# Contextos Delimitados y Propiedad de Datos

Evidencia S6 — Domain-Driven Design aplicado a Gimnasio UTB.

Este documento identifica contextos delimitados conceptuales a partir del lenguaje de los interesados (`docs/problema.md`), asigna la propiedad de los datos por módulo y conserva las violaciones/riesgos identificados originalmente en S6 junto con su estado actual.

## Mapa conceptual de contextos

Este mapa representa contextos del producto, incluidos algunos todavía no implementados; no describe por completo el runtime actual. El flujo Flutter/API de aforo y QR está implementado, aunque no se ha verificado en un dispositivo contra el deployment. Express sirve HTTP internamente y el acceso público HTTPS termina en el proxy/ingress de Dokploy.

```mermaid
flowchart TD
    subgraph CLIENTE["Cliente"]
        APP["App Móvil (Flutter)<br/>• Escaneo QR<br/>• Consulta de Aforo"]
    end

    subgraph SUPPORTING["Contexto: Usuarios e Identidad (Supporting Domain)"]
        USUARIOS["Módulo de Usuarios (Upstream - U)<br/>• Identidad y Código QR<br/>• Roles del Personal"]
    end

    subgraph CORE["Contexto: Control de Aforo (Core Domain - Downstream)"]
        direction TB
        IN_PORT["Inbound Port<br/>(HTTP REST API)"]
        DOMAIN["Domain Core<br/>• Conteo Tiempo Real<br/>• Consistencia Aforo (S1)<br/>• Reglas de Cupo"]
        OUT_DB["Outbound Port<br/>(AforoRepositoryPort)"]
        OUT_NOTIF["Outbound Port<br/>(NotificationPort)"]

        IN_PORT --> DOMAIN
        DOMAIN --> OUT_DB
        DOMAIN --> OUT_NOTIF
    end

    subgraph GENERIC["Contexto: Notificaciones (Generic Subdomain)"]
        FCM["Firebase Cloud Messaging (OHS/PL)<br/>• Alertas Push Masivas"]
    end

    subgraph PERSISTENCIA["Persistencia"]
        POSTGRES[("PostgreSQL DB<br/>• Transacciones ACID (ES1)")]
    end

    %% Relaciones
    APP -->|HTTP / REST / JSON (relación conceptual)| IN_PORT
    USUARIOS -->|Customer-Supplier: Upstream a Downstream| IN_PORT
    OUT_DB -->|SQL / Driver pg| POSTGRES
    OUT_NOTIF -->|OHS / PL: HTTP REST / JSON| FCM
    FCM -.-|Alertas Push| APP

    %% Estilos de subgrupos
    style CORE fill:#e8f5e9,stroke:#2e7d32,stroke-width:2px
    style SUPPORTING fill:#e3f2fd,stroke:#1565c0,stroke-width:2px
    style GENERIC fill:#fff8e1,stroke:#f57f17,stroke-width:2px
    style CLIENTE fill:#eceff1,stroke:#455a64,stroke-width:1.5px
    style PERSISTENCIA fill:#eceff1,stroke:#37474f,stroke-width:1.5px
```

## Tabla módulo → dato → dueño único

| Contexto / Módulo | Dato del que es **dueño** (único que escribe) | Quién puede **leerlo** (sin escribir) | Estado |
|---|---|---|---|
| **Aforo** | Contador de ocupación actual; historial de eventos de entrada/salida | Notificaciones (para decidir si envía push), Gestión Operativa (para mostrar en panel del encargado) | Implementado (contador; historial completo no persistido) |
| **Identidad / Estudiante** | Cuentas sintéticas, sesiones, QR temporales y estado individual dentro/fuera | Aforo (valida y consume el QR dentro de la transacción) | Implementado para demostración; sin SSO ni identidad UTB |
| **Gestión Operativa (Encargado)** | Estado de apertura/cierre del gimnasio y capacidad máxima; marca de "corrección manual" sobre un evento de acceso | Aforo (para bloquear registros si está cerrado), app del estudiante (solo lectura del estado) | Apertura/cierre y capacidad implementadas **dentro del módulo Aforo** (ADR-0012): viven en la misma fila que el contador porque cada registro debe leerlas con la fila bloqueada. La corrección manual no está implementada |
| **Notificaciones** | Preferencias de alerta de aforo, estado de deduplicación y bandeja de notificaciones | Lee el estado/capacidad vigente de Aforo | Implementado en el monolito; FCM y tokens push pendientes |

**Regla que se debe respetar al crecer:** Aforo nunca escribe preferencias del estudiante, y Notificaciones nunca escribe el contador de aforo — solo lo lee. Las preferencias y el log de notificaciones pertenecen a Notificaciones; Aforo invoca su callback transaccional sin importar el módulo. FCM y la suscripción de dispositivos aún no existen.

## Estado actual de consistencia y riesgos identificados en S6

Los módulos Aforo e Identidad están implementados. El servidor real usa PostgreSQL y `AforoPostgresAdapter`; el adapter de memoria sigue disponible para pruebas/inyección. El registro QR consume el código, alterna el estado individual y actualiza el contador en la misma transacción; los fallos revierten el consumo. Las pruebas PostgreSQL comprueban persistencia, rollback y concurrencia del contador; no demuestran carga HTTP ni retención tras redeploy.

| # | Problema/riesgo identificado originalmente en S6 | Corrección/evidencia actual | Estado |
|---|---|---|---|
| V1 | `AforoMemoriaAdapter` exponía `this.aforoActual` como propiedad pública mutable. | El estado ahora es el campo privado `#aforoActual`, modificado mediante `actualizarAforo()`. | **Corregida.** No es un riesgo vigente en la implementación actual. |
| V2 | La lectura de aforo saltaba la capa de aplicación y llegaba al repositorio desde `server.js`. | `crearConsultarAforoUseCase` existe y `server.js` lo compone e inyecta en el router. | **Corregida.** Las consultas actuales pasan por el caso de uso. |
| V3 | Futuros módulos podrían necesitar un contrato de lectura propio en vez de depender del adapter concreto. | Notificaciones recibe el estado bloqueado a través de callbacks transaccionales y no importa el adapter concreto. | **Mitigado para Notificaciones.** Reevaluar si aparece otro consumidor. |
