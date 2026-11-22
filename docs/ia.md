# Uso de Inteligencia Artificial

## Propósito

Durante el desarrollo del proyecto se podrán utilizar herramientas de inteligencia artificial como apoyo en actividades de investigación, organización de ideas, redacción y revisión de documentación.

La inteligencia artificial será utilizada como una herramienta de apoyo y no como sustituto del análisis, diseño y toma de decisiones realizados por los integrantes del equipo.

## Uso realizado hasta el momento

Para la etapa inicial del proyecto se utilizó una herramienta de inteligencia artificial como apoyo para:

- Organizar la documentación inicial del repositorio.
- Estructurar el archivo README.
- Apoyar la redacción del aspecto de arquitectura relacionado con la consistencia de datos.
- Mejorar la organización y presentación de la información del proyecto.

## Validación

Todo el contenido generado o sugerido mediante herramientas de inteligencia artificial será revisado por los integrantes del equipo antes de incorporarse al proyecto.

Los integrantes son responsables de las decisiones, documentación, diseño y código incluidos en el repositorio.

## Registro por entregas

Este documento registra los usos relevantes de herramientas de inteligencia artificial por entrega. La herramienta utilizada se especifica en cada entrada.

Este documento registra, de forma trazable, el uso de IA generativa durante el desarrollo del proyecto, conforme a lo exigido por el curso. Por cada entrega se documenta la herramienta, un resumen de la solicitud y del resultado, y la verificación/edición realizada por el equipo antes de incorporarlo.

> **Nota:** Ningún contenido generado se incorporó al proyecto sin revisión del equipo. Las decisiones de arquitectura (elección de stack, estilo arquitectónico) fueron tomadas por el equipo; la IA se usó para estructurar la documentación, comparar alternativas de forma sistemática, y depurar la integración con GitHub.

---

## semana 2— arc42 secciones 1–3, árbol de utilidad, escenarios de calidad, C4 nivel 1

| Campo | Detalle |
|---|---|
| **Fecha** | 14 de agosto |
| **Herramienta** | Claude|
| **Prompt utilizado (resumido)** | Se solicitó estructurar el arc42 (secciones 1 a 3) a partir del problema ya definido por el equipo (aforo del gimnasio, registro QR/manual, notificaciones), pidiendo explícitamente que preguntara por cualquier decisión técnica pendiente antes de redactar. Ante la pregunta de la IA sobre el stack, el equipo definió: app móvil en Flutter, backend en Node.js + Express, base de datos PostgreSQL, despliegue en Render. |
| **Salida generada** | Documento arc42 con secciones 1 (Introducción y Objetivos), 2 (Restricciones), 3 (Contexto y Alcance), árbol de utilidad, 5 escenarios de calidad con medida, y un primer diagrama C4 de contexto en sintaxis Mermaid. |
| **Verificación del equipo** | Se revisaron los objetivos de calidad y restricciones frente al problema real del gimnasio; se validó que las medidas de los escenarios fueran razonables para el alcance del MVP, se cambio el diagrama C4 de contexto por uno hecho por el equipo de trabajo. |
| **Aceptado** | Se aceptó la estructura inicial del arc42, los escenarios de calidad y la comparación de alternativas como base para la documentación del proyecto. |
| **Rechazado** | Se rechazó el primer diagrama C4 generado por la IA. |
| **Motivo** | El equipo consideró que el diagrama debía representar con mayor precisión el contexto real del Gimnasio UTB y sus actores, por lo que decidió elaborar y ajustar el diagrama directamente. |


## Semana 3 — arc42 sección 4, matriz comparativa, ADR 0001, esqueleto del repositorio

| Campo | Detalle |
|---|---|
| **Fecha** | 23 de agosto |
| **Herramienta** | Claude  |
| **Prompt utilizado** | *"La entrega de esta semana es: arc42 sección 4, matriz comparativa de capas / hexagonal / monolito modular y docs/adr/0001-*.md con alternativas y consecuencias. [...] ayudame con la creacion del esqueleto y archivos teniendo en cuenta las correciones realizadas de la anterior entrega* |
| **Salida generada** | (1) Sección 4 del arc42 con matriz comparativa (Capas / Hexagonal / Monolito Modular) evaluada contra los escenarios de calidad y restricciones ya definidos por el equipo; (2) ADR 0001 con las tres alternativas, decisión (Arquitectura Hexagonal) y consecuencias positivas/negativas; (3) esqueleto de repositorio Node.js/Express con estructura `domain/`, `application/`, `infrastructure/` por módulo, prueba automatizada (`node:test`) y workflow de CI. |
| **Verificación del equipo** | Se ejecutó `npm install && npm start` y `npm test` de forma local antes de integrar el esqueleto al repositorio, confirmando que la prueba pasaba en verde sin necesidad de base de datos. La decisión de arquitectura (Hexagonal) fue evaluada por el equipo contra las alternativas antes de aceptarla — no se tomó por default. |
| **Aceptado** | Se aceptó la estructura inicial del esqueleto ejecutable, la organización basada en arquitectura hexagonal, la prueba automatizada y la propuesta de integración continua, después de ser revisadas y probadas por el equipo. |
| **Rechazado o ajustado** | Se rechazaron o modificaron las propuestas que no coincidían completamente con las decisiones arquitectónicas y necesidades específicas del proyecto. |
| **Motivo** | El equipo decidió mantener únicamente las propuestas compatibles con el problema del Gimnasio UTB, la arquitectura hexagonal seleccionada y el alcance definido para el MVP. La decisión final sobre la arquitectura fue tomada por el equipo después de comparar las alternativas y no directamente por la IA. |

