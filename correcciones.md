# Registro de Correcciones por Entrega

Este documento consolida los ajustes, refinamientos y correcciones aplicadas a los artefactos del proyecto en cada una de las entregas semanales.

## Semana 2 — Definición del Problema, Contexto y Atributos de Calidad

| Archivo / Documento | Corrección Realizada |
| :--- | :--- |
| `docs/arc42_gimnasio_utb.md` (Sección 3) | Se descartó y reemplazó el diagrama C4 de contexto inicial por uno elaborado manualmente por el equipo, para reflejar con mayor precisión los actores reales (estudiantes, encargado) y el entorno del Gimnasio UTB. |
| `docs/arc42_gimnasio_utb.md` (Sección 10) | Se ajustaron las medidas de los escenarios de calidad (árbol de utilidad) para que fueran realistas y acordes al alcance de un Producto Mínimo Viable (MVP). |

## Semana 3 — Estilo Arquitectónico y Esqueleto del Proyecto

| Archivo / Documento | Corrección Realizada |
| :--- | :--- |
| `src/` (Estructura de carpetas) | Se depuró el esqueleto inicial del backend para asegurar que la separación de carpetas (`domain/`, `application/`, `infrastructure/`) cumpliera estrictamente con la Arquitectura Hexagonal decidida por el equipo. |
| `package.json` y `.github/workflows/ci.yml` | Se ajustaron los scripts de ejecución y la configuración de GitHub Actions para garantizar que las pruebas automatizadas pasaran en verde de forma local y en la nube sin requerir conexión a base de datos. |
| `docs/adr/0001-arquitectura-hexagonal.md` | Se documentó formalmente la decisión arquitectónica tras depurar la matriz comparativa (Capas vs Hexagonal vs Monolito Modular) y adaptarla a las restricciones del proyecto. |

## Semana 4 — Corte Vertical, Trazabilidad y Limpieza Final (Corte 1)

| Archivo / Documento | Corrección Realizada |
| :--- | :--- |
| `docs/arc42_gimnasio_utb.md` | Se reubicó el diagrama C4 de contexto a la sección 3.1. Se eliminaron fragmentos de código Mermaid sueltos y se eliminó la duplicidad de texto en la Sección 10 (Requerimientos de Calidad), unificando el Árbol de Utilidad y los Escenarios. |
| `README.md` | Se eliminaron secciones completamente duplicadas (instrucciones de ejecución, estructura del proyecto e integración continua). Se integró la sección del "Corte Vertical Ejecutable (MVP)" con los pasos definitivos de conexión a PostgreSQL. |
| `docs/aspectos.md` | Se borró la primera mitad del documento que contenía el título y la descripción de contexto duplicados. Se añadió al final una nueva tabla de trazabilidad para incluir las columnas de "Implementación" y "Pruebas" del escenario de consistencia (S1). |
| `docs/ia.md` | Se actualizó el registro de uso de IA correspondiente a la entrega, documentando la generación del glosario (Sección 12) y la estructuración del corte vertical, dejando constancia de la validación del equipo. |
