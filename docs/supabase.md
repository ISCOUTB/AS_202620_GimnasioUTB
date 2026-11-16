# Configuración de Supabase para el backend

## Alcance y estado

El backend usa el driver PostgreSQL `pg` existente para conectarse a una base
local o a Supabase PostgreSQL. Supabase Auth es la fuente de autenticación de
estudiantes. Flutter continúa comunicándose únicamente con la API Express.

La conectividad PostgreSQL se comprobó previamente con una consulta `SELECT 1`;
esto no valida todavía el esquema, permisos, RLS ni los flujos completos de la
API. El repositorio no incluye credenciales. Las pruebas locales usan dobles de
Auth y el adapter de identidad en memoria; no son evidencia de un login real.

## Responsabilidades de las claves

| Variable | Uso |
|---|---|
| `DATABASE_URL` | Conexión del backend al PostgreSQL mediante `pg`, exclusivamente con `gimnasio_runtime`. |
| `DATABASE_SSL` | TLS PostgreSQL. Es obligatorio por defecto; `false` solo se admite para `localhost`, `127.0.0.1`, `::1` y el servicio local `postgres`. |
| `DB_MIGRATIONS_URL` | Conexión de `gimnasio_migrator`, solo para bootstrap/migraciones. No se usa en la API. |
| `DB_PROVISIONING_URL` | Conexión separada para seed/vinculación; no se necesita para la primera inicialización. Nunca se usa en la API. |
| `DB_RECONCILIATION_URL` | Conexión de solo lectura para reconciliación; no se necesita para la primera inicialización ni se usa en la API. |
| `SUPABASE_URL` | Base URL del proyecto para los endpoints Auth. |
| `SUPABASE_PUBLISHABLE_KEY` | Clave preferida de aplicación; el adapter backend la envía como `apikey`. No sustituye el access token del usuario. |
| `SUPABASE_ANON_KEY` | Clave heredada admitida como fallback cuando no se define la publishable key. |
| `SUPABASE_SERVICE_ROLE_KEY` | Solo las herramientas administrativas de seed, vínculo y reconciliación la utilizan. No es necesaria para arrancar la API y no debe enviarse al cliente. |

Al ejecutar `npm start`, `npm run dev` o un comando administrativo `db:*`, se
carga el `.env` de la raíz mediante una ruta independiente del directorio
actual. Las variables inyectadas por el proceso o contenedor tienen prioridad.
Si el archivo no existe, se admiten variables inyectadas; otros errores de
lectura detienen el comando. Cada herramienta usa únicamente la conexión que
corresponde a su función. Antes de componer la API, el proceso runtime elimina `DB_MIGRATIONS_URL`,
`DB_PROVISIONING_URL`, `DB_RECONCILIATION_URL` y
`SUPABASE_SERVICE_ROLE_KEY` de su entorno; aunque estén configuradas para otras
herramientas, no quedan disponibles para los adapters runtime.

