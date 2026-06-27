const {
    getEventConfig,
    getConfiguredFields,
    getEventAmount,
    registerUserEvent,
} = require('../lib/lanparty_service');

const validateRegistration = async (payload, { Joi }) => {
    const body = await Joi.object({
        arrival_date: Joi.string().pattern(/^\d{4}-\d{2}-\d{2}$/).required(),
        departure_date: Joi.string().pattern(/^\d{4}-\d{2}-\d{2}$/).required(),
        rules_agree: Joi.boolean().valid(true).required(),
        agb_agree: Joi.boolean().valid(true).required(),
        extra_data: Joi.object().unknown(true).default({}),
    }).validateAsync(payload || {});

    const amount = getEventAmount(body.arrival_date, body.departure_date);
    if (!amount.days) {
        const error = new Error('Invalid event dates');
        error.status = 400;
        throw error;
    }

    return body;
};

const getLanpartyPaymentMessage = (eventRegistration) => {
    const event = getEventConfig();
    return JSON.stringify({
        eventName: event.EventName,
        amount: eventRegistration.amount,
        amountCents: eventRegistration.amount_cents,
        paymentToken: eventRegistration.payment_token,
        arrivalDate: eventRegistration.arrival_date,
        departureDate: eventRegistration.departure_date,
        fields: getConfiguredFields(),
        extraData: eventRegistration.extra_data,
        bank: {
            owner: event.KontoInhaber,
            iban: event.KontoIban,
            bank: event.KontoBank,
            purpose: `${event.Verwendungszweck || event.EventName} ${eventRegistration.payment_token}`,
        },
    });
};

const afterUserCreated = async ({ userId, data, sendNotification, NOTIFICATION_TYPES }) => {
    const eventRegistration = registerUserEvent(userId, data);
    await sendNotification(
        userId,
        0,
        NOTIFICATION_TYPES.LANPARTY_PAYMENT,
        getLanpartyPaymentMessage(eventRegistration)
    );
};

module.exports = {
    validateRegistration,
    afterUserCreated,
};
