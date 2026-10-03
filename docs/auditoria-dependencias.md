# Auditoría de dependencias propuestas por el modelo (S9)

**Fecha:** 3 de octubre de 2026. **Fuente:** `package.json`, `package-lock.json`, `npm audit` y el registro de npm consultados ese día.

**Objetivo:** un modelo generativo puede proponer paquetes que no existen, que están abandonados, que tienen vulnerabilidades o que no hacen falta. Cada dependencia debe poder justificarse con evidencia, no con "así venía en el código generado".

## 1. Criterios aplicados a cada dependencia

1. **Existe y es la correcta:** el nombre exacto está publicado en npm, con repositorio oficial (descarta paquetes alucinados y typosquatting).
2. **Mantenimiento:** fecha de la última publicación frente a la versión `latest`.
3. **Licencia compatible.**
4. **Vulnerabilidades:** `npm audit`.
5. **Necesidad:** ¿la reemplaza algo de la biblioteca estándar de Node?
6. **Trazabilidad:** quién la introdujo, cuándo y si `docs/ia.md` lo registra.

## 2. Resultado por dependencia directa

| Paquete | Tipo | Declarado | Instalado (lock, tras la auditoría) | `latest` en npm | Licencia | Existe desde / repo oficial | Introducida por | Decisión |
|---|---|---|---|---|---|---|---|---|
| `express` | prod | `^4.19.2` | 4.22.3 | 5.2.1 | MIT | 2010 / `expressjs/express` | Commit `92f4a53` (23-ago, semana 3) | **Conservar** en 4.x. Migrar a 5 es un cambio mayor: si se hace, va con ADR y pruebas |
| `pg` | prod | `^8.16.3` | 8.23.0 | 8.23.1 | MIT | 2010 / `brianc/node-postgres` | Commit `201a8cf` (28-sep) | **Conservar.** No hay alternativa en la biblioteca estándar de Node para hablar con PostgreSQL |
| `ajv` | dev | `^8.20.0` | 8.20.0 | 8.20.0 | MIT | 2015 / `ajv-validator/ajv` | Commit `032e501` (20-sep, semana 7) | **Conservar.** Valida las respuestas contra el esquema del contrato |
| `js-yaml` | dev | `^4.3.2` | 4.3.2 | 5.4.2 | MIT | 2011 / `nodeca/js-yaml` | Commit `032e501` (20-sep, semana 7) | **Conservar.** Solo lee `openapi.yaml` en las pruebas. Va una versión mayor atrás: actualizar es opcional y no afecta producción |
| `dependency-cruiser` | dev | `^18.5.0` | 18.5.0 | 18.5.0 | MIT | Repo `sverweij/dependency-cruiser` | Esta auditoría | **Añadida** para las fitness functions de arquitectura |

**Existencia y typosquatting:** los cuatro paquetes originales existen desde 2010 a 2015, con el nombre exacto y el repositorio oficial del proyecto. No se encontró ningún paquete inexistente ni de nombre sospechoso.

**Tamaño del árbol:** 89 paquetes antes de añadir `dependency-cruiser` (82 de producción) y 129 después. Los 40 adicionales son de desarrollo y no llegan a producción. Licencias del árbol final: MIT (119), ISC (7), BSD-3-Clause (2) y Python-2.0 (1, `argparse`, transitiva de `js-yaml`, solo desarrollo); el paquete raíz es privado.

## 3. Vulnerabilidades

| Momento | Resultado de `npm audit` |
|---|---|
| Antes | **3 moderadas:** `qs` (rangos 2.2.5 a 6.15.3; avisos GHSA-x5fp-wj9c-mxmx y GHSA-4mjr-xmp4-gh2g), `body-parser` 1.20.5 a 1.20.6 y `express` 4.22.2, estas dos por depender de `qs` |
| Acción | `npm audit fix`: `express` 4.22.2 → 4.22.3, `body-parser` 1.20.6 → 1.20.8, `qs` 6.15.3 → 6.16.0. Los tres dentro del rango declarado, sin cambios mayores |
| Después | **0 vulnerabilidades.** Con la actualización, base 12/12, contrato 11/11 y PostgreSQL 8/8 siguen en verde |

El CI ahora corre `npm audit --audit-level=high`, de modo que una vulnerabilidad alta o crítica nueva rompe el build. Las moderadas no lo rompen: se revisan en cada corte.

## 4. ¿Cuáles propuso el modelo?

- `express` y `pg`: `docs/ia.md` registra que en las semanas 3 y 4 Claude generó el esqueleto Node.js/Express y el código base con PostgreSQL. Ambas pasaron la verificación anterior.
- `ajv` y `js-yaml`: llegaron con la prueba de contrato de la semana 7, **que no tiene entrada en `docs/ia.md`**. Si se usó IA para elegirlas, hay que registrarlo; si no, basta con dejar constancia de que fueron decisión del equipo.
- **Dependencias propuestas y rechazadas:** `docs/ia.md` no registra ninguna. Es normal que el modelo sugiera paquetes de más; cuando ocurra, se anota en la tabla de la semana correspondiente con el motivo.
- **Durante esta auditoría** se descartó proponer la migración a Express 5 y a js-yaml 5: son cambios mayores sin un defecto que los justifique hoy.

## 5. Regla para próximas dependencias

Antes de aceptar un paquete sugerido por un modelo: `npm view <paquete>` (existe, repositorio, fecha), `npm audit` después de instalarlo, revisar su licencia, buscar si la biblioteca estándar lo cubre, y anotarlo en `docs/ia.md`. La regla G3 de `arch:check` además falla si el código importa un paquete que no está declarado en `package.json`.

## Referencias

[1] "npm-audit," *npm Docs*. [En línea]. Disponible: https://docs.npmjs.com/cli/commands/npm-audit
[2] GitHub Advisory Database, GHSA-x5fp-wj9c-mxmx y GHSA-4mjr-xmp4-gh2g. [En línea]. Disponible: https://github.com/advisories
