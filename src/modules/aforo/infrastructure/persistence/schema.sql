-- Una sola fila con el estado del gimnasio. capacidad_maxima, abierto y
-- motivo_cierre los cambia el encargado (ADR-0012); en una base anterior los
-- agrega la migración 20261122_002.
CREATE TABLE IF NOT EXISTS aforo_estado (
  id SMALLINT PRIMARY KEY CHECK (id = 1),
  aforo_actual INTEGER NOT NULL DEFAULT 0 CHECK (aforo_actual >= 0),
  capacidad_maxima INTEGER NOT NULL DEFAULT 30,
  abierto BOOLEAN NOT NULL DEFAULT TRUE,
  motivo_cierre TEXT,
  CONSTRAINT aforo_estado_capacidad_rango_check
    CHECK (capacidad_maxima BETWEEN 1 AND 10000),
  CONSTRAINT aforo_estado_motivo_longitud_check
    CHECK (motivo_cierre IS NULL OR char_length(motivo_cierre) <= 200),
  CONSTRAINT aforo_estado_motivo_solo_cerrado_check
    CHECK (NOT abierto OR motivo_cierre IS NULL)
);

INSERT INTO aforo_estado (id, aforo_actual)
VALUES (1, 0)
ON CONFLICT (id) DO NOTHING;

CREATE TABLE IF NOT EXISTS estudiantes (
  id UUID NOT NULL DEFAULT gen_random_uuid(),
  codigo_estudiante TEXT PRIMARY KEY,
  correo TEXT,
  cedula_sintetica TEXT,
  nombre TEXT NOT NULL,
  -- Hash scrypt de la contraseña (ADR-0011); NULL = la cuenta no puede iniciar sesión.
  password_hash TEXT,
  activa BOOLEAN NOT NULL DEFAULT TRUE,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE UNIQUE INDEX IF NOT EXISTS estudiantes_id_uidx
  ON estudiantes (id);

CREATE UNIQUE INDEX IF NOT EXISTS estudiantes_correo_ci_uidx
  ON estudiantes (LOWER(correo))
  WHERE correo IS NOT NULL;

CREATE UNIQUE INDEX IF NOT EXISTS estudiantes_cedula_sintetica_uidx
  ON estudiantes (cedula_sintetica)
  WHERE cedula_sintetica IS NOT NULL;

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

ALTER TABLE aforo_estado ENABLE ROW LEVEL SECURITY;
ALTER TABLE estudiantes ENABLE ROW LEVEL SECURITY;
ALTER TABLE sesiones_estudiantes ENABLE ROW LEVEL SECURITY;
ALTER TABLE qr_credenciales ENABLE ROW LEVEL SECURITY;
ALTER TABLE estudiante_estado_acceso ENABLE ROW LEVEL SECURITY;

REVOKE ALL PRIVILEGES ON TABLE
  aforo_estado,
  estudiantes,
  sesiones_estudiantes,
  qr_credenciales,
  estudiante_estado_acceso
FROM PUBLIC;
