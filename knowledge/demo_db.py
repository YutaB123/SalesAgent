"""Small, isolated SQLite store for the handset demo and fictional CRM."""
from contextlib import contextmanager
from pathlib import Path
import sqlite3


class DemoStore:
    pg = False
    placeholder = '?'

    def __init__(self, path):
        self.path = Path(path)

    @contextmanager
    def connection(self):
        self.path.parent.mkdir(parents=True, exist_ok=True)
        conn = sqlite3.connect(self.path, timeout=10)
        conn.row_factory = sqlite3.Row
        conn.execute('PRAGMA foreign_keys=ON')
        try:
            with conn:
                yield conn
        finally:
            conn.close()
