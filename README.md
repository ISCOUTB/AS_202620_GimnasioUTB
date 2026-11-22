# AS_202620_GimnasioUTB

## Sistema de Gestión de Aforo para el Gimnasio UTB

Este proyecto académico implementa un backend para consultar y actualizar el aforo, junto con una aplicación Flutter para estudiantes y encargados. La autenticación estudiantil usa Supabase Auth para cuentas sintéticas; no es SSO ni valida identidad institucional UTB. La integración externa requiere credenciales de Supabase y no se considera verificada hasta probarse contra un proyecto configurado.

## Problema y alcance

La propuesta busca ayudar a los estudiantes a conocer la ocupación del gimnasio antes de desplazarse y registrar sus accesos.

El corte vertical actual permite:

- Registrar una transición `ENTRADA` o `SALIDA`.
- Consultar el contador actual del aforo.
- Persistir el contador en PostgreSQL cuando se ejecuta el servidor real.
- Consultar liveness, readiness y un contador operacional de accesos.
- Iniciar sesión con una cuenta sintética de demostración y mostrar un QR temporal de un solo uso.
- Escanear el QR desde la cuenta de operador y registrar la entrada o salida junto con la actualización transaccional del aforo.

El QR no contiene datos personales legibles, expira en 60 segundos y solo puede consumirse una vez. La carga de estudiantes sintéticos se restringe a bases cuyo nombre incluye `test` y no se permite con `NODE_ENV=production`. El registro manual del operador sigue modificando únicamente el contador.

## Stack actual

- **Backend:** Node.js y Express, organizado con Arquitectura Hexagonal / Ports and Adapters. La decisión se describe en [ADR 0001](docs/adr/0001-arquitectura-hexagonal.md).
- **Persistencia del servidor real:** PostgreSQL mediante `AforoPostgresAdapter`; admite una instancia local o la URL PostgreSQL de Supabase.
- **Autenticación estudiantil:** adapter de Supabase Auth; la API valida el access token y lo relaciona con un perfil local. El QR temporal sigue siendo responsabilidad de la API.
- **Adapter en memoria:** disponible como implementación por defecto de `createApp()`, usada por pruebas que no requieren PostgreSQL.
- **App Flutter:** proyecto en `docs/Flutter`; consulta el aforo y registra accesos contra esta API (instrucciones en [su README](docs/Flutter/README.md)).
- **Deployment actual:** la API corre en Dokploy con `deploy/compose.lab.yaml` y usa el PostgreSQL y Auth del mismo proyecto Supabase ([ADR 0010](docs/adr/0010-postgresql-gestionado-en-supabase.md)). El Compose ya no incluye un PostgreSQL propio.

## Ejecución local

Requisitos: Node.js 18 o superior y una instancia PostgreSQL accesible. El servidor real requiere `DATABASE_URL`. Al iniciar con `npm start`, `npm run dev` o ejecutar un comando administrativo `db:*`, se carga el `.env` de la raíz del proyecto; las variables ya inyectadas por el entorno tienen prioridad. Antes de iniciar la API, se eliminan de su entorno las URLs administrativas y la clave `service_role`. Cada comando administrativo utiliza solo la conexión destinada a su función. La autenticación requiere `SUPABASE_URL` y `SUPABASE_PUBLISHABLE_KEY` o, por compatibilidad, `SUPABASE_ANON_KEY`; sin ellas las rutas de identidad responden `503`, pero el resto de la API puede iniciar.

```bash
npm install
npm start
```

`npm run db:check-connections` ejecuta un preflight de solo lectura para
`DATABASE_URL` y `DB_MIGRATIONS_URL` antes de inicializar. `npm run db:init`
prepara una base nueva, pero es una operación de escritura: requiere
`DB_INIT_ENABLED=true`, roles separados ya creados y confirmación exacta del
destino/proyecto. No se ejecuta al iniciar la API. La base queda sin acceso
runtime hasta aplicar los grants y políticas RLS documentados. Para el
procedimiento completo y el SQL propuesto revisa [la guía de Supabase y
migraciones](docs/supabase.md).

```text
npm run db:check-connections
# db:init requiere autorización independiente y roles/permisos ya preparados
npm run db:init
# solo después de aplicar grants y políticas RLS:
npm run db:check-security
```

Variables de entorno (ver `.env.example`):

