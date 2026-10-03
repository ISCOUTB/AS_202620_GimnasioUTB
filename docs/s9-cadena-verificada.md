# Evidencia S9 — Cadena verificada de una porción construida con IA

**Porción elegida:** registrar un acceso con consistencia transaccional del contador de aforo (`registrar-acceso.usecase.js` + `AforoPostgresAdapter`).

**Por qué esta porción:** es el corte vertical de la semana 4 (el primer caso de uso extremo a extremo, generado con apoyo de IA según `docs/ia.md`, semana 4), y es la que sostiene el único escenario de calidad implementado (S1). Es la porción donde un error generado por IA sería más caro: un contador que pierde actualizaciones muestra cupos falsos.

**Fecha de verificación:** 3 de octubre de 2026. Entorno: Node v22.22.2 y PostgreSQL 16 locales (el CI usa Node 20).

## 1. La cadena completa

| Eslabón | Contenido | Evidencia en el repo |
|---|---|---|
| **Aspecto** | Consistencia de datos del contador de aforo | `docs/aspectos.md` (fila S1) |
| **Escenario de calidad** | S1: entradas concurrentes sobre el contador; la medida es que 20 entradas concurrentes dejen el valor final en 20 | `docs/aspectos.md`, `docs/arc42/arc42_gimnasio_utb.md` §10.2 |
| **Decisión** | Hexagonal (dominio aislado, puerto de repositorio) y transacción con `SELECT ... FOR UPDATE` | `docs/adr/0001-arquitectura-hexagonal.md`, `docs/adr/0004-concurrencia-postgresql.md` |
| **Prompt a la IA** | Semana 4: se pidió el corte vertical conectado a PostgreSQL y la fila de trazabilidad de S1. Ver `docs/ia.md` | `docs/ia.md`, semana 4 |
| **Código generado** | Caso de uso `registrar-acceso.usecase.js`, puerto `aforo-repository.port.js`, `aforo-postgres.adapter.js`, `schema.sql` | `src/modules/aforo/` |
| **Verificación automática** | 3 suites de pruebas, prueba de mutación sobre el bloqueo, fitness functions de arquitectura y auditoría de dependencias (sección 2) | `tests/`, `.dependency-cruiser.cjs`, `.github/workflows/ci.yml` |
| **Revisión humana** | Qué se leyó, qué se corrigió y qué se rechazó | `docs/ia.md`, semana 9, y sección 3 de este documento |
| **Resultado** | S1 cumplido con evidencia; límites declarados en la sección 4 | `docs/auditoria-erosion.md` |

## 2. Verificación ejecutada (resultados reales)

| Verificación | Comando | Resultado |
|---|---|---|
| Pruebas base (dominio, integración, health/ready/metrics) | `npm run test:base` | 12/12 en verde |
| Prueba de contrato contra `docs/openapi.yaml` | `npm run test:contrato` | 11/11 en verde |
| Pruebas con PostgreSQL real | `DATABASE_URL=... npm run test:postgres` | 8/8 en verde, incluida `serializa 20 entradas concurrentes sin lost updates` |
| **Prueba de mutación** (¿la prueba de concurrencia detecta el defecto que debe detectar?) | Se quitó `FOR UPDATE` del `SELECT` del adapter en una copia y se corrió `test:postgres` 3 veces | La prueba **falló las 3 veces**: valor final 5, 6 y 5 en lugar de 20 |
| Fitness functions de arquitectura | `npm run arch:check` | 0 violaciones (11 módulos, 16 dependencias) |
| Sensibilidad de las fitness functions | Se inyectaron violaciones en 5 archivos de una copia | Las reglas reportaron 12 errores (ver `docs/auditoria-erosion.md`) |
| Vulnerabilidades de dependencias | `npm audit` | 3 moderadas antes; 0 después de `npm audit fix` |

**Qué prueba la mutación:** que el bloqueo de fila no es decorativo. Sin `FOR UPDATE`, la transacción lee el mismo valor desde varias conexiones y se pisan. Con él, la prueba pasa. Esto valida el código generado y también la prueba que lo vigila.

## 3. Revisión humana: qué debe poder defender el equipo

El curso exige explicar cada línea en la revisión en vivo. Para esta porción:

1. **¿Por qué la transición se pasa como función (`actualizarAforo(transicionar)`) y no como `leer` + `escribir` separados?** Porque la lectura, la regla de dominio y la escritura deben ocurrir dentro de la misma transacción con la fila bloqueada. Dos llamadas separadas reabren la condición de carrera.
2. **¿Qué hace `ROLLBACK` cuando la regla de dominio rechaza una salida?** Libera el bloqueo y deja el contador intacto. Lo prueba el subtest `revierte una salida rechazada por la regla de dominio`.
3. **¿Por qué `AforoPostgresAdapter` importa `AforoDomainError`?** Para no convertir un rechazo de negocio (HTTP 400) en un fallo de infraestructura (HTTP 503). La dirección infraestructura → dominio está permitida por ADR-0001.
4. **¿Qué pasa si el pool de conexiones se agota?** `pool.connect()` espera; no hay timeout configurado en el adapter. Es un límite no cubierto por pruebas.
5. **¿Por qué la prueba de concurrencia no demuestra comportamiento bajo carga HTTP?** Llama directo al adapter con 20 operaciones; no pasa por Express.

## 4. Qué se aceptó, corrigió y rechazó en esta porción

El detalle por sesión está en `docs/ia.md` (semana 9). Resumen de la verificación de esta semana:

- **Aceptado:** la estructura hexagonal de la porción (el análisis de dependencias no encontró violaciones) y la estrategia de bloqueo de fila.
- **Corregido:** las dos violaciones latentes de la semana 6 que seguían abiertas (V1: estado público mutable en el adapter de memoria; V2: lectura que saltaba el caso de uso). Ver `docs/auditoria-erosion.md`.
- **Pendiente, sin ocultar:** el CI no ejecuta `test:postgres`, por lo que la evidencia de S1 solo se reverifica en una máquina con PostgreSQL. No hay timeout de pool. No hay prueba de carga HTTP.

## 5. Componente generativo en ejecución

**No aplica.** El sistema no contiene un modelo generativo en ejecución:

- `package.json` no declara ningún SDK de modelos (solo `express` y `pg` en producción).
- Las notificaciones personalizadas (FCM) están como objetivo futuro y no implementadas (`docs/adr/0003-comunicacion-sincrona-asincrona.md`).

Por eso no se presenta evaluación, costo por llamada ni latencia de un modelo: no existen datos reales que reportar y inventarlos violaría la regla de documentación coherente con el código. **Condición para reabrir este punto:** si las notificaciones personalizadas pasan a usar un LLM, se debe añadir `docs/evaluacion-generativa.md` con un conjunto de casos versionado, tasa de aciertos, costo por llamada y mensual con supuestos, latencia p50/p95, comportamiento ante caída del proveedor (timeout, reintento, degradación) y defensa de la entrada (validación y límites).

## Referencias

[1] N. Ford, R. Parsons y P. Kua, *Building Evolutionary Architectures*. O'Reilly Media, 2017.
[2] A. Cockburn, "Hexagonal architecture," 2005. [En línea]. Disponible: https://alistair.cockburn.us/hexagonal-architecture/
[3] "dependency-cruiser," GitHub. [En línea]. Disponible: https://github.com/sverweij/dependency-cruiser
