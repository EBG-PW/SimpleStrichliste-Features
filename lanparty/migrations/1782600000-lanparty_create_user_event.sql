CREATE TABLE IF NOT EXISTS user_event (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    user_id INTEGER NOT NULL UNIQUE,
    arrival_date TEXT NOT NULL,
    departure_date TEXT NOT NULL,
    rules_agreed_timestamp TEXT NOT NULL,
    agb_agreed_timestamp TEXT NOT NULL,
    has_payed INTEGER NOT NULL DEFAULT 0 CHECK (has_payed IN (0, 1)),
    payment_token TEXT NOT NULL UNIQUE,
    amount_cents INTEGER NOT NULL DEFAULT 0,
    extra_data TEXT NOT NULL DEFAULT '{}',
    created_timestamp TEXT NOT NULL DEFAULT (datetime('now')),
    updated_timestamp TEXT NOT NULL DEFAULT (datetime('now')),
    FOREIGN KEY (user_id) REFERENCES users(id)
);

CREATE INDEX IF NOT EXISTS idx_user_event_payment_state ON user_event (has_payed, payment_token);
