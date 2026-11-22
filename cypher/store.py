"""SQLite persistence for the relational graph, audit log, slang cache and DP packets.

In a real deployment this state lives on the user's device (the "edge"); here a
single local database plays that role so the whole system can be inspected.
"""

import sqlite3
import threading
from datetime import datetime, timezone
from pathlib import Path

SCHEMA = """
CREATE TABLE IF NOT EXISTS edges (
    room TEXT, src TEXT, dst TEXT,
    tolerance REAL NOT NULL,
    interactions INTEGER NOT NULL DEFAULT 0,
    flags INTEGER NOT NULL DEFAULT 0,
    updated_at TEXT NOT NULL,
    PRIMARY KEY (room, src, dst)
);
CREATE TABLE IF NOT EXISTS messages (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    room TEXT, sender TEXT, recipient TEXT, text TEXT,
    score REAL, layer INTEGER, action TEXT, reason TEXT,
    delta_v REAL, tolerance REAL,
    verification TEXT,
    created_at TEXT NOT NULL
);
CREATE TABLE IF NOT EXISTS slang (
    term TEXT PRIMARY KEY,
    severity REAL NOT NULL,
    source TEXT,
    first_seen TEXT NOT NULL,
    last_seen TEXT NOT NULL
);
CREATE TABLE IF NOT EXISTS dp_updates (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    created_at TEXT NOT NULL,
    norm_raw REAL, norm_sent REAL, noise_std REAL,
    round INTEGER
);
"""


def now_iso() -> str:
    return datetime.now(timezone.utc).isoformat(timespec="seconds")


class Store:
    def __init__(self, path: Path | str):
        if str(path) != ":memory:":
            Path(path).parent.mkdir(parents=True, exist_ok=True)
        self.conn = sqlite3.connect(str(path), check_same_thread=False)
        self.conn.row_factory = sqlite3.Row
        self.lock = threading.RLock()
        with self.lock:
            self.conn.executescript(SCHEMA)
            self.conn.commit()

    def execute(self, sql: str, params=()):
        with self.lock:
            cur = self.conn.execute(sql, params)
            self.conn.commit()
            return cur

    def query(self, sql: str, params=()) -> list[dict]:
        with self.lock:
            return [dict(r) for r in self.conn.execute(sql, params).fetchall()]

    def one(self, sql: str, params=()) -> dict | None:
        rows = self.query(sql, params)
        return rows[0] if rows else None

    def reset(self):
        with self.lock:
            for table in ("edges", "messages", "dp_updates"):
                self.conn.execute(f"DELETE FROM {table}")
            self.conn.commit()
