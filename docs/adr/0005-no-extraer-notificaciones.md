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

### A. No extraer: módulo del monolito con puerto propio y outbox

Notificaciones se implementa como un módulo hexagonal más (`src/modules/notificaciones/`), con su `NotificationPort` y un adaptador FCM. Aforo publica eventos en una tabla `outbox_evento` en la misma transacción del registro, y un *relay* los envía a FCM con timeout, reintentos y circuit breaker. El relay se ejecuta en el mismo código: primero dentro del proceso de la API y, si hace falta, como otro proceso de la misma imagen (`node src/relay.js`) en el Compose, sin ser un servicio con base de datos ni contrato propios.

### B. Extraer Notificaciones como microservicio con broker

Servicio independiente (otro repositorio o carpeta, otro contenedor, su propia base) que consume eventos de Aforo desde un broker (por ejemplo RabbitMQ). Aforo seguiría necesitando un outbox para publicar al broker de forma confiable.

### C. Extraer Notificaciones como microservicio llamado por HTTP

Aforo llama por HTTP al servicio de notificaciones durante o después del registro de acceso.

## Criterios y evaluación

| Criterio técnico | A. No extraer | B. Servicio + broker | C. Servicio + HTTP |
|---|---|---|---|
| **Necesidad de escalar por separado** | No hay medición que muestre que las notificaciones compitan por CPU o memoria con la API. Si llega a ocurrir, el relay se mueve a otro proceso sin extraer. | Lo permite, pero hoy resuelve un problema que no se ha observado. | Igual que B. |
| **Aislamiento de fallos de FCM** (F9) | Se logra con outbox + circuit breaker: el registro de acceso no espera a FCM. | Se logra. | **No se logra**: si el servicio o FCM fallan, la llamada síncrona arrastra el registro de accesos (fallo en cascada). |
| **Consistencia entre aforo y evento** (F8) | Una transacción local: aforo y evento se confirman juntos. | Outbox en Aforo + broker + consumidor idempotente: tres piezas que fallan por separado. | Escritura doble sin garantía, salvo agregar outbox y reintentos, que es construir B a mano. |
| **Modos de fallo nuevos** | Ninguno de red entre módulos. Solo F8–F10, ya mitigados por el diseño. | Broker caído, mensajes duplicados o desordenados, consumidor atrasado, esquemas de evento incompatibles. | Timeouts entre servicios, reintentos que duplican, circuit breaker entre servicios. |
| **Frontera de datos estable** | No necesita estar fija: un error de frontera se corrige moviendo código dentro del repo. | Necesita contrato de eventos (AsyncAPI) estable antes de existir el módulo. Una frontera equivocada se paga con migración de datos entre bases. | Necesita contrato HTTP estable; mismo riesgo. |
| **Costo operativo** (equipo de 3, Dokploy) | Sin componentes nuevos de infraestructura. | Broker, segunda base, segundo pipeline, trazas distribuidas y monitoreo de colas. | Segundo servicio, segundo pipeline y trazas. |
| **Depuración y observabilidad actuales** | Suficientes: un proceso, logs JSON, `/metrics`. | Insuficientes: sin trazas ni correlación no se puede seguir un evento entre servicios. | Insuficientes por la misma razón. |
| **Ritmo de cambio / propiedad** | Un equipo, un repositorio y un ritmo de despliegue. No hay un equipo que necesite desplegar Notificaciones por su cuenta. | Útil cuando haya equipos con ritmos distintos; no es el caso. | Igual que B. |
| **Reversibilidad** | Alta. Si después se extrae, el puerto y el outbox ya son la costura: el adaptador cambia de "llamar al módulo" a "publicar en un broker". | Baja. Volver al monolito exige fusionar bases y retirar infraestructura. | Baja. |

## Decisión

Se elige **A: no extraer**. Notificaciones se construirá como módulo del monolito, detrás de `NotificationPort`, con outbox en la misma base de datos y un relay con timeout, retroceso y circuit breaker.

No es una ausencia de decisión. Se evaluaron B y C y se rechazaron con criterios concretos:

- **C** se descarta por diseño: acopla en el tiempo el registro de accesos (núcleo) con un subdominio genérico y con un tercero, justo el fallo en cascada que se quiere evitar.
- **B** resuelve problemas reales (escalado y despliegue independientes) que **hoy no se han observado**, y a cambio agrega modos de fallo, infraestructura y una frontera de datos fijada antes de existir el código. Lo único que B aporta y A necesita, el aislamiento frente a FCM, A lo obtiene con el outbox.

La extracción queda **preparada, no ejecutada**: el puerto y el outbox son la costura por donde se cortaría el servicio si las condiciones cambian.

## Consecuencias

### Positivas

- El registro de accesos sigue dependiendo solo de PostgreSQL; FCM no puede tumbarlo.
- Aforo y su evento se confirman en una transacción: no hay notificaciones fantasma ni perdidas por escritura doble.
- No se agrega infraestructura, coherente con el tamaño del equipo y la plataforma actual.
- El C4 nivel 2 **no cambia**: no se agrega ningún contenedor. El relay es parte del contenedor `api`.

### Negativas y riesgos aceptados

- Un pico de envíos comparte proceso con la API mientras el relay corra dentro de ella. Mitigación: límite de lote (50 eventos), y mover el relay a otro proceso de la misma imagen si se observa impacto.
- El outbox agrega una tabla que crece; requiere depuración periódica de eventos enviados.
- La entrega es al menos una vez: Notificaciones debe descartar ids repetidos (F10).
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
