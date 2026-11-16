# Configuración de Supabase para el backend

## Alcance y estado

El backend usa el driver PostgreSQL `pg` existente para conectarse a una base
local o a Supabase PostgreSQL. Supabase Auth es la fuente de autenticación de
estudiantes. Flutter continúa comunicándose únicamente con la API Express.

La integración no ha sido probada contra un proyecto Supabase real porque el
repositorio no incluye credenciales. Las pruebas locales usan dobles de Auth y
el adapter de identidad en memoria; no son evidencia de conectividad externa.

## Responsabilidades de las claves

| Variable | Uso |
|---|---|
| `DATABASE_URL` | Conexión del backend al PostgreSQL local o de Supabase mediante `pg`. Utiliza la URL de conexión del dashboard y conserva el modo SSL indicado por Supabase. |
| `SUPABASE_URL` | Base URL del proyecto para los endpoints Auth. |
| `SUPABASE_PUBLISHABLE_KEY` | Clave preferida de aplicación; el adapter backend la envía como `apikey`. No sustituye el access token del usuario. |
| `SUPABASE_ANON_KEY` | Clave heredada admitida como fallback cuando no se define la publishable key. |
| `SUPABASE_SERVICE_ROLE_KEY` | Solo las herramientas administrativas de seed, vínculo y reconciliación la utilizan. No es necesaria para arrancar la API y no debe enviarse al cliente. |

Al ejecutar `npm start` o `npm run dev`, el backend carga el archivo `.env` de
la raíz del repositorio usando una ruta independiente del directorio actual.
Las variables ya establecidas por el proceso o el contenedor tienen prioridad.
Si el archivo no existe, el backend puede arrancar con variables inyectadas;
los errores de lectura distintos de archivo ausente detienen el arranque. Los
scripts administrativos `db:*` no usan este cargador y requieren que sus
variables estén disponibles en el proceso que los ejecuta.

La clave publishable es compatible con el encabezado `apikey` que espera el
adapter: Supabase la define como clave de API de bajo privilegio, mientras que
el access token Auth del usuario se envía aparte como `Authorization: Bearer`.
El adapter prefiere `SUPABASE_PUBLISHABLE_KEY` y conserva `SUPABASE_ANON_KEY`
para proyectos que aún usan la clave heredada. No utiliza la clave de servicio
para el login de estudiantes. Consulta la
[documentación de API keys de Supabase](https://supabase.com/docs/guides/getting-started/api-keys).

`DATABASE_URL` debe ser una URI de conexión PostgreSQL aceptada por `pg`, por
ejemplo `postgresql://USUARIO:CONTRASENA@HOST:5432/BASE`. Codifica los caracteres
especiales de usuario y contraseña según el formato URI y conserva los
parámetros SSL requeridos por Supabase. El adapter pasa esta URI a
`new Pool({ connectionString })`; no crea tablas ni inicializa la base al
arrancar la API.

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
4. Copia la clave `service_role` solo al entorno administrativo donde se
   ejecute el seed. No la agregues a Flutter, al repositorio, a logs ni al
   entorno normal de la API.
5. Obtén la conexión PostgreSQL desde el dashboard y configúrala como
   `DATABASE_URL`, conservando SSL. Para `db:migrate`, usa conexión directa o
   un pooler en modo sesión, porque el runner mantiene un advisory lock de
   sesión. Para el tráfico normal de la API, valida el modo de pooler elegido
   con una prueba de integración en un proyecto desechable.
6. Configura los mismos endpoints privados en el entorno local solo si se va
   a probar contra Supabase. No añadas valores reales a `.env.example`.

Para el Compose de Dokploy, configura `SUPABASE_URL` y
`SUPABASE_PUBLISHABLE_KEY` (o `SUPABASE_ANON_KEY` para instalaciones heredadas)
en el servicio API. No configures `SUPABASE_SERVICE_ROLE_KEY` en ese servicio.
El seed administrativo debe ejecutarse fuera del proceso de producción y con
sus propias protecciones y variables temporales.

La API devuelve `503` en las rutas de identidad si no están configurados
`SUPABASE_URL` y alguna de las claves publishable/anon. Si solo se define la URL
o una clave, el servidor falla al iniciar con un error de configuración
explícito.

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
directo para clientes. El backend usa su conexión PostgreSQL privada como
frontera confiable; no se debe asumir que RLS limita al dueño de la tabla. Si
se cambia a un rol de base de datos restringido, hay que definir y probar sus
permisos antes del despliegue. La clave `service_role` de Auth no es la
`DATABASE_URL`.

## Inicialización y migraciones

### Base local nueva

`npm run db:init` aplica el esquema base idempotente y crea el modelo actual.
Para una base nueva, normalmente no se requiere migración histórica.

### Base existente

La migración versionada se encuentra en
`db/migrations/20261116_001_supabase_auth_student_profile.sql`. El runner
mantiene la tabla `schema_migrations`, toma un advisory lock y aplica cada
archivo una sola vez dentro de una transacción.

No se ejecuta al arrancar la API. Antes de usarlo, verifica que `DATABASE_URL`
apunte a una base desechable/de prueba, que `DB_MIGRATIONS_HOST` y
`DB_MIGRATIONS_TARGET` coincidan exactamente con su host y nombre, y configura
`DB_MIGRATIONS_ENABLED=true`. El script no se ha ejecutado como parte de esta
implementación.

La migración agrega columnas e índices y conserva los datos de estudiantes,
presencia, QR y hashes legacy. Aunque estos hashes permanecen almacenados, el
backend ya no los valida: las credenciales activas pasan a ser responsabilidad
exclusiva de Supabase Auth. Haz backup y revisión de destino antes de autorizar
su ejecución.

## Provisionamiento de una cuenta sintética

`npm run db:seed-demo-student` provisiona una cuenta individual; no es un
generador masivo. Requiere:

- `NODE_ENV` distinto de `production`.
- `DEMO_SEED_ENABLED=true`.
- `DEMO_DATABASE_HOST` y `DEMO_DATABASE_NAME` que coincidan exactamente con
  `DATABASE_URL`.
- `DEMO_SUPABASE_PROJECT_REF` que coincida con el host
  `<project-ref>.supabase.co`. Supabase local solo se acepta con
  `NODE_ENV=test`.
- `SUPABASE_URL`, `SUPABASE_SERVICE_ROLE_KEY` y datos ficticios del estudiante.

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

   El comando exige las protecciones `DEMO_*`, el host/base PostgreSQL exactos
   y el proyecto Supabase indicado. Bloquea el perfil por código dentro de una
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

`npm run db:reconcile-identities` compara, en modo de solo lectura, los
usuarios Auth con los perfiles locales. Reporta:

- cuentas Auth sin perfil local;
- cuentas Auth cuyo correo puede corresponder a un perfil aún no vinculado
  (solo candidato, requiere confirmación humana);
- perfiles sin `auth_user_id`;
- perfiles que apuntan a un UUID Auth inexistente;
- diferencias de correo y UUID Auth asociados a más de un perfil.

El comando lista usuarios Auth con la clave administrativa y lee perfiles con
`DATABASE_URL`; nunca imprime la clave ni intenta corregir o borrar filas.
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