| Variable | Obligatoria | Para qué |
|---|---|---|
| `DATABASE_URL` | Sí | Conexión runtime a PostgreSQL mediante `gimnasio_runtime`. |
| `DATABASE_SSL` | No | TLS es obligatorio por defecto; `false` solo para hosts PostgreSQL locales permitidos. |
| `DATABASE_SSL_CA_CERT_PATH` / `DATABASE_SSL_CA_CERT_BASE64` | Para Supabase | CA oficial de Supabase como ruta a archivo (local) o PEM en base64 (Dokploy). Solo una de las dos. |
| `DB_MIGRATIONS_URL` | Solo para inicializar/migrar | Conexión de `gimnasio_migrator`; no debe usar el rol runtime. |
| `DB_PROVISIONING_URL` | Futuro seed/vinculación | Rol DML distinto; no requerido para inicializar y nunca usado en la API. |
| `DB_RECONCILIATION_URL` | Futura reconciliación | Rol de solo lectura separado; no requerido para inicializar. |
| `SUPABASE_URL` | Para identidad | URL del proyecto Supabase, utilizada por el backend. |
| `SUPABASE_PUBLISHABLE_KEY` | Para identidad (preferida) | Clave de aplicación enviada como `apikey`; la identidad del usuario se valida por separado con su access token. |
| `SUPABASE_ANON_KEY` | Compatibilidad heredada | Se usa como `apikey` solo cuando no está definida la publishable key. No se envía desde Flutter. |
| `SUPABASE_SERVICE_ROLE_KEY` | Solo para herramientas administrativas aisladas | Clave privilegiada para seed, vinculación y reconciliación; la API la elimina de su entorno. Nunca exponer al cliente. |
| `OPERADOR_TOKEN` | Para registrar accesos | Secreto de mínimo 32 caracteres que exige `POST /api/v1/aforo/acceso`. Sin él, ese endpoint responde `503`. Generarlo con `node -e "console.log(require('crypto').randomBytes(32).toString('hex'))"`. |
| `CORS_ORIGINS` | Solo para Flutter web | Orígenes permitidos separados por coma, p. ej. `http://localhost:8080`. |
| `DB_INIT_ENABLED`, `DB_MIGRATIONS_ENABLED` | Solo para operaciones de esquema | Autorización explícita separada para inicialización y migraciones. |
| `DB_GRANTS_ENABLED` | Solo para `db:grant-runtime` | Autoriza aplicar los permisos por columna y las políticas RLS de los roles runtime y provisioning. |
| `DB_MIGRATIONS_HOST`, `DB_MIGRATIONS_TARGET`, `DB_MIGRATIONS_PROJECT_REF` | Solo para operaciones de esquema | Confirmación del host/base y, en Supabase, del proyecto asociado a la URL. |
| `DB_PROVISIONING_ENABLED`, `DEMO_DATABASE_HOST`, `DEMO_DATABASE_NAME`, `DEMO_SUPABASE_PROJECT_REF` | Solo para seed/vínculo | Habilitación explícita y confirmaciones de la base/proyecto de demostración. |
| `DB_RECONCILIATION_ENABLED` | Solo para reconciliación | Habilitación explícita de la consulta de solo lectura. |
| `DEMO_STUDENT_ID`, `DEMO_STUDENT_EMAIL`, `DEMO_STUDENT_NAME`, `DEMO_STUDENT_CEDULA`, `DEMO_STUDENT_PASSWORD` | Solo para seed | Datos sintéticos individuales. La contraseña se crea en Supabase Auth y no se guarda en la tabla de estudiantes. |

`db:init` aplica el esquema base idempotente, incluida la fila inicial de
`aforo_estado`, usando `DB_MIGRATIONS_URL`. En una base nueva se ejecuta después
de `npm run db:check-connections` y solo con autorización explícita. Luego
deben aplicarse los permisos y políticas RLS con `npm run db:grant-runtime`
antes de iniciar la API. `DATABASE_SSL=false` solo se acepta para hosts
PostgreSQL locales (desarrollo); las conexiones Supabase mantienen TLS y
validación de certificados. El servidor escucha en el puerto 3000 por defecto.
Los logs se escriben como JSON en stdout.

`npm run db:check-connections` es una comprobación de solo lectura previa al
bootstrap, valida ambas conexiones, TLS, separación de roles, permisos de
esquema y ausencia de objetos preexistentes; no prueba DDL creando objetos.
`npm run db:check-security` es la comprobación runtime posterior: valida TLS,
atributos efectivos, privilegios de esquema/base y columnas ACL esperadas;
las sondas cierran sus pools y no imprimen URLs ni credenciales. Ninguna sonda
certifica por sí sola las expresiones de las políticas RLS.