## Semana 4 — Glosario inicial, corte vertical ejecutable, actualización del README y trazabilidad de aspectos

| Campo | Detalle |
|---|---|
| **Fecha** | 30 de agosto |
| **Herramienta** | Claude |
| **Prompt utilizado** | Se solicitó la creación del glosario inicial (Sección 12 de arc42), el diseño de un corte vertical ejecutable para el README que conectara el backend con PostgreSQL, y la actualización de la tabla de aspectos de calidad añadiendo trazabilidad completa hasta las pruebas. |
| **Salida generada** | (1) Definiciones glosario inicial del arc42 (aforo, arquitectura hexagonal, cold start, estado operativo, FCM, registro de excepción y transacciones ACID); (2) bloque para el `README.md` unificado con la guía del corte vertical ejecutable y comandos de instalación; (3) código base en Node.js y PostgreSQL para conectar el primer caso de uso extremo a extremo; (4) fila completa para la tabla de aspectos evaluando la consistencia transaccional y su estrategia de pruebas de carga/integración. |
| **Verificación del equipo** | El equipo revisó las definiciones del glosario para que se ajustaran al dominio del gimnasio, validó que los comandos de instalación del README fueran reproducibles en el entorno local y examinó la fila de la tabla de aspectos para asegurar coherencia con el escenario S1. |
| **Aceptado** | Se aceptó el contenido del glosario, la unificación del README, la estructura del corte vertical en PostgreSQL y la trazabilidad de aspectos para integrarse directamente al repositorio del proyecto. |
| **Rechazado o ajustado** | N/A |
| **Motivo** | Los componentes generados respondían directamente a los requerimientos pendientes del esqueleto y la documentación de arquitectura sin requerir modificaciones estructurales mayores. |

---
## Semana 5 — Glosario inicial, corte vertical ejecutable, trazabilidad de aspectos y documento de correcciones

| Campo | Detalle |
|---|---|
| **Fecha** | 6 de septiembre de 2026 |
| **Herramienta** | Gemini |
| **Prompt utilizado** | Se solicitó estructurar el glosario inicial (arc42 sección 12), clarificar el concepto de corte vertical ejecutable para el `README.md` con persistencia en PostgreSQL, completar la tabla de aspectos de calidad con trazabilidad hasta pruebas, y crear un documento `correcciones.md` organizado por entregas semanales. |
| **Salida generada** | (1) Definiciones del glosario inicial (arc42 Sección 12); (2) versión unificada del `README.md` eliminando duplicidades e incluyendo la guía y código base para el corte vertical ejecutable; (3) fila completa de trazabilidad para la matriz de aspectos (`aspectos.md`) enlazando el escenario S1 con la implementación y pruebas de carga; (4) archivo `docs/correcciones.md` dividiendo los ajustes del proyecto por hito semanal; (5) resumen ejecutivo de avances de la semana. |
| **Verificación del equipo** | El equipo revisó las definiciones del glosario, validó la eliminación de texto duplicado en el README y en el documento de aspectos, inspeccionó el flujo extremo a extremo del corte vertical en la arquitectura hexagonal y ajustó la estructura del historial de correcciones. |
| **Aceptado** | Se aceptó la unificación del README, el código inicial del corte vertical, la matriz de trazabilidad de aspectos, el glosario de arc42 y la incorporación del archivo `correcciones.md`. |
| **Rechazado o ajustado** | Se solicitó un reajuste en la estructura propuesta para `correcciones.md` para evitar un listado general y clasificar las correcciones por entrega semanal. |
| **Motivo** | Dividir el historial de correcciones por entrega permite una mejor trazabilidad frente a las retroalimentaciones recibidas en cada hito evaluativo del curso. |

## Semana 6 — Contextos delimitados y propiedad de datos

| Campo | Detalle |
|---|---|
| **Fecha** | 13 de septiembre de 2026 |
| **Herramienta** | Claude |
| **Prompt utilizado (resumido)** | Se pidió primero una explicación de qué son y para qué sirven los entregables de la evidencia S6 (mapa de contextos, tabla módulo→datos con dueño único, lista de violaciones con plan de corrección). Luego se solicitó la construcción de la tabla de propiedad de datos por módulo y la lista de violaciones detectadas en el código actual con la información dada. Finalmente se pidió actualizar el `README.md` para enlazarlo desde la sección "Documentación". |
| **Salida generada** | (1) Explicación conceptual de los tres entregables de S6 en términos de DDD aplicados al dominio del gimnasio; (2) tabla módulo→dato→dueño único cubriendo el contexto Aforo (implementado) y los contextos Identidad/Estudiante, Gestión Operativa y Notificaciones (aún no implementados, derivados del lenguaje de `docs/problema.md`); (3) tabla de 3 violaciones/riesgos detectados en el código real (`aforo-memoria.adapter.js`, `server.js`) con su plan de corrección; (4) archivo `docs/contextos-delimitados.md` con ambas tablas; (5) línea nueva en el `README.md` enlazando el documento. |
| **Verificación del equipo** | Se revisó que la tabla de propiedad de datos reflejara fielmente los contextos descritos en `problema.md` y no contextos inventados; se contrastaron las violaciones señaladas directamente contra el código fuente actual (`aforo-memoria.adapter.js`, `server.js`, el puerto y el caso de uso) para confirmar que corresponden a código real y no a supuestos genéricos de DDD.|
| **Aceptado** | Se aceptaron ambas tablas, el archivo `docs/contextos-delimitados.md` y la actualización del `README.md` para integrarse al repositorio. |
| **Motivo** | El mapa de contextos delimitados aún está pendiente de elaborar por el equipo (no fue generado por la IA); las tablas y violaciones sí se generaron con IA pero se validaron contra el código fuente real antes de aceptarlas, siguiendo el mismo criterio de las entregas anteriores de no incorporar nada sin revisión. |

