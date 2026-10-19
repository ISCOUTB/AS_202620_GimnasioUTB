# ADR-0005: No extraer Notificaciones a un servicio propio (por ahora)

## Estado

Aceptada — 18 de octubre de 2026. Se revisa cuando se cumpla alguna de las condiciones de la sección "Cuándo revisar esta decisión".

## Contexto

En S6 se identificaron cuatro contextos delimitados: Aforo, Identidad/Estudiante, Gestión Operativa y Notificaciones. El documento de [contextos delimitados](../contextos-delimitados.md) señaló a **Notificaciones** como el candidato natural para separarse: es un subdominio genérico, depende de un tercero (FCM), solo **lee** el aforo (nunca lo escribe) y su carga es distinta a la del registro de accesos (envíos masivos en ráfaga).

Por eso es el módulo con más argumentos a favor de la extracción. Si la respuesta para él es "todavía no", con más razón lo es para Aforo (núcleo, con estado transaccional) o Identidad.

Hechos del sistema actual que pesan en la decisión:

- Monolito Node.js/Express con Arquitectura Hexagonal ([ADR-0001](0001-arquitectura-hexagonal.md)); un solo despliegue en Dokploy con Docker Compose (`api`, `postgres`, `db-init`).
- Consistencia del contador por transacción local y `SELECT ... FOR UPDATE` en PostgreSQL ([ADR-0004](0004-concurrencia-postgresql.md)).
- Comunicación síncrona HTTP; FCM y WebSocket no implementados ([ADR-0003](0003-comunicacion-sincrona-asincrona.md)).
- Observabilidad: logs JSON y `/metrics` en memoria por proceso. No hay trazas distribuidas, broker de mensajes ni correlación entre servicios.
- Equipo de tres personas, un repositorio, un pipeline.
- El módulo Notificaciones **todavía no existe**: su frontera nunca se ha probado en código.

Los modos de fallo que introduce la distribución están en la [evidencia S11](../s11-fallos-parciales.md).

## Opciones evaluadas

### A. No extraer: módulo del monolito con puerto propio y outbox (diseño futuro)

Si se implementa esta opción, Notificaciones sería un módulo hexagonal (`src/modules/notificaciones/`), con un `NotificationPort` y un adaptador FCM. Aforo publicaría eventos en una tabla `outbox_evento` dentro de la misma transacción del registro, y un *relay* los enviaría a FCM con timeout, reintentos y circuit breaker. El relay podría ejecutarse en el mismo código: primero dentro del proceso de la API y, si hiciera falta, como otro proceso de la misma imagen (`node src/relay.js`) en Compose, sin ser un servicio con base de datos ni contrato propios. Ninguno de esos componentes existe actualmente en el repositorio.

### B. Extraer Notificaciones como microservicio con broker

Servicio independiente (otro repositorio o carpeta, otro contenedor, su propia base) que consume eventos de Aforo desde un broker (por ejemplo RabbitMQ). Aforo seguiría necesitando un outbox para publicar al broker de forma confiable.

### C. Extraer Notificaciones como microservicio llamado por HTTP

Aforo llama por HTTP al servicio de notificaciones durante o después del registro de acceso.

## Criterios y evaluación

| Criterio técnico | A. No extraer | B. Servicio + broker | C. Servicio + HTTP |
|---|---|---|---|
| **Necesidad de escalar por separado** | No hay medición que muestre que las notificaciones compitan por CPU o memoria con la API. Si llega a ocurrir, el relay podría moverse a otro proceso sin extraer. | Lo permite, pero hoy resuelve un problema que no se ha observado. | Igual que B. |
| **Aislamiento de fallos de FCM** (F9) | El diseño con outbox + circuit breaker permitiría que el registro de acceso no espere a FCM; aún no está implementado. | Se logra con una arquitectura asíncrona correctamente configurada. | **No se logra** con la llamada síncrona descrita: si el servicio o FCM fallan, la llamada puede arrastrar el registro de accesos (fallo en cascada). |
| **Consistencia entre aforo y evento** (F8) | Si se implementa el outbox en la misma transacción, aforo y evento se confirmarían juntos. | Outbox en Aforo + broker + consumidor idempotente: varias piezas que fallan por separado. | Escritura doble sin garantía, salvo agregar outbox y reintentos, que suma mecanismos similares a B. |
| **Modos de fallo nuevos** | No habría llamadas de red entre módulos. F8–F10 son riesgos del diseño futuro de notificaciones, no mitigaciones ya implementadas. | Broker caído, mensajes duplicados o desordenados, consumidor atrasado, esquemas de evento incompatibles. | Timeouts entre servicios, reintentos que duplican, circuit breaker entre servicios. |
| **Frontera de datos estable** | No necesita estar fija: un error de frontera se corrige moviendo código dentro del repo. | Necesita contrato de eventos (AsyncAPI) estable antes de existir el módulo. Una frontera equivocada se paga con migración de datos entre bases. | Necesita contrato HTTP estable; mismo riesgo. |
| **Costo operativo** (equipo de 3, Dokploy) | Sin componentes nuevos de infraestructura. | Broker, segunda base, segundo pipeline, trazas distribuidas y monitoreo de colas. | Segundo servicio, segundo pipeline y trazas. |
| **Depuración y observabilidad actuales** | Suficientes: un proceso, logs JSON, `/metrics`. | Insuficientes: sin trazas ni correlación no se puede seguir un evento entre servicios. | Insuficientes por la misma razón. |
| **Ritmo de cambio / propiedad** | Un equipo, un repositorio y un ritmo de despliegue. No hay un equipo que necesite desplegar Notificaciones por su cuenta. | Útil cuando haya equipos con ritmos distintos; no es el caso. | Igual que B. |
| **Reversibilidad** | Potencialmente alta si primero se implementa y valida un puerto y un outbox con contratos adecuados; hoy esa costura no existe en el código. | Baja. Volver al monolito exigiría fusionar bases y retirar infraestructura. | Baja. |

