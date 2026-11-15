# Aspectos de Arquitectura

| ID | Aspecto | Estímulo | Fuente del estímulo | Entorno | Respuesta | Medida de respuesta | Tensión | Decisiones / ADR |
|---|---|---|---|---|---|---|---|---|
| S1 | Consistencia de datos | Llegan transiciones de aforo, incluidas las asociadas a QR, incluso de forma concurrente. | Cliente HTTP; QR de cuenta sintética o token de operador. | Servidor real conectado a PostgreSQL. | El dominio valida la transición y el adapter PostgreSQL actualiza el contador bajo bloqueo. Para QR, consumo del código y cambio de estado individual ocurren en la misma transacción. | Las pruebas PostgreSQL comprueban concurrencia del contador, rollback y el flujo QR transaccional. No demuestran carga HTTP general, historial de eventos ni unicidad de operaciones manuales. | La transacción prioriza consistencia; las cuentas de prueba no son identidad institucional. | [ADR-0001](./adr/0001-arquitectura-hexagonal.md), [ADR-0008](./adr/0008-identidad-de-prueba-y-qr-de-acceso.md) |

## Desarrollo del aspecto S1

### Contexto

El backend mantiene el contador y, para accesos por QR, un estado individual asociado a cuentas sintéticas. No persiste un historial de eventos. S1 cubre la consistencia transaccional del contador y del consumo de QR, no la identidad institucional ni la deduplicación manual.

### Decisión arquitectónica inicial

- El estado actual de ocupación se mantiene en la fila `aforo_estado`.
- El puerto `AforoRepositoryPort` expone `obtenerAforoActual()` y `actualizarAforo(transicionar)`.
- `AforoPostgresAdapter` aplica la transición bajo `BEGIN`, `SELECT ... FOR UPDATE`, `UPDATE` y `COMMIT`; ante errores intenta `ROLLBACK`.
- `createApp()` puede usar el adapter en memoria por defecto; el servidor real compone PostgreSQL y requiere `DATABASE_URL`.
- La identidad de demostración y el QR están implementados; no hay SSO, roles individuales de operador, deduplicación manual ni historial completo.

> **Decisión formalizada:** Para aislar la lógica de consistencia de aforo (S1 / ES1) y permitir pruebas del dominio desacopladas de la infraestructura, se definió la adopción de Arquitectura Hexagonal. Ver detalle y trade-offs en el documento [ADR-0001: Adoptar Arquitectura Hexagonal](./adr/0001-arquitectura-hexagonal.md).

### Riesgo

Si las entradas y salidas no se registran correctamente, el número de cupos disponibles puede ser incorrecto.

Esto podría ocasionar que el sistema informe que existen cupos cuando el gimnasio está lleno o que indique ocupación máxima cuando realmente existen espacios disponibles.

### Trazabilidad de Aspectos hasta Pruebas

A continuación se detalla la trazabilidad del escenario S1 implementado y sus límites de evidencia.

| Aspecto / Requerimiento | Escenario de Calidad Asociado | Decisión Arquitectónica (ADR) | Implementación (Componentes / Código) | Pruebas (Validación) |
| :--- | :--- | :--- | :--- | :--- |
| **Consistencia transaccional del contador de aforo.** Las transiciones válidas no deben perder actualizaciones concurrentes. | **S1:** solicitudes de entrada concurrentes actualizan el contador. No se afirma unicidad ni deduplicación de estudiantes. | **ADR-0001 (Arquitectura Hexagonal)** y [ADR-0004 (concurrencia PostgreSQL)](./adr/0004-concurrencia-postgresql.md): el dominio (`src/modules/aforo/domain/aforo.js`) permanece aislado; `AforoRepositoryPort` define `actualizarAforo(transicionar)`. | `registrar-acceso.usecase.js` aplica la regla del dominio. `AforoPostgresAdapter` ejecuta la transición en transacción, bloquea la fila con `FOR UPDATE`, actualiza y confirma; intenta rollback ante errores. `schema.sql` define un contador no negativo. El adapter en memoria sigue disponible para `createApp()` y pruebas. | Pruebas base: 12/12; contrato: 11/11; PostgreSQL: 8/8 según la validación reportada. La integración PostgreSQL comprueba persistencia, rollback por error del dominio y de PostgreSQL, y 20 entradas concurrentes con resultado final 20. La prueba concurrente opera directamente sobre el adapter, no es una prueba de carga HTTP. |
