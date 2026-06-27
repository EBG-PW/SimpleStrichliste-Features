const crypto = require('node:crypto');
const fs = require('node:fs');
const path = require('node:path');

const { db } = require('@lib/sqlite');
const { getMessageRecipientUsers } = require('@lib/sqlite/users');

const appRoot = process.cwd();
const featureConfigPath = path.join(appRoot, 'config', 'lanparty.json');
const legacyDefaultConfigPath = path.join(appRoot, 'config', 'lanparty.default.json');
const sourceConfigPath = path.join(__dirname, '..', 'config', 'lanparty.json');
const datePattern = /^\d{4}-\d{2}-\d{2}$/;
const paymentTokenAlphabet = 'ABCDEFGHJKMNPQRSTUVWXYZ23456789';
const paymentTokenLength = 12;
const systemDepositItemUuid = '13620506-b9f8-44d7-a9ff-d1b58ddee93f';

const normalizeMoney = (value) => {
    const number = Number(value);
    return Number.isFinite(number) ? Math.max(0, number) : 0;
};

const cleanupLegacyDefaultConfigFile = () => {
    if (!fs.existsSync(legacyDefaultConfigPath)) return;
    fs.unlinkSync(legacyDefaultConfigPath);
};

const getReadableConfigPath = () => {
    if (fs.existsSync(featureConfigPath)) return featureConfigPath;
    if (fs.existsSync(sourceConfigPath)) return sourceConfigPath;
    throw new Error('Missing lanparty config file: config/lanparty.json');
};

const readFeatureConfigFile = () => {
    cleanupLegacyDefaultConfigFile();
    return JSON.parse(fs.readFileSync(getReadableConfigPath(), 'utf8'));
};

const writeFeatureConfigFile = (config) => {
    cleanupLegacyDefaultConfigFile();
    fs.mkdirSync(path.dirname(featureConfigPath), { recursive: true });
    fs.writeFileSync(featureConfigPath, `${JSON.stringify(config, null, 2)}\n`, 'utf8');
};

const getLanpartyFeatureConfig = () => readFeatureConfigFile();

const getEventConfig = () => getLanpartyFeatureConfig();

const getConfiguredFields = () => {
    const fields = Array.isArray(getEventConfig().fields) ? getEventConfig().fields : [];
    return fields.map((field) => ({
        ...field,
        labelKey: field.labelKey || (field.key ? `Lanparty.Fields.${field.key}` : null),
    }));
};

const getPriceItems = () => {
    const event = getEventConfig();
    return {
        FixKostenProTag: Array.isArray(event.FixKostenProTag) ? event.FixKostenProTag : [],
        PauschalkostenProTag: Array.isArray(event.PauschalkostenProTag) ? event.PauschalkostenProTag : [],
    };
};

const getPerDayAmount = () => {
    const prices = getPriceItems();
    return [...prices.FixKostenProTag, ...prices.PauschalkostenProTag]
        .reduce((sum, item) => sum + normalizeMoney(item.amount), 0);
};

const getEventDateRange = () => {
    const event = getEventConfig();
    return {
        startDate: datePattern.test(event.EventStartDate || '') ? event.EventStartDate : null,
        endDate: datePattern.test(event.EventEndDate || '') ? event.EventEndDate : null,
    };
};

const isDateInEventRange = (arrivalDate, departureDate) => {
    const { startDate, endDate } = getEventDateRange();
    if (!datePattern.test(arrivalDate || '') || !datePattern.test(departureDate || '')) return false;
    if (startDate && arrivalDate < startDate) return false;
    if (endDate && departureDate > endDate) return false;
    return true;
};

const getAttendanceDays = (arrivalDate, departureDate) => {
    const arrival = new Date(`${arrivalDate}T00:00:00Z`);
    const departure = new Date(`${departureDate}T00:00:00Z`);
    const diffMs = departure.getTime() - arrival.getTime();
    if (!Number.isFinite(diffMs) || diffMs < 0) return 0;
    return Math.max(1, Math.ceil(diffMs / 86400000));
};

const getEventAmount = (arrivalDate, departureDate) => {
    const days = getAttendanceDays(arrivalDate, departureDate);
    const perDayAmount = getPerDayAmount();
    if (!days || !isDateInEventRange(arrivalDate, departureDate)) {
        return {
            days: 0,
            perDayAmount,
            totalAmount: 0,
            totalCents: 0,
        };
    }

    return {
        days,
        perDayAmount,
        totalAmount: days * perDayAmount,
        totalCents: Math.round(days * perDayAmount * 100),
    };
};

const createPaymentToken = () => {
    return Array.from({ length: paymentTokenLength }, () => paymentTokenAlphabet[crypto.randomInt(paymentTokenAlphabet.length)]).join('');
};

const normalizeExtraData = (extraData = {}) => {
    const result = {};
    getConfiguredFields().forEach((field) => {
        const key = field.key;
        if (!key || !/^[a-zA-Z0-9_]{1,64}$/.test(key)) return;
        const rawValue = extraData[key];
        if (field.type === 'number') {
            const value = Number(rawValue ?? field.default ?? 0);
            const min = Number.isFinite(Number(field.min)) ? Number(field.min) : Number.NEGATIVE_INFINITY;
            const max = Number.isFinite(Number(field.max)) ? Number(field.max) : Number.POSITIVE_INFINITY;
            result[key] = Math.min(Math.max(Number.isFinite(value) ? value : 0, min), max);
            return;
        }
        if (field.type === 'bool') {
            result[key] = rawValue === true || rawValue === 'true' || rawValue === 'on' || rawValue === 1 || rawValue === '1';
            return;
        }
        result[key] = String(rawValue ?? field.default ?? '').slice(0, 500);
    });
    return result;
};

