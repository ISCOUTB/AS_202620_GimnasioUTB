# AS_202620_GimnasioUTB

## Sistema de Gestión de Aforo para el Gimnasio UTB

Este proyecto académico implementa un backend para consultar y actualizar el aforo, junto con una aplicación Flutter para estudiantes y encargados. Los estudiantes inician sesión con cuentas sintéticas cuyo hash de contraseña vive en el PostgreSQL del propio sistema ([ADR 0011](docs/adr/0011-volver-a-postgresql-propio-y-login-local.md)); no es SSO ni valida identidad institucional UTB.

## Problema y alcance

La propuesta busca ayudar a los estudiantes a conocer la ocupación del gimnasio antes de desplazarse y registrar sus accesos.

El corte vertical actual permite:

- Registrar una transición `ENTRADA` o `SALIDA`.
- Consultar el contador actual del aforo.
- Persistir el contador en PostgreSQL cuando se ejecuta el servidor real.
- Consultar liveness, readiness y un contador operacional de accesos.
- Iniciar sesión con una cuenta sintética de demostración y mostrar un QR temporal de un solo uso.
- Escanear el QR desde la cuenta de operador, o buscar al estudiante por cédula, y registrar la entrada o salida junto con la actualización transaccional del aforo.
- Abrir y cerrar el gimnasio con un motivo opcional: cerrado, se bloquean los nuevos ingresos y quienes están dentro siguen registrados hasta que salen ([ADR 0012](docs/adr/0012-estado-capacidad-y-registro-por-cedula.md)).
- Definir la capacidad máxima y mostrar el porcentaje de ocupación y los cupos. Si un ingreso la supera, la app pide confirmación al encargado antes de registrarlo.
- Configurar alertas automáticas individuales por umbral, días y horario; consultar los avisos en la pestaña existente. La evaluación respeta `America/Bogota`, evita duplicados por episodio y vuelve a evaluar el aforo en el horario permitido.

El QR no contiene datos personales legibles, expira en 60 segundos y solo puede consumirse una vez. Las cuentas de prueba se cargan desde la variable `DEMO_STUDENTS` en cada deploy. El registro sin identificación (para visitantes) modifica únicamente el contador.

## Stack actual

- **Backend:** Node.js y Express, organizado con Arquitectura Hexagonal / Ports and Adapters. La decisión se describe en [ADR 0001](docs/adr/0001-arquitectura-hexagonal.md).
- **Persistencia del servidor real:** PostgreSQL 16 mediante `AforoPostgresAdapter`. En el deployment corre dentro del mismo Docker Compose.
- **Autenticación estudiantil:** `AutenticacionLocalAdapter`, detrás del puerto `AutenticacionEstudiantePort`. Verifica la contraseña con scrypt y crea sesiones de 8 horas; en la base se guarda solo el hash del token. El QR temporal sigue siendo responsabilidad de la API.
- **Adapter en memoria:** disponible como implementación por defecto de `createApp()`, usada por pruebas que no requieren PostgreSQL.
- **App Flutter:** proyecto en `docs/Flutter`; consulta el aforo y registra accesos contra esta API (instrucciones en [su README](docs/Flutter/README.md)).
- **Deployment actual:** Dokploy con `deploy/compose.lab.yaml`: PostgreSQL propio, creación automática de roles, esquema, permisos y estudiantes de prueba, y la API ([ADR 0011](docs/adr/0011-volver-a-postgresql-propio-y-login-local.md)).

## Ejecución local

Requisitos: Node.js 18 o superior y un PostgreSQL accesible. Al iniciar con `npm start`, `npm run dev` o un comando `db:*`, se carga el `.env` de la raíz (plantilla en `.env.example`); las variables ya inyectadas por el entorno tienen prioridad. Antes de iniciar la API se eliminan de su entorno `DB_MIGRATIONS_URL`, `DB_ADMIN_URL` y `DEMO_STUDENTS`. Cada comando administrativo usa solo la conexión de su función.

Con un PostgreSQL local y el `.env` completo, la base se prepara con la misma cadena que ejecuta el Compose:

```bash
npm install
npm run db:bootstrap          # superusuario: crea gimnasio_migrator y gimnasio_runtime
npm run db:prepare            # gimnasio_migrator: esquema + migraciones
npm run db:grant-runtime      # permisos por columna y políticas RLS del runtime
npm run db:seed-demo-students # cuentas de DEMO_STUDENTS
npm run db:check-security     # verifica la matriz de permisos del runtime
npm start
```

