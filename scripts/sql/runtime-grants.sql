-- Permisos por columna y políticas RLS del rol de la API (gimnasio_runtime).
-- Lo ejecuta `npm run db:grant-runtime` con gimnasio_migrator, que es dueño de
-- las tablas después de `db:prepare` y por eso puede conceder permisos y crear
-- políticas. Es idempotente: GRANT no falla si ya existe y cada política solo
-- se crea si todavía no está en pg_policies. `npm run db:check-security`
-- comprueba que el resultado sea exactamente esta matriz.

GRANT SELECT (id, aforo_actual), UPDATE (aforo_actual)
  ON TABLE public.aforo_estado TO gimnasio_runtime;
-- password_hash: la API verifica la contraseña en el login (ADR-0011).
-- UPDATE (created_at) solo existe para poder bloquear la fila con FOR UPDATE.
GRANT SELECT (id, codigo_estudiante, correo, nombre, activa, password_hash),
  UPDATE (created_at)
  ON TABLE public.estudiantes TO gimnasio_runtime;
GRANT SELECT (token_hash, codigo_estudiante, expires_at),
  INSERT (token_hash, codigo_estudiante, expires_at)
  ON TABLE public.sesiones_estudiantes TO gimnasio_runtime;
GRANT SELECT (token_hash, codigo_estudiante, expires_at, consumido_en),
  INSERT (token_hash, codigo_estudiante, expires_at),
  UPDATE (consumido_en)
  ON TABLE public.qr_credenciales TO gimnasio_runtime;
GRANT SELECT (codigo_estudiante, dentro),
  INSERT (codigo_estudiante, dentro),
  UPDATE (dentro)
  ON TABLE public.estudiante_estado_acceso TO gimnasio_runtime;

DO $$
DECLARE
  politica RECORD;
BEGIN
  FOR politica IN
    SELECT * FROM (VALUES
      ('aforo_estado', 'gimnasio_runtime_aforo_read',
        'FOR SELECT TO gimnasio_runtime USING (id = 1)'),
      ('aforo_estado', 'gimnasio_runtime_aforo_update',
        'FOR UPDATE TO gimnasio_runtime USING (id = 1) WITH CHECK (id = 1)'),
      ('estudiantes', 'gimnasio_runtime_estudiantes_read',
        'FOR SELECT TO gimnasio_runtime USING (true)'),
      -- SELECT ... FOR UPDATE (emitir y consumir QR) exige que la fila pase
      -- también el USING de una política UPDATE. WITH CHECK (false) permite
      -- bloquear la fila pero rechaza cualquier modificación real del perfil.
      ('estudiantes', 'gimnasio_runtime_estudiantes_lock',
        'FOR UPDATE TO gimnasio_runtime USING (true) WITH CHECK (false)'),
      ('sesiones_estudiantes', 'gimnasio_runtime_sesiones_read',
        'FOR SELECT TO gimnasio_runtime USING (true)'),
      ('sesiones_estudiantes', 'gimnasio_runtime_sesiones_insert',
        'FOR INSERT TO gimnasio_runtime WITH CHECK (true)'),
      ('qr_credenciales', 'gimnasio_runtime_qr_read',
        'FOR SELECT TO gimnasio_runtime USING (true)'),
      ('qr_credenciales', 'gimnasio_runtime_qr_insert',
        'FOR INSERT TO gimnasio_runtime WITH CHECK (true)'),
      ('qr_credenciales', 'gimnasio_runtime_qr_update',
        'FOR UPDATE TO gimnasio_runtime USING (true) WITH CHECK (true)'),
      ('estudiante_estado_acceso', 'gimnasio_runtime_estado_read',
        'FOR SELECT TO gimnasio_runtime USING (true)'),
      ('estudiante_estado_acceso', 'gimnasio_runtime_estado_insert',
        'FOR INSERT TO gimnasio_runtime WITH CHECK (true)'),
      ('estudiante_estado_acceso', 'gimnasio_runtime_estado_update',
        'FOR UPDATE TO gimnasio_runtime USING (true) WITH CHECK (true)')
    ) AS p(tabla, nombre, definicion)
  LOOP
    IF NOT EXISTS (
      SELECT 1 FROM pg_catalog.pg_policies
      WHERE schemaname = 'public'
        AND tablename = politica.tabla
        AND policyname = politica.nombre
    ) THEN
      EXECUTE format(
        'CREATE POLICY %I ON public.%I %s',
        politica.nombre, politica.tabla, politica.definicion
      );
    END IF;
  END LOOP;
END;
$$;
