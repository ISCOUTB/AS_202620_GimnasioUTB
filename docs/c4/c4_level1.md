```mermaid
C4Context
    title C4 Level 1 - Contexto actual del sistema

    System_Ext(cliente, "Aplicación Flutter", "Consulta el estado del gimnasio; el estudiante usa una cuenta sintética y el encargado la contraseña de encargado.")
    System(backend, "Backend Gimnasio UTB", "API de aforo, estado y capacidad del gimnasio, sesiones, QR, registro por cédula y endpoints operativos.")
    System_Ext(postgres, "PostgreSQL", "Almacena el estado del gimnasio, cuentas sintéticas, sesiones, QR y estado individual.")

    Rel(cliente, backend, "Consulta el estado, inicia sesión, presenta/escanea QR, registra por cédula y configura el gimnasio", "HTTPS / JSON; Bearer según operación")
    Rel(backend, postgres, "Lee y actualiza aforo e identidad transaccional", "SQL mediante pg; DATABASE_URL")
```

## Arquitectura objetivo / futura

**No implementado actualmente:** SSO institucional, roles individuales de encargados, historial completo, WebSocket y FCM. La apertura/cierre y la capacidad máxima ya están implementadas (ADR-0012). Las cuentas disponibles son sintéticas y no representan identidad UTB.
