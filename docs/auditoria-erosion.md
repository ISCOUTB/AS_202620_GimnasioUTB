# Auditoría de erosión arquitectónica (S9)

**Fecha:** 3 de octubre de 2026. **Alcance:** `src/` en la rama `main` (commit `e6a7f58`) más las correcciones de esta semana.

**Objetivo:** comprobar que el código sigue respetando lo decidido en ADR-0001 y `docs/contextos-delimitados.md`, ahora que escribir código con IA es barato y la revisión humana no crece al mismo ritmo. La erosión se vigila con reglas ejecutables (fitness functions [1]) y con una revisión manual de lo que un análisis de imports no ve.

## 1. Reglas automatizadas

Configuradas en `.dependency-cruiser.cjs`, se ejecutan con `npm run arch:check` y en el CI (`.github/workflows/ci.yml`). Toda violación `error` rompe el build.

| Regla | Qué prohíbe | Origen |
|---|---|---|
| H1 | El dominio importa `application`, `infrastructure`, `shared` o `server.js` | ADR-0001 |
| H1b | El dominio importa paquetes npm o módulos core de Node (Express, pg, fs...) | ADR-0001 |
| H2 | La capa de aplicación importa infraestructura o `server.js` | ADR-0001 |
| H2b | La capa de aplicación importa paquetes npm | ADR-0001 |
| H3 | El adaptador HTTP y el de persistencia se importan entre sí | ADR-0001 |
| H4 | Cualquier archivo distinto de `server.js` importa un adaptador concreto de persistencia | ADR-0001 (composition root) |
| M1 | Un módulo importa archivos internos de otro módulo | `contextos-delimitados.md` (dueño único) |
| M2 | `src/shared` importa módulos de dominio | `contextos-delimitados.md` |
| G1 | Dependencias circulares | General |
| G2 | Módulos huérfanos (advertencia) | Código abandonado |
| G3 | Paquetes importados sin declarar en `package.json` | General |

## 2. Resultado de la ejecución

```text
$ npm run arch:check
✔ no dependency violations found (11 modules, 16 dependencies cruised)
```

**El repositorio actual no tiene violaciones de dependencias.** Eso se verificó, no se asumió.

### Prueba de sensibilidad

Una regla que nunca falla no demuestra nada. En una copia temporal del repo se inyectaron violaciones en 5 archivos: el dominio importando Express y el adapter de PostgreSQL, el caso de uso importando el adapter en memoria, el router HTTP importando el adapter de PostgreSQL, un módulo `notificaciones` importando internos de `aforo`, y `shared/logger.js` importando el dominio. Resultado: **12 errores** detectados, con las reglas H1, H1b, H2, H3, H4, M1, M2 y G1 disparadas.

**Corrección durante la construcción (registrada en `docs/ia.md`):** la primera versión de la configuración incluía `includeOnly: '^src'`. Eso ocultaba los paquetes npm del grafo, de modo que H1b y H2b no podían dispararse. Se detectó al preparar la prueba de sensibilidad y se eliminó la opción.

## 3. Estado de las violaciones de la semana 6

| # | Violación (S6) | Estado hoy | Evidencia |
|---|---|---|---|
| V1 | `this.aforoActual` público y mutable en `aforo-memoria.adapter.js` | **Corregida:** campo privado `#aforoActual`, solo modificable vía `actualizarAforo` | `git diff` de esta semana |
| V2 | `server.js` leía el repositorio saltándose el caso de uso | **Corregida:** nuevo `consultar-aforo.usecase.js`, el router recibe el caso de uso | `git diff` de esta semana |
| V3 | No existe puerto de lectura (`AforoQueryPort`) para futuros módulos | **Abierta, aceptada:** solo es necesario cuando exista el módulo Notificaciones. La regla M1 ya impide el atajo de importar el adapter | Regla M1 |

Tras las correcciones: base 12/12, contrato 11/11 y PostgreSQL 8/8 en verde, y `arch:check` sin violaciones.

## 4. Hallazgos de la revisión manual

Lo que el análisis de imports no ve:

| # | Hallazgo | Dónde | Severidad | Plan |
|---|---|---|---|---|
| E1 | El composition root acumula lógica: contadores de métricas, envoltorio `registrarAcceso` con logging y los endpoints `/health`, `/ready`, `/metrics`. Pasó de ser ensamblaje a contener comportamiento | `src/server.js` (91 líneas) | Media | Extraer métricas a `src/shared/` y dejar `server.js` solo con ensamblaje |
| E2 | `/ready` sigue consultando `repository.obtenerAforoActual()` directo, sin pasar por un caso de uso | `src/server.js` | Baja | Aceptado: es una sonda de infraestructura, no una lectura de negocio. Documentado para que no se copie ese patrón en lecturas de negocio |
| E3 | Seis bloques `catch {}` vacíos alrededor del logger en `server.js` y `aforo.router.js`. Tragan errores en silencio | `src/server.js`, `aforo.router.js` | Media | Hacer que el logger nunca lance y quitar los `try/catch`. Es un patrón típico de código generado "a la defensiva" |
| E4 | El CI no ejecuta `test:postgres`: la evidencia de S1 no se reverifica en cada push | `.github/workflows/ci.yml` | Alta | Añadir un servicio PostgreSQL al job y `DATABASE_URL` de una base de prueba |
| E5 | El mapa de contextos muestra "Reglas de Cupo" y `NotificationPort` dentro del dominio, y no existen en el código | `docs/contextos-delimitados.md` | Baja | Ya está rotulado como mapa conceptual; mantener el rótulo visible |
| E6 | `AforoPostgresAdapter` conoce `AforoDomainError`. La dirección es válida, pero acopla el manejo de errores del adapter al dominio | `aforo-postgres.adapter.js` | Baja | Mantener y registrar |

**Origen (IA o humano):** `docs/ia.md` solo registra el uso de IA hasta la semana 6. Los commits del 27 y 28 de septiembre (adapter PostgreSQL, manejo de errores, observabilidad, `taller.md`) no tienen entrada, por lo que no se puede afirmar quién los generó. Ver el apartado de registro pendiente en `docs/ia.md`.

## 5. Conclusión

La estructura hexagonal se mantiene: no hay dependencias prohibidas y ahora el CI las vigila. La erosión que sí aparece es de otro tipo: lógica que se acumula en el composition root (E1), errores silenciados (E3) y evidencia que ya no se reverifica automáticamente (E4). Esas tres son las que conviene atacar antes del siguiente corte.

## Referencias

[1] N. Ford, R. Parsons y P. Kua, *Building Evolutionary Architectures*. O'Reilly Media, 2017.
[2] "dependency-cruiser," GitHub. [En línea]. Disponible: https://github.com/sverweij/dependency-cruiser
