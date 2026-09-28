CREATE TABLE IF NOT EXISTS aforo_estado (
  id SMALLINT PRIMARY KEY CHECK (id = 1),
  aforo_actual INTEGER NOT NULL DEFAULT 0 CHECK (aforo_actual >= 0)
);

INSERT INTO aforo_estado (id, aforo_actual)
VALUES (1, 0)
ON CONFLICT (id) DO NOTHING;