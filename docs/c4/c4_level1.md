```mermaid
C4Context
    title C4 Level 1 - Contexto actual del sistema

    System_Ext(cliente, "Aplicación Flutter", "Consulta el aforo; el estudiante usa una cuenta sintética y el operador el token compartido.")
    System(backend, "Backend Gimnasio UTB", "API de aforo, sesiones sintéticas, emisión/consumo de QR y endpoints operativos.")
    System_Ext(postgres, "PostgreSQL", "Almacena el aforo, cuentas sintéticas, sesiones, QR y estado individual.")

    Rel(cliente, backend, "Consulta aforo, inicia sesión y presenta/escanea QR", "HTTPS / JSON; Bearer según operación")
    Rel(backend, postgres, "Lee y actualiza aforo e identidad transaccional", "SQL mediante pg; DATABASE_URL")
```

## Arquitectura objetivo / futura

**No implementado actualmente:** SSO institucional, roles individuales de encargados, apertura/cierre del gimnasio, historial completo, WebSocket y FCM. Las cuentas disponibles son sintéticas y no representan identidad UTB.