## Semana 8 — Observabilidad existente y deployment con Dokploy

| Campo | Detalle |
|---|---|
| **Herramienta** | GitHub Copilot en VS Code |
| **Objetivo** | Revisar el backend real y preparar/documentar su deployment con Docker Compose en Dokploy, sin alterar la lógica de negocio ni agregar dependencias de observabilidad innecesarias. |
| **Actividades asistidas por IA** | Se inspeccionaron la arquitectura hexagonal, el adapter PostgreSQL, el adapter de memoria, los endpoints y la observabilidad existente. Se revisó que los logs fueran JSON y que `/metrics` expusiera `access_operations_total` en memoria, sin presentarla como Prometheus. Se propusieron, crearon y revisaron el `Dockerfile`, `.dockerignore`, `deploy/compose.lab.yaml` y `deploy/.env.example`. Se detectó y corrigió en el Dockerfile el permiso de escritura de `/app` antes de ejecutar `npm ci` como usuario `node`. Se analizaron los errores de Compose reportados durante la preparación, incluida la ruta de archivo ausente y la configuración requerida en el entorno generado por Dokploy. |
| **Resultado asistido** | Se preparó una composición de tres servicios (`postgres`, `db-init`, `api`), con volumen nombrado para PostgreSQL, inicialización mediante `npm run db:init`, dependencias por estado saludable y healthcheck de la API sobre `/ready`. La `DATABASE_URL` se construye internamente con el hostname `postgres`; el archivo real de entorno no se versiona. No se modificó la arquitectura ni se agregaron servicios o dependencias de observabilidad. |
| **Acciones y verificaciones del equipo** | El equipo configuró las variables en Dokploy, corrigió la configuración del entorno, activó el redeploy mediante webhook y verificó el resultado `Docker Compose Deployed: ✅`, PostgreSQL `Healthy`, la finalización de `db-init` y el arranque de la API. En producción verificó `/health`, `/ready`, `/metrics`, `GET /api/v1/aforo` y `POST /api/v1/aforo/acceso`: en esa ejecución el contador pasó de 0 a 1 con `ENTRADA` y volvió a 0 con `SALIDA`; las métricas observadas fueron entrada 1, salida 1 y total 2. Son resultados de esa ejecución, no métricas históricas persistentes. Copilot ayudó a preparar y revisar los archivos; no ejecutó el deployment ni las solicitudes productivas. |
| **Archivos relacionados** | `Dockerfile`, `.dockerignore`, `deploy/compose.lab.yaml`, `deploy/.env.example`, `README.md` y esta entrada. Los dos últimos documentan el estado y la trazabilidad; no se modificó código de negocio. |
| **Validación técnica asistida** | Se revisaron sintaxis YAML, rutas relativas de build, referencias a `package.json`, `package-lock.json`, `src/` y `scripts/`, orden de permisos en Dockerfile, y que el lockfile correspondiera con `package.json`. Docker no estaba disponible localmente, por lo que no se ejecutó una construcción ni un despliegue desde este entorno. Se revisó el estado de Git; los commits relacionados con el deployment son `e960de7` y `32be1b1`. |
| **Límites** | Las métricas viven en memoria y se reinician con el proceso. El volumen está configurado, pero no se documentó una prueba de retención de datos después de un redeploy. La interfaz Flutter existe, pero no se verificó integración funcional con la API. |

## Semana 9 — Generación verificada y trazable: cadena, erosión y dependencias

| Campo | Detalle |
|---|---|
| **Fecha** | 3 de octubre de 2026 |
| **Herramienta** | Claude (claude.ai), con acceso al repositorio clonado y a un entorno de ejecución |
| **Prompt utilizado (resumido)** | Se pidió generar todo lo que exige la evidencia S9 a partir del repositorio real: cadena completa de una porción construida con IA, extracto de `docs/ia.md`, auditoría de erosión y auditoría de dependencias propuestas por el modelo, y evaluación del componente generativo si existe. Antes se había pedido un prompt de trabajo para la evidencia. |
| **Salida generada** | (1) `docs/s9-cadena-verificada.md`; (2) `docs/auditoria-erosion.md` y la configuración `.dependency-cruiser.cjs` con 11 reglas, el script `arch:check` y su paso en el CI; (3) `docs/auditoria-dependencias.md` y el paso `npm audit` en el CI; (4) corrección de V1 (campo privado en el adapter de memoria) y V2 (caso de uso `consultar-aforo.usecase.js`); (5) `npm audit fix` sobre `express`, `body-parser` y `qs`; (6) esta entrada. |
| **Verificación** | Se ejecutaron y pasaron: `test:base` 12/12, `test:contrato` 11/11 y `test:postgres` 8/8 con PostgreSQL 16 real; `arch:check` sin violaciones; `npm audit` de 3 moderadas a 0. Se hizo una prueba de mutación (sin `FOR UPDATE` la prueba de concurrencia falla con 5, 6 y 5 en vez de 20) y una inyección de violaciones (12 errores detectados). Los resultados completos están en los documentos del punto anterior. **Reproducción por el equipo:** ☐ fecha y responsable. |
| **Aceptado** | La configuración de fitness functions, las correcciones V1 y V2, la actualización de dependencias sin cambios mayores y los tres documentos. |
| **Corregido** | La primera versión de `.dependency-cruiser.cjs` tenía `includeOnly: '^src'`, que ocultaba los paquetes npm y dejaba sin efecto las reglas H1b y H2b. Se detectó al preparar la prueba de sensibilidad y se eliminó la opción. |
| **Rechazado** | (a) Redactar una evaluación de costo y latencia de un componente generativo: el sistema no tiene ninguno, y se dejó como "No aplica" con la condición para reabrirlo. (b) Proponer la migración a Express 5 y a js-yaml 5: son cambios mayores sin un defecto que los justifique hoy. |
| **Motivo** | La regla del curso es que la documentación coincida con el código y que todo se pueda defender en vivo: no se incluyó nada que no tuviera evidencia ejecutada. |


