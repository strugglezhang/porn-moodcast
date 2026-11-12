-- Rebuild the CHECK constraint without changing existing records or timestamps.
CREATE TABLE records_expanded (
    date TEXT PRIMARY KEY NOT NULL,
    weather TEXT NOT NULL CHECK (weather IN (
        'sunny','cloudy','fog','rain','storm','snow',
        'wind','downpour','hail','rainbow','typhoon','tornado'
    )),
    note TEXT NOT NULL DEFAULT '' CHECK (length(note) <= 500),
    created_at TEXT NOT NULL DEFAULT (strftime('%Y-%m-%dT%H:%M:%fZ', 'now')),
    updated_at TEXT NOT NULL DEFAULT (strftime('%Y-%m-%dT%H:%M:%fZ', 'now'))
);
INSERT INTO records_expanded (date,weather,note,created_at,updated_at)
SELECT date,weather,note,created_at,updated_at FROM records;
DROP TABLE records;
ALTER TABLE records_expanded RENAME TO records;
