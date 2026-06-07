const crypto = require('node:crypto');
const { db } = require('@lib/sqlite');

const TRANSACTION_ITEM_UUID = '13620506-b9f8-44d7-a9ff-d1b58ddee93f';

const toCents = (price) => Math.round(Number(price || 0) * 100);
const fromCents = (price) => Number((price / 100).toFixed(2));
const isPastDeadline = (deadline) => {
    if (!deadline) return false;
    const deadlineDate = new Date(deadline);
    return !Number.isNaN(deadlineDate.getTime()) && Date.now() > deadlineDate.getTime();
};
const pageMeta = (page, limit, total) => ({
    page,
    limit,
    total,
    totalPages: Math.max(1, Math.ceil(total / limit)),
});

const mapVendor = (vendor) => vendor ? ({
    uuid: vendor.uuid,
    name: vendor.name,
    description: vendor.description || '',
    hasMenu: vendor.has_menu === 1,
    isActive: vendor.is_active === 1,
    createdAt: vendor.created_at,
}) : null;

const mapCategory = (category) => category ? ({
    uuid: category.uuid,
    vendorUuid: category.vendor_uuid,
    name: category.name,
    sortOrder: category.sort_order,
    isActive: category.is_active === 1,
}) : null;

const mapItem = (item) => item ? ({
    id: item.id,
    uuid: item.uuid,
    vendorUuid: item.vendor_uuid,
    categoryUuid: item.category_uuid,
    categoryName: item.category_name,
    name: item.name,
    description: item.description || '',
    price: fromCents(item.price),
    isActive: item.is_active === 1,
}) : null;

const getVendorByUuid = (uuid) => db.prepare('SELECT * FROM foodorder_vendors WHERE uuid = ?').get(uuid);
const getOrderByUuid = (uuid) => db.prepare('SELECT * FROM foodorder_orders WHERE uuid = ?').get(uuid);
const getUserFoodorderBalance = (userId) => db.prepare(`
    SELECT
        u.balance,
        COALESCE(SUM(
            CASE
                WHEN foi.charged_at IS NULL AND foi.status NOT IN ('missing', 'cancelled')
                THEN foi.price_at_order * foi.quantity
                ELSE 0
            END
        ), 0) AS reserved
    FROM users u
    LEFT JOIN foodorder_order_items foi ON foi.user_id = u.id
    WHERE u.id = ? AND u.state > 0
    GROUP BY u.id
`).get(userId);

const getCategoryByUuid = (uuid, vendorId = null) => {
    if (!uuid) return null;
    return vendorId
        ? db.prepare('SELECT * FROM foodorder_item_categories WHERE uuid = ? AND vendor_id = ?').get(uuid, vendorId)
        : db.prepare('SELECT * FROM foodorder_item_categories WHERE uuid = ?').get(uuid);
};

const getOrderItems = (orderId) => {
    return db.prepare(`
        SELECT
            foi.id,
            foi.item_name,
            foi.quantity,
            foi.note,
            foi.price_at_order,
            foi.status,
            foi.charged_at,
            foi.ordered_at,
            u.uuid AS user_uuid,
            u.name AS user_name,
            u.username AS user_username,
            fi.uuid AS item_uuid
        FROM foodorder_order_items foi
        JOIN users u ON u.id = foi.user_id
        LEFT JOIN foodorder_items fi ON fi.id = foi.item_id
        WHERE foi.order_id = ?
        ORDER BY foi.ordered_at DESC, foi.id DESC
    `).all(orderId).map((item) => ({
        id: item.id,
        itemUuid: item.item_uuid,
        itemName: item.item_name,
        quantity: item.quantity,
        note: item.note || '',
        price: fromCents(item.price_at_order),
        total: fromCents(item.price_at_order * item.quantity),
        status: item.status,
        chargedAt: item.charged_at,
        orderedAt: item.ordered_at,
        user: {
            uuid: item.user_uuid,
            name: item.user_name,
            username: item.user_username,
        },
    }));
};

const mapOrder = (order, includeItems = false) => ({
    uuid: order.uuid,
    title: order.title,
    status: order.status,
    orderDeadline: order.order_deadline,
    createdAt: order.created_at,
    updatedAt: order.updated_at,
    itemCount: order.item_count || 0,
    total: fromCents(order.total || 0),
    vendor: order.vendor_uuid ? {
        uuid: order.vendor_uuid,
        name: order.vendor_name,
        description: order.vendor_description || '',
        hasMenu: order.vendor_has_menu === 1,
    } : null,
    items: includeItems ? getOrderItems(order.id) : undefined,
});