## Semana 11 — Fallos parciales y decisión de extracción

| Campo | Detalle |
|---|---|
| **Fecha** | 18 de octubre de 2026 |
| **Herramienta** | Claude (claude.ai), con acceso de lectura al repositorio clonado |
| **Prompt utilizado (resumido)** | Se compartió el enunciado de la evidencia S11 (tabla de modos de fallo con mitigación, diseño de idempotencia o saga si aplica, ADR de extraer o no extraer con la opción "no extraer" evaluada, y actualización de arc42 §11) y se pidió construirla a partir del código real. |
| **Salida generada** | (1) `docs/s11-fallos-parciales.md`: integraciones I1–I4, tabla F1–F11, diseño de idempotencia de `POST /acceso`, política de reintentos, timeouts, outbox y circuit breaker para Notificaciones, y análisis de saga; (2) `docs/adr/0005-no-extraer-notificaciones.md`; (3) arc42 §9 (fila de ADR-0005) y §11 (nueva subsección 11.1 de modos de fallo); (4) enlaces en `README.md`; (5) esta entrada. |
| **Verificación** | Cada fila de "Qué pasa hoy" se contrastó con el código: `registrar-acceso.usecase.js` (sin idempotencia), `aforo-postgres.adapter.js` (`Pool` sin timeouts) y `server.js` (cierre ante `SIGTERM`). Se comprobó en `node_modules/pg-pool` y `pg/lib/defaults.js` que `connectionTimeoutMillis`, `statement_timeout`, `lock_timeout` y `query_timeout` no tienen límite por defecto. No se modificó código, por lo que las suites existentes no cambian. **Revisión por el equipo:** ☑ 18/10/2026 — Sebastián Caicedo. |
| **Aceptado** | La tabla de modos de fallo, el diseño de idempotencia con la clave en la misma transacción, el outbox para Notificaciones y la decisión de no extraer. |
| **Corregido** | La primera idea fue proponer un circuit breaker también entre la API y PostgreSQL. Se descartó y se dejó explicado en el documento: sin PostgreSQL no hay respuesta alternativa útil, y los timeouts ya hacen fallar rápido. |
| **Rechazado** | Implementar en esta semana la idempotencia y los timeouts: cambia el puerto, los dos adapters, el router y el contrato OpenAPI, y la evidencia S11 pide el diseño. Queda como trabajo siguiente, con la lista de archivos y pruebas en la sección 3.8 del documento. Tampoco se presentó una saga como necesaria: el sistema usa una sola base y una transacción local basta; la saga se describe solo como escenario hipotético. |
| **Motivo** | Documentar como IMPLEMENTADO solo lo que existe en el código y poder defender cada decisión en la sustentación. |


## Semana 12 — Arquitecturas de datos y eventos

| Campo | Detalle |
|---|---|
| **Fecha** | 25 de octubre de 2026 |
| **Herramienta** | Claude (claude.ai), con acceso de lectura al repositorio clonado |
| **Prompt utilizado (resumido)** | Se compartió el enunciado de la semana 12 (espectro de consistencia, caché e invalidación, eventos, búsqueda y pipelines) y la evidencia S12 (tabla operación → garantía, diseño de caché con política de invalidación, ADR de la decisión de datos más costosa de revertir, almacenes y brokers en C4 nivel 2, arc42 §8) y se pidió construirla a partir del código y la documentación existentes. |
| **Salida generada** | (1) `docs/s12-datos-eventos.md`: escenarios Q1–Q5, tabla O1–O12, diseño de caché, flujo por eventos con garantías de entrega y orden, búsqueda y pipeline de reportes; (2) `docs/adr/0006-log-de-eventos-de-acceso.md`; (3) arc42 §8.2 reescrita, §8.6 y §8.7 nuevas, fila en §9, escenario Q3 en §10.3, riesgos en §11.2 y §11.3, términos en §12; (4) diagrama de datos y eventos y tabla de almacenes en `docs/c4/c4_level2.md`; (5) enlaces en `README.md`; (6) esta entrada. |
| **Verificación** | Se contrastó con el código: `aforo-postgres.adapter.js` (lectura sin bloqueo en `obtenerAforoActual`, escritura con `FOR UPDATE`), `schema.sql` (solo `aforo_estado`, sin historial), `server.js` (`/ready` y los casos de uso comparten el mismo repositorio, por lo que la caché debe componerse aparte) y `deploy/compose.lab.yaml` (una sola instancia de `api`, `postgres:16-alpine`). La afirmación central del log (versiones sin huecos ni repetidas bajo concurrencia, incluso con transacciones revertidas) se comprobó con un script de laboratorio fuera del repositorio sobre PostgreSQL 16: 3 corridas de 70 operaciones concurrentes, todas con versiones 1..N y el contador reconstruible desde el log. No se modificó código, por lo que las suites existentes no cambian. **Revisión por el equipo:** ☐ fecha y responsable. |
| **Aceptado** | La tabla operación → garantía, la caché en proceso con write-through por versión y TTL de 2 s, y el log de eventos append-only (ADR-0006). |
| **Corregido** | (a) La primera política de caché fue "borrar la entrada al escribir". Se cambió a write-through con guarda de versión porque una lectura lenta que sale antes de una escritura podía volver después y dejar la caché atrasada hasta el TTL. (b) Se reemplazaron las tablas `solicitud_acceso` y `outbox_evento` de S11 por el log único, porque el outbox con `SKIP LOCKED` no garantizaba orden y el diseño de WebSocket lo necesita; se dejó explícito en ADR-0006. |
| **Rechazado** | Redis y caché HTTP (sección 4.3 del documento), un broker de mensajes y un motor de búsqueda (sin escenario que los justifique), event sourcing puro (ADR-0006, opción C) e implementar la caché y el log esta semana: la evidencia pide el diseño y el cambio toca puerto, adapters, `server.js` y pruebas (lista en la sección 7). |
| **Motivo** | Que cada garantía salga de un escenario de calidad y no de la tecnología, y documentar como IMPLEMENTADO solo lo que existe en el código. |


