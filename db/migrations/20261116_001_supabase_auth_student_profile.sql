ALTER TABLE estudiantes
  ADD COLUMN IF NOT EXISTS id UUID DEFAULT gen_random_uuid();

UPDATE estudiantes
SET id = gen_random_uuid()
WHERE id IS NULL;

ALTER TABLE estudiantes
  ALTER COLUMN id SET NOT NULL;

ALTER TABLE estudiantes
  ADD COLUMN IF NOT EXISTS auth_user_id UUID,
  ADD COLUMN IF NOT EXISTS correo TEXT,
  ADD COLUMN IF NOT EXISTS cedula_sintetica TEXT,
  ADD COLUMN IF NOT EXISTS activa BOOLEAN NOT NULL DEFAULT TRUE;

CREATE UNIQUE INDEX IF NOT EXISTS estudiantes_id_uidx
  ON estudiantes (id);

CREATE UNIQUE INDEX IF NOT EXISTS estudiantes_auth_user_id_uidx
  ON estudiantes (auth_user_id)
  WHERE auth_user_id IS NOT NULL;

CREATE UNIQUE INDEX IF NOT EXISTS estudiantes_correo_ci_uidx
  ON estudiantes (LOWER(correo))
  WHERE correo IS NOT NULL;

CREATE UNIQUE INDEX IF NOT EXISTS estudiantes_cedula_sintetica_uidx
  ON estudiantes (cedula_sintetica)
  WHERE cedula_sintetica IS NOT NULL;

DO $$
BEGIN
  IF EXISTS (
    SELECT 1
    FROM information_schema.columns
    WHERE table_schema = current_schema()
      AND table_name = 'estudiantes'
      AND column_name = 'password_hash'
  ) THEN
    EXECUTE 'ALTER TABLE estudiantes ALTER COLUMN password_hash DROP NOT NULL';
  END IF;
END;
$$;

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

DO $$
DECLARE
  role_name TEXT;
BEGIN
  FOREACH role_name IN ARRAY ARRAY['anon', 'authenticated', 'service_role'] LOOP
    IF EXISTS (SELECT 1 FROM pg_roles WHERE rolname = role_name) THEN
      EXECUTE format(
        'REVOKE ALL PRIVILEGES ON TABLE aforo_estado, estudiantes, sesiones_estudiantes, qr_credenciales, estudiante_estado_acceso FROM %I',
        role_name
      );
    END IF;
  END LOOP;
END;
$$;