const listVendors = ({ page, limit, query }) => {
    const offset = (page - 1) * limit;
    const where = query ? 'WHERE name LIKE ? OR description LIKE ?' : '';
    const params = query ? [`%${query}%`, `%${query}%`] : [];
    const total = db.prepare(`SELECT COUNT(*) AS count FROM foodorder_vendors ${where}`).get(...params).count;
    const vendors = db.prepare(`
        SELECT * FROM foodorder_vendors
        ${where}
        ORDER BY is_active DESC, name ASC
        LIMIT ? OFFSET ?
    `).all(...params, limit, offset).map(mapVendor);
    return { vendors, pagination: pageMeta(page, limit, total) };
};

const createVendor = (body) => {
    const uuid = crypto.randomUUID();
    db.prepare(`
        INSERT INTO foodorder_vendors (uuid, name, description, has_menu, is_active)
        VALUES (?, ?, ?, ?, ?)
    `).run(uuid, body.name, body.description, body.hasMenu ? 1 : 0, body.isActive ? 1 : 0);
    return uuid;
};

const updateVendor = (uuid, body) => {
    const result = db.prepare(`
        UPDATE foodorder_vendors
        SET name = ?, description = ?, has_menu = ?, is_active = ?
        WHERE uuid = ?
    `).run(body.name, body.description, body.hasMenu ? 1 : 0, body.isActive ? 1 : 0, uuid);
    return result.changes > 0;
};

const getVendor = (uuid) => mapVendor(getVendorByUuid(uuid));

const listCategories = (vendorUuid) => {
    const vendor = getVendorByUuid(vendorUuid);
    if (!vendor) return null;
    return db.prepare(`
        SELECT fc.*, fv.uuid AS vendor_uuid
        FROM foodorder_item_categories fc
        JOIN foodorder_vendors fv ON fv.id = fc.vendor_id
        WHERE fv.uuid = ?
        ORDER BY fc.sort_order ASC, fc.name ASC
    `).all(vendorUuid).map(mapCategory);
};

const createCategory = (vendorUuid, body) => {
    const vendor = getVendorByUuid(vendorUuid);
    if (!vendor) return null;
    const uuid = crypto.randomUUID();
    db.prepare(`
        INSERT INTO foodorder_item_categories (uuid, vendor_id, name, sort_order, is_active)
        VALUES (?, ?, ?, ?, ?)
    `).run(uuid, vendor.id, body.name, body.sortOrder, body.isActive ? 1 : 0);
    return uuid;
};

const listVendorItems = (vendorUuid, { page, limit, query, categoryUuid }) => {
    const vendor = getVendorByUuid(vendorUuid);
    if (!vendor) return null;

    const where = ['fv.uuid = ?'];
    const params = [vendorUuid];
    if (query) {
        where.push('(fi.name LIKE ? OR fi.description LIKE ?)');
        params.push(`%${query}%`, `%${query}%`);
    }
    if (categoryUuid) {
        where.push('fc.uuid = ?');
        params.push(categoryUuid);
    }

    const whereSql = `WHERE ${where.join(' AND ')}`;
    const total = db.prepare(`
        SELECT COUNT(*) AS count
        FROM foodorder_items fi
        JOIN foodorder_vendors fv ON fv.id = fi.vendor_id
        LEFT JOIN foodorder_item_categories fc ON fc.id = fi.category_id
        ${whereSql}
    `).get(...params).count;
    const offset = (page - 1) * limit;
    const items = db.prepare(`
        SELECT fi.*, fv.uuid AS vendor_uuid, fc.uuid AS category_uuid, fc.name AS category_name
        FROM foodorder_items fi
        JOIN foodorder_vendors fv ON fv.id = fi.vendor_id
        LEFT JOIN foodorder_item_categories fc ON fc.id = fi.category_id
        ${whereSql}
        ORDER BY fi.is_active DESC, COALESCE(fc.sort_order, 9999), fc.name, fi.name
        LIMIT ? OFFSET ?
    `).all(...params, limit, offset).map(mapItem);
    return { vendor: mapVendor(vendor), items, pagination: pageMeta(page, limit, total) };
};

