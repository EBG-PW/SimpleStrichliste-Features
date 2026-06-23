CREATE TABLE foodorder_orders_new (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    uuid TEXT NOT NULL UNIQUE,
    title TEXT NOT NULL,
    vendor_id INTEGER,
    status TEXT NOT NULL DEFAULT 'open' CHECK (status IN ('open', 'closed', 'ordered', 'arrived', 'completed', 'cancelled')),
    order_deadline TEXT,
    created_by INTEGER,
    created_at TEXT NOT NULL DEFAULT (datetime('now')),
    updated_at TEXT NOT NULL DEFAULT (datetime('now')),
    FOREIGN KEY (vendor_id) REFERENCES foodorder_vendors(id) ON DELETE SET NULL,
    FOREIGN KEY (created_by) REFERENCES users(id) ON DELETE SET NULL
);

INSERT INTO foodorder_orders_new (
    id, uuid, title, vendor_id, status, order_deadline, created_by, created_at, updated_at
)
SELECT
    id, uuid, title, vendor_id, status, order_deadline, created_by, created_at, updated_at
FROM foodorder_orders;

CREATE TABLE foodorder_order_items_new (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    order_id INTEGER NOT NULL,
    user_id INTEGER NOT NULL,
    item_id INTEGER,
    item_name TEXT NOT NULL,
    quantity INTEGER NOT NULL DEFAULT 1 CHECK (quantity > 0),
    note TEXT,
    price_at_order INTEGER NOT NULL DEFAULT 0 CHECK (price_at_order >= 0),
    status TEXT NOT NULL DEFAULT 'requested' CHECK (status IN ('requested', 'ordered', 'completed', 'missing', 'cancelled')),
    charged_at TEXT,
    ordered_at TEXT NOT NULL DEFAULT (datetime('now')),
    FOREIGN KEY (order_id) REFERENCES foodorder_orders_new(id) ON DELETE CASCADE,
    FOREIGN KEY (user_id) REFERENCES users(id) ON DELETE CASCADE,
    FOREIGN KEY (item_id) REFERENCES foodorder_items(id) ON DELETE SET NULL
);

INSERT INTO foodorder_order_items_new (
    id, order_id, user_id, item_id, item_name, quantity, note, price_at_order, status, charged_at, ordered_at
)
SELECT
    id, order_id, user_id, item_id, item_name, quantity, note, price_at_order, status, charged_at, ordered_at
FROM foodorder_order_items;

DROP TABLE foodorder_order_items;
DROP TABLE foodorder_orders;
ALTER TABLE foodorder_orders_new RENAME TO foodorder_orders;
ALTER TABLE foodorder_order_items_new RENAME TO foodorder_order_items;
CREATE INDEX IF NOT EXISTS idx_foodorder_orders_status ON foodorder_orders(status);
CREATE INDEX IF NOT EXISTS idx_foodorder_orders_deadline ON foodorder_orders(order_deadline);
CREATE INDEX IF NOT EXISTS idx_foodorder_order_items_order_id ON foodorder_order_items(order_id);
CREATE INDEX IF NOT EXISTS idx_foodorder_order_items_user_id ON foodorder_order_items(user_id);