La clave publishable es compatible con el encabezado `apikey` que espera el
adapter: Supabase la define como clave de API de bajo privilegio, mientras que
el access token Auth del usuario se envía aparte como `Authorization: Bearer`.
El adapter prefiere `SUPABASE_PUBLISHABLE_KEY` y conserva `SUPABASE_ANON_KEY`
para proyectos que aún usan la clave heredada. No utiliza la clave de servicio
para el login de estudiantes. Consulta la
[documentación de API keys de Supabase](https://supabase.com/docs/guides/getting-started/api-keys).

`DATABASE_URL` y `DB_MIGRATIONS_URL` deben ser URI PostgreSQL válidas. Las
conexiones usan TLS con `rejectUnauthorized: true`; no se desactiva la
validación del certificado ni se confía en `sslmode=no-verify`. La configuración
fuerza TLS aunque la URI incluya parámetros SSL que pudieran debilitarlo. El
modo sin TLS solo se permite explícitamente para hosts locales indicados arriba.
La API no crea tablas ni inicializa la base al arrancar.

El backend no usa Supabase Auth como sustituto de sus reglas de autorización
ni permite al cliente escribir directamente en las tablas. El token compartido
del operador sigue siendo una credencial separada.

## Preparación manual del proyecto

1. Crea un proyecto Supabase dedicado a demostración/pruebas; no uses datos ni
   cuentas institucionales.
2. En la configuración de Auth, habilita email y contraseña. No configures un
   servidor de correo para la demostración. Las cuentas creadas por el script
   se marcan confirmadas desde el endpoint administrativo de Auth.
3. Copia la URL y la clave publishable del proyecto al entorno privado del
   backend como `SUPABASE_URL` y `SUPABASE_PUBLISHABLE_KEY`. La clave `anon`
   heredada sigue admitida bajo el nombre `SUPABASE_ANON_KEY`.
4. Prepara manualmente `gimnasio_runtime` y `gimnasio_migrator` con el SQL de
   esta guía; no reutilices el rol administrativo actual. Establece sus
   contraseñas en el gestor de secretos, sin incluirlas en el SQL, el
   repositorio o los logs.
5. Configura `DATABASE_URL` y `DB_MIGRATIONS_URL` con usuarios distintos,
   dirigidos a la misma base/proyecto y con TLS validado. Para el runner de
   migraciones usa conexión directa o pooler en modo sesión, porque mantiene
   un advisory lock de sesión. La configuración de provisionamiento y
   reconciliación se difiere hasta que esos flujos se autoricen.
6. Para inicializar, configura además `DB_INIT_ENABLED`,
   `DB_MIGRATIONS_HOST`, `DB_MIGRATIONS_TARGET`,
   `DB_MIGRATIONS_PROJECT_REF` y el `SUPABASE_URL` que confirma el proyecto.
   `DB_MIGRATIONS_ENABLED` solo se necesita para migrar una base legacy.
7. Configura los endpoints privados en el entorno local solo si se va a probar
   contra Supabase. No añadas valores reales a `.env.example`.

Para el Compose de Dokploy, configura `SUPABASE_URL`,
`SUPABASE_PUBLISHABLE_KEY` (o `SUPABASE_ANON_KEY` para instalaciones heredadas)
y la `DATABASE_URL` del runtime en el servicio API. `DB_MIGRATIONS_URL` solo se
inyecta en `db-init`; `DB_PROVISIONING_URL`, `DB_RECONCILIATION_URL` y
`SUPABASE_SERVICE_ROLE_KEY` solo deben existir en el proceso administrativo que
los necesita. El seed y la vinculación no se ejecutan dentro de la API ni en
producción.

El Compose de PostgreSQL local requiere `DATABASE_URL` y `DB_MIGRATIONS_URL`
separadas en `deploy/.env`; ambas apuntan al servicio `postgres` pero deben
usar roles distintos ya aprovisionados. `POSTGRES_USER` y
`POSTGRES_PASSWORD` inicializan la instancia y no se reutilizan como URL de la
API ni de `db-init`. Esta modificación no crea roles y el despliegue no arrancará
hasta que existan y las URLs se configuren.

La API devuelve `503` en las rutas de identidad si no están configurados
`SUPABASE_URL` y alguna de las claves publishable/anon. Si solo se define la URL
o una clave, el servidor falla al iniciar con un error de configuración
explícito.

## Roles, permisos y RLS

Flutter no se conecta a PostgreSQL: Express es el único intermediario. Los
permisos siguientes son para el usuario efectivo del pool runtime, no para
`anon`, `authenticated` ni `service_role` del API REST de Supabase.

### Operaciones SQL y matriz runtime

Las consultas del adapter de aforo leen y bloquean `aforo_estado`, y actualizan
`aforo_actual`. El adapter de identidad consulta `estudiantes` y
`estudiante_estado_acceso`, crea/consume `qr_credenciales` y actualiza
`consumido_en`/`dentro`. El permiso `UPDATE(created_at)` sobre `estudiantes`
solo permite satisfacer el requisito de `SELECT ... FOR UPDATE`; la tabla no
tendrá política RLS de `UPDATE`, por lo que las escrituras runtime sobre
perfiles siguen denegadas. No hay consultas runtime a
`sesiones_estudiantes`. Supabase Auth se consulta por HTTPS; el backend no
consulta `auth.users` por SQL.

| Objeto | SELECT | INSERT | UPDATE | DELETE/otros | Motivo |
|---|---:|---:|---:|---:|---|
| `public.aforo_estado` | Columnas `id`, `aforo_actual` | No | Columna `aforo_actual` | No | Consulta y transición del contador; política de fila limita a `id = 1`. |
| `public.estudiantes` | Columnas `id`, `auth_user_id`, `codigo_estudiante`, `correo`, `nombre`, `activa` | No | Columna `created_at` solo para `SELECT FOR UPDATE` | No | No se cambia el perfil en runtime; no se crea política RLS de `UPDATE`. |
| `public.qr_credenciales` | Columnas `token_hash`, `codigo_estudiante`, `expires_at`, `consumido_en` | `token_hash`, `codigo_estudiante`, `expires_at` | Columna `consumido_en` | No | Busca/bloquea tokens, crea credenciales y marca consumo. |
| `public.estudiante_estado_acceso` | Columnas `codigo_estudiante`, `dentro` | `codigo_estudiante`, `dentro` | Columna `dentro` | No | Lee el estado y usa `INSERT ... ON CONFLICT DO UPDATE`. |
| `public.sesiones_estudiantes` | No | No | No | No | Tabla legacy; el adapter actual no la consulta. |
| `public.schema_migrations` | No | No | No | No | Exclusiva del rol migrador. |
| `auth.users` | No | No | No | No | Auth se consume por HTTPS, no por SQL. |

No se necesitan `DELETE`, `TRUNCATE`, `REFERENCES`, `TRIGGER` ni `MAINTAIN`
para las consultas de la API. PostgreSQL permite permisos DML por columna y la
sonda posterior a la inicialización los reconoce y rechaza grants DML a nivel
de tabla. La documentación de [`SELECT`](https://www.postgresql.org/docs/current/sql-select.html)
establece que `SELECT ... FOR UPDATE` requiere `UPDATE` en al menos una columna
de cada tabla bloqueada; por eso `created_at` es el permiso mínimo adicional
en `estudiantes`. Una futura refactorización podría retirar ese permiso con un
mecanismo alternativo de bloqueo, pero necesitaría pruebas de concurrencia.

Los scripts `db:seed-demo-student` y `db:link-student-auth` escriben en
`estudiantes` y usan exclusivamente `DB_PROVISIONING_URL`, con un rol DML
separado; no hacen fallback a `DATABASE_URL`. El validador exige además que
ambas URLs indiquen el mismo destino y roles distintos. `db:reconcile-identities`
es de solo lectura y usa `DB_RECONCILIATION_URL` (solo `SELECT` sobre
estudiantes), con un rol separado; requiere `SUPABASE_SERVICE_ROLE_KEY` para
listar usuarios Auth.

### Diseño de roles

| Rol propuesto | Atributos y propiedad | Permisos/uso |
|---|---|---|
| `gimnasio_migrator` | Login dedicado; `NOSUPERUSER`, `NOCREATEDB`, `NOCREATEROLE`, `NOREPLICATION`, `NOBYPASSRLS`, `NOINHERIT`; sin membresías. No es dueño de `public`, pero será dueño de los objetos que cree. | Solo `DB_MIGRATIONS_URL`; `USAGE` y `CREATE` en `public`; ejecuta bootstrap/migraciones con autorización y destino confirmado. Como dueño de objetos puede omitir RLS sobre ellos aunque `BYPASSRLS` sea falso; nunca usar como runtime. |
| `gimnasio_runtime` | Login distinto; mismos atributos administrativos prohibidos y `NOINHERIT`; no es dueño de esquema/tablas ni miembro de otros roles. `BYPASSRLS` falso. | `DATABASE_URL`; `USAGE` de `public`, sin `CREATE`, solo permisos DML por columna y políticas RLS indicadas abajo. |
| `gimnasio_provisioner` | No se prepara en esta etapa. Login no propietario, sin DDL ni atributos administrativos ni `BYPASSRLS`. | `DB_PROVISIONING_URL`, solo para seed/vinculación tras configurar sus permisos y política RLS por separado. |
| `gimnasio_auditor` | No se prepara en esta etapa. Login no propietario, sin DDL/DML excepto lectura autorizada. | `DB_RECONCILIATION_URL`, solo para reconciliación tras configurar su política RLS por separado. |
| Supabase Auth | No es un rol PostgreSQL. | La API normal usa HTTPS, publishable key y access token. `SUPABASE_SERVICE_ROLE_KEY` queda en herramientas administrativas Auth, nunca en Flutter ni como `DATABASE_URL`. |

El código local ya comprueba que las URLs de runtime y esquema sean distintas
y que el rol efectivo de `DB_MIGRATIONS_URL` no tenga privilegios
administrativos ni `BYPASSRLS`; ahora también exige que, para bases locales, la
URL runtime apunte al mismo destino con otro rol. Seed/vínculo exigen que
`DB_PROVISIONING_URL` y `DATABASE_URL` pertenezcan al mismo destino y tengan
roles distintos; la reconciliación aplica la misma separación para su URL
read-only y rechaza reutilizar los roles de migraciones/provisionamiento cuando
están disponibles para validación. Estas validaciones de URL no verifican los
grants reales ni sustituyen la revisión manual de atributos/ACL. El rol remoto
actual, según la auditoría previa, no es apto para ninguno de esos usos.

### SQL propuesto para preparar roles

Este bloque es una **propuesta no ejecutada**. Antes de aplicarlo, consulta
`pg_roles` para confirmar que los roles no existen y revisa las ACL actuales.
Si ya existen, detente y audítalos en vez de ejecutar `CREATE ROLE`. El ejemplo
usa el nombre estándar `postgres`; cámbialo solo si el destino confirmado usa
otro nombre. Ejecútalo manualmente como administrador autorizado. No establece
contraseñas; configura las dos credenciales separadas fuera del SQL.

```sql
CREATE ROLE gimnasio_runtime
  LOGIN NOINHERIT NOSUPERUSER NOCREATEDB NOCREATEROLE
  NOREPLICATION NOBYPASSRLS;
CREATE ROLE gimnasio_migrator
  LOGIN NOINHERIT NOSUPERUSER NOCREATEDB NOCREATEROLE
  NOREPLICATION NOBYPASSRLS;

GRANT CONNECT ON DATABASE postgres TO gimnasio_runtime, gimnasio_migrator;
GRANT USAGE ON SCHEMA public TO gimnasio_runtime;
GRANT USAGE, CREATE ON SCHEMA public TO gimnasio_migrator;
REVOKE CREATE ON DATABASE postgres FROM gimnasio_runtime;
REVOKE CREATE ON SCHEMA public FROM gimnasio_runtime;

ALTER DEFAULT PRIVILEGES FOR ROLE gimnasio_migrator
  REVOKE ALL ON TABLES FROM PUBLIC, anon, authenticated, service_role;
ALTER DEFAULT PRIVILEGES FOR ROLE gimnasio_migrator
  REVOKE ALL ON SEQUENCES FROM PUBLIC, anon, authenticated, service_role;
```

`gimnasio_migrator` no recibe `CREATEDB` ni `CREATEROLE`; solo obtiene
`USAGE, CREATE` en `public` para el bootstrap vacío. Como propietario de los
objetos que cree podrá omitir RLS sobre esos objetos, aunque su atributo
`BYPASSRLS` sea falso; por eso no se usa como runtime. Las revocaciones
`REVOKE CREATE` no eliminan permisos heredados o concedidos a `PUBLIC`: el
preflight verifica privilegios efectivos y cualquier concesión preexistente
requiere inspección antes de cambiarla. Las ACL por defecto aquí solo aplican
a objetos creados por `gimnasio_migrator`, no corrigen las ACL existentes ni
las ACL por defecto de otro creador como `postgres`.

Si la inspección confirma que `public` concede `CREATE` a `PUBLIC` o a los
roles REST de Supabase, el administrador debe revisar el impacto antes de
revocar el permiso en ese esquema. La propuesta acotada es:

```sql
REVOKE CREATE ON SCHEMA public FROM PUBLIC, anon, authenticated, service_role;
```

Esto afecta a todos esos principals en `public`, no solo a `gimnasio_runtime`;
no se debe aplicar si alguna integración existente depende de crear objetos
allí. El migrador conserva su `CREATE` explícito. No se propone revocar permisos
en otros esquemas o bases.

El orden es: aplicar manualmente este SQL; ejecutar preflight; solo tras
autorización independiente ejecutar `db:init`; y luego aplicar una sola vez
los grants y políticas runtime siguientes. Hasta completar el último paso,
RLS seguirá bloqueando las consultas de la API.

### Políticas RLS para la frontera provisional de Express

Las cinco tablas de aplicación tienen RLS habilitado, pero no se encontraron
políticas remotas. Un rol runtime no propietario y sin `BYPASSRLS` no puede
operar hasta definir políticas: con RLS habilitado y sin política se aplica
denegación por defecto. El siguiente SQL es una **propuesta para aplicar una
sola vez después de `db:init`**, una vez revisado y autorizado. Otorga acceso
por operación al rol runtime; no crea ni pretende ofrecer aislamiento por
estudiante.

El código valida los tokens mediante Supabase Auth HTTPS, pero no transmite el
JWT ni un contexto de usuario verificado a la sesión PostgreSQL. Por tanto,
`auth.uid()` no puede identificar al estudiante en estas conexiones. Las
políticas por rol a continuación confían a Express la autorización por
estudiante y no proporcionan aislamiento RLS entre estudiantes. Si se requiere
aislamiento en PostgreSQL, primero hay que diseñar cómo establecer y validar
contexto por transacción y separar el flujo del operador; ese cambio no existe
actualmente.

La frontera provisional de confianza es Express:

- **Express** valida el access token contra Supabase Auth, vincula el `auth_user_id`
  con el perfil local, rechaza cuentas inactivas, valida el QR de un solo uso y
  aplica el token del operador a los accesos manuales.
- **PostgreSQL** restringe cada rol por tabla/operación, aplica RLS y
  restricciones/índices, y serializa las transiciones con transacciones y
  bloqueos. RLS sin una identidad verificada puede limitar al rol backend por
  tabla y fijar filas globales (por ejemplo `aforo_estado.id = 1`), pero no
  separa estudiantes entre sí.
- **Riesgo residual:** una falla de autorización o compromiso de Express puede
  utilizar todos los permisos de runtime en las tablas habilitadas; una política
  RLS común al rol backend no evita que ese backend lea otras filas. No entregar
  credenciales runtime a Flutter, limitar columnas/operaciones y mantener la
  validación de pertenencia en los casos de uso reduce el impacto, pero no crea
  aislamiento por estudiante en PostgreSQL.
- **Reconciliación:** el rol `gimnasio_auditor` debe ser de solo lectura y solo
  necesita `SELECT` sobre `estudiantes`, pero RLS sin una política también le
  deniega esa lectura. Una futura política limitada a ese rol podría darle
  visibilidad completa de `estudiantes`, que es necesaria para reconciliar y
  sigue siendo información sensible; no se prepara SQL para aplicarla en esta
  etapa. La enumeración de Auth usa la clave service-role, que conserva
  privilegios amplios de Auth y debe mantenerse en una ejecución aislada.

El SQL propuesto aplica grants por columna y políticas por tabla/operación:

```sql
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

CREATE POLICY gimnasio_runtime_aforo_read ON public.aforo_estado
  FOR SELECT TO gimnasio_runtime USING (id = 1);
CREATE POLICY gimnasio_runtime_aforo_update ON public.aforo_estado
  FOR UPDATE TO gimnasio_runtime USING (id = 1) WITH CHECK (id = 1);
CREATE POLICY gimnasio_runtime_estudiantes_read ON public.estudiantes
  FOR SELECT TO gimnasio_runtime USING (true);
CREATE POLICY gimnasio_runtime_qr_read ON public.qr_credenciales
  FOR SELECT TO gimnasio_runtime USING (true);
CREATE POLICY gimnasio_runtime_qr_insert ON public.qr_credenciales
  FOR INSERT TO gimnasio_runtime WITH CHECK (true);
CREATE POLICY gimnasio_runtime_qr_update ON public.qr_credenciales
  FOR UPDATE TO gimnasio_runtime USING (true) WITH CHECK (true);
CREATE POLICY gimnasio_runtime_estado_read ON public.estudiante_estado_acceso
  FOR SELECT TO gimnasio_runtime USING (true);
CREATE POLICY gimnasio_runtime_estado_insert ON public.estudiante_estado_acceso
  FOR INSERT TO gimnasio_runtime WITH CHECK (true);
CREATE POLICY gimnasio_runtime_estado_update ON public.estudiante_estado_acceso
  FOR UPDATE TO gimnasio_runtime USING (true) WITH CHECK (true);
```

La ausencia de política `UPDATE` en `estudiantes` mantiene denegada la
modificación de perfiles por runtime aunque exista el permiso de columna para
bloqueo. Las políticas `true` para estudiantes, QR y estado son deliberadamente
amplias para las consultas actuales: un proceso Express comprometido podría
leer/modificar filas de otros estudiantes en las operaciones permitidas. No se
concede `DELETE`, ni acceso runtime a `sesiones_estudiantes`,
`schema_migrations` o `auth.users`. No se preparan aquí políticas para
provisionamiento/reconciliación; esos roles necesitan un análisis y permiso
manual independiente antes de ejecutar sus comandos.

### Privilegios por defecto

La auditoría remota encontró privilegios amplios para `anon` y
`authenticated` en objetos futuros de `public`, incluidos `TRUNCATE`,
`TRIGGER` y `MAINTAIN`. Los `REVOKE` añadidos al esquema base/migración protegen
las tablas de aplicación presentes y el runner protege `schema_migrations`;
no corrigen por sí solos las ACL predeterminadas de otros roles creadores.

El administrador debe inspeccionar primero `pg_default_acl`, su rol creador y
si la ACL es global o específica de esquema. `ALTER DEFAULT PRIVILEGES` afecta
los objetos creados por el rol indicado. Una revocación `IN SCHEMA public` no
retira una concesión global; la revocación global puede afectar otros esquemas
del mismo creador. La opción de menor alcance es un rol creador dedicado y
revocar los grants en el mismo alcance donde fueron concedidos. La propuesta
de `ALTER DEFAULT PRIVILEGES` para el creador dedicado `gimnasio_migrator` está
incluida en el SQL de preparación de roles. No corrige ACL existentes ni las
ACL por defecto de `postgres`; cualquier concesión global de otro creador
requiere inspección y una decisión separada. No se ha ejecutado ningún SQL.

## Verificación PostgreSQL de solo lectura

### Preflight antes de `db:init`

`npm run db:check-connections` usa `DATABASE_URL` y `DB_MIGRATIONS_URL` para
ejecutar una consulta de lectura por conexión y cerrar ambos pools. Carga el
`.env` raíz sin imprimir sus valores y valida primero que las URLs representen
el mismo destino confirmado. Comprueba TLS, roles efectivos
`gimnasio_runtime`/`gimnasio_migrator`, ausencia de atributos administrativos y
herencia, acceso `USAGE`/`CREATE` esperado en `public`, ausencia de `CREATE`
runtime en base/esquema y que no existan las tablas esperadas ni
`schema_migrations`.

La sonda comprueba los grants de esquema sin crear objetos; no ejecuta DDL para
probar el migrador. Si algún check falla, no ejecutes `db:init`. El resultado
no contiene host, URLs, contraseñas ni claves. Este comando no se ha ejecutado
contra Supabase en esta etapa.

### Comprobación después de aplicar grants y políticas

`npm run db:check-security` valida el rol runtime: TLS, atributos,
existencia/RLS de tablas, permisos efectivos y columnas exactas de la matriz,
ausencia de grants DML amplios a nivel de tabla y restricciones de acceso a
`public`/`auth`.
Cierra el pool y no revela credenciales. No valida expresiones ni aislamiento
de fila. Inspecciona también manualmente `pg_policies` mediante una consulta
`SELECT`:

```sql
SELECT schemaname, tablename, policyname, roles, cmd, qual, with_check
FROM pg_catalog.pg_policies
WHERE schemaname = 'public'
  AND tablename IN (
    'aforo_estado', 'estudiantes', 'sesiones_estudiantes',
    'qr_credenciales', 'estudiante_estado_acceso'
  )
ORDER BY tablename, policyname;
```

La compatibilidad TLS se verificó localmente con `pg@8.23.0` (el manifiesto
permite `^8.16.3`): acepta `ssl: { rejectUnauthorized: true }`. La URI limpia
los parámetros SSL que podrían sobrescribir esa opción; no se deshabilita la
validación del certificado. La conexión real, certificado y TLS del servidor
se confirman con el preflight.

## Primera inicialización (pendiente de autorización)

Esta secuencia no se ha ejecutado y esta guía **no autoriza escrituras remotas**:

1. El administrador inspecciona con `SELECT` roles, miembros, propietarios,
   ACL de base/esquema y `pg_default_acl`; confirma que no existen objetos de
   aplicación. Si hay alguno, detenerse y auditarlo. Consultas de solo lectura:

   ```sql
   SELECT rolname, rolsuper, rolcreatedb, rolcreaterole, rolreplication,
          rolbypassrls, rolinherit
   FROM pg_catalog.pg_roles
   WHERE rolname IN ('gimnasio_runtime', 'gimnasio_migrator');

   SELECT pg_catalog.pg_get_userbyid(defaclrole) AS creator,
          namespace.nspname AS schema_name, defaclobjtype, defaclacl
   FROM pg_catalog.pg_default_acl defaults
   LEFT JOIN pg_catalog.pg_namespace namespace
     ON namespace.oid = defaults.defaclnamespace
   ORDER BY creator, schema_name, defaclobjtype;
   ```

   Revisa también `pg_auth_members` y las ACL de base/esquema para los dos
   roles. La creación del rol debe detenerse si alguno ya existe.
2. Ejecuta manualmente el SQL de roles propuesto y establece contraseñas
   distintas en un gestor de secretos.
3. Configura las variables requeridas abajo y ejecuta
   `npm run db:check-connections`. Continuar solo con `status: completed`, todos
   los checks verdaderos, destino/proyecto correctos y sin objetos previos.
4. Solo con autorización independiente, ejecutar exactamente
   `npm run db:init`. Aplica el esquema base desde
   `src/modules/aforo/infrastructure/persistence/schema.sql`; en base nueva no
   ejecutar `db:migrate`. El esquema no depende de `auth.users` ni crea
   extensiones; `gen_random_uuid()` está disponible en PostgreSQL moderno.
5. Aplicar manualmente, una sola vez, los grants y políticas RLS runtime. No
   iniciar Express antes de este paso.
6. Ejecutar `npm run db:check-security`, inspeccionar `pg_policies` y probar
   flujos con cuentas sintéticas en un proyecto desechable. Preparar por
   separado permisos/políticas antes de ejecutar provisionamiento o
   reconciliación.

Para el bootstrap, configura en el `.env` privado o gestor de secretos:

- `DATABASE_URL` (login runtime) y `DB_MIGRATIONS_URL` (login migrador);
- `DB_MIGRATIONS_HOST`, `DB_MIGRATIONS_TARGET`,
  `DB_MIGRATIONS_PROJECT_REF`, `SUPABASE_URL` y `DB_INIT_ENABLED=true`;
- `DATABASE_SSL` puede omitirse (TLS es obligatorio por defecto); nunca usar
  `false` para Supabase;
- `SUPABASE_PUBLISHABLE_KEY` o `SUPABASE_ANON_KEY` se requiere para Auth
  runtime, pero no para el bootstrap PostgreSQL;
- `DB_PROVISIONING_URL`, `DB_RECONCILIATION_URL`,
  `SUPABASE_SERVICE_ROLE_KEY` y sus flags no son necesarios para `db:init`;
- `DB_MIGRATIONS_ENABLED` es solo para la migración de una base legacy.

El comando exacto, solo después de la autorización independiente, es:

```text
npm run db:init
```

Esta etapa no autoriza crear roles, conceder permisos o políticas, ejecutar
`db:init`/`db:migrate`, provisionar estudiantes, ejecutar seeds ni modificar
datos remotos.

## Modelo y relación Auth-estudiante

La tabla `estudiantes` conserva `codigo_estudiante` como clave primaria para
mantener las relaciones existentes con presencia y QR. Incorpora:

- `id`: identificador interno UUID.
- `auth_user_id`: UUID único devuelto por Supabase Auth.
- `correo`: correo sintético único, normalizado a minúsculas.
- `cedula_sintetica`: identificador numérico ficticio único.
- `activa`: estado de la cuenta.

El adapter valida el access token consultando Supabase Auth y luego busca el
`auth_user_id` en la tabla. El UUID es único, pero no se declara una FK hacia
`auth.users`: el esquema también debe poder inicializarse en PostgreSQL local,
donde ese esquema externo no existe. La existencia de la identidad se verifica
en la frontera de autenticación. No se almacenan contraseñas nuevas en la tabla
de estudiantes.

Para una base ya creada, la migración conserva filas, códigos, nombres,
presencia, QR y hashes scrypt antiguos. Deja la columna legacy nullable para
permitir insertar perfiles nuevos, pero el código nuevo no lee ni escribe esos
hashes; su eliminación requeriría una decisión y migración posterior.
La tabla legacy `sesiones_estudiantes` puede permanecer en una base existente,
pero ya no se consulta ni emite tokens propios. No se elimina ninguna tabla.

Las tablas de la aplicación tienen RLS habilitado sin políticas de acceso
directo para clientes. La auditoría remota previa observó que el rol PostgreSQL
actual tiene `BYPASSRLS` y permisos administrativos; no se debe seguir usando
como rol runtime. El futuro rol runtime no propietario requerirá políticas RLS
explícitas para las cinco tablas de aplicación antes de operar. No se debe
resolver el bloqueo otorgándole `BYPASSRLS`. La clave `service_role` de Auth no
es la `DATABASE_URL`.

## Inicialización y migraciones

### Base local nueva

`npm run db:init` aplica el esquema base idempotente y crea el modelo actual.
Ahora requiere `DB_INIT_ENABLED=true`, `DB_MIGRATIONS_URL` y la confirmación
exacta de host/base; para destinos Supabase también exige que
`DB_MIGRATIONS_PROJECT_REF`, `SUPABASE_URL` y el host de conexión identifiquen
el mismo proyecto. No se ejecutó. En una base realmente nueva, el orden será:
revisar/resolver permisos y roles manualmente, verificar el destino, ejecutar
`db:init` una vez y comprobar el esquema. La migración actual ya está contenida
en el esquema base, por lo que no debe ejecutarse como paso de bootstrap.

### Base existente

La migración versionada se encuentra en
`db/migrations/20261116_001_supabase_auth_student_profile.sql`. El runner
exige `DB_MIGRATIONS_ENABLED=true`, `DB_MIGRATIONS_URL`, confirmación de
host/base y, para Supabase, el project ref. Compara el host directo con el
project ref o valida que el usuario del pooler incluya ese ref. Mantiene un
advisory lock de dos enteros y crea/protege `public.schema_migrations`, aplica
el SQL y registra la versión en la misma transacción por archivo. Así, la
creación del registro se revierte junto a la primera migración fallida.
Antes de abrir la transacción comprueba además que el rol PostgreSQL efectivo no
tenga `SUPERUSER`, `CREATEDB`, `CREATEROLE`, `REPLICATION` ni `BYPASSRLS`, y
exige que los usuarios de `DATABASE_URL` y `DB_MIGRATIONS_URL` sean distintos.

No se ejecuta al arrancar la API. La migración existente requiere que el
esquema base ya tenga `estudiantes`, `aforo_estado`,
`sesiones_estudiantes`, `qr_credenciales` y `estudiante_estado_acceso`. En una
base vacía se usa `db:init`; en una base legacy compatible se usa la migración
solo después de comparar sus objetos y revisar respaldo, permisos y RLS.
El script no se ha ejecutado como parte de esta implementación.

La migración agrega columnas e índices y conserva los datos de estudiantes,
presencia, QR y hashes legacy. Aunque estos hashes permanecen almacenados, el
backend ya no los valida: las credenciales activas pasan a ser responsabilidad
exclusiva de Supabase Auth. Haz backup y revisión de destino antes de autorizar
su ejecución.

## Provisionamiento de una cuenta sintética

`npm run db:seed-demo-student` provisiona una cuenta individual; no es un
generador masivo. Requiere:

- `NODE_ENV` distinto de `production`.
- `DB_PROVISIONING_ENABLED=true`.
- `DB_PROVISIONING_URL` con un rol distinto de runtime y del rol migrador.
- `DEMO_DATABASE_HOST` y `DEMO_DATABASE_NAME` que coincidan exactamente con
  `DB_PROVISIONING_URL`.
- `DEMO_SUPABASE_PROJECT_REF` que coincida con el host
  `<project-ref>.supabase.co`, tanto para Auth como para PostgreSQL directo o
  pooler. Supabase local solo se acepta con `NODE_ENV=test`.
- `SUPABASE_URL`, `SUPABASE_SERVICE_ROLE_KEY` y datos ficticios del estudiante.

El script no usa `DATABASE_URL` como fallback: también requiere esa URL para
verificar que el rol provisioning sea distinto del runtime y que ambos señalen
al mismo proyecto/base. Si `DB_MIGRATIONS_URL` está disponible en el proceso,
rechaza reutilizar su usuario; si no, el administrador debe verificar esa
distinción manualmente. El proceso de API elimina ambas URLs administrativas y
la clave Auth service-role de su entorno.

El seed es idempotente para la combinación código/correo: busca primero las
identidades Auth y perfiles existentes, reutiliza una cuenta con el mismo
correo y vincula el perfil existente por código cuando no hay conflicto.
Repetirlo no duplica usuarios ni perfiles. En un perfil ya existente no
sobrescribe nombre, cédula, estado ni presencia. Para un perfil nuevo usa los
valores sintéticos de las variables de seed.

Auth y PostgreSQL no comparten una transacción distribuida. Por eso el seed no
borra automáticamente cuentas ni perfiles cuando detecta una inconsistencia.
Si se pierde la respuesta de creación Auth, vuelve a listar usuarios para
recuperar el UUID. Si no puede confirmar el resultado, o falla la escritura
local, informa el estado que pudo establecer y recomienda reconciliar antes de
reintentar. Una interrupción simultánea de red/proveedor aún puede dejar un
estado incierto; no se promete atomicidad absoluta.

### Vincular un perfil existente

Para una cuenta que ya existe en Supabase Auth:

1. Ejecuta primero `npm run db:reconcile-identities` y revisa el resultado.
   El comando es de solo lectura; no modifica ni elimina cuentas o perfiles.
2. Verifica fuera de banda que el correo sintético pertenece al estudiante cuyo
   código usarás. No vincules perfiles basándote únicamente en un nombre.
3. Ejecuta:

   ```text
   npm run db:link-student-auth -- --student-code CODIGO --email XXXX@utb.edu.co
   ```

   El comando exige `DB_PROVISIONING_ENABLED=true`, la URL provisioning
   separada, el host/base PostgreSQL exactos y el proyecto Supabase indicado.
   Bloquea el perfil por código dentro de una
   transacción, valida que el usuario Auth exista y no esté asociado a otro
   código, y asigna `auth_user_id`. Solo completa `correo` si estaba vacío;
   no cambia código, nombre, cédula, `activa` ni presencia. Si ya está vinculado
   a otra identidad, falla sin sobrescribir.

4. Vuelve a ejecutar la reconciliación y confirma que no aparece en las
   categorías de perfil sin Auth, Auth sin perfil o vínculo roto.

Para un perfil existente que aún no tiene cuenta Auth, el seed idempotente
puede crearla y vincularla al `DEMO_STUDENT_ID` existente. Verifica antes que
el código y correo sintético sean correctos. Si ya existe el usuario Auth,
el seed lo reutiliza. No uses ese procedimiento con registros reales.

### Diagnóstico y recuperación

`npm run db:reconcile-identities` requiere
`DB_RECONCILIATION_ENABLED=true` y compara, en modo de solo lectura, los
usuarios Auth con los perfiles locales. Reporta:

- cuentas Auth sin perfil local;
- cuentas Auth cuyo correo puede corresponder a un perfil aún no vinculado
  (solo candidato, requiere confirmación humana);
- perfiles sin `auth_user_id`;
- perfiles que apuntan a un UUID Auth inexistente;
- diferencias de correo y UUID Auth asociados a más de un perfil.

El comando lista usuarios Auth con la clave administrativa y lee perfiles con
`DB_RECONCILIATION_URL` (rol de solo lectura); nunca imprime la clave ni
intenta corregir o borrar filas. Sus errores CLI redactan URLs, contraseñas y
la clave de servicio. Requiere `DB_RECONCILIATION_ENABLED=true`.
Después de confirmar manualmente la relación, usa la herramienta de vinculación
por código o el seed idempotente. No borres una cuenta Auth huérfana ni un
perfil local automáticamente: pueden ser resultado de una operación parcial
o una asociación aún no verificada.

El administrador asigna una contraseña individual y la entrega por un canal
seguro fuera del sistema. El seed no imprime contraseñas ni tokens.

## Flujo de autenticación

`POST /api/v1/estudiantes/sesion` recibe `correo` y `contrasena`. La API
intercambia esas credenciales con Supabase Auth y devuelve el access token
como `data.token`, preservando la forma de respuesta que consume Flutter.
Cada llamada autenticada a `POST /api/v1/estudiantes/qr` se valida contra el
endpoint de usuario de Supabase Auth y se asocia a un perfil local.

El access token expira conforme a la configuración del proyecto Supabase. La
app lo conserva solo en memoria; no persiste ni renueva access/refresh tokens.
Ante un `401` al solicitar el QR, Flutter descarta el cliente autenticado,
vuelve a la pantalla de login y explica que debe iniciar sesión nuevamente.
Cerrar sesión descarta localmente las credenciales y vuelve al login, pero no
revoca inmediatamente un access token ya emitido: seguirá siendo válido hasta
su vencimiento. No se implementa una sesión de revocación propia. El QR
conserva su token aleatorio, expiración, consumo único y almacenamiento como
hash, independiente del token Auth.

Las cuentas inactivas aún pueden autenticarse para que una persona que ya está
dentro pueda solicitar un QR de salida. El consumo del QR permite esa salida,
pero rechaza una entrada de una cuenta inactiva.

## Desarrollo y pruebas

- Usa PostgreSQL local para pruebas de adapters y migraciones.
- Las pruebas de `SupabaseAuthAdapter` sustituyen `fetch`; no contactan al
  proveedor.
- Las pruebas de rutas inyectan dobles para Auth y persistencia.
- Las pruebas PostgreSQL requieren una base con nombre que incluya `test` y
  crean/eliminan un esquema temporal. No apuntes esas pruebas a una base
  compartida ni a producción.
- La validación externa queda pendiente hasta configurar un proyecto de
  prueba, aplicar las migraciones de forma controlada y comprobar login,
  vencimiento, cuenta no vinculada, disponibilidad y seed.
