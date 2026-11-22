```mermaid
C4Container
    title C4 Level 2 - Contenedores actuales

    System_Ext(cliente, "App Flutter / cliente HTTP", "Consulta el aforo; usa sesión sintética estudiantil o token compartido de operador.")

    Container_Boundary(sistema, "Gimnasio UTB") {
        Container(api, "Backend / API", "Node.js / Express", "Expone el estado del gimnasio (aforo, capacidad, apertura), login de estudiantes (scrypt y sesiones propias), QR, registro por cédula y endpoints operativos.")
        Container(init, "Preparación de base", "Node.js, misma imagen (db-bootstrap y db-init)", "En cada deploy crea los roles, aplica esquema, permisos y cuentas de prueba, y verifica la seguridad. Termina antes de que arranque la API.")
        ContainerDb(db, "Base de datos", "PostgreSQL 16 en el Compose de Dokploy (ADR-0011)", "Persiste aforo, cuentas sintéticas con hash de contraseña, sesiones, QR y estado individual.")
    }

    Rel(cliente, api, "Consulta aforo (público) y endpoints operativos", "HTTPS / JSON")
    Rel(cliente, api, "Registra entradas/salidas, abre/cierra y cambia la capacidad", "HTTPS / JSON + Authorization: Bearer (ADR-0007)")
    Rel(cliente, api, "Inicia sesión y muestra/escanea QR temporal", "HTTPS / JSON + Bearer según endpoint")
    Rel(api, db, "Lee y actualiza aforo e identidad transaccional", "SQL / pg, red interna del Compose, rol gimnasio_runtime")
    Rel(init, db, "Crea roles; esquema, permisos y cuentas; verificación", "SQL / pg, superusuario solo en db-bootstrap, luego gimnasio_migrator")
```

## Contenedores y evidencia

- **Backend / API:** el proceso real se inicia desde `src/server.js`; usa Express y compone `AforoPostgresAdapter`. La aplicación expone las rutas del módulo de aforo y `/health`, `/ready` y `/metrics`.
- **PostgreSQL:** contenedor `postgres` del Compose con el volumen `postgres_data`. `schema.sql` crea el contador, cuentas sintéticas, sesiones, credenciales QR y estado individual.
- **Preparación de base:** `db-bootstrap` y `db-init` usan la misma imagen que la API, se ejecutan una vez por deploy y terminan. Separan los tres niveles de privilegio: superusuario, migrador y runtime ([guía de base de datos](../base-de-datos.md)).
- **Adapters internos:** `AforoPostgresAdapter` es la implementación usada por el servidor real. `AforoMemoriaAdapter` es una alternativa inyectable y se usa por defecto en `createApp()` para pruebas sin PostgreSQL. Ninguno es un contenedor separado.
- El adapter PostgreSQL realiza transacciones con bloqueo de fila; el detalle pertenece a la vista de componentes/ejecución, no representa un servicio adicional.

## Contenedores de datos y eventos (S12) — DISEÑO

Este diagrama muestra la arquitectura objetivo de la [evidencia S12](../s12-datos-eventos.md). **No describe el sistema actual**: el diagrama de arriba sigue siendo el vigente.

```mermaid
C4Container
    title C4 Level 2 - Datos y eventos (DISEÑO S12, no implementado)

    Person(estudiante, "Estudiante", "Consulta el aforo desde la app.")
    System_Ext(fcm, "Firebase Cloud Messaging", "Servicio externo de notificaciones push.")

    Container_Boundary(sistema, "Gimnasio UTB") {
        Container(app, "App móvil", "Flutter", "UI existente; integración con la API pendiente.")
        Container(api, "Backend / API", "Node.js / Express", "Registra transiciones con consistencia fuerte. Incluye caché en proceso del aforo (TTL 2 s, write-through por versión); no es un contenedor aparte.")
        Container(worker, "Worker de eventos", "Node.js, misma imagen que la API", "Lee el log por consumidor con checkpoint: notificaciones, difusión y reporte nocturno.")
        ContainerDb(db, "Base de datos", "PostgreSQL en el Compose", "aforo_estado (estado + version), acceso_evento (log append-only), consumidor_checkpoint, aforo_por_hora.")
    }

    Rel(estudiante, app, "Usa")
    Rel(app, api, "Consulta aforo y registra accesos", "HTTPS / JSON")
    Rel(api, db, "Transacción: UPDATE estado + INSERT evento; lectura del aforo en miss", "SQL / pg")
    Rel(worker, db, "Lee eventos con version > checkpoint; avanza checkpoint; escribe agregados", "SQL / pg, sondeo 1-2 s")
    Rel(worker, fcm, "Envía push, al menos una vez, con timeout y circuit breaker", "HTTPS / JSON")
    Rel(api, app, "Difunde aforo con version (FUTURO)", "WebSocket / JSON")
```

### Almacenes de datos y brokers

| Almacén | Tipo | ¿Contenedor propio? | Estado |
|---|---|---|---|
| PostgreSQL (`aforo_estado`) | Base relacional, fuente de verdad del invariante | **Sí** (servicio `postgres` del Compose, ADR-0011) | IMPLEMENTADO |
| Log `acceso_evento` + `consumidor_checkpoint` | Log append-only dentro de PostgreSQL | No: son tablas del mismo contenedor. Se nombran en su descripción para que sean visibles. | DISEÑO (ADR-0006) |
| `aforo_por_hora` | Datos derivados para reportes | No: tabla del mismo contenedor | FUTURO |
| Caché del aforo | Memoria del proceso `api` | No: componente interno de la API | DISEÑO |
| Broker de mensajes | — | **No existe.** El log en PostgreSQL cumple su papel (ADR-0005, ADR-0006). | No aplica |

El worker sí es un contenedor propio en este diseño: es otro proceso con su propio ciclo de vida, aunque use la misma imagen. La relación `api → app` por WebSocket sale de la API porque es quien mantiene las conexiones.

## Arquitectura objetivo / futura

**No implementado actualmente:** SSO institucional, roles individuales de encargados, historial completo, deduplicación de operaciones manuales, WebSocket, FCM, Render e infraestructura como código. Las cuentas disponibles son sintéticas y no representan identidad UTB.
