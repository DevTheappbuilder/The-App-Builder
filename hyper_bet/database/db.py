import os
import sqlite3
import secrets
import hashlib
from pathlib import Path

DB_PATH = Path(os.getenv("DB_PATH", "hyperbet.sqlite"))


def get_conn() -> sqlite3.Connection:
    conn = sqlite3.connect(DB_PATH)
    conn.row_factory = sqlite3.Row
    return conn


def init_db() -> None:
    with get_conn() as conn:
        conn.executescript(
            """
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
            """
        )

        conn.execute(
            "INSERT OR IGNORE INTO house (id, total_wagered, total_paid, jackpot) VALUES (1,0,0,0)"
        )
        cur = conn.execute("SELECT id FROM fairness WHERE id = 1")
        if cur.fetchone() is None:
            seed = secrets.token_hex(32)
            seed_hash = hashlib.sha256(seed.encode()).hexdigest()
            conn.execute(
                "INSERT INTO fairness (id, server_seed, server_seed_hash, previous_server_seed, rotated_at) VALUES (1,?,?,NULL,strftime('%s','now'))",
                (seed, seed_hash),
            )


def get_or_create_user(user_id: int) -> sqlite3.Row:
    uid = str(user_id)
    with get_conn() as conn:
        row = conn.execute("SELECT * FROM users WHERE user_id = ?", (uid,)).fetchone()
        if row is None:
            conn.execute(
                "INSERT INTO users (user_id, balance, client_seed, nonce) VALUES (?,1000,?,0)",
                (uid, secrets.token_hex(16)),
            )
            row = conn.execute("SELECT * FROM users WHERE user_id = ?", (uid,)).fetchone()
        return row
