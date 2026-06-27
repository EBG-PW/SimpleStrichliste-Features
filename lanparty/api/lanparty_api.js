const { verifyRequest } = require('@middleware/verifyRequest');
const { limiter } = require('@middleware/limiter');
const {
    getEventConfig,
    getConfiguredFields,
    getPriceItems,
    getEventAmount,
    getEventUsers,
    getUnpaidEventUsers,
    markEventUserPaid,
    savePriceConfig,
} = require('../lib/lanparty_service');
const Joi = require('@lib/sanitizer');
const express = require('ultimate-express');

const router = new express.Router();

const PluginName = 'Lanparty';
const PluginRequirements = [];
const PluginVersion = '0.1.0';

const paymentStateSchema = Joi.object({
    uuid: Joi.string().uuid().required(),
});

const priceItemSchema = Joi.object({
    name: Joi.fullysanitizedString().min(1).max(100).required(),
    amount: Joi.number().min(0).max(100000).required(),
});

const pricesSchema = Joi.object({
    FixKostenProTag: Joi.array().items(priceItemSchema).max(100).required(),
    PauschalkostenProTag: Joi.array().items(priceItemSchema).max(100).required(),
});

router.get('/config', limiter(5), async (req, res) => {
    const event = getEventConfig();
    return res.json({
        EventName: event.EventName,
        EventStartDate: event.EventStartDate,
        EventEndDate: event.EventEndDate,
        ZVR: event.ZVR,
        Veranstalter: event.Veranstalter,
        Street: event.Street,
        PLZORT: event.PLZORT,
        Country: event.Country,
        KontoInhaber: event.KontoInhaber,
        KontoIban: event.KontoIban,
        KontoBank: event.KontoBank,
        Verwendungszweck: event.Verwendungszweck,
        rules: Array.isArray(event.rules) ? event.rules : [],
        agb: Array.isArray(event.agb) ? event.agb : [],
        fields: getConfiguredFields(),
        prices: getPriceItems(),
    });
});

router.post('/estimate', limiter(10), async (req, res) => {
    const body = await Joi.object({
        arrival_date: Joi.string().pattern(/^\d{4}-\d{2}-\d{2}$/).required(),
        departure_date: Joi.string().pattern(/^\d{4}-\d{2}-\d{2}$/).required(),
    }).validateAsync(req.body);
    const amount = getEventAmount(body.arrival_date, body.departure_date);
    if (!amount.days) return res.status(400).json({ error: 'Invalid event dates' });
    return res.json(amount);
});

router.get('/users', verifyRequest('app.admin.lanparty.read'), limiter(2), async (req, res) => {
    return res.json({ fields: getConfiguredFields(), users: getEventUsers() });
});

router.get('/payments', verifyRequest('app.admin.lanparty.read'), limiter(2), async (req, res) => {
    return res.json({ users: getUnpaidEventUsers() });
});

router.post('/payments/:uuid/paid', verifyRequest('app.admin.lanparty.write'), limiter(10), async (req, res) => {
    const params = await paymentStateSchema.validateAsync(req.params);
    const result = markEventUserPaid(params.uuid, req.user.user_data.id);
    if (!result.found) return res.status(404).json({ error: 'User event not found' });
    return res.json({
        success: true,
        alreadyPaid: result.alreadyPaid,
        creditedAmount: result.creditedAmount,
    });
});

router.get('/prices', verifyRequest('app.admin.lanparty.read'), limiter(2), async (req, res) => {
    return res.json(getPriceItems());
});

router.put('/prices', verifyRequest('app.admin.lanparty.write'), limiter(10), async (req, res) => {
    const body = await pricesSchema.validateAsync(req.body);
    return res.json(savePriceConfig(body));
});

module.exports = {
    router,
    PluginName,
    PluginRequirements,
    PluginVersion,
};