Cada paso exige su propia variable de autorización (`DB_BOOTSTRAP_ENABLED`, `DB_INIT_ENABLED` + `DB_MIGRATIONS_ENABLED`, `DB_GRANTS_ENABLED`, `DB_SEED_ENABLED`) y la confirmación del destino (`DB_MIGRATIONS_HOST`, `DB_MIGRATIONS_TARGET`). El detalle está en [la guía de base de datos](docs/base-de-datos.md).

| Variable | Requerida | Uso |
|---|---|---|
| `DATABASE_URL` | Sí | Rol `gimnasio_runtime`, el único que usa la API. |
| `DATABASE_SSL` | No | TLS obligatorio por defecto; `false` solo para hosts locales (`localhost`, `127.0.0.1`, `::1` y `postgres` dentro del Compose). |
| `DATABASE_SSL_CA_CERT_PATH` / `DATABASE_SSL_CA_CERT_BASE64` | No | CA en PEM para un PostgreSQL remoto con certificado propio. Solo una de las dos. |
| `OPERADOR_TOKEN` | Para registrar accesos | Secreto de mínimo 32 caracteres; sin él los registros responden `503` (ADR-0007). |
| `CORS_ORIGINS` | No | Orígenes web permitidos, separados por coma. |
| `ALERTAS_AFORO_INTERVAL_MS` | No | Frecuencia de respaldo para revaluar alertas (mínimo 1000 ms, predeterminado 30000); las transiciones de aforo también se evalúan dentro de su transacción. |
| `DB_ADMIN_URL` | Solo `db:bootstrap` | Superusuario del PostgreSQL local; nunca llega a la API. |
| `DB_MIGRATIONS_URL` | Solo comandos de esquema y seed | Rol `gimnasio_migrator`, dueño de las tablas. |
| `DB_MIGRATIONS_HOST`, `DB_MIGRATIONS_TARGET` | Con `DB_MIGRATIONS_URL` | Confirmación explícita del host y la base. |
| `DEMO_STUDENTS` | No | `codigo|correo|nombre|contraseña|cedula` separados por `;`. Correo `@utb.edu.co`, contraseña de 12 caracteres o más; la cédula (5 a 12 dígitos) es opcional y permite buscar al estudiante. |

## Deployment en Dokploy (ADR-0011)

`deploy/compose.lab.yaml` define cuatro servicios que arrancan en orden, cada uno esperando al anterior:

1. `postgres`: PostgreSQL 16 con el volumen `postgres_data`.
2. `db-bootstrap` (superusuario): crea o actualiza `gimnasio_migrator` y `gimnasio_runtime` sin privilegios administrativos. Si el volumen viene de una versión anterior, transfiere sus tablas al migrador.
3. `db-init` (`gimnasio_migrator`): `db:prepare`, `db:grant-runtime`, `db:seed-demo-students` y `db:check-security`. Si la verificación de seguridad falla, el deploy se detiene antes de la API.
4. `api` (`gimnasio_runtime`): no recibe credenciales administrativas.

Todo es idempotente: repetir el deploy no duplica ni borra datos. Las variables del panel están en `deploy/.env.example`: `POSTGRES_DB`, `POSTGRES_USER`, `POSTGRES_PASSWORD` (si el volumen ya existe, los mismos valores de siempre), `DB_MIGRATOR_PASSWORD`, `DB_RUNTIME_PASSWORD`, `OPERADOR_TOKEN` y `DEMO_STUDENTS`.

Verificación después de cada deploy:

```text
GET https://gimnasio-utb.iscoutb.dev/          -> 200, descripción del servicio
GET https://gimnasio-utb.iscoutb.dev/health    -> 200 {"status":"ok",...}
GET https://gimnasio-utb.iscoutb.dev/ready     -> 200 (la API alcanza PostgreSQL)
GET https://gimnasio-utb.iscoutb.dev/api/v1/aforo -> 200 {"status":"success","data":{"aforoActual":N,"capacidadMaxima":30,"abierto":true,...}}
```

Historia: en S8 el Compose tenía `postgres`, `db-init` y `api` con un único usuario de base de datos, y se verificó una entrada y una salida (aforo 0 → 1 → 0). En noviembre de 2026 se intentó mover base y login a Supabase (ADR-0009 y ADR-0010); ese deployment nunca llegó a funcionar y se revirtió con ADR-0011, conservando las mejoras de la API y de Flutter. El volumen de S8 se reutiliza.

