-- ADR-0011: autenticación propia en lugar de Supabase Auth.
-- La contraseña vuelve a guardarse como hash scrypt en estudiantes.password_hash
-- (columna que ya existía antes de Supabase) y se retira auth_user_id.

ALTER TABLE estudiantes
  ADD COLUMN IF NOT EXISTS password_hash TEXT;

ALTER TABLE estudiantes
  ALTER COLUMN password_hash DROP NOT NULL;

DROP INDEX IF EXISTS estudiantes_auth_user_id_uidx;

ALTER TABLE estudiantes
  DROP COLUMN IF EXISTS auth_user_id;