const createVendorItem = (vendorUuid, body) => {
    const vendor = getVendorByUuid(vendorUuid);
    if (!vendor) return { error: 'FoodOrders.Errors.VendorNotFound' };
    const category = getCategoryByUuid(body.categoryUuid, vendor.id);
    if (body.categoryUuid && !category) return { error: 'FoodOrders.Errors.CategoryNotFound' };
    const uuid = crypto.randomUUID();
    db.prepare(`
        INSERT INTO foodorder_items (uuid, vendor_id, category_id, name, description, price, is_active)
        VALUES (?, ?, ?, ?, ?, ?, ?)
    `).run(uuid, vendor.id, category?.id || null, body.name, body.description, toCents(body.price), body.isActive ? 1 : 0);
    return { uuid };
};

const updateItem = (uuid, body) => {
    const item = db.prepare('SELECT * FROM foodorder_items WHERE uuid = ?').get(uuid);
    if (!item) return { error: 'FoodOrders.Errors.ItemNotFound' };
    const category = getCategoryByUuid(body.categoryUuid, item.vendor_id);
    if (body.categoryUuid && !category) return { error: 'FoodOrders.Errors.CategoryNotFound' };
    db.prepare(`
        UPDATE foodorder_items
        SET name = ?, description = ?, category_id = ?, price = ?, is_active = ?
        WHERE uuid = ?
    `).run(body.name, body.description, category?.id || null, toCents(body.price), body.isActive ? 1 : 0, uuid);
    return { uuid };
};

const importVendorMenu = (vendorUuid, importedCategories) => {
    const vendor = getVendorByUuid(vendorUuid);
    if (!vendor) return { error: 'FoodOrders.Errors.VendorNotFound' };

    const runImport = db.transaction((vendorId, categories) => {
        let categoryCount = 0;
        let itemCount = 0;

        categories.forEach((category, index) => {
            const categoryName = String(category.name || '').trim().slice(0, 120);
            if (!categoryName || !Array.isArray(category.items)) return;

            const existingCategory = db.prepare(`
                SELECT id FROM foodorder_item_categories
                WHERE vendor_id = ? AND name = ?
            `).get(vendorId, categoryName);

            let categoryId = existingCategory?.id;
            if (categoryId) {
                db.prepare(`
                    UPDATE foodorder_item_categories
                    SET sort_order = ?, is_active = 1
                    WHERE id = ?
                `).run(index, categoryId);
            } else {
                categoryId = db.prepare(`
                    INSERT INTO foodorder_item_categories (uuid, vendor_id, name, sort_order, is_active)
                    VALUES (?, ?, ?, ?, 1)
                `).run(crypto.randomUUID(), vendorId, categoryName, index).lastInsertRowid;
                categoryCount += 1;
            }

            category.items.forEach((item) => {
                const itemName = String(item.name || '').trim().slice(0, 120);
                if (!itemName) return;

                const existingItem = db.prepare(`
                    SELECT id FROM foodorder_items
                    WHERE vendor_id = ? AND name = ?
                `).get(vendorId, itemName);

                const description = String(item.description || '').trim().slice(0, 500);
                const price = toCents(item.price);
                if (existingItem) {
                    db.prepare(`
                        UPDATE foodorder_items
                        SET category_id = ?, description = ?, price = ?, is_active = 1
                        WHERE id = ?
                    `).run(categoryId, description, price, existingItem.id);
                } else {
                    db.prepare(`
                        INSERT INTO foodorder_items (uuid, vendor_id, category_id, name, description, price, is_active)
                        VALUES (?, ?, ?, ?, ?, ?, 1)
                    `).run(crypto.randomUUID(), vendorId, categoryId, itemName, description, price);
                }
                itemCount += 1;
            });
        });

        db.prepare('UPDATE foodorder_vendors SET has_menu = 1 WHERE id = ?').run(vendorId);
        return { categoryCount, itemCount };
    });

    return runImport(vendor.id, importedCategories);
};

