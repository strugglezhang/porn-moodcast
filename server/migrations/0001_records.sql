CREATE TABLE records (
    date TEXT PRIMARY KEY NOT NULL,
    weather TEXT NOT NULL CHECK (weather IN ('sunny','cloudy','fog','rain','storm','snow')),
    note TEXT NOT NULL DEFAULT '' CHECK (length(note) <= 500),
    created_at TEXT NOT NULL DEFAULT (strftime('%Y-%m-%dT%H:%M:%fZ', 'now')),
    updated_at TEXT NOT NULL DEFAULT (strftime('%Y-%m-%dT%H:%M:%fZ', 'now'))
);
