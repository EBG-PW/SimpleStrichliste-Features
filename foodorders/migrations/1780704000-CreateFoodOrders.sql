PRAGMA foreign_keys = ON;

CREATE TABLE IF NOT EXISTS foodorder_vendors (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    uuid TEXT NOT NULL UNIQUE,
    name TEXT NOT NULL UNIQUE,
    description TEXT,
    has_menu INTEGER NOT NULL DEFAULT 1,
    is_active INTEGER NOT NULL DEFAULT 1,
    created_at TEXT NOT NULL DEFAULT (datetime('now'))
);

CREATE TABLE IF NOT EXISTS foodorder_item_categories (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    uuid TEXT NOT NULL UNIQUE,
    vendor_id INTEGER NOT NULL,
    name TEXT NOT NULL,
    sort_order INTEGER NOT NULL DEFAULT 0,
    is_active INTEGER NOT NULL DEFAULT 1,
    created_at TEXT NOT NULL DEFAULT (datetime('now')),
    FOREIGN KEY (vendor_id) REFERENCES foodorder_vendors(id) ON DELETE CASCADE,
    UNIQUE (vendor_id, name)
);

CREATE TABLE IF NOT EXISTS foodorder_items (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    uuid TEXT NOT NULL UNIQUE,
    vendor_id INTEGER NOT NULL,
    category_id INTEGER,
    name TEXT NOT NULL,
    description TEXT,
    price INTEGER NOT NULL CHECK (price >= 0),
    is_active INTEGER NOT NULL DEFAULT 1,
    created_at TEXT NOT NULL DEFAULT (datetime('now')),
    FOREIGN KEY (vendor_id) REFERENCES foodorder_vendors(id) ON DELETE CASCADE,
    FOREIGN KEY (category_id) REFERENCES foodorder_item_categories(id) ON DELETE SET NULL,
    UNIQUE (vendor_id, name)
);

CREATE TABLE IF NOT EXISTS foodorder_orders (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    uuid TEXT NOT NULL UNIQUE,
    title TEXT NOT NULL,
    vendor_id INTEGER,
    status TEXT NOT NULL DEFAULT 'open' CHECK (status IN ('open', 'closed', 'ordered', 'completed', 'cancelled')),
    order_deadline TEXT,
    created_by INTEGER,
    created_at TEXT NOT NULL DEFAULT (datetime('now')),
    updated_at TEXT NOT NULL DEFAULT (datetime('now')),
    FOREIGN KEY (vendor_id) REFERENCES foodorder_vendors(id) ON DELETE SET NULL,
    FOREIGN KEY (created_by) REFERENCES users(id) ON DELETE SET NULL
);

CREATE TABLE IF NOT EXISTS foodorder_order_items (
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
    FOREIGN KEY (order_id) REFERENCES foodorder_orders(id) ON DELETE CASCADE,
    FOREIGN KEY (user_id) REFERENCES users(id) ON DELETE CASCADE,
    FOREIGN KEY (item_id) REFERENCES foodorder_items(id) ON DELETE SET NULL
);

CREATE INDEX IF NOT EXISTS idx_foodorder_items_vendor_id ON foodorder_items(vendor_id);
CREATE INDEX IF NOT EXISTS idx_foodorder_items_category_id ON foodorder_items(category_id);
CREATE INDEX IF NOT EXISTS idx_foodorder_item_categories_vendor_id ON foodorder_item_categories(vendor_id);
CREATE INDEX IF NOT EXISTS idx_foodorder_orders_status ON foodorder_orders(status);
CREATE INDEX IF NOT EXISTS idx_foodorder_orders_deadline ON foodorder_orders(order_deadline);
CREATE INDEX IF NOT EXISTS idx_foodorder_order_items_order_id ON foodorder_order_items(order_id);
CREATE INDEX IF NOT EXISTS idx_foodorder_order_items_user_id ON foodorder_order_items(user_id);
