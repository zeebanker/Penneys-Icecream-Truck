-- Pennys Truck - database schema
-- One table, one row. It always holds the single latest truck state.

CREATE TABLE IF NOT EXISTS truck_state (
  id         INTEGER PRIMARY KEY,   -- always 1, so there is only ever one row
  lat        REAL,                  -- latest latitude  (NULL until first ping)
  lon        REAL,                  -- latest longitude (NULL until first ping)
  updated_at TEXT,                  -- when the location last came in (ISO 8601, UTC)
  sharing    INTEGER NOT NULL DEFAULT 0,  -- 0 = off, 1 = on (Penny's button)
  moving     INTEGER NOT NULL DEFAULT 1   -- 0 = stationary/serving, 1 = moving
);

-- Make sure the single row exists. Safe to run more than once.
INSERT OR IGNORE INTO truck_state (id, lat, lon, updated_at, sharing, moving)
VALUES (1, NULL, NULL, NULL, 0, 1);
