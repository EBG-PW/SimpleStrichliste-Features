const express = require('ultimate-express');
const Joi = require('@lib/sanitizer');
const { verifyRequest } = require('@middleware/verifyRequest');
const { limiter } = require('@middleware/limiter');
const { parseMultipart } = require('@middleware/parseMultipartForm');
const foodorders = require('@lib/sqlite/foodorders');
const { getNotificationSubscribers } = require('@lib/sqlite/userNotifications');
const { importMenuFromHtml, importParsers } = require('@lib/foodorder_importer');
const { sendNotification } = require('@lib/notifications');

const router = new express.Router();

const PluginName = 'FoodOrders';
const PluginRequirements = [];
const PluginVersion = '0.0.2';

const ORDER_STATUSES = ['open', 'closed', 'ordered', 'arrived', 'completed', 'cancelled'];
const ORDER_ITEM_STATUSES = ['requested', 'ordered', 'completed', 'missing', 'cancelled'];
const FOOD_ORDER_CREATED = 'FoodOrderCreated';
const FOOD_ORDER_ARRIVED = 'FoodOrderArrived';

const queueOrderNotification = async (recipients, type, order) => {
    await Promise.all(recipients.map((recipient) => {
        const message = JSON.stringify({
            orderUuid: order.uuid,
            orderTitle: order.title,
            vendorName: order.vendor?.name || '',
            orderDeadline: order.orderDeadline,
            items: recipient.items || [],
        });
        return sendNotification(recipient.id, 0, type, message, recipient);
    }));
};

const paginationSchema = Joi.object({
    page: Joi.number().integer().min(1).default(1),
    limit: Joi.number().integer().min(1).max(50).default(15),
    query: Joi.fullysanitizedString().allow('').max(120).default(''),
    status: Joi.string().valid(...ORDER_STATUSES, '').allow('').default(''),
    categoryUuid: Joi.string().uuid().allow('', null).default(null),
});

const uuidSchema = Joi.object({
    uuid: Joi.string().uuid().required(),
});

const idSchema = Joi.object({
    id: Joi.number().integer().positive().required(),
});

const vendorSchema = Joi.object({
    name: Joi.fullysanitizedString().min(2).max(120).required(),
    description: Joi.fullysanitizedString().allow('').max(500).default(''),
    hasMenu: Joi.boolean().default(true),
    isActive: Joi.boolean().default(true),
});

const categorySchema = Joi.object({
    name: Joi.fullysanitizedString().min(2).max(120).required(),
    sortOrder: Joi.number().integer().min(0).max(9999).default(0),
    isActive: Joi.boolean().default(true),
});

const itemSchema = Joi.object({
    name: Joi.fullysanitizedString().min(2).max(120).required(),
    description: Joi.fullysanitizedString().allow('').max(500).default(''),
    categoryUuid: Joi.string().uuid().allow('', null).default(null),
    price: Joi.number().min(0).max(10000).required(),
    isActive: Joi.boolean().default(true),
});

const importSchema = Joi.object({
    parser: Joi.string().valid(...importParsers.map(parser => parser.id)).required(),
});

const orderSchema = Joi.object({
    title: Joi.fullysanitizedString().min(2).max(160).required(),
    vendorUuid: Joi.string().uuid().required(),
    orderDeadline: Joi.string().allow('', null).max(80).default(null),
    status: Joi.string().valid(...ORDER_STATUSES).default('open'),
});

const orderStatusSchema = Joi.object({
    status: Joi.string().valid(...ORDER_STATUSES).required(),
});

const orderItemStatusSchema = Joi.object({
    status: Joi.string().valid(...ORDER_ITEM_STATUSES).required(),
});

const userOrderItemSchema = Joi.object({
    itemUuid: Joi.string().uuid().allow('', null).default(null),
    itemName: Joi.fullysanitizedString().min(2).max(160).allow('', null).default(null),
    price: Joi.number().min(0).max(10000).default(0),
    quantity: Joi.number().integer().min(1).max(99).default(1),
    note: Joi.fullysanitizedString().allow('').max(500).default(''),
});

