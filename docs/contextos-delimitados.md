# Contextos Delimitados y Propiedad de Datos

Evidencia S6 — Domain-Driven Design aplicado a Gimnasio UTB.

Este documento identifica contextos delimitados conceptuales a partir del lenguaje de los interesados (`docs/problema.md`), asigna la propiedad de los datos por módulo y conserva las violaciones/riesgos identificados originalmente en S6 junto con su estado actual.

## Mapa conceptual de contextos

Este mapa representa contextos del producto, incluidos algunos todavía no implementados; no describe por completo el runtime actual. Existe un proyecto Flutter con UI, pero no se ha verificado integración funcional con la API. Express sirve HTTP internamente y no configura TLS; el acceso público HTTPS termina en el proxy/ingress de Dokploy. Las relaciones del mapa siguen siendo conceptuales.

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
| **Aforo** | Contador de ocupación actual; historial de eventos de entrada/salida | Notificaciones (para decidir si envía push), Gestión Operativa (para mostrar en panel del encargado) | Implementado (solo el contador; el historial de eventos aún no se persiste) |
| **Identidad / Estudiante** | Perfil del estudiante; código QR asociado; preferencias de horario para notificaciones | Aforo (para validar quién registra el acceso), Notificaciones (para saber a quién y cuándo notificar) | No implementado |
| **Gestión Operativa (Encargado)** | Estado de apertura/cierre del gimnasio; marca de "corrección manual" sobre un evento de acceso | Aforo (para bloquear registros si está cerrado), app del estudiante (solo lectura del estado) | No implementado |
| **Notificaciones** | Log de notificaciones enviadas; estado de suscripción push del dispositivo | — (nodo terminal, nadie más necesita leer esto) | No implementado |

**Regla que se debe respetar al crecer:** Aforo nunca escribe preferencias del estudiante, y Notificaciones nunca escribe el contador de aforo — solo lo lee. Esa separación es la que permitiría, si se quisiera, extraer Notificaciones como servicio aparte sin tocar Aforo.

## Estado actual de consistencia y riesgos identificados en S6

El contexto Aforo es el único módulo implementado; no hay escrituras cruzadas entre módulos. El servidor real usa PostgreSQL y `AforoPostgresAdapter`; el adapter de memoria sigue disponible para pruebas/inyección. Las transiciones PostgreSQL usan `BEGIN`, `SELECT ... FOR UPDATE`, la transición del dominio, `UPDATE` y `COMMIT`, con intento de `ROLLBACK` ante errores. El esquema restringe el contador a valores no negativos. Las pruebas PostgreSQL verifican rechazo de salida desde cero, rollback, persistencia entre instancias del adapter y 20 entradas concurrentes con resultado final 20. Esto no demuestra historial, identidad, carga HTTP ni retención tras redeploy.

| # | Problema/riesgo identificado originalmente en S6 | Corrección/evidencia actual | Estado |
|---|---|---|---|
| V1 | `AforoMemoriaAdapter` exponía `this.aforoActual` como propiedad pública mutable. | El estado ahora es el campo privado `#aforoActual`, modificado mediante `actualizarAforo()`. | **Corregida.** No es un riesgo vigente en la implementación actual. |
| V2 | La lectura de aforo saltaba la capa de aplicación y llegaba al repositorio desde `server.js`. | `crearConsultarAforoUseCase` existe y `server.js` lo compone e inyecta en el router. | **Corregida.** Las consultas actuales pasan por el caso de uso. |
| V3 | Futuros módulos podrían necesitar un contrato de lectura propio en vez de depender del adapter concreto. | Actualmente solo existe el módulo Aforo; no hay módulo Notificaciones que consuma esa consulta. | **Riesgo futuro abierto/aceptado.** Revaluar al introducir otro módulo consumidor. |
