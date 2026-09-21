# ADR-0003 — Comunicación síncrona para comandos y asíncrona para notificaciones

## Estado

Aceptada — septiembre de 2026.

## Contexto

El registro de accesos, la consulta de aforo y el cambio de estado necesitan confirmar al usuario el resultado de una operación persistida. Las notificaciones push dependen de un proveedor externo y no deben bloquear esa confirmación.

## Decisión

Se usará comunicación síncrona mediante HTTPS REST con JSON para comandos y consultas. Las operaciones de persistencia asociadas se ejecutarán mediante transacciones SQL y solo se confirmarán cuando terminen correctamente.

Las notificaciones se enviarán de forma asíncrona mediante Firebase Cloud Messaging (FCM), después de confirmar la operación principal al usuario.

## Consecuencias

### Positivas

- El cliente recibe una respuesta determinista para actualizar su interfaz.
- Una demora o indisponibilidad temporal de FCM no revierte una operación de aforo o estado ya confirmada.
- El contrato síncrono queda descrito en `docs/openapi.yaml`.

### Negativas

- El usuario puede ver el cambio principal antes de recibir la notificación push.
- El adaptador de mensajería deberá registrar y reintentar notificaciones fallidas cuando se implemente.
- Las operaciones síncronas dependen de la disponibilidad del API y de PostgreSQL durante la confirmación.

## Alcance de los flujos

| Flujo | Comunicación | Protocolo | Formato |
|---|---|---|---|
| Registro de acceso y consulta de aforo | Síncrona | HTTPS REST | JSON |
| Persistencia de acceso o estado | Síncrona | SQL sobre TCP 5432 | Filas relacionales |
| Notificación de cambio de estado | Asíncrona | FCM Push sobre HTTPS | JSON |

## Referencias

- [Vista de ejecución del arc42](../arc42/arc42_gimnasio_utb.md#6-runtime-view-vista-de-ejecución).
- [C4 nivel 2](../c4/c4_level2.md).
- [Contrato OpenAPI](../openapi.yaml).
