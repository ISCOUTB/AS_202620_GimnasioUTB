# Base de datos: roles, permisos y estudiantes de prueba

Esta guía describe cómo se prepara el PostgreSQL del sistema (ADR-0011). En
Dokploy todo ocurre solo en cada deploy; localmente se ejecutan los mismos
comandos a mano.

## Roles

| Rol | Quién lo usa | Qué puede hacer |
| --- | --- | --- |
| Superusuario (`POSTGRES_USER`) | Solo `db-bootstrap` | Crear y actualizar los otros dos roles. Nunca llega a la API |
| `gimnasio_migrator` | `db-init` | Dueño de las tablas: esquema, migraciones, permisos del runtime y estudiantes de prueba. Sin privilegios administrativos |
| `gimnasio_runtime` | La API | Solo las columnas de la matriz de abajo. Sin DDL, sin `DELETE`, sin `TRUNCATE`, `NOINHERIT` y sin membresías |

Los dos roles de la aplicación se crean con
`LOGIN NOINHERIT NOSUPERUSER NOCREATEDB NOCREATEROLE NOREPLICATION NOBYPASSRLS`.
`db-bootstrap` además revoca `CONNECT`/`TEMP` sobre la base a `PUBLIC`, revoca
`CREATE` en el esquema `public` y da `CREATE` solo al migrador.

## Cadena de preparación

| Paso | Comando | Rol | Qué hace |
| --- | --- | --- | --- |
| 1 | `npm run db:bootstrap` | Superusuario (`DB_ADMIN_URL`) | Crea o actualiza los roles con las contraseñas de `DB_MIGRATIONS_URL` y `DATABASE_URL`. Si el volumen trae tablas de una versión anterior (creadas por el superusuario), las transfiere al migrador |
| 2 | `npm run db:prepare` | `gimnasio_migrator` | Si `estudiantes` ya existe, aplica migraciones y luego `schema.sql`; si no, `schema.sql` y luego migraciones. Así funciona con una base nueva, con la de S8 o con la de la versión de QR anterior |
| 3 | `npm run db:grant-runtime` | `gimnasio_migrator` | Aplica `scripts/sql/runtime-grants.sql` (permisos por columna y políticas RLS) |
| 4 | `npm run db:seed-demo-students` | `gimnasio_migrator` | Crea o actualiza las cuentas de `DEMO_STUDENTS` en una sola sentencia |
| 5 | `npm run db:check-security` | `gimnasio_runtime` | Comprueba atributos del rol, RLS y que los permisos sean exactamente la matriz |

Cada paso exige su autorización explícita (`DB_BOOTSTRAP_ENABLED`,
`DB_INIT_ENABLED` y `DB_MIGRATIONS_ENABLED`, `DB_GRANTS_ENABLED`,
`DB_SEED_ENABLED`) y la confirmación del destino (`DB_MIGRATIONS_HOST` y
`DB_MIGRATIONS_TARGET` iguales al host y la base de `DB_MIGRATIONS_URL`).
`db:bootstrap` solo acepta el host del Compose o `localhost`. Todos los pasos
son idempotentes.

## Matriz de permisos del runtime

| Tabla | `SELECT` | `INSERT` | `UPDATE` | Para qué |
| --- | --- | --- | --- | --- |
| `aforo_estado` | `id`, `aforo_actual` | — | `aforo_actual` | Leer y actualizar el contador (fila `id = 1`) |
| `estudiantes` | `id`, `codigo_estudiante`, `correo`, `nombre`, `activa`, `password_hash` | — | `created_at` | Login y perfil. `UPDATE (created_at)` solo permite bloquear la fila |
| `sesiones_estudiantes` | `token_hash`, `codigo_estudiante`, `expires_at` | las mismas | — | Crear y validar sesiones |
| `qr_credenciales` | `token_hash`, `codigo_estudiante`, `expires_at`, `consumido_en` | `token_hash`, `codigo_estudiante`, `expires_at` | `consumido_en` | Emitir y consumir QR |
| `estudiante_estado_acceso` | `codigo_estudiante`, `dentro` | las mismas | `dentro` | Saber si es ENTRADA o SALIDA |

Todas las tablas tienen RLS. Políticas destacadas:

- `gimnasio_runtime_estudiantes_lock`: `FOR UPDATE USING (true) WITH CHECK (false)`. `SELECT ... FOR UPDATE` necesita que la fila pase el `USING` de una política `UPDATE`; sin ella, emitir un QR devolvía "sesión no válida". `WITH CHECK (false)` impide cualquier modificación real del perfil.
- `aforo_estado` solo permite la fila `id = 1`.
- `sesiones_estudiantes` permite leer e insertar, nunca actualizar.

La cédula sintética no está en la matriz: la API no puede leerla.

## Contraseñas y sesiones

- Contraseña: `scrypt` con salt aleatorio de 16 bytes y clave de 64 bytes, guardada como `scrypt$<salt>$<clave>` en `estudiantes.password_hash`. La verificación compara en tiempo constante y, si el correo no existe, igual calcula un hash para no revelar qué correos están registrados.
- Sesión: token aleatorio de 32 bytes que solo tiene la app; la base guarda su SHA-256 con vencimiento de 8 horas.
- QR: token aleatorio de 32 bytes, vence en 60 segundos y se consume una vez (ADR-0008).

## `DEMO_STUDENTS`

```text
codigo|correo|nombre|contraseña;codigo|correo|nombre|contraseña
```

- Código: de 3 a 20 letras, números o guiones.
- Correo: termina en `@utb.edu.co`; no puede pertenecer a otro código.
- Contraseña: 12 caracteres o más, sin `|` ni `;`.
- Máximo 50 estudiantes. Si un estudiante deja de estar en la lista, no se borra.
- Si la variable está vacía, el paso se omite y la API arranca sin cuentas.

Los mensajes de error nunca repiten las contraseñas; además, los scripts
reemplazan por `[redactado]` cualquier contraseña de las URLs o de
`DEMO_STUDENTS` antes de imprimir.
