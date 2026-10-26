# ADR-001: Prototipo aislado de mensajería asíncrona

## Estado

Aceptada para el taller educativo. No autoriza migrar el flujo de acceso de producción.

## Contexto y problema

El repositorio implementa `POST /api/v1/aforo/acceso` mediante request-response: el handler espera la regla de dominio y la persistencia PostgreSQL antes de responder. El endpoint devuelve el aforo resultante y por ello requiere una transición confirmada. No hay un efecto secundario real posterior que necesite independencia o ejecución diferida. FCM y WebSocket están documentados como objetivos futuros, pero no están implementados; tampoco existe un broker, cola durable o consumidor.

El taller académico requiere poder observar un ciclo productor-consumidor con contrato, idempotencia, backoff, DLQ y telemetría. Integrar esa infraestructura a la operación actual agregaría complejidad y cambiaría su semántica sin necesidad probada.

## Alternativas consideradas

### A. Seguir procesando sincrónicamente

El productor ejecuta el caso de uso y persiste el cambio antes de contestar. Es el comportamiento vigente, devuelve el resultado inmediato y evita estados de confirmación pendientes. No permite demostrar aislamiento de fallos de un consumidor posterior y acoplaría una futura llamada externa al tiempo de respuesta si se implementara de manera ingenua.

### B. Integrar mensajería asíncrona en el endpoint actual

Publicar un evento durable y procesarlo después podría desacoplar efectos secundarios. Para un registro fiable, la publicación necesitaría ser atómica con la transición PostgreSQL, por ejemplo mediante un outbox/transaccional, y requeriría definir cuándo responde el endpoint, persistencia, confirmaciones, consumidores y recuperación. Nada de ello existe hoy; una publicación directa después de actualizar el contador perdería eventos ante una caída entre ambas operaciones.

### C. Prototipo independiente en memoria

Implementar productor, cola local, consumidor y DLQ en un módulo `experiments/` no referenciado por la API. Se ejecuta y prueba sin servicios externos y permite mostrar las políticas solicitadas sin añadir una dependencia o cambiar un endpoint.

## Decisión

Se elige C. El prototipo vive en `experiments/messaging/`, fuera del módulo de producción, usa únicamente Node.js y no es importado por `src/server.js`. La cola guarda una muestra de evento de acceso no identificable en un array; el consumidor actualiza una proyección de demostración, no el contador de aforo real. La comparación con el flujo síncrono real y las limitaciones se presentan explícitamente al estudiante.

## Garantías implementadas y no implementadas

- **Contrato:** el consumidor valida estructura, evento, fecha y versión 1 antes de ejecutar el manejador. Rechaza versiones incompatibles.
- **Entrega:** no se garantiza durabilidad ni entrega at-least-once. Cola y DLQ son arrays en proceso; un reinicio los pierde y no hay confirmaciones de broker. El consumidor ejecuta uno a tres intentos locales por llamada, que sirven para mostrar la política, no como garantía de entrega.
- **Idempotencia:** IDs completados se guardan en memoria; repetición posterior o concurrente del mismo ID no invoca de nuevo el manejador. Esto no es exactamente una vez y la tabla de IDs se pierde al reiniciar.
- **Reintentos:** solo un `RecoverableProcessingError` es recuperable. El primer intento es inmediato; después del primer fallo espera 100 ms y después del segundo 200 ms. Tres intentos totales como máximo. Errores definitivos se envían a la DLQ inmediatamente.
- **DLQ:** agotamiento de reintentos o fallo definitivo guarda el mensaje, intentos, fecha y error en una lista en memoria. No hay re-proceso ni retención durable.
- **Observabilidad:** cada intento emite JSON con `eventId`, `eventType`, resultado, número de intento y, si aplica, error; hay contadores en memoria por consumidor.

## Ventajas, desventajas y riesgos

**Ventajas:** demostración reproducible, sin broker externo ni paquetes nuevos; tests rápidos sin PostgreSQL; el endpoint y el modelo operacional no cambian.

**Desventajas y riesgos:** no hay almacenamiento durable, control de concurrencia entre procesos ni garantías de entrega. La deduplicación cubre una instancia de consumidor y solo marca el ID al terminar exitosamente el manejador. Si un efecto real se confirma y el proceso cae antes de marcarlo, una nueva entrega podría repetirlo. Logs y métricas se reinician y no están centralizados. El backoff no se aplica a fallos definitivos.

## Consecuencias y paso a producción

No alterar el endpoint por este ejercicio. Si aparece un requisito real de procesamiento posterior, acordar primero el efecto, la semántica de respuesta y el dueño del evento. Para una integración robusta se requeriría al menos:

1. Persistir el evento en un outbox en la misma transacción que la transición PostgreSQL, según evaluación de ADR-0006, o adoptar una solución equivalente de publicación atómica.
2. Elegir e operar un mecanismo durable de cola, definir confirmaciones, visibilidad, orden, retención, seguridad y recuperación.
3. Guardar idempotencia durable junto al efecto de negocio, con claves/retención y límites de concurrencia definidos.
4. Persistir DLQ, re-drive controlado, política de retención y alertas; evitar que la reejecución duplique efectos.
5. Incorporar métricas y logs agregados, pruebas de integración con fallos y una estrategia de despliegue/versionado de consumidores.
6. Revisar minimización y retención de datos antes de incluir identificadores personales.

La cola en memoria del taller no es infraestructura para producción. El detalle está en [límites-experimento.md](./limites-experimento.md).
