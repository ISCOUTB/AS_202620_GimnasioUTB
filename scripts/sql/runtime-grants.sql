-- Permisos y políticas RLS para los roles de aplicación (docs/supabase.md).
-- Lo ejecuta `npm run db:grant-runtime` con el rol gimnasio_migrator, que es
-- dueño de las tablas después de `db:init` y por eso puede conceder permisos
-- y crear políticas. Es idempotente: GRANT no falla si ya existe y cada
-- política solo se crea si todavía no está en pg_policies.

-- 1. Rol runtime (API Express): matriz de permisos por columna.
GRANT SELECT (id, aforo_actual), UPDATE (aforo_actual)
  ON TABLE public.aforo_estado TO gimnasio_runtime;
GRANT SELECT (id, auth_user_id, codigo_estudiante, correo, nombre, activa),
  UPDATE (created_at)
  ON TABLE public.estudiantes TO gimnasio_runtime;
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

-- 2. Rol de provisionamiento (seed y vinculación de cuentas sintéticas).
-- Solo se configura si el administrador ya creó gimnasio_provisioner.
-- No recibe DELETE ni acceso a QR, presencia o aforo.
DO $$
DECLARE
  politica RECORD;
BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_catalog.pg_roles WHERE rolname = 'gimnasio_provisioner') THEN
    RAISE NOTICE 'gimnasio_provisioner no existe; se omiten sus permisos';
    RETURN;
  END IF;

  GRANT SELECT (auth_user_id, codigo_estudiante, correo, cedula_sintetica, nombre, activa),
    INSERT (auth_user_id, codigo_estudiante, correo, cedula_sintetica, nombre, activa),
    UPDATE (auth_user_id, correo)
    ON TABLE public.estudiantes TO gimnasio_provisioner;

  FOR politica IN
    SELECT * FROM (VALUES
      ('gimnasio_provisioner_estudiantes_read',
        'FOR SELECT TO gimnasio_provisioner USING (true)'),
      ('gimnasio_provisioner_estudiantes_insert',
        'FOR INSERT TO gimnasio_provisioner WITH CHECK (true)'),
      ('gimnasio_provisioner_estudiantes_update',
        'FOR UPDATE TO gimnasio_provisioner USING (true) WITH CHECK (true)')
    ) AS p(nombre, definicion)
  LOOP
    IF NOT EXISTS (
      SELECT 1 FROM pg_catalog.pg_policies
      WHERE schemaname = 'public'
        AND tablename = 'estudiantes'
        AND policyname = politica.nombre
    ) THEN
      EXECUTE format(
        'CREATE POLICY %I ON public.estudiantes %s',
        politica.nombre, politica.definicion
      );
    END IF;
  END LOOP;
END;
$$;
