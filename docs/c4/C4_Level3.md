```mermaid
C4Component
    title C4 Level 3 - Componentes implementados del backend de aforo

    System_Ext(cliente, "Cliente HTTP", "Consume las rutas HTTP actuales.")

    Container_Boundary(api, "Backend / API (Node.js / Express)") {
        Component(server, "Composition root", "src/server.js", "Compone dependencias y rutas; configura /health, /ready, /metrics y el cierre SIGTERM.")
        Component(router, "Router HTTP de aforo", "crearAforoRouter", "Atiende POST /api/v1/aforo/acceso y GET /api/v1/aforo.")
        Component(usecase, "Caso de uso", "crearRegistrarAccesoUseCase", "Ejecuta el registro y delega la transición atómica al puerto.")
        Component(domain, "Regla de dominio", "aplicarAcceso en aforo.js", "Valida ENTRADA/SALIDA y calcula el contador resultante.")
        Component(port, "Puerto de persistencia", "AforoRepositoryPort", "Define obtenerAforoActual() y actualizarAforo(transicionar).")
        Component(pg, "Adapter PostgreSQL", "AforoPostgresAdapter", "Implementa el puerto y persiste el contador en una transacción.")
        Component(memory, "Adapter en memoria", "AforoMemoriaAdapter", "Implementación alternativa del puerto usada por createApp() y pruebas sin DB.")
        Component(logger, "Logger compartido", "shared/logger.js", "Emite eventos operativos como logs JSON estructurados.")
    }

    ContainerDb(db, "PostgreSQL", "PostgreSQL", "Esquema aforo_estado: una fila persistente del contador agregado.")

    Rel(cliente, router, "Invoca rutas de aforo", "HTTP / JSON")
    Rel(cliente, server, "Consulta /health, /ready y /metrics", "HTTP / JSON")
    Rel(server, router, "Monta el router e inyecta el caso de uso y el getter del repositorio")
    Rel(server, pg, "Crea y usa en el arranque real")
    Rel(server, logger, "Emite eventos de arranque y apagado")
    Rel(router, usecase, "Invoca para POST de acceso")
    Rel(router, port, "GET de aforo usa el getter del repositorio inyectado por server.js")
    Rel(usecase, port, "Llama actualizarAforo(transicionar)")
    Rel(usecase, domain, "La función de transición ejecuta aplicarAcceso")
    Rel(pg, port, "Implementa")
    Rel(memory, port, "Implementa; alternativa en pruebas/inyección")
    Rel(pg, db, "Lee y actualiza mediante pg; DATABASE_URL")
```

## Responsabilidades implementadas

- `server.js` es el composition root. En el arranque real crea `AforoPostgresAdapter`; `createApp()` admite inyección y usa memoria por defecto. También compone `/health`, `/ready`, `/metrics` y el cierre ordenado ante `SIGTERM`.
- `crearAforoRouter` recibe las solicitudes HTTP de aforo y devuelve las respuestas definidas por la implementación. `POST /acceso` pasa por el caso de uso. `GET /` usa la función getter suministrada desde `server.js`; no existe `ConsultarAforoUseCase`.
- `crearRegistrarAccesoUseCase` llama `actualizarAforo(transicionar)`. La transición invoca `aplicarAcceso` en `aforo.js` con el valor actual.
- `AforoPostgresAdapter` ejecuta `BEGIN`, `SELECT ... FOR UPDATE`, actualización y `COMMIT`; ante errores intenta `ROLLBACK`. Esa secuencia es comportamiento del componente, no un componente separado.
- `AforoMemoriaAdapter` implementa el puerto para composición alternativa y pruebas; no es el adapter elegido por el servidor real.
- `shared/logger.js` proporciona logs estructurados JSON para eventos operativos. El composition root también protege el resultado del caso de uso ante fallos al registrar eventos de acceso.

## Arquitectura objetivo / futura

**No implementado actualmente:** Flutter, QR, identidad de estudiantes, autenticación, roles, historial, deduplicación, estado de apertura/cierre, WebSocket, FCM, API Gateway, Redis, servicios separados y componentes de usuarios o notificaciones. No forman parte de este diagrama de componentes.