const listOrders = ({ page, limit, query, status }) => {
    const where = [];
    const params = [];
    if (query) {
        where.push('(fo.title LIKE ? OR fv.name LIKE ?)');
        params.push(`%${query}%`, `%${query}%`);
    }
    if (status) {
        where.push('fo.status = ?');
        params.push(status);
    }
    const whereSql = where.length > 0 ? `WHERE ${where.join(' AND ')}` : '';
    const total = db.prepare(`
        SELECT COUNT(*) AS count
        FROM foodorder_orders fo
        LEFT JOIN foodorder_vendors fv ON fv.id = fo.vendor_id
        ${whereSql}
    `).get(...params).count;
    const offset = (page - 1) * limit;
    const orders = db.prepare(`
        SELECT
            fo.*,
            fv.uuid AS vendor_uuid,
            fv.name AS vendor_name,
            fv.description AS vendor_description,
            fv.has_menu AS vendor_has_menu,
            COUNT(foi.id) AS item_count,
            COALESCE(SUM(foi.price_at_order * foi.quantity), 0) AS total
        FROM foodorder_orders fo
        LEFT JOIN foodorder_vendors fv ON fv.id = fo.vendor_id
        LEFT JOIN foodorder_order_items foi ON foi.order_id = fo.id
        ${whereSql}
        GROUP BY fo.id
        ORDER BY fo.created_at DESC
        LIMIT ? OFFSET ?
    `).all(...params, limit, offset).map(order => mapOrder(order, false));
    return { orders, pagination: pageMeta(page, limit, total) };
};

const getOrders = (whereSql = '', params = [], includeItems = false) => {
    return db.prepare(`
        SELECT
            fo.*,
            fv.uuid AS vendor_uuid,
            fv.name AS vendor_name,
            fv.description AS vendor_description,
            fv.has_menu AS vendor_has_menu,
            COUNT(foi.id) AS item_count,
            COALESCE(SUM(foi.price_at_order * foi.quantity), 0) AS total
        FROM foodorder_orders fo
        LEFT JOIN foodorder_vendors fv ON fv.id = fo.vendor_id
        LEFT JOIN foodorder_order_items foi ON foi.order_id = fo.id
        ${whereSql}
        GROUP BY fo.id
        ORDER BY fo.created_at DESC
    `).all(...params).map((order) => mapOrder(order, includeItems));
};

const createOrder = (body, createdBy) => {
    const vendor = getVendorByUuid(body.vendorUuid);
    if (!vendor) return null;
    const uuid = crypto.randomUUID();
    db.prepare(`
        INSERT INTO foodorder_orders (uuid, title, vendor_id, status, order_deadline, created_by)
        VALUES (?, ?, ?, ?, ?, ?)
    `).run(uuid, body.title, vendor.id, body.status, body.orderDeadline || null, createdBy);
    return uuid;
};

const getAdminOrder = (uuid) => {
    const orders = getOrders('WHERE fo.uuid = ?', [uuid], true);
    return orders[0] || null;
};

const updateOrderStatus = (uuid, status) => {
    const result = db.prepare(`
        UPDATE foodorder_orders
        SET status = ?, updated_at = datetime('now')
        WHERE uuid = ?
    `).run(status, uuid);
    return result.changes > 0;
};

const updateOrderItemStatus = (id, status, adminId) => {
    const updateStatus = db.transaction((itemId, nextStatus, initiatorId) => {
        const item = db.prepare(`
            SELECT foi.*, fo.title AS order_title, u.uuid AS user_uuid
            FROM foodorder_order_items foi
            JOIN foodorder_orders fo ON fo.id = foi.order_id
            JOIN users u ON u.id = foi.user_id
            WHERE foi.id = ?
        `).get(itemId);
        if (!item) return null;

        let charged = false;
        if (nextStatus === 'completed' && !item.charged_at) {
            const customItemText = `${item.order_title} - ${item.item_name}`.slice(0, 500);
            db.prepare('UPDATE users SET balance = balance - ? WHERE id = ?').run(item.price_at_order * item.quantity, item.user_id);
            db.prepare(`
                INSERT INTO transactions (user_id, item_id, quantity, price_at_transaction, initiator_id, custom_item_text)
                VALUES (?, (SELECT id FROM items WHERE uuid = ?), ?, ?, ?, ?)
            `).run(item.user_id, TRANSACTION_ITEM_UUID, item.quantity, item.price_at_order, initiatorId, customItemText);
            charged = true;
        }

        db.prepare(`
            UPDATE foodorder_order_items
            SET status = ?, charged_at = CASE WHEN ? = 'completed' AND charged_at IS NULL THEN datetime('now') ELSE charged_at END
            WHERE id = ?
        `).run(nextStatus, nextStatus, itemId);

        return { charged };
    });

    return updateStatus(id, status, adminId);
};

