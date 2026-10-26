# Límites del experimento

- **No hay broker real.** `InMemoryMessageQueue` es un array local al proceso. No usa RabbitMQ, Kafka, Redis, PostgreSQL como cola ni otro servicio.
- **No es durable ni garantiza entrega.** Una caída puede perder mensajes antes o durante el procesamiento. No hay ACK/NACK, lease, confirmación de publicación ni recuperación de mensajes.
- **No garantiza at-least-once ni exactly-once.** Tres intentos corresponden al procesamiento de una llamada local al consumidor, no a una política de entrega de infraestructura. La idempotencia es una protección en memoria, no una garantía exactly-once.
- **Deduplicación volátil.** El conjunto de `eventId` se reinicia con el proceso y no coordina instancias. Solo registra un evento después de que el manejador resuelve correctamente. Un fallo parcial del manejador con efecto ya aplicado puede repetir ese efecto tras reintento; el código de producción necesitaría una transacción idempotente.
- **DLQ volátil y sin re-drive.** Los errores definitivos y los fallos que agotan intentos quedan en una lista en memoria. Reiniciar descarta la evidencia; no hay interfaz para inspeccionar, alertar, retener o re-procesar.
- **Backoff simple.** Delays fijos de 100 y 200 ms, sin jitter, límite de tasa ni circuito de protección. Solo `RecoverableProcessingError` dispara reintento; el resto se trata como definitivo.
- **Métricas y logs locales.** Se reinician al finalizar la ejecución y no están integrados con Prometheus, trazas distribuidas, dashboards ni alertas. El demo escribe logs JSON a stdout.
- **Integración intencionalmente ausente.** El evento de ejemplo solo contiene `tipoAcceso`; actualiza una proyección descartable y no el contador PostgreSQL. `POST /api/v1/aforo/acceso` permanece síncrono y sin cambios, dado que hoy no tiene un efecto posterior implementado que justifique una cola.

Para producción hacen falta publicación durable atómica (por ejemplo, outbox en la transacción de PostgreSQL), broker operado, consumidor con confirmaciones y política de recuperación, deduplicación durable ligada a la transacción del efecto, DLQ persistente y re-drive auditado, métricas/alertas, compatibilidad de despliegue y revisión de privacidad/retención. La decisión de no integrar se desarrolla en [ADR-001](./ADR-001-mensajeria-asincrona.md).
