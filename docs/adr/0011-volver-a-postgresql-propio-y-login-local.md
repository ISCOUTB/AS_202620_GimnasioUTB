# ADR-0011: Volver a PostgreSQL propio en el Compose y login local

## Estado

Aceptada e implementada (22 de noviembre de 2026). Reemplaza a
[ADR-0009](0009-supabase-auth.md) (Supabase Auth) y a
[ADR-0010](0010-postgresql-gestionado-en-supabase.md) (PostgreSQL en
Supabase). Recupera el enfoque de credenciales propias de
[ADR-0008](0008-identidad-de-prueba-y-qr-de-acceso.md).

## Contexto

Entre el 16 y el 22 de noviembre la base de datos y el login de estudiantes se
movieron a Supabase. Ese deployment nunca llegó a funcionar en Dokploy:

- Exigía configurar a mano un proyecto externo (roles, contraseñas, pooler,
  certificado propio de Supabase y claves) que el equipo no logró completar a
  tiempo para la entrega.
- El servidor siguió ejecutando la versión de S8, de modo que el sistema
  desplegado no correspondía con el código ni con la documentación.
- La autenticación dependía de un proveedor externo para una demostración con
  cuentas sintéticas, sin ganar nada que el curso evalúe.

La arquitectura hexagonal permitía revertir sin tocar el dominio ni los casos
de uso: el router de identidad depende de un puerto de autenticación, no de
Supabase.

## Decisión

1. **PostgreSQL dentro del Compose** (`deploy/compose.lab.yaml`), con el mismo
   volumen `postgres_data` de S8, para no perder el aforo existente.
2. **Roles separados creados automáticamente.** `db-bootstrap` usa el
   superusuario solo para crear o actualizar `gimnasio_migrator` (dueño del
   esquema) y `gimnasio_runtime` (API), sin privilegios administrativos. Se
   conserva el mínimo privilegio de S13 sin pasos manuales.
3. **Esquema, permisos, cuentas y verificación en cada deploy.** `db-init`
   ejecuta `db:prepare` (esquema y migraciones en el orden correcto para
   bases nuevas o anteriores), `db:grant-runtime`, `db:seed-demo-students` y
   `db:check-security`. Si la verificación de seguridad falla, la API no
   arranca.
4. **Login local detrás de `AutenticacionEstudiantePort`.**
   `AutenticacionLocalAdapter` verifica la contraseña con scrypt (incluido en
   Node, comparación en tiempo constante) y crea sesiones de 8 horas; la base
   guarda solo el hash SHA-256 del token. El contrato HTTP no cambia, así que
   la app Flutter no se modifica.
5. **Estudiantes de prueba desde `DEMO_STUDENTS`**, una variable de Dokploy
   (`codigo|correo|nombre|contraseña;...`). Se crean o actualizan en una sola
   sentencia en cada deploy.
6. Se elimina el código de Supabase (adaptadores de Auth, scripts de
   provisionamiento, reconciliación y preflight) y la guía `docs/supabase.md`.

## Alternativas consideradas

1. **Terminar la configuración de Supabase.** Rechazada: dependía de accesos y
   pasos manuales sobre un proyecto externo, con riesgo alto a pocos días de la
   sustentación.
2. **Un solo usuario de base de datos, como en S8.** Rechazada: la API tendría
   permisos de dueño (DDL, DELETE) y contradiría el modelo de amenazas de S13.
3. **Sin login, solo el código del estudiante.** Rechazada: cualquiera podría
   generar el QR de otro estudiante.
4. **Conservar el código de Supabase desconectado.** Rechazada: código muerto
   que confunde la documentación y genera hallazgos en SonarCloud.

## Consecuencias

- El deployment no depende de servicios externos: Dokploy levanta todo con las
  variables del panel.
- `POSTGRES_USER` y `POSTGRES_PASSWORD` deben ser los mismos del volumen
  existente: la contraseña del superusuario queda fijada cuando se crea.
- La API tiene ahora permiso de lectura sobre `estudiantes.password_hash` y de
  lectura e inserción en `sesiones_estudiantes`. Nunca devuelve el hash y no
  puede modificar ni borrar sesiones.
- Las sesiones vencidas quedan en la tabla; limpiarlas es trabajo futuro.
- No hay recuperación de contraseña ni registro de cuentas: las cuentas son
  sintéticas y las administra el equipo con `DEMO_STUDENTS`.
- Las migraciones `20261116_001` (columnas de Supabase) y `20261122_001`
  (vuelta a `password_hash`) quedan en el historial; las bases nuevas aplican
  ambas en orden.
