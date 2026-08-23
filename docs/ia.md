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

## Registro de futuras interacciones

Este documento se actualizará durante el desarrollo del proyecto para registrar nuevos usos relevantes de herramientas de inteligencia artificial.

Este documento registra, de forma trazable, el uso de IA generativa (Claude, Anthropic, vía claude.ai) durante el desarrollo del proyecto, conforme a lo exigido por el curso. Por cada entrega se documenta: el prompt utilizado, la herramienta, un resumen de lo generado, y la verificación/edición realizada por el equipo antes de incorporarlo.

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


## Semana 3 — arc42 sección 4, matriz comparativa, ADR 0001, esqueleto del repositorio

| Campo | Detalle |
|---|---|
| **Fecha** | 23 de agosto |
| **Herramienta** | Claude  |
| **Prompt utilizado** | *"La entrega de esta semana es: arc42 sección 4, matriz comparativa de capas / hexagonal / monolito modular y docs/adr/0001-*.md con alternativas y consecuencias. [...] ayudame con la creacion del esqueleto y archivos teniendo en cuenta las correciones realizadas de la anterior entrega* |
| **Salida generada** | (1) Sección 4 del arc42 con matriz comparativa (Capas / Hexagonal / Monolito Modular) evaluada contra los escenarios de calidad y restricciones ya definidos por el equipo; (2) ADR 0001 con las tres alternativas, decisión (Arquitectura Hexagonal) y consecuencias positivas/negativas; (3) esqueleto de repositorio Node.js/Express con estructura `domain/`, `application/`, `infrastructure/` por módulo, prueba automatizada (`node:test`) y workflow de CI. |
| **Verificación del equipo** | Se ejecutó `npm install && npm start` y `npm test` de forma local antes de integrar el esqueleto al repositorio, confirmando que la prueba pasaba en verde sin necesidad de base de datos. La decisión de arquitectura (Hexagonal) fue evaluada por el equipo contra las alternativas antes de aceptarla — no se tomó por default. |

---

*Este registro se actualiza en cada corte con los usos de IA generativa relevantes al entregable correspondiente.*