const errorResponse = (res, error, status = 404) => res.status(status).json({ error });

router.get('/admin/vendors', verifyRequest('web.admin.foodorders.read'), limiter(1), async (req, res) => {
    const query = await paginationSchema.validateAsync(req.query);
    res.json(foodorders.listVendors(query));
});

router.post('/admin/vendors', verifyRequest('web.admin.foodorders.write'), limiter(2), async (req, res) => {
    const body = await vendorSchema.validateAsync(req.body);
    res.status(201).json({ uuid: foodorders.createVendor(body) });
});

router.get('/admin/vendors/:uuid', verifyRequest('web.admin.foodorders.read'), limiter(1), async (req, res) => {
    const params = await uuidSchema.validateAsync(req.params);
    const vendor = foodorders.getVendor(params.uuid);
    if (!vendor) return errorResponse(res, 'FoodOrders.Errors.VendorNotFound');
    res.json({ vendor });
});

router.put('/admin/vendors/:uuid', verifyRequest('web.admin.foodorders.write'), limiter(2), async (req, res) => {
    const params = await uuidSchema.validateAsync(req.params);
    const body = await vendorSchema.validateAsync(req.body);
    if (!foodorders.updateVendor(params.uuid, body)) return errorResponse(res, 'FoodOrders.Errors.VendorNotFound');
    res.json({ uuid: params.uuid });
});

router.get('/admin/vendors/:uuid/categories', verifyRequest('web.admin.foodorders.read'), limiter(1), async (req, res) => {
    const params = await uuidSchema.validateAsync(req.params);
    const categories = foodorders.listCategories(params.uuid);
    if (!categories) return errorResponse(res, 'FoodOrders.Errors.VendorNotFound');
    res.json({ categories });
});

router.post('/admin/vendors/:uuid/categories', verifyRequest('web.admin.foodorders.write'), limiter(2), async (req, res) => {
    const params = await uuidSchema.validateAsync(req.params);
    const body = await categorySchema.validateAsync(req.body);
    const uuid = foodorders.createCategory(params.uuid, body);
    if (!uuid) return errorResponse(res, 'FoodOrders.Errors.VendorNotFound');
    res.status(201).json({ uuid });
});

router.get('/admin/vendors/:uuid/items', verifyRequest('web.admin.foodorders.read'), limiter(1), async (req, res) => {
    const params = await uuidSchema.validateAsync(req.params);
    const query = await paginationSchema.validateAsync(req.query);
    const result = foodorders.listVendorItems(params.uuid, query);
    if (!result) return errorResponse(res, 'FoodOrders.Errors.VendorNotFound');
    res.json(result);
});

router.post('/admin/vendors/:uuid/items', verifyRequest('web.admin.foodorders.write'), limiter(2), async (req, res) => {
    const params = await uuidSchema.validateAsync(req.params);
    const body = await itemSchema.validateAsync(req.body);
    const result = foodorders.createVendorItem(params.uuid, body);
    if (result.error) return errorResponse(res, result.error);
    res.status(201).json(result);
});

router.put('/admin/items/:uuid', verifyRequest('web.admin.foodorders.write'), limiter(2), async (req, res) => {
    const params = await uuidSchema.validateAsync(req.params);
    const body = await itemSchema.validateAsync(req.body);
    const result = foodorders.updateItem(params.uuid, body);
    if (result.error) return errorResponse(res, result.error);
    res.json(result);
});

router.get('/admin/import-parsers', verifyRequest('web.admin.foodorders.read'), limiter(1), async (req, res) => {
    res.json({ parsers: importParsers });
});

router.post('/admin/vendors/:uuid/import', verifyRequest('web.admin.foodorders.write'), parseMultipart(), limiter(2), async (req, res) => {
    const params = await uuidSchema.validateAsync(req.params);
    const body = await importSchema.validateAsync(req.body);
    const html = req.file?.buffer?.toString('utf8') || '';
    const imported = importMenuFromHtml(body.parser, html);
    if (imported.error) return errorResponse(res, imported.error, imported.status || 400);
    const result = foodorders.importVendorMenu(params.uuid, imported.categories);
    if (result.error) return errorResponse(res, result.error);
    res.json(result);
});

