CREATE TABLE music (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    name TEXT NOT NULL CHECK (length(name) BETWEEN 1 AND 160),
    filename TEXT NOT NULL UNIQUE,
    bytes INTEGER NOT NULL CHECK (bytes > 0 AND bytes <= 31457280),
    created_at TEXT NOT NULL DEFAULT (strftime('%Y-%m-%dT%H:%M:%fZ', 'now'))
);