## Semana 13 — Seguridad y riesgos

| Campo | Detalle |
|---|---|
| **Fecha** | 1 de noviembre de 2026 |
| **Herramienta** | Claude (claude.ai), con acceso de lectura al repositorio clonado |
| **Prompt utilizado (resumido)** | Se compartió el enunciado de la semana 13 (modelado de amenazas STRIDE, mitigaciones verificables, cadena de suministro, privacidad y riesgos de IA generativa) y la evidencia S13 (tabla de amenazas priorizadas con mitigación, análisis de dependencias, sección de privacidad, arc42 §8 y §11, ADR para mitigaciones estructurales). Además se pidió conectar el frontend Flutter con el backend. |
| **Salida generada** | (1) `docs/s13-seguridad-amenazas.md`: activos, atacantes, diagrama de flujo con fronteras, tabla T1–T16, análisis de dependencias, privacidad, riesgos de IA y plan con responsables; (2) `docs/adr/0007-autenticacion-operador-y-cors.md`; (3) código: `src/shared/http/seguridad.js` (token de operador, CORS, cabeceras) y su composición en `src/server.js` con límite de cuerpo; (4) `tests/seguridad.test.js` y casos `401`, `413` y `503` en la prueba de contrato; (5) `docs/openapi.yaml` 2.0.0 con `securitySchemes`; (6) CI con `npm audit signatures` y permisos mínimos, `.github/dependabot.yml`, `qs` 6.16.2 en el lockfile; (7) Flutter: token de operador en `AforoApi` y en la pantalla de inicio, textos actualizados, pruebas del cliente y README de conexión; (8) arc42 §3.3, §8.8, §9, §10.2, §11.2, §11.4; C4 nivel 2; README; esta entrada. |
| **Verificación** | `npm run test:base` 19/19, `npm run test:contrato` 14/14, `npm run arch:check` sin violaciones (13 módulos), `npm audit` 0 vulnerabilidades. Se consultó el deployment (`GET /api/v1/aforo`) y respondió con la forma del contrato. `npm audit signatures` **no** se pudo ejecutar en el entorno de análisis (espejo del registro); se verifica en GitHub Actions. Las pruebas de Flutter **no** se ejecutaron (sin SDK en el entorno): deben correrse con `flutter test` antes de fusionar. **Revisión por el equipo:** ☐ fecha y responsable. |
| **Aceptado** | Token de operador compartido con falla cerrada, CORS con lista blanca, límite de 1 KB, cabeceras defensivas, Dependabot y el plan priorizado. |
| **Corregido** | (a) La primera actualización de `qs` con `npm audit fix` reescribió todo `package-lock.json` por diferencias de formato; se reemplazó por un cambio de 3 líneas. (b) El cliente Flutter usaba promoción de tipo sobre un campo privado nulable, que requiere Dart 3.2 mientras `pubspec.yaml` permite desde 3.0; se reescribió como `(_operatorToken ?? '').isNotEmpty`. (c) La primera tabla del README de Flutter decía que el backend local lee `.env`; el servidor no carga ese archivo, así que se cambió a `node --env-file=.env`. (d) SonarCloud señaló que la cabecera CORS se escribía con el origen recibido (aunque ya estaba validado) y una expresión regular con riesgo de backtracking; se cambió a escribir el valor de la configuración y a quitar las barras con un ciclo. También se corrigieron en el prototipo de mensajería la copia con `JSON.parse(JSON.stringify())` y el `await` dentro del ciclo de reintentos (reescrito con recursión).|
| **Rechazado** | Usuarios y roles con JWT (exige el contexto Identidad; ADR-0007, opción C), restringir por IP (opción D), publicar `/api/v2` y mantener `/api/v1` abierto (dejaría la vulnerabilidad viva; excepción documentada en ADR-0007), agregar `helmet` y `express-rate-limit` como dependencias (más superficie de cadena de suministro para cinco cabeceras; el límite de tasa se pide al proxy) y podar `pubspec.yaml` sin poder ejecutar `flutter pub get`. |
| **Motivo** | Cerrar primero la amenaza de mayor riesgo (T1) con un cambio pequeño, probado y reversible, y documentar como IMPLEMENTADO solo lo que tiene prueba. |

## Entrega final — Hallazgos de SonarCloud en la app Android