const getMenu = (vendorUuid) => {
    return db.prepare(`
        SELECT
            fi.*,
            fv.uuid AS vendor_uuid,
            fc.uuid AS category_uuid,
            fc.name AS category_name,
            COALESCE(fc.sort_order, 9999) AS category_sort_order
        FROM foodorder_items fi
        JOIN foodorder_vendors fv ON fv.id = fi.vendor_id
        LEFT JOIN foodorder_item_categories fc ON fc.id = fi.category_id
        WHERE fv.uuid = ? AND fi.is_active = 1
        ORDER BY category_sort_order ASC, fc.name ASC, fi.name ASC
    `).all(vendorUuid).map(mapItem);
};

const listOpenOrders = () => ({ orders: getOrders("WHERE fo.status IN ('open', 'closed', 'ordered')") });

const getUserOrder = (uuid) => {
    const orders = getOrders("WHERE fo.uuid = ? AND fo.status IN ('open', 'closed', 'ordered')", [uuid], true);
    if (orders.length === 0) return null;
    const order = orders[0];
    return { order, menu: order.vendor ? getMenu(order.vendor.uuid) : [] };
};

const addUserOrderItem = (orderUuid, body, userId) => {
    const order = getOrderByUuid(orderUuid);
    if (!order || order.status !== 'open') return { error: 'FoodOrders.Errors.OpenOrderNotFound' };
    if (isPastDeadline(order.order_deadline)) return { error: 'FoodOrders.Errors.OrderDeadlinePassed', status: 400 };
    const vendor = db.prepare('SELECT * FROM foodorder_vendors WHERE id = ?').get(order.vendor_id);
    if (!vendor) return { error: 'FoodOrders.Errors.VendorNotFound' };

    let itemId = null;
    let itemName = body.itemName;
    let price = toCents(body.price);

    if (vendor.has_menu === 1) {
        if (!body.itemUuid) return { error: 'FoodOrders.Errors.MenuItemRequired' };
        const menuItem = db.prepare('SELECT id, name, price FROM foodorder_items WHERE uuid = ? AND vendor_id = ? AND is_active = 1').get(body.itemUuid, vendor.id);
        if (!menuItem) return { error: 'FoodOrders.Errors.MenuItemNotFound' };
        itemId = menuItem.id;
        itemName = menuItem.name;
        price = menuItem.price;
    } else if (!itemName) {
        return { error: 'FoodOrders.Errors.ItemNameRequired' };
    }

    const userBalance = getUserFoodorderBalance(userId);
    if (!userBalance) return { error: 'FoodOrders.Errors.UserNotFound', status: 404 };
    const totalPrice = price * body.quantity;
    if (userBalance.balance - userBalance.reserved < totalPrice) {
        return { error: 'FoodOrders.Errors.InsufficientFunds', status: 400 };
    }

    const result = db.prepare(`
        INSERT INTO foodorder_order_items (order_id, user_id, item_id, item_name, quantity, note, price_at_order)
        VALUES (?, ?, ?, ?, ?, ?, ?)
    `).run(order.id, userId, itemId, itemName, body.quantity, body.note, price);
    return { id: result.lastInsertRowid };
};

const deleteUserOrderItem = (orderUuid, itemId, userId) => {
    const order = getOrderByUuid(orderUuid);
    if (!order || order.status !== 'open') return { error: 'FoodOrders.Errors.OpenOrderNotFound', status: 404 };

    const item = db.prepare(`
        SELECT *
        FROM foodorder_order_items
        WHERE id = ? AND order_id = ? AND user_id = ?
    `).get(itemId, order.id, userId);
    if (!item) return { error: 'FoodOrders.Errors.OrderItemNotFound', status: 404 };
    if (item.charged_at || item.status !== 'requested') return { error: 'FoodOrders.Errors.OrderItemLocked', status: 400 };

    db.prepare('DELETE FROM foodorder_order_items WHERE id = ?').run(itemId);
    return { id: itemId };
};

module.exports = {
    listVendors,
    createVendor,
    getVendor,
    updateVendor,
    listCategories,
    createCategory,
    listVendorItems,
    createVendorItem,
    updateItem,
    importVendorMenu,
    listOrders,
    createOrder,
    getAdminOrder,
    updateOrderStatus,
    updateOrderItemStatus,
    listOpenOrders,
    getUserOrder,
    addUserOrderItem,
    deleteUserOrderItem,
};
