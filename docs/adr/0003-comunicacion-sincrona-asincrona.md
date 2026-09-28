# ADR-0003: Comunicación síncrona para la API y la persistencia

## Estado

Aceptada para los flujos HTTP y de persistencia actualmente implementados. FCM y WebSocket son objetivos futuros, no parte de esta decisión operativa vigente.

## Contexto

El backend actual es Node.js/Express y necesita devolver el resultado de la consulta o transición del contador al cliente HTTP. La escritura del contador se realiza en PostgreSQL antes de responder al cliente.

## Decisión

### IMPLEMENTADO

- La API REST actual utiliza comunicación síncrona mediante HTTP/JSON.
- El flujo router → caso de uso → puerto → adapter es request-response: el handler espera (`await`) el resultado del caso de uso y la persistencia antes de responder. El I/O de PostgreSQL usa APIs asíncronas de Node.js, pero no se responde al cliente antes de que termine la operación.
- Las escrituras en PostgreSQL son síncronas respecto de la respuesta HTTP y están protegidas por transacciones.
- El servidor local puede escucharse, por ejemplo, en `http://localhost:3000`. El servidor Express actual no configura HTTPS/TLS.

El detalle de transacción y concurrencia PostgreSQL está en [ADR-0004](0004-concurrencia-postgresql.md).

### FUTURO / OBJETIVO

- FCM y el envío asíncrono de notificaciones no están implementados; no existe un adapter FCM ni se envían notificaciones actualmente.
- WebSocket no está implementado y no se difunde el aforo a clientes conectados.
- HTTPS/TLS puede ser una consideración del despliegue futuro, pero no es una propiedad del servidor local actual.

## Consecuencias

### Positivas

- El cliente recibe la respuesta de una operación después de completarse la transición y la persistencia actuales.
- Una escritura PostgreSQL que no confirma no se presenta como una operación exitosa del caso de uso.
- El contrato HTTP está descrito en `docs/openapi.yaml`.

### Limitaciones

- La operación depende de que el API y PostgreSQL estén disponibles durante la solicitud.
- No existe actualmente un canal de notificaciones o actualización en tiempo real.
- Este ADR no define TLS ni infraestructura cloud.

## Alcance de los flujos

| Flujo | Estado | Comunicación / protocolo | Formato |
|---|---|---|---|
| Registro y consulta del contador | IMPLEMENTADO | Síncrono, HTTP REST | JSON |
| Persistencia del contador | IMPLEMENTADO | Síncrono, PostgreSQL mediante `pg`; conexión configurada con `DATABASE_URL` | SQL / filas relacionales |
| Notificaciones FCM | FUTURO / OBJETIVO | No implementado | No aplica actualmente |
| Actualización mediante WebSocket | FUTURO / OBJETIVO | No implementado | No aplica actualmente |

## Referencias

- [Vista de ejecución del arc42](../arc42/arc42_gimnasio_utb.md#6-vista-de-ejecución).
- [C4 nivel 2](../c4/c4_level2.md).
- [Contrato OpenAPI](../openapi.yaml).
- [ADR-0001: Arquitectura Hexagonal](0001-arquitectura-hexagonal.md).
- [ADR-0004: concurrencia PostgreSQL](0004-concurrencia-postgresql.md).