| Campo | Detalle |
|---|---|
| **Fecha** | 22 de noviembre de 2026 |
| **Herramienta** | Claude (claude.ai), con acceso de lectura al repositorio clonado |
| **Prompt utilizado (resumido)** | Se compartieron las capturas de los dos hallazgos de seguridad que SonarCloud abrió en `main`: ofuscación deshabilitada en el build de release (`build.gradle.kts`, L33) y respaldo de datos de la aplicación habilitado (`AndroidManifest.xml`, L4, regla `xml:S6358`). |
| **Salida generada** | (1) `isMinifyEnabled = true`, `isShrinkResources = true` y `proguardFiles(...)` en el tipo `release`; (2) `docs/Flutter/android/app/proguard-rules.pro` con reglas para Play Core y ML Kit; (3) `android:allowBackup="false"` en `<application>`; (4) esta entrada. |
| **Verificación** | SonarCloud debe cerrar ambos hallazgos tras el análisis de `main`. La APK de release debe compilarse con `flutter build apk --release` y el escáner QR probarse en un celular, porque R8 puede eliminar clases usadas por reflexión. No se compiló en el entorno de análisis (sin SDK de Flutter). **Revisión por el equipo:** ☐ fecha y responsable. |
| **Aceptado** | Ofuscación y reducción con R8 en release; respaldo deshabilitado, porque la app guarda la sesión del estudiante y el token del operador. |
| **Corregido** | Se propuso además `android:fullBackupContent="false"`; se retiró porque ese atributo espera un recurso XML y `allowBackup="false"` basta para la regla. |
| **Rechazado** | Marcar los hallazgos como "Safe" o "Won't fix" en SonarCloud sin cambiar el código. |
| **Motivo** | Corregir la causa en el código en lugar de ocultar los hallazgos. |

## Entrega final — Deuda técnica señalada por SonarCloud

| Campo | Detalle |
|---|---|
| **Fecha** | 22 de noviembre de 2026 |
| **Herramienta** | Claude (claude.ai), con acceso de lectura al repositorio clonado |
| **Prompt utilizado (resumido)** | Se compartieron capturas de los 26 hallazgos abiertos en `main`: complejidad cognitiva mayor a 15 en cinco scripts, `await` dentro de ciclos, ternarios anidados, una excepción capturada sin usar, un `AggregateError` sin mensaje y hallazgos de configuración Android (tráfico en texto plano, código comentado, tarea Gradle sin grupo y `rootProject.name`). |
| **Salida generada** | (1) División en funciones de `validarDestinoPostgres`, `provisionarEstudiante`, `vincularPerfilExistente`, `crearInformeReconciliacion` y `sanitizarMensajeAdministrativo`, conservando el orden de validación y los mensajes de error; (2) migraciones y paginación de Supabase Auth encadenadas por recursión (deben ser secuenciales) y cierre de pools en paralelo con `Promise.all`; (3) ternarios reemplazados por funciones (`obtenerCodigoError`, `calcularVencimientoMs`); (4) tipo de error registrado en `identidad.router.js` y mensaje en el `AggregateError`; (5) Android: `usesCleartextTraffic="false"`, permiso `CAMERA`, plantillas sin código comentado, `group`/`description` en la tarea `clean` y `rootProject.name`; (6) esta entrada. |
| **Verificación** | `npm run test:base` 79/79, `npm run test:contrato` 29/29, `npm run test:mensajeria` 9/9, `npm run arch:check` sin violaciones. ESLint con `sonarjs/cognitive-complexity` (máximo 15), `no-await-in-loop` y `no-nested-ternary` sin errores en `scripts/` y `src/` (antes reportaba, por ejemplo, 35 y 32 en `postgres-destination.js` y `seed-demo-student.js`). `aplicarMigraciones` se ejecutó dos veces contra PostgreSQL 16 local: aplicó la migración y la segunda vez la reconoció como aplicada. `test:postgres` no se ejecutó. La APK debe recompilarse con `flutter build apk --release`. **Revisión por el equipo:** ☐ fecha y responsable. |
| **Aceptado** | Refactorizaciones sin cambio de comportamiento, recursión para operaciones que deben ser secuenciales y `usesCleartextTraffic="false"` (la app usa HTTPS y el cliente HTTP de Dart no depende de esa política, por lo que el backend local por `http://10.0.2.2` sigue funcionando en desarrollo). |
| **Corregido** | (a) La primera versión del orden de migraciones usaba `localeCompare`; se cambió a comparación por código de carácter para conservar el orden exacto de `sort()`. (b) Al quitar el código comentado de `launch_background.xml` se escribió un comentario con `<item>`, que Sonar podía volver a marcar; se eliminó. |
| **Rechazado** | Ejecutar las migraciones con `Promise.all` (rompería el orden y compartiría una conexión transaccional), marcar los hallazgos como "Won't fix" sin cambiar el código y desactivar reglas en SonarCloud. |
| **Motivo** | Bajar la complejidad para que cada función se pueda explicar y probar por separado, sin debilitar los controles de seguridad de los scripts administrativos. |

## Entrega final — Cierre del deployment con Supabase, documentación y APK