Los archivos de deployment son `Dockerfile`, `.dockerignore`, `deploy/compose.lab.yaml` y `deploy/.env.example`. Dokploy genera `deploy/.env` desde el panel; no se versionan credenciales.

## API actual

| Método y ruta | Comportamiento |
|---|---|
| `GET /` | Raíz informativa: nombre del servicio y rutas públicas. |
| `GET /health` | Liveness estático. Responde `200` con `{"status":"ok","service":"gimnasio-utb-backend"}`. |
| `GET /ready` | Consulta el repositorio. Responde `200` si está disponible y `503` si la consulta falla. |
| `GET /metrics` | Devuelve `access_operations_total` (`entrada`, `salida`, `total`), en memoria por proceso. Se reinicia con el proceso; no es Prometheus ni una métrica persistente. |
| `GET /api/v1/aforo` | Devuelve `aforoActual`, `capacidadMaxima`, `abierto`, `motivoCierre` y `porcentajeOcupacion`. |
| `POST /api/v1/aforo/acceso` | Exige `Authorization: Bearer <OPERADOR_TOKEN>`. Recibe `{"tipoAcceso":"ENTRADA"}` o `{"tipoAcceso":"SALIDA"}`. Responde `201` si se registra, `400` si falla la entrada o regla de dominio, `401` sin token válido, `413` si el cuerpo supera 1 KB, `503` si el repositorio no está disponible o el servidor no tiene token configurado, y `500` ante errores inesperados. |
| `POST /api/v1/estudiantes/sesion` | Inicia sesión con correo `@utb.edu.co` y contraseña; devuelve un token de sesión aleatorio y su vencimiento (8 horas). |
| `POST /api/v1/estudiantes/qr` | Requiere la sesión de estudiante; devuelve un QR de un solo uso válido por 60 segundos. |
| `GET /api/v1/notificaciones/preferencias` | Sesión de estudiante. Devuelve sus preferencias y la capacidad vigente; una configuración ya guardada puede aparecer como incompatible si el encargado redujo la capacidad. |
| `PUT /api/v1/notificaciones/preferencias` | Sesión de estudiante. Sincroniza habilitación, umbral, días y minutos desde medianoche. Un umbral habilitado superior a la capacidad vigente se rechaza. |
| `GET /api/v1/notificaciones` | Sesión de estudiante. Devuelve las últimas 50 notificaciones, incluidas las alertas de aforo automáticas. |
| `POST /api/v1/aforo/acceso-qr` | Requiere token de operador; consume el QR y registra la transición individual y el aforo en la misma transacción. |
| `POST /api/v1/aforo/acceso-cedula` | Igual que el QR, identificando al estudiante por su cédula. |
| `PUT /api/v1/aforo/estado` | Token de operador. `{"abierto":false,"motivoCierre":"..."}` cierra; `{"abierto":true}` abre. |
| `PUT /api/v1/aforo/capacidad` | Token de operador. `{"capacidadMaxima":30}` (1 a 10000). |
| `POST /api/v1/estudiantes/busqueda` | Token de operador. `{"cedula":"..."}` devuelve nombre, código y si está dentro. |
| `POST /api/v1/operador/verificacion` | Comprueba el token de operador; la app lo usa al ingresar como encargado. |

Con el gimnasio cerrado, toda entrada responde `409` con `code: GIMNASIO_CERRADO`. Una entrada que supera la capacidad responde `409` con `code: CAPACIDAD_SUPERADA` hasta que se repite con `"confirmarExcesoCapacidad": true`.

Solo las alertas automáticas `AFORO_BAJO` aplican días y horarios; los avisos de otros tipos no pasan por ese filtro. El umbral es estricto (`aforoActual < umbral`), los intervalos incluyen el inicio y excluyen el fin. Al reducir la capacidad, las preferencias se conservan y las incompatibles quedan pausadas hasta que el estudiante ajuste su umbral. La evaluación se hace dentro de las transacciones de aforo/capacidad/preferencias y, como respaldo, cada 30 segundos. Las alertas disponibles aparecen en la bandeja dentro de la app; FCM no está configurado.

