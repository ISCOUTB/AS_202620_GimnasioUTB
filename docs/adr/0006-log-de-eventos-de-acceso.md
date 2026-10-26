# ADR-0006: Registrar cada transición del aforo en un log de eventos append-only

## Estado

Aceptada — 25 de octubre de 2026. **Diseño, no implementado.** Se revisa cuando se cumpla alguna condición de la sección "Cuándo revisar esta decisión".

## Contexto

Hoy la base guarda **solo el contador**: una fila de `aforo_estado` con `aforo_actual` (ADR-0004). Cada `UPDATE` sobrescribe el valor anterior. No queda rastro de qué transiciones llevaron al número actual.

Esa es la decisión de datos más cara de revertir del sistema, por una asimetría:

- Un esquema, un índice o una caché se cambian con una migración.
- **Una historia que no se guardó no se puede reconstruir.** Si dentro de tres meses Bienestar pide la ocupación por hora del semestre, o el encargado necesita explicar por qué el contador marca 40 con 15 personas dentro, no hay de dónde sacarlo. Cada día que el sistema opera sin log es historia perdida para siempre.

Además, tres diseños ya aceptados necesitan registrar algo por cada transición, cada uno con su propia tabla:

| Necesidad | Diseño previo | Tabla propuesta |
|---|---|---|
| Idempotencia de `POST /acceso` (F1, F5) | [S11 §3.3](../s11-fallos-parciales.md) | `solicitud_acceso`, depurada a las 24 h |
| Publicar eventos hacia Notificaciones (F8) | [S11 §4.1](../s11-fallos-parciales.md), [ADR-0005](0005-no-extraer-notificaciones.md) | `outbox_evento`, una fila por envío |
| Historial de accesos del contexto Aforo | [Contextos delimitados](../contextos-delimitados.md) | Ninguna todavía |

Ninguna de esas tablas existe en el código. Este es el momento más barato para decidir el modelo.

Hechos que pesan:

- Una sola base PostgreSQL, en contenedor de Docker Compose con volumen (arc42 §7.2).
- Escrituras serializadas por `SELECT ... FOR UPDATE` sobre una única fila (ADR-0004).
- Monolito hexagonal; Notificaciones, si se implementa, queda dentro (ADR-0005).
- El backend no identifica estudiantes todavía. Cuando lo haga, los eventos serán **datos personales**.

## Opciones evaluadas

### A. Solo estado (continuar como hoy)

El contador sigue siendo lo único durable. La idempotencia y el outbox se implementan como en S11, con tablas que se depuran.

### B. Estado + log de eventos append-only en la misma transacción

`aforo_estado` sigue siendo la fuente de verdad para el **invariante** (`aforo ≥ 0`, se lee con bloqueo). Cada transición confirmada anexa una fila inmutable a `acceso_evento` en la misma transacción, numerada con `aforo_estado.version`. El log cumple tres papeles: historial, registro de idempotencia (columna `idempotency_key UNIQUE`) y fuente de eventos para los consumidores, que lo leen con un checkpoint propio. Esquema completo en la [evidencia S12 §5.1](../s12-datos-eventos.md).

### C. Event sourcing puro

Sin fila de estado: el aforo es la proyección de los eventos (`SUM` o una proyección materializada).

### D. Log en un broker externo (Kafka, RabbitMQ Streams) como fuente

El evento se publica a un broker y la base se alimenta desde él.

## Criterios y evaluación

| Criterio | A. Solo estado | **B. Estado + log** | C. Event sourcing puro | D. Broker como fuente |
|---|---|---|---|---|
| **Conserva la historia** | No. Se pierde para siempre. | Sí, desde el día en que se implementa. | Sí. | Sí, según la retención del broker. |
| **Invariante `aforo ≥ 0` bajo concurrencia** | Resuelto (ADR-0004). | Igual que hoy: el bloqueo y la regla no cambian. | Para validar hay que conocer el valor actual: o se suman eventos en cada escritura, o se mantiene una proyección con bloqueo, es decir, se vuelve a B. | El broker no valida invariantes; la regla quedaría fuera de la transacción, o se acepta y luego se compensa. |
| **Atomicidad estado–evento** (F8) | Requiere el outbox de S11. | Nativa: misma transacción. | Nativa. | Escritura doble (broker + base) o un outbox igual. |
| **Orden para consumidores** | El outbox con `SKIP LOCKED` no garantiza orden. | **Total y sin huecos** por `version`, gracias al bloqueo de ADR-0004. | Igual que B si se serializa. | Por partición. |
| **Costo de leer el aforo** | Una fila. | Una fila (sin cambio). | Una suma o una proyección que mantener. | Una proyección que mantener. |
| **Infraestructura nueva** | Ninguna. | Ninguna: dos tablas más. | Ninguna. | Broker, su monitoreo y su volumen (rechazado en ADR-0005 por costo operativo). |
| **Costo en la escritura** | Mínimo. | Un `INSERT` más **con el bloqueo tomado**: alarga un poco la sección crítica (F4). | Similar a B. | Llamada de red en la ruta de la petición o outbox. |
| **Datos personales** | No hay historia que proteger. | Habrá que definir retención antes de guardar `estudiante_id`. | Igual que B, y borrar es más difícil: los eventos son la verdad. | Igual que C, repartido en otro sistema. |
| **Reversibilidad** | Pasar de A a B después es fácil en código, pero **la historia anterior no vuelve**. | Volver a A es borrar dos tablas. | Volver a un modelo con estado exige reconstruir proyecciones. | Baja: retirar infraestructura y migrar consumidores. |