const registerUserEvent = (userId, eventBody) => {
    const amount = getEventAmount(eventBody.arrival_date, eventBody.departure_date);
    const extraData = normalizeExtraData(eventBody.extra_data || {});
    const paymentToken = createPaymentToken();

    db.prepare(`
        INSERT INTO user_event (
            user_id,
            arrival_date,
            departure_date,
            rules_agreed_timestamp,
            agb_agreed_timestamp,
            has_payed,
            payment_token,
            amount_cents,
            extra_data
        ) VALUES (?, ?, ?, datetime('now'), datetime('now'), 0, ?, ?, ?)
    `).run(
        userId,
        eventBody.arrival_date,
        eventBody.departure_date,
        paymentToken,
        amount.totalCents,
        JSON.stringify(extraData)
    );

    return getUserEventByUserId(userId);
};

const getUserEventByUserId = (userId) => {
    const row = db.prepare(`
        SELECT ue.*, u.uuid, u.name, u.username, u.email
        FROM user_event ue
        JOIN users u ON u.id = ue.user_id
        WHERE ue.user_id = ?
    `).get(userId);
    if (!row) return null;
    return {
        ...row,
        has_payed: row.has_payed === 1,
        amount: row.amount_cents / 100,
        extra_data: JSON.parse(row.extra_data || '{}'),
    };
};

const getEventUsers = () => db.prepare(`
    SELECT
        u.uuid,
        u.name,
        u.username,
        u.email,
        ue.arrival_date,
        ue.departure_date,
        ue.rules_agreed_timestamp,
        ue.agb_agreed_timestamp,
        ue.has_payed,
        ue.payment_token,
        ue.amount_cents,
        ue.extra_data
    FROM user_event ue
    JOIN users u ON u.id = ue.user_id
    WHERE u.state > 0
    ORDER BY ue.arrival_date ASC, u.name COLLATE NOCASE
`).all().map((row) => ({
    ...row,
    has_payed: row.has_payed === 1,
    amount: row.amount_cents / 100,
    extra_data: JSON.parse(row.extra_data || '{}'),
}));

const getUnpaidEventUsers = () => getEventUsers().filter((user) => !user.has_payed);

const markEventUserPaid = (uuid, initiatorId) => db.transaction((userUuid, authorizerId) => {
    const eventUser = db.prepare(`
        SELECT
            ue.id,
            ue.user_id,
            ue.has_payed,
            ue.amount_cents
        FROM user_event ue
        JOIN users u ON u.id = ue.user_id
        WHERE u.uuid = ? AND u.state > 0
    `).get(userUuid);

    if (!eventUser) {
        return {
            found: false,
            alreadyPaid: false,
            creditedAmount: 0,
        };
    }

    if (eventUser.has_payed === 1) {
        return {
            found: true,
            alreadyPaid: true,
            creditedAmount: 0,
        };
    }

    db.prepare(`
        UPDATE user_event
        SET has_payed = 1, updated_timestamp = datetime('now')
        WHERE id = ?
    `).run(eventUser.id);

    const creditedAmountCents = Math.max(0, Number(eventUser.amount_cents) || 0);
    const authorizer = Number.isInteger(Number(authorizerId)) ? Number(authorizerId) : eventUser.user_id;
    if (creditedAmountCents > 0) {
        db.prepare('UPDATE users SET balance = balance + ? WHERE id = ?').run(creditedAmountCents, eventUser.user_id);
        db.prepare(`
            INSERT INTO transactions (user_id, item_id, quantity, price_at_transaction, initiator_id)
            VALUES (?, (SELECT id FROM items WHERE uuid = ?), 1, ?, ?)
        `).run(eventUser.user_id, systemDepositItemUuid, creditedAmountCents, authorizer);
    }

    return {
        found: true,
        alreadyPaid: false,
        creditedAmount: creditedAmountCents / 100,
    };
})(uuid, initiatorId);

const savePriceConfig = (prices) => {
    const config = readFeatureConfigFile();
    config.FixKostenProTag = (prices.FixKostenProTag || []).map((item) => ({
        name: String(item.name || '').slice(0, 100),
        amount: normalizeMoney(item.amount),
    })).filter((item) => item.name);
    config.PauschalkostenProTag = (prices.PauschalkostenProTag || []).map((item) => ({
        name: String(item.name || '').slice(0, 100),
        amount: normalizeMoney(item.amount),
    })).filter((item) => item.name);
    writeFeatureConfigFile(config);
    return getPriceItems();
};

module.exports = {
    getLanpartyFeatureConfig,
    getEventConfig,
    getConfiguredFields,
    getPriceItems,
    getPerDayAmount,
    getEventDateRange,
    isDateInEventRange,
    getAttendanceDays,
    getEventAmount,
    getMessageRecipientUsers,
    registerUserEvent,
    getUserEventByUserId,
    getEventUsers,
    getUnpaidEventUsers,
    markEventUserPaid,
    savePriceConfig,
};