Para habilitar push FCM faltan el proyecto y configuración Firebase de las apps Android/iOS, las dependencias y permisos Flutter (`firebase_core`/`firebase_messaging`), el registro/renovación del token de dispositivo, y las credenciales de servidor con un adaptador de envío y reintentos. No hay secretos ni archivos `google-services.json` / `GoogleService-Info.plist` versionados.

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
| POST | `/api/v1/estudiantes/sesion` | Inicia sesión del estudiante con correo y contraseña. |
| POST | `/api/v1/estudiantes/qr` | Emite el QR personal de un solo uso (60 s). |
| POST | `/api/v1/aforo/acceso-qr` | El operador consume el QR; la API decide ENTRADA o SALIDA. |
| POST | `/api/v1/aforo/acceso-cedula` | El operador registra por cédula; la API decide ENTRADA o SALIDA. |
| PUT | `/api/v1/aforo/estado` | Abre o cierra el gimnasio (motivo opcional). |
| PUT | `/api/v1/aforo/capacidad` | Cambia la capacidad máxima. |
| POST | `/api/v1/estudiantes/busqueda` | Busca un estudiante por cédula. |
| POST | `/api/v1/operador/verificacion` | Valida la contraseña de encargado. |

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

El dominio contiene las reglas del aforo: la transición del contador, el bloqueo de entradas con el gimnasio cerrado y la confirmación al superar la capacidad (ADR-0012). La aplicación depende de `AforoRepositoryPort`, cuyo contrato incluye `obtenerAforoActual()`, `obtenerEstado()`, `actualizarAforo(transicionar)` y `modificarEstado(transformar)`. La infraestructura ofrece el adapter PostgreSQL y el adapter en memoria. El módulo Notificaciones evalúa las preferencias y escribe el aviso en la misma transacción de aforo; un evaluador periódico revalida los períodos permitidos.

`AforoPostgresAdapter` ejecuta la transición dentro de una transacción y bloquea la fila con `SELECT ... FOR UPDATE` antes de actualizarla. Confirma con `COMMIT`, intenta `ROLLBACK` ante errores y libera el cliente. El servidor real compone la aplicación con PostgreSQL y cierra el adapter tras drenar las solicitudes al recibir `SIGTERM`.

La suite PostgreSQL incluye persistencia entre instancias, rollback, 20 entradas concurrentes y el flujo de sesión/QR: consumo único y reversión del consumo cuando falla la transición. Esta última integración se omite si no hay `DATABASE_URL` segura de pruebas; ninguna de estas pruebas constituye carga HTTP general.

## Pruebas y CI

```bash
npm test
```

`npm test` ejecuta pruebas base, de contrato y PostgreSQL. Las pruebas base y de contrato usan `createApp()` con el adapter en memoria; las pruebas PostgreSQL requieren `DATABASE_URL` apuntando a una base cuyo nombre incluya `test`, y se omiten si no está configurada. Las pruebas de alertas cubren umbrales individuales y estrictos, zona/días/horas, episodios, cambios de capacidad y concurrencia.

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
    ├── notificaciones/             # preferencias, evaluación y bandeja del estudiante
    └── identidad/
        ├── application/           # errores y puerto de autenticación
        └── infrastructure/        # router HTTP, adapter PostgreSQL, autenticación local (scrypt)

scripts/                           # db:bootstrap, db:prepare, db:grant-runtime, seed y verificaciones
scripts/sql/runtime-grants.sql     # permisos por columna y políticas RLS
db/migrations/                     # migraciones versionadas para bases existentes
deploy/                            # Compose de Dokploy (PostgreSQL propio + API)
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
- [ADR 0009: Supabase Auth para estudiantes](docs/adr/0009-supabase-auth.md) (reemplazado por ADR 0011).
- [ADR 0010: PostgreSQL gestionado en Supabase](docs/adr/0010-postgresql-gestionado-en-supabase.md) (reemplazado por ADR 0011).
- [ADR 0011: Volver a PostgreSQL propio y login local](docs/adr/0011-volver-a-postgresql-propio-y-login-local.md).
- [ADR 0012: Estado del gimnasio, capacidad máxima y registro por cédula](docs/adr/0012-estado-capacidad-y-registro-por-cedula.md).
- [Guía de base de datos: roles, permisos y estudiantes de prueba](docs/base-de-datos.md).
- [Taller: prototipo aislado de mensajería asíncrona](docs/taller-mensajeria/README.md).

## Integrantes

- Sebastián Felipe Caicedo Acosta
- Pedro Luis Pallares De La Hoz
- Rodrigo Andrés Facio Lince Beltrán