| Campo | Detalle |
|---|---|
| **Fecha** | 22 de noviembre de 2026 |
| **Herramienta** | Claude (claude.ai), con acceso de lectura al repositorio clonado |
| **Prompt utilizado (resumido)** | Se pidió identificar y generar lo que faltaba para la entrega final sobre el `main` actual (que ya incluía el Compose adaptado a Supabase del commit `3e8d1c3` y las correcciones de SonarCloud), una guía para aplicarlo y desplegar, una guía para entender y exponer el proyecto, y los pasos para instalar la APK. Se mantuvo el flujo QR existente. |
| **Salida generada** | (1) `docs/adr/0010-postgresql-gestionado-en-supabase.md`, que formaliza el paso a Supabase; (2) soporte de `DATABASE_SSL_CA_CERT_BASE64` en `src/shared/postgres-pool.js` y en `deploy/compose.lab.yaml` (obligatoria para `api`), con pruebas; (3) `scripts/grant-runtime-db.js`, `scripts/sql/runtime-grants.sql` y `npm run db:grant-runtime`, con `tests/grant-runtime-db.test.js`; (4) `GET /` informativo, contrato 3.1.0 y pruebas; (5) README, arc42 (§1.2, §2.1, §2.3, §7.2, §7.3, §9, §11.2), C4 nivel 2 (Supabase Auth), `docs/supabase.md`, nota en `docs/taller.md`; (6) eliminación de `h -h github.com -s workflow` (salida de `less` guardada por error) y `s13-correcciones-sonar.patch` (ya aplicado); (7) esta entrada. |
| **Verificación** | `npm run test:base` 88/88, `npm run test:contrato` 30/30, `npm run test:mensajeria` 9/9, `npm run arch:check` sin violaciones, ESLint con `sonarjs/cognitive-complexity` (máx. 15) sin errores y `npm audit` sin vulnerabilidades. Contra PostgreSQL 16 local con los roles `gimnasio_migrator`, `gimnasio_runtime` y `gimnasio_provisioner`: `db:init`, `db:grant-runtime` dos veces (idempotente), `db:check-security` con todos los checks en `true` salvo TLS (base local sin TLS), flujo QR con el rol runtime (ENTRADA → aforo 1, QR reutilizado rechazado, SALIDA → aforo 0), `UPDATE` de perfil rechazado por RLS y seed con el rol provisioner (crea y luego reconoce el perfil; `DELETE` denegado). No se ejecutó contra Supabase (sin credenciales en el entorno de análisis): se verifica al desplegar. **Revisión por el equipo:** ☐ fecha y responsable. |
| **Aceptado** | PostgreSQL de Supabase con TLS verificado y CA en base64, script idempotente de permisos y políticas ejecutado con el rol dueño de las tablas, y raíz informativa. |
| **Corregido** | (a) El primer parche creaba un `deploy/compose.supabase.yaml` nuevo; al llegar el commit `3e8d1c3` con el Compose ya adaptado, se descartó y se modificó `compose.lab.yaml` para no tener dos configuraciones. (b) El Compose de `3e8d1c3` instalaba `ca-certificates` en la imagen para validar TLS; se documentó que Node no usa ese almacén y que la CA de Supabase no es pública, por lo que sin `DATABASE_SSL_CA_CERT_BASE64` la conexión falla con `SELF_SIGNED_CERT_IN_CHAIN`. (c) La prueba de contrato fijaba la versión `3.0.0`; se cambió a validar el MAJOR 3. (d) La matriz runtime de `docs/supabase.md` no tenía política `UPDATE` en `estudiantes` y afirmaba que el permiso de columna bastaba para el bloqueo; la prueba local mostró que `SELECT ... FOR UPDATE` devolvía cero filas y la emisión del QR fallaba como "sesión no válida". Se agregó `gimnasio_runtime_estudiantes_lock` con `USING (true) WITH CHECK (false)`. |
| **Rechazado** | Desactivar la verificación del certificado (`rejectUnauthorized: false`), relajar la validación de proyecto del seed, crear perfiles con SQL manual y cambiar el flujo QR a un QR fijo del encargado. |
| **Motivo** | Dejar un deployment reproducible sin debilitar los controles de seguridad y que la documentación describa el sistema que realmente se despliega. |

## Entrega final — Regreso a PostgreSQL en el Compose y login propio (ADR-0011)

| Campo | Detalle |
|---|---|
| **Fecha** | 22 de noviembre de 2026 |
| **Herramienta** | Claude (claude.ai), con acceso de lectura al repositorio clonado |
| **Prompt utilizado (resumido)** | El deployment con Supabase no funcionó en Dokploy (faltaban la CA y las credenciales del proyecto externo). Se pidió volver al esquema anterior, con PostgreSQL en el Compose de Dokploy, conservando las mejoras de la API y de Flutter. El equipo eligió login propio en la base, roles separados creados automáticamente, estudiantes de prueba creados al desplegar desde una variable y eliminar el código de Supabase. |
| **Salida generada** | (1) `AutenticacionEstudiantePort` y `AutenticacionLocalAdapter` (scrypt, sesiones de 8 horas guardadas como hash), con `contrasena.js`; (2) `deploy/compose.lab.yaml` con `postgres`, `db-bootstrap`, `db-init` y `api`; (3) `scripts/bootstrap-local-db.js`, `prepare-db.js`, `seed-demo-students.js` y `admin-messages.js`; (4) migración `20261122_001_autenticacion_local.sql` y permisos/políticas del runtime para `password_hash` y `sesiones_estudiantes`; (5) eliminación de los adaptadores y scripts de Supabase y de `docs/supabase.md`; (6) ADR-0011, `docs/base-de-datos.md`, ADR-0008/0009/0010 actualizados, README, arc42 (§1.2, §7.2, §7.3, §9, §11.2), C4 nivel 2, guía Flutter, contrato 3.1.1 (solo documentación) y nota de `docs/taller.md`; (7) esta entrada. |
| **Verificación** | `npm run test:base` 76/76, `npm run test:contrato` 30/30, `npm run test:mensajeria` 9/9, `npm run arch:check` sin violaciones, ESLint con `sonarjs/cognitive-complexity` (máx. 15), `no-await-in-loop` y `no-nested-ternary` sin errores. Contra PostgreSQL 16 local con la misma cadena del Compose: base nueva, segunda ejecución (idempotente), volumen con el esquema de S8 (aforo conservado) y volumen con la versión anterior del QR (`password_hash NOT NULL`); en todos `db:check-security` con todos los checks en `true`. Flujo HTTP con el rol runtime: login incorrecto 401, login correcto, QR ENTRADA y luego SALIDA, QR reutilizado rechazado y token de operador incorrecto 401. `test:postgres` 9/9. No se ejecutó contra el servidor de Dokploy: se verifica al desplegar. **Revisión por el equipo:** ☐ fecha y responsable. |
| **Aceptado** | PostgreSQL en el Compose con el mismo volumen de S8, tres niveles de privilegio (superusuario solo para crear roles, migrador dueño de las tablas, runtime mínimo), verificación de seguridad antes de arrancar la API y contrato HTTP sin cambios para no recompilar Flutter. |
| **Corregido** | (a) El orden fijo "esquema y luego migraciones" fallaba con el volumen de la versión anterior (`password_hash NOT NULL` y sin columnas nuevas); se agregó `db:prepare`, que aplica primero las migraciones cuando la tabla `estudiantes` ya existe. (b) Las tablas creadas en S8 por el superusuario impedían que el migrador las modificara; `db-bootstrap` ahora las transfiere. (c) En las pruebas locales un código estudiantil de dos caracteres no pasaba la validación de `DEMO_STUDENTS`; se usó un código válido. |
| **Rechazado** | Un solo usuario de base de datos con permisos de dueño para la API, guardar contraseñas de `DEMO_STUDENTS` en el repositorio, desactivar `db:check-security` para acelerar el deploy y conservar el código de Supabase desconectado. |
| **Motivo** | Tener un deployment que dependa solo de Dokploy y del repositorio, sin perder el mínimo privilegio de S13 ni las funciones de QR y login que usa la app. |