## Decisión

Se elige **B: estado + log de eventos append-only en la misma transacción.**

- **A** se rechaza porque su costo no se ve hoy, sino cuando ya es tarde: lo que no se registró no se puede pedir después. Además, obligaría a mantener tres tablas con tres semánticas (idempotencia, outbox, historial) para registrar el mismo hecho.
- **C** se rechaza porque, para hacer cumplir `aforo ≥ 0` con concurrencia, termina necesitando una fila de estado bloqueada, que es B con más complejidad en la lectura.
- **D** se rechaza por las mismas razones de costo operativo de ADR-0005, y porque saca el evento de la transacción que valida el invariante.

Reglas que acompañan la decisión:

1. **Append-only.** Los eventos no se editan ni se borran desde la aplicación. Una corrección manual (FUTURO) es un evento nuevo con `origen = 'MANUAL'`.
2. **`aforo_estado` manda para el invariante; el log manda para la historia.** Comprobación de coherencia: `aforo_actual` y `version` de `aforo_estado` deben coincidir con `aforo_resultante` y `version` del último evento.
3. **La `version` la asigna el `UPDATE` con el bloqueo tomado**, no una secuencia, para garantizar orden total y ausencia de huecos ([S12 §5.4](../s12-datos-eventos.md)).
4. **Antes de agregar `estudiante_id` al evento** se define y documenta una política de retención y anonimización (por ejemplo, conservar agregados y desvincular la identidad pasado cierto plazo). Este ADR no afirma cumplimiento legal de ningún tipo.

### Relación con decisiones anteriores

- **Refina el diseño de S11** (no implementado): `solicitud_acceso` pasa a ser la columna `acceso_evento.idempotency_key`, y `outbox_evento` pasa a ser la lectura del log con `consumidor_checkpoint`. Las garantías de S11 se mantienen (clave en la misma transacción; evento atómico con la transición) y se gana **orden**, que el outbox con `SKIP LOCKED` no daba.
- **No cambia ADR-0005:** Notificaciones sigue sin extraerse; el lector del log es el "relay" en otro proceso de la misma imagen.
- **Depende de ADR-0004:** el orden total del log se apoya en que todas las escrituras se serializan sobre una fila.

## Consecuencias

### Positivas

- Historia completa y ordenada desde el día de la implementación; habilita reportes (S12 §6) y auditoría de correcciones.
- Una sola escritura de "lo que pasó" sirve a idempotencia, eventos e historial.
- Los consumidores (notificaciones, WebSocket, reportes) reciben las transiciones en el mismo orden en que ocurrieron, sin broker.
- La `version` también sirve a la caché para no retroceder ([S12 §4.5](../s12-datos-eventos.md)).

### Negativas y costos

- Un `INSERT` más dentro de la sección crítica: algo más de contención en hora pico (F4). Hay que medirlo cuando exista prueba de carga.
- La tabla crece sin límite. Supuesto no medido: 2.000 eventos al día a unos 150 bytes por fila con índices son del orden de **100 MB al año**. Manejable, pero requiere una política de retención o particionado por mes.
- El formato del evento se vuelve un **contrato** para los consumidores: cambiar una columna obliga a coordinarlos.
- El contador actual al migrar no tiene eventos que lo expliquen. La comprobación de coherencia aplica desde el primer evento.

## Cuándo revisar esta decisión

- Si el contador se divide en varias filas (varios gimnasios o zonas): el orden pasa a ser **por fila**; los consumidores deben aceptarlo.
- Si se reemplaza el bloqueo pesimista de ADR-0004 por uno optimista o por otro mecanismo: revisar la asignación de `version`.
- Si una medición muestra que el `INSERT` dentro del bloqueo afecta la latencia de registro en hora pico.
- Antes de agregar cualquier dato personal al evento.
- Si aparecen consumidores externos al monolito o volúmenes que la base no soporte: entonces se evalúa publicar del log a un broker (D como complemento, no como fuente).

## Evidencia y referencias

- Diseño detallado, garantías de entrega y orden, y pruebas planeadas: [evidencia S12](../s12-datos-eventos.md).
- Esquema actual: `src/modules/aforo/infrastructure/persistence/schema.sql` (solo `aforo_estado`).
- [ADR-0004: concurrencia PostgreSQL](0004-concurrencia-postgresql.md).
- [ADR-0005: no extraer Notificaciones](0005-no-extraer-notificaciones.md).
- [Evidencia S11: idempotencia y outbox](../s11-fallos-parciales.md).
