CREATE TABLE IF NOT EXISTS aforo_estado (
  id SMALLINT PRIMARY KEY CHECK (id = 1),
  aforo_actual INTEGER NOT NULL DEFAULT 0 CHECK (aforo_actual >= 0)
);

INSERT INTO aforo_estado (id, aforo_actual)
VALUES (1, 0)
ON CONFLICT (id) DO NOTHING;

CREATE TABLE IF NOT EXISTS estudiantes (
  codigo_estudiante TEXT PRIMARY KEY,
  nombre TEXT NOT NULL,
  password_hash TEXT NOT NULL,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE TABLE IF NOT EXISTS sesiones_estudiantes (
  token_hash TEXT PRIMARY KEY,
  codigo_estudiante TEXT NOT NULL REFERENCES estudiantes(codigo_estudiante) ON DELETE CASCADE,
  expires_at TIMESTAMPTZ NOT NULL
);

CREATE INDEX IF NOT EXISTS sesiones_estudiantes_expira_idx
  ON sesiones_estudiantes (expires_at);

CREATE TABLE IF NOT EXISTS qr_credenciales (
  token_hash TEXT PRIMARY KEY,
  codigo_estudiante TEXT NOT NULL REFERENCES estudiantes(codigo_estudiante) ON DELETE CASCADE,
  expires_at TIMESTAMPTZ NOT NULL,
  consumido_en TIMESTAMPTZ
);

CREATE INDEX IF NOT EXISTS qr_credenciales_estudiante_idx
  ON qr_credenciales (codigo_estudiante, expires_at);

CREATE TABLE IF NOT EXISTS estudiante_estado_acceso (
  codigo_estudiante TEXT PRIMARY KEY REFERENCES estudiantes(codigo_estudiante) ON DELETE CASCADE,
  dentro BOOLEAN NOT NULL DEFAULT FALSE
);