## Entrega final — Estado del gimnasio, capacidad y registro por cédula (ADR-0012)

| Campo | Detalle |
|---|---|
| **Fecha** | 22 de noviembre de 2026 |
| **Herramienta** | Claude (claude.ai), con acceso de lectura al repositorio clonado |
| **Prompt utilizado (resumido)** | Se pidió completar la app sin reconstruir Flutter: el encargado abre y cierra el gimnasio con motivo, cambia la capacidad máxima y registra por QR o por cédula; con el gimnasio cerrado se bloquean los ingresos y quienes están dentro siguen registrados; la app muestra aforo, porcentaje y estado y se actualiza sola; quitar de la app las menciones a la API, a cuentas sintéticas y a pruebas; renombrar "Token de operador" a "Contraseña de encargado" y "Operación de aforo" a "Ingresar como encargado"; teclados acordes a cada campo. El equipo decidió conservar los botones sin identificación, pedir confirmación **antes** de registrar un ingreso que supera la capacidad, capacidad inicial de 30 y no tocar la pestaña de alertas. |
| **Salida generada** | (1) Dominio: `aplicarAccesoConEstado`, `cambiarApertura`, `cambiarCapacidad`, `calcularPorcentajeOcupacion`, `GimnasioCerradoError` y `CapacidadSuperadaError`; (2) puerto con `obtenerEstado` y `modificarEstado`, adaptadores PostgreSQL y memoria; (3) casos de uso `registrar-acceso-estudiante` (QR y cédula) y `configurar-gimnasio`; (4) rutas `PUT /estado`, `PUT /capacidad`, `POST /acceso-cedula`, `POST /estudiantes/busqueda` y `POST /operador/verificacion`, y `409` con `code`; (5) migración `20261122_002`, permisos del runtime y `db:check-security`; (6) `DEMO_STUDENTS` con cédula opcional; (7) Flutter: `EstadoGimnasioController`, panel con estado, ocupación y gestión del encargado, accesos por QR, cédula y sin identificación con diálogo de confirmación, pantalla de ingreso renombrada y con teclados por campo; (8) pruebas; (9) contrato 4.0.0, ADR-0012, README, arc42, guía de base de datos y README de Flutter; (10) esta entrada. |
| **Verificación** | `npm run test:base` 86/86, `npm run test:contrato` 56/56 (cada respuesta documentada tiene prueba), `npm run test:mensajeria` 9/9, `npm run arch:check` sin violaciones, ESLint (`sonarjs/cognitive-complexity` máx. 15) sin errores, `test:postgres` 9/9 contra PostgreSQL 16 (cédula, QR rechazado con el gimnasio cerrado sin gastarse, salida permitida cerrado, capacidad superada con y sin confirmación, `CHECK` del motivo). Cadena completa del Compose sobre una base existente (aforo conservado, capacidad 30) y una nueva, con `db:check-security` en `true`. **No se pudo compilar Flutter en el entorno de análisis** (sin acceso al SDK): las pruebas `flutter test` y `flutter analyze` las corre el equipo antes de fusionar. **Revisión por el equipo:** ☐ fecha y responsable. |
| **Aceptado** | Reglas en el dominio y evaluadas dentro de la transacción que bloquea `aforo_estado`, confirmación como segundo intento decidido por el servidor, búsqueda por cédula con `POST` y contrato MAJOR documentado. |
| **Corregido** | (a) La primera versión de `alternarAcceso` armaba el `WHERE` con una plantilla de texto; aunque el valor era interno, SonarCloud lo marcaría como posible inyección SQL. Se cambió a dos consultas constantes. (b) La consulta de `/api/v1/aforo` en las pruebas antiguas usaba un repositorio sin `obtenerEstado`; se actualizaron los dobles de prueba en lugar de agregar una rama de compatibilidad al caso de uso. |
| **Rechazado** | Comparar aforo y capacidad en la app antes de enviar (con el QR la app no sabe si es entrada o salida), una tabla aparte de configuración y `GET ?cedula=` (la cédula quedaría en los registros). |
| **Motivo** | Completar el MVP con reglas verificables en el servidor y una app que no muestre funciones a medias. |

*Este registro se actualiza en cada corte con los usos de IA generativa relevantes al entregable correspondiente.*
