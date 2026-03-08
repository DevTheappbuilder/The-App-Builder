const Database = require('better-sqlite3');
const crypto = require('crypto');

const db = new Database('hyperbet.sqlite');

db.pragma('journal_mode = WAL');

db.exec(`
CREATE TABLE IF NOT EXISTS users (
  user_id TEXT PRIMARY KEY,
  balance INTEGER NOT NULL DEFAULT 1000,
  client_seed TEXT NOT NULL,
  nonce INTEGER NOT NULL DEFAULT 0,
  wins INTEGER NOT NULL DEFAULT 0,
  losses INTEGER NOT NULL DEFAULT 0,
  total_wagered REAL NOT NULL DEFAULT 0,
  total_won REAL NOT NULL DEFAULT 0,
  last_daily INTEGER NOT NULL DEFAULT 0
);

CREATE TABLE IF NOT EXISTS house (
  id INTEGER PRIMARY KEY CHECK (id = 1),
  total_wagered REAL NOT NULL DEFAULT 0,
  total_paid REAL NOT NULL DEFAULT 0,
  jackpot REAL NOT NULL DEFAULT 0
);

CREATE TABLE IF NOT EXISTS fairness (
  id INTEGER PRIMARY KEY CHECK (id = 1),
  server_seed TEXT NOT NULL,
  server_seed_hash TEXT NOT NULL,
  previous_server_seed TEXT,
  rotated_at INTEGER NOT NULL
);
`);

const houseRow = db.prepare('SELECT id FROM house WHERE id = 1').get();
if (!houseRow) {
  db.prepare('INSERT INTO house (id, total_wagered, total_paid, jackpot) VALUES (1, 0, 0, 0)').run();
}

const fairRow = db.prepare('SELECT id FROM fairness WHERE id = 1').get();
if (!fairRow) {
  const seed = crypto.randomBytes(32).toString('hex');
  const hash = crypto.createHash('sha256').update(seed).digest('hex');
  db.prepare(
    'INSERT INTO fairness (id, server_seed, server_seed_hash, previous_server_seed, rotated_at) VALUES (1, ?, ?, NULL, ?)',
  ).run(seed, hash, Date.now());
}

const getUserStmt = db.prepare('SELECT * FROM users WHERE user_id = ?');
const createUserStmt = db.prepare(
  'INSERT INTO users (user_id, balance, client_seed, nonce, wins, losses, total_wagered, total_won, last_daily) VALUES (?, 1000, ?, 0, 0, 0, 0, 0, 0)',
);

function getOrCreateUser(userId) {
  let user = getUserStmt.get(userId);
  if (!user) {
    createUserStmt.run(userId, crypto.randomBytes(16).toString('hex'));
    user = getUserStmt.get(userId);
  }
  return user;
}

module.exports = { db, getOrCreateUser };
