CREATE TABLE IF NOT EXISTS users (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  username TEXT UNIQUE NOT NULL COLLATE NOCASE,
  salt TEXT NOT NULL,
  password_hash TEXT NOT NULL,
  role TEXT NOT NULL DEFAULT 'user',
  balance INTEGER NOT NULL DEFAULT 0,
  phone TEXT DEFAULT '',
  banned INTEGER NOT NULL DEFAULT 0,
  created_at INTEGER NOT NULL
);

CREATE TABLE IF NOT EXISTS sessions (
  token TEXT PRIMARY KEY,
  user_id INTEGER NOT NULL,
  created_at INTEGER NOT NULL
);

CREATE TABLE IF NOT EXISTS products (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  tier TEXT NOT NULL,
  game_id TEXT NOT NULL,
  title TEXT DEFAULT '',
  description TEXT DEFAULT '',
  price INTEGER NOT NULL,
  file_name TEXT,
  file_mime TEXT,
  file_data TEXT,
  status TEXT NOT NULL DEFAULT 'available',
  created_at INTEGER NOT NULL,
  sold_at INTEGER
);
CREATE INDEX IF NOT EXISTS idx_products_tier_status ON products(tier, status);

CREATE TABLE IF NOT EXISTS orders (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  user_id INTEGER NOT NULL,
  product_id INTEGER NOT NULL,
  price INTEGER NOT NULL,
  discount INTEGER NOT NULL DEFAULT 0,
  total INTEGER NOT NULL,
  voucher TEXT,
  created_at INTEGER NOT NULL
);
CREATE INDEX IF NOT EXISTS idx_orders_user ON orders(user_id);

CREATE TABLE IF NOT EXISTS deposits (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  user_id INTEGER NOT NULL,
  amount INTEGER NOT NULL,
  method TEXT DEFAULT '',
  note TEXT DEFAULT '',
  status TEXT NOT NULL DEFAULT 'pending',
  created_at INTEGER NOT NULL,
  processed_at INTEGER
);
CREATE INDEX IF NOT EXISTS idx_deposits_user ON deposits(user_id);

CREATE TABLE IF NOT EXISTS vouchers (
  code TEXT PRIMARY KEY,
  type TEXT NOT NULL DEFAULT 'percent',
  value INTEGER NOT NULL,
  max_uses INTEGER NOT NULL DEFAULT 0,
  used INTEGER NOT NULL DEFAULT 0,
  min_price INTEGER NOT NULL DEFAULT 0,
  expires_at INTEGER,
  active INTEGER NOT NULL DEFAULT 1,
  created_at INTEGER NOT NULL
);

CREATE TABLE IF NOT EXISTS broadcasts (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  title TEXT NOT NULL,
  message TEXT NOT NULL,
  created_at INTEGER NOT NULL
);

CREATE TABLE IF NOT EXISTS settings (
  key TEXT PRIMARY KEY,
  value TEXT
);

INSERT OR IGNORE INTO settings(key, value) VALUES ('contact', 'https://t.me/yanzstoru');
INSERT OR IGNORE INTO settings(key, value) VALUES ('deposit_info', 'DANA / OVO / GoPay: 08xxxxxxxxxx a.n Yanz Shop' || char(10) || 'Transfer sesuai nominal, lalu kirim permintaan deposit di bawah. Saldo masuk setelah admin konfirmasi.');