Para provisionar una cuenta sintética, sigue la guía de [configuración de Supabase](docs/supabase.md) y ejecuta el seed solo con `DB_PROVISIONING_ENABLED=true`, un `DB_PROVISIONING_URL` de rol separado y las confirmaciones exactas de proyecto/base de demostración. El script crea o reutiliza el usuario en Supabase Auth y crea o vincula el perfil. Es idempotente y no elimina cuentas automáticamente ante fallos parciales. Rechaza `NODE_ENV=production`. No uses datos personales reales.

El seed es idempotente y ya no elimina cuentas automáticamente ante fallos parciales. Para revisar estados inconsistentes, configura un rol `SELECT`-only en `DB_RECONCILIATION_URL`, habilita `DB_RECONCILIATION_ENABLED=true` y usa `npm run db:reconcile-identities`; para vincular una cuenta Auth ya existente a un perfil por código, configura `DB_PROVISIONING_URL` y `DB_PROVISIONING_ENABLED=true` antes de usar `npm run db:link-student-auth -- --student-code CODIGO --email XXXX@utb.edu.co`. Revisa primero las precauciones y el procedimiento de [recuperación y vinculación](docs/supabase.md#diagnóstico-y-recuperación).

## Deployment final (ADR-0010)

La API se despliega en Dokploy con `deploy/compose.lab.yaml`: el servicio `api` corre siempre y `db-migrate` (perfil `maintenance`) solo se usa para migraciones manuales. La base y la autenticación están en el mismo proyecto Supabase: la API se conecta por el Session Pooler con el rol `gimnasio_runtime` y TLS verificado con la CA oficial de Supabase (`DATABASE_SSL_CA_CERT_BASE64`), porque esa CA no está en el almacén de certificados de Node. Las variables del panel se listan en `deploy/.env.example`.

La base se prepara una sola vez desde un equipo del equipo, en este orden: roles (SQL en [la guía de Supabase](docs/supabase.md)), `npm run db:init`, `npm run db:grant-runtime`, `npm run db:check-security` y `npm run db:seed-demo-student`. El contenedor permanente no recibe credenciales administrativas.

Verificación después de cada deploy:

```text
GET https://gimnasio-utb.iscoutb.dev/          -> 200, descripción del servicio
GET https://gimnasio-utb.iscoutb.dev/health    -> 200 {"status":"ok",...}
GET https://gimnasio-utb.iscoutb.dev/ready     -> 200 (la API alcanza PostgreSQL)
GET https://gimnasio-utb.iscoutb.dev/api/v1/aforo -> 200 {"status":"success","data":{"aforoActual":N}}
```

## Deployment de S8 (histórico)

En S8 el Compose tenía tres servicios: `postgres` (PostgreSQL en contenedor con volumen nombrado), `db-init` y `api`. El equipo verificó entonces `Docker Compose Deployed: ✅`, los endpoints públicos y una entrada y salida (aforo 0 → 1 → 0). Ese PostgreSQL en contenedor se retiró en noviembre de 2026 al pasar la base a Supabase (ADR-0010); sus datos no se migraron.

Los archivos de deployment son `Dockerfile`, `.dockerignore`, `deploy/compose.lab.yaml` y `deploy/.env.example`. Dokploy genera `deploy/.env` desde la configuración del panel; no se versionan credenciales.

## API actual

| Método y ruta | Comportamiento |
|---|---|
| `GET /` | Raíz informativa: nombre del servicio y rutas públicas. |
| `GET /health` | Liveness estático. Responde `200` con `{"status":"ok","service":"gimnasio-utb-backend"}`. |
| `GET /ready` | Consulta el repositorio. Responde `200` si está disponible y `503` si la consulta falla. |
| `GET /metrics` | Devuelve `access_operations_total` (`entrada`, `salida`, `total`), en memoria por proceso. Se reinicia con el proceso; no es Prometheus ni una métrica persistente. |
| `GET /api/v1/aforo` | Devuelve el aforo actual en `data.aforoActual`. |
| `POST /api/v1/aforo/acceso` | Exige `Authorization: Bearer <OPERADOR_TOKEN>`. Recibe `{"tipoAcceso":"ENTRADA"}` o `{"tipoAcceso":"SALIDA"}`. Responde `201` si se registra, `400` si falla la entrada o regla de dominio, `401` sin token válido, `413` si el cuerpo supera 1 KB, `503` si el repositorio no está disponible o el servidor no tiene token configurado, y `500` ante errores inesperados. |
| `POST /api/v1/estudiantes/sesion` | Inicia sesión con correo sintético y contraseña mediante Supabase Auth; devuelve el access token del proveedor y su vencimiento. |
| `POST /api/v1/estudiantes/qr` | Requiere la sesión de estudiante; devuelve un QR de un solo uso válido por 60 segundos. |
| `POST /api/v1/aforo/acceso-qr` | Requiere token de operador; consume el QR y registra la transición individual y el aforo en la misma transacción. |

Ejemplo observado después de una entrada y una salida en una ejecución de producción (no es historial persistente):

```json
{
	"access_operations_total": {
		"entrada": 1,
		"salida": 1,
		"total": 2
	}
}
```

Los logs estructurados incluyen `timestamp`, `level`, `event` y `message`. Los callsites actuales no registran credenciales, `DATABASE_URL`, tokens ni payloads de las solicitudes.

## Endpoints de la API

**URL base:** `https://gimnasio-utb.iscoutb.dev`

El backend expone los siguientes endpoints para consultar el estado del servicio, verificar la disponibilidad de la base de datos, consultar métricas operacionales y gestionar el aforo del gimnasio.

| Método | Endpoint | Descripción |
|:---:|---|---|
| GET | `/` | Describe el servicio y lista las rutas públicas. |
| GET | `/health` | Verifica que el servidor se encuentre activo (liveness). |
| GET | `/ready` | Verifica que el servicio pueda consultar el repositorio de datos (readiness). |
| GET | `/metrics` | Consulta el contador operacional de entradas y salidas. |
| GET | `/api/v1/aforo` | Consulta el número actual de personas dentro del gimnasio. |
| POST | `/api/v1/aforo/acceso` | Registra una entrada o salida manual (token de operador). |
| POST | `/api/v1/estudiantes/sesion` | Inicia sesión del estudiante con Supabase Auth. |
| POST | `/api/v1/estudiantes/qr` | Emite el QR personal de un solo uso (60 s). |
| POST | `/api/v1/aforo/acceso-qr` | El operador consume el QR; la API decide ENTRADA o SALIDA. |

### Ejemplos de uso

**Consultar aforo actual:**

```http
GET /api/v1/aforo
```

**Registrar entrada:**

```http
POST /api/v1/aforo/acceso
Content-Type: application/json
Authorization: Bearer <OPERADOR_TOKEN>

{
  "tipoAcceso": "ENTRADA"
}
```

**Registrar salida:**

```http
POST /api/v1/aforo/acceso
Content-Type: application/json
Authorization: Bearer <OPERADOR_TOKEN>

{
  "tipoAcceso": "SALIDA"
}
```

**Consultar métricas:**

```http
GET /metrics
```

**Nota:** El contador de aforo se almacena en PostgreSQL. Las métricas operacionales de accesos se mantienen en memoria durante la ejecución del proceso y se reinician cuando este se reinicia.

## Arquitectura y consistencia

El dominio contiene la regla de transición del contador; la aplicación depende de `AforoRepositoryPort`, cuyo contrato actual incluye `obtenerAforoActual()` y `actualizarAforo(transicionar)`. La infraestructura ofrece el adapter PostgreSQL y el adapter en memoria.

`AforoPostgresAdapter` ejecuta la transición dentro de una transacción y bloquea la fila con `SELECT ... FOR UPDATE` antes de actualizarla. Confirma con `COMMIT`, intenta `ROLLBACK` ante errores y libera el cliente. El servidor real compone la aplicación con PostgreSQL y cierra el adapter tras drenar las solicitudes al recibir `SIGTERM`.

La suite PostgreSQL incluye persistencia entre instancias, rollback, 20 entradas concurrentes y el flujo de sesión/QR: consumo único y reversión del consumo cuando falla la transición. Esta última integración se omite si no hay `DATABASE_URL` segura de pruebas; ninguna de estas pruebas constituye carga HTTP general.

## Pruebas y CI

```bash
npm test
```

`npm test` ejecuta pruebas base, de contrato y PostgreSQL. Las pruebas base y de contrato usan `createApp()` con el adapter en memoria; las pruebas PostgreSQL requieren `DATABASE_URL` apuntando a una base cuyo nombre incluya `test`, y se omiten si no está configurada.

El workflow de GitHub Actions usa Node.js 24 y ejecuta `npm ci --ignore-scripts`, `npm run test:base` (incluye las pruebas de seguridad de S13), `npm run test:contrato`, `npm run test:mensajeria`, `npm run arch:check`, `npm audit --audit-level=high` y `npm audit signatures`, con permisos de solo lectura sobre el repositorio. Dependabot (`.github/dependabot.yml`) propone actualizaciones semanales de npm, pub, Docker y GitHub Actions. No aprovisiona PostgreSQL ni ejecuta `test:postgres`; la automatización de pruebas PostgreSQL en CI no está implementada. SonarCloud analiza el repositorio mediante la integración de la organización en GitHub y el Quality Gate se consulta en su panel.

## Estructura relevante

```text
src/
├── server.js                      # composición (raíz de composición)
├── shared/                        # logger, entorno, pool PostgreSQL, seguridad HTTP
└── modules/
    ├── aforo/
    │   ├── domain/aforo.js
    │   ├── application/           # casos de uso y puerto del repositorio
    │   └── infrastructure/        # router HTTP, adapters PostgreSQL y memoria, schema.sql
    └── identidad/
        ├── application/           # errores y puerto de Supabase Auth
        └── infrastructure/        # router HTTP, adapter PostgreSQL, adapters Supabase Auth

scripts/                           # db:init, db:migrate, db:grant-runtime, seed y verificaciones
scripts/sql/runtime-grants.sql     # permisos por columna y políticas RLS
db/migrations/                     # migraciones versionadas para bases existentes
deploy/                            # Compose de Dokploy (Supabase) y de laboratorio
docs/Flutter/                      # app móvil (estudiante y encargado)
tests/                             # dominio, integración, contrato, seguridad y PostgreSQL
```

## Documentación

- [Problema y alcance](docs/problema.md).
- [Aspectos de arquitectura](docs/aspectos.md).
- [Contrato OpenAPI](docs/openapi.yaml).
- [Documentación arc42](docs/arc42/arc42_gimnasio_utb.md).
- [Diagramas C4](docs/c4/).
- [ADR 0001: Arquitectura Hexagonal](docs/adr/0001-arquitectura-hexagonal.md).
- [ADR 0003: Comunicación síncrona y asíncrona](docs/adr/0003-comunicacion-sincrona-asincrona.md).
- [ADR 0004: Concurrencia PostgreSQL](docs/adr/0004-concurrencia-postgresql.md).
- [ADR 0005: No extraer Notificaciones a un servicio propio](docs/adr/0005-no-extraer-notificaciones.md).
- [ADR 0006: Log de eventos de acceso append-only](docs/adr/0006-log-de-eventos-de-acceso.md).
- [Contextos delimitados](docs/contextos-delimitados.md).
- [Registro de uso de IA](docs/ia.md).
- [S9: cadena verificada de una porción construida con IA](docs/s9-cadena-verificada.md).
- [Auditoría de erosión arquitectónica](docs/auditoria-erosion.md).
- [Auditoría de dependencias](docs/auditoria-dependencias.md).
- [S11: fallos parciales, idempotencia y decisión de extracción](docs/s11-fallos-parciales.md).
- [S12: estrategia de datos y eventos (consistencia, caché y log de eventos)](docs/s12-datos-eventos.md).
- [S13: modelado de amenazas, dependencias y privacidad](docs/s13-seguridad-amenazas.md).
- [ADR 0007: Token de operador y CORS con lista blanca](docs/adr/0007-autenticacion-operador-y-cors.md).
- [ADR 0008: Identidad de prueba y QR de acceso](docs/adr/0008-identidad-de-prueba-y-qr-de-acceso.md).
- [ADR 0009: Supabase Auth para estudiantes](docs/adr/0009-supabase-auth.md).
- [ADR 0010: PostgreSQL gestionado en Supabase para el deployment final](docs/adr/0010-postgresql-gestionado-en-supabase.md).
- [Configuración de Supabase, Auth y migraciones](docs/supabase.md).
- [Taller: prototipo aislado de mensajería asíncrona](docs/taller-mensajeria/README.md).

## Integrantes

- Sebastián Felipe Caicedo Acosta
- Pedro Luis Pallares De La Hoz
- Rodrigo Andrés Facio Lince Beltrán