## Decisión

Se elige **A: no extraer**. Si se implementa Notificaciones, se propone construirlo como módulo del monolito, detrás de `NotificationPort`, con outbox en la misma base de datos y un relay con timeout, retroceso y circuit breaker. Es un diseño futuro, no una capacidad actual.

No es una ausencia de decisión. Se evaluaron B y C y se rechazaron con criterios concretos:

- **C** se descarta por diseño: acopla en el tiempo el registro de accesos (núcleo) con un subdominio genérico y con un tercero, justo el fallo en cascada que se quiere evitar.
- **B** resuelve problemas reales (escalado y despliegue independientes) que **hoy no se han observado**, y a cambio agrega modos de fallo, infraestructura y una frontera de datos fijada antes de existir el código. Lo único que B aporta y A necesita, el aislamiento frente a FCM, A lo obtiene con el outbox.

La extracción **no se ha ejecutado ni está preparada en el código**. Un puerto y un outbox podrían constituir una costura arquitectónica futura si se implementan y validan; hoy no existen en el repositorio.

## Consecuencias

### Positivas

- Con el diseño propuesto ya implementado, el registro de accesos dependería solo de PostgreSQL y FCM no podría bloquearlo sincrónicamente.
- Con el outbox implementado en la misma transacción, Aforo y su evento se confirmarían juntos, evitando la escritura doble descrita.
- No se agrega infraestructura, coherente con el tamaño del equipo y la plataforma actual.
- El C4 nivel 2 **no cambia por esta decisión**: actualmente no se agrega ningún contenedor. Si se implementara, el relay propuesto sería parte del contenedor `api` o un proceso de la misma imagen.

### Negativas y riesgos aceptados

- Si se implementa el relay dentro de la API, un pico de envíos compartiría el proceso. Mitigación propuesta: límite de lote (50 eventos) y mover el relay a otro proceso de la misma imagen si se observa impacto.
- Si se implementa, el outbox agregaría una tabla que crece y requeriría depuración periódica de eventos enviados.
- La entrega propuesta es al menos una vez, por lo que puede producir mensajes duplicados. La deduplicación por ID estable sería una mitigación futura; no está implementada ni se garantiza que evite que el proveedor push muestre duplicados (F10).
- La disciplina de frontera depende del equipo. Mitigación propuesta: agregar a `.dependency-cruiser.cjs` reglas que impidan que `notificaciones` importe el dominio o la infraestructura de `aforo` y viceversa (solo a través de eventos o puertos), para que la opción de extraer siga abierta.

## Cuándo revisar esta decisión

Se reabre si se cumple al menos una condición, con evidencia medida:

1. El relay retrasa la entrega de forma sostenida (por ejemplo, eventos pendientes con más de 2 minutos de antigüedad en hora pico) y moverlo a otro proceso no lo resuelve.
2. El envío de notificaciones afecta la latencia del registro de accesos de forma medible.
3. Aparece un equipo distinto responsable de Notificaciones o se necesita desplegarlo con otro ritmo.
4. Otros sistemas de la universidad, además del gimnasio, necesitan consumir el mismo servicio de notificaciones.

Requisitos previos antes de extraer, si se reabre: idempotencia implementada en el registro de accesos, trazas distribuidas con id de correlación, contrato de eventos versionado (AsyncAPI) con prueba de contrato en el pipeline y una base de datos propia para Notificaciones.

## Referencias

- [Evidencia S11: modos de fallo, idempotencia, outbox y saga](../s11-fallos-parciales.md)
- [Contextos delimitados (S6)](../contextos-delimitados.md)
- [ADR-0001: Arquitectura Hexagonal](0001-arquitectura-hexagonal.md)
- [ADR-0003: Comunicación síncrona](0003-comunicacion-sincrona-asincrona.md)
- [ADR-0004: Concurrencia PostgreSQL](0004-concurrencia-postgresql.md)
- [arc42 §11: Riesgos](../arc42/arc42_gimnasio_utb.md#11-riesgos-y-deuda-técnica)