router.get('/admin/orders', verifyRequest('web.admin.foodorders.read'), limiter(1), async (req, res) => {
    const query = await paginationSchema.validateAsync(req.query);
    res.json(foodorders.listOrders(query));
});

router.post('/admin/orders', verifyRequest('web.admin.foodorders.write'), limiter(2), async (req, res) => {
    const body = await orderSchema.validateAsync(req.body);
    const uuid = foodorders.createOrder(body, req.user.user_data.id);
    if (!uuid) return errorResponse(res, 'FoodOrders.Errors.VendorNotFound');
    const order = foodorders.getAdminOrder(uuid);
    const recipients = getNotificationSubscribers('foodorders-new-order', 'email', true);
    await queueOrderNotification(recipients, FOOD_ORDER_CREATED, order);
    res.status(201).json({ uuid });
});

router.get('/admin/orders/:uuid', verifyRequest('web.admin.foodorders.read'), limiter(1), async (req, res) => {
    const params = await uuidSchema.validateAsync(req.params);
    const order = foodorders.getAdminOrder(params.uuid);
    if (!order) return errorResponse(res, 'FoodOrders.Errors.OrderNotFound');
    res.json({ order });
});

router.put('/admin/orders/:uuid/status', verifyRequest('web.admin.foodorders.write'), limiter(2), async (req, res) => {
    const params = await uuidSchema.validateAsync(req.params);
    const body = await orderStatusSchema.validateAsync(req.body);
    const result = foodorders.updateOrderStatus(params.uuid, body.status);
    if (!result) return errorResponse(res, 'FoodOrders.Errors.OrderNotFound');
    if (result.error) return errorResponse(res, result.error, 400);
    if (body.status === 'arrived') {
        const order = foodorders.getAdminOrder(params.uuid);
        await queueOrderNotification(
            foodorders.getOrderParticipants(params.uuid),
            FOOD_ORDER_ARRIVED,
            order
        );
    }
    res.json({ uuid: params.uuid, status: body.status });
});

router.put('/admin/order-items/:id/status', verifyRequest('web.admin.foodorders.write'), limiter(2), async (req, res) => {
    const params = await idSchema.validateAsync(req.params);
    const body = await orderItemStatusSchema.validateAsync(req.body);
    const result = foodorders.updateOrderItemStatus(params.id, body.status, req.user.user_data.id);
    if (!result) return errorResponse(res, 'FoodOrders.Errors.OrderItemNotFound');
    if (result.error) return errorResponse(res, result.error, 400);
    res.json({ id: params.id, status: body.status, charged: result.charged });
});

router.get('/orders/open', verifyRequest('web.user.foodorders.read'), limiter(1), async (req, res) => {
    res.json(foodorders.listOpenOrders());
});

router.get('/orders/:uuid', verifyRequest('web.user.foodorders.read'), limiter(1), async (req, res) => {
    const params = await uuidSchema.validateAsync(req.params);
    const result = foodorders.getUserOrder(params.uuid);
    if (!result) return errorResponse(res, 'FoodOrders.Errors.OrderNotFound');
    res.json(result);
});

router.post('/orders/:uuid/items', verifyRequest('web.user.foodorders.write'), limiter(1), async (req, res) => {
    const params = await uuidSchema.validateAsync(req.params);
    const body = await userOrderItemSchema.validateAsync(req.body);
    const result = foodorders.addUserOrderItem(params.uuid, body, req.user.user_data.id);
    if (result.error) return errorResponse(res, result.error, result.status || 404);
    res.status(201).json(result);
});

router.delete('/orders/:uuid/items/:id', verifyRequest('web.user.foodorders.write'), limiter(1), async (req, res) => {
    const params = await uuidSchema.concat(idSchema).validateAsync(req.params);
    const result = foodorders.deleteUserOrderItem(params.uuid, params.id, req.user.user_data.id);
    if (result.error) return errorResponse(res, result.error, result.status || 404);
    res.json(result);
});

module.exports = {
    router,
    PluginName,
    PluginRequirements,
    PluginVersion,
};
