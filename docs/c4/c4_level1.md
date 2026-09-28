```mermaid
C4Context
    title C4 Level 1 - Contexto actual del backend de aforo

    System_Ext(cliente, "Cliente HTTP", "Cliente genérico que consume la API; no se presupone identidad ni autenticación.")
    System(backend, "Backend Gimnasio UTB", "API HTTP de aforo: consulta y transiciones de entrada/salida, liveness, readiness y métricas operacionales.")
    System_Ext(postgres, "PostgreSQL", "Almacena el estado persistente del contador de aforo.")

    Rel(cliente, backend, "Consulta el aforo, registra entradas/salidas y consulta endpoints operativos", "HTTP / JSON")
    Rel(backend, postgres, "Lee y actualiza el contador", "SQL mediante pg; DATABASE_URL")
```

## Arquitectura objetivo / futura

**No implementado actualmente.** La visión del producto puede incluir estudiantes y encargados, una aplicación Flutter, identidad, autenticación, QR, apertura/cierre del gimnasio, historial, WebSocket y FCM. Estos elementos no forman parte del contexto actual ni tienen conexiones mostradas en el diagrama principal.
