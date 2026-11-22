# Registro de Correcciones por Entrega

Este documento consolida los ajustes, refinamientos y correcciones aplicadas a los artefactos del proyecto en cada una de las entregas semanales.

## Semana 2 — Definición del Problema, Contexto y Atributos de Calidad

| Archivo / Documento | Corrección Realizada |
| :--- | :--- |
| `docs/arc42/arc42_gimnasio_utb.md` (Sección 3) | Se descartó y reemplazó el diagrama C4 de contexto inicial por uno elaborado manualmente por el equipo, para reflejar con mayor precisión los actores reales (estudiantes, encargado) y el entorno del Gimnasio UTB. |
| `docs/arc42/arc42_gimnasio_utb.md` (Sección 10) | Se ajustaron las medidas de los escenarios de calidad (árbol de utilidad) para que fueran realistas y acordes al alcance de un Producto Mínimo Viable (MVP). |

## Semana 3 — Estilo Arquitectónico y Esqueleto del Proyecto

| Archivo / Documento | Corrección Realizada |
| :--- | :--- |
| `src/` (Estructura de carpetas) | Se depuró el esqueleto inicial del backend para asegurar que la separación de carpetas (`domain/`, `application/`, `infrastructure/`) cumpliera estrictamente con la Arquitectura Hexagonal decidida por el equipo. |
| `package.json` y `.github/workflows/ci.yml` | Se ajustaron los scripts de ejecución y la configuración de GitHub Actions para garantizar que las pruebas automatizadas pasaran en verde de forma local y en la nube sin requerir conexión a base de datos. |
| `docs/adr/0001-arquitectura-hexagonal.md` | Se documentó formalmente la decisión arquitectónica tras depurar la matriz comparativa (Capas vs Hexagonal vs Monolito Modular) y adaptarla a las restricciones del proyecto. |

## Semana 4 — Corte Vertical, Trazabilidad y Limpieza Final (Corte 1)

| Archivo / Documento | Corrección Realizada |
| :--- | :--- |
| `docs/arc42/arc42_gimnasio_utb.md` | Se reubicó el diagrama C4 de contexto a la sección 3.1. Se eliminaron fragmentos de código Mermaid sueltos y se eliminó la duplicidad de texto en la Sección 10 (Requerimientos de Calidad), unificando el Árbol de Utilidad y los Escenarios. |
| `README.md` | Se eliminaron secciones completamente duplicadas (instrucciones de ejecución, estructura del proyecto e integración continua). Se integró la sección del "Corte Vertical Ejecutable (MVP)" con los pasos definitivos de conexión a PostgreSQL. |
| `docs/aspectos.md` | Se borró la primera mitad del documento que contenía el título y la descripción de contexto duplicados. Se añadió al final una nueva tabla de trazabilidad para incluir las columnas de "Implementación" y "Pruebas" del escenario de consistencia (S1). |
| `docs/ia.md` | Se actualizó el registro de uso de IA correspondiente a la entrega, documentando la generación del glosario (Sección 12) y la estructuración del corte vertical, dejando constancia de la validación del equipo. |

## Semana 7 — Vistas de ejecución, contratos de comunicación y conceptos transversales

| Archivo / Documento | Corrección Realizada |
| :--- | :--- |
| `docs/arc42/arc42_gimnasio_utb.md` (Secciones 6 y 8) | Se ampliaron los flujos de interacción de la Vista de Ejecución mediante diagramas de secuencia para el registro de acceso y el cambio de estado del gimnasio. Se documentó la clasificación síncrona de comandos y persistencia, y asíncrona de notificaciones push. Se incorporó la sección 8 con lenguaje ubicuo, mapa resumido de contextos delimitados, límites y propiedad de datos. |
| `docs/c4/c4_level2.md` | Se etiquetaron todas las relaciones del C4 nivel 2 con el protocolo y formato de comunicación correspondiente: interacción de usuario, HTTPS REST/JSON, SQL sobre TCP 5432 y FCM Push/JSON. |
| `docs/adr/0003-comunicacion-sincrona-asincrona.md` | Se registró la decisión arquitectónica de usar comunicación síncrona para comandos, consultas y persistencia, y comunicación asíncrona para notificaciones mediante FCM, incluyendo consecuencias y alcance. |
| `README.md` | Se añadió el enlace al ADR-0003 en la sección de documentación del proyecto. |

## Entrega final — Deployment, documentación y APK

| Archivo / Documento | Corrección Realizada |
| :--- | :--- |
| `docs/taller.md` | Se añadió una nota inicial: el análisis de Vercel/Render fue la evaluación de S8; el deployment real es Dokploy con Supabase (ADR-0010). |
| `README.md` | Se documentó el deployment final, las variables nuevas, `GET /` y los endpoints de QR; se actualizó la estructura del proyecto, el estado de SonarCloud y los enlaces a ADR-0008 y ADR-0010. |
| `docs/arc42/arc42_gimnasio_utb.md` | Se actualizaron §1.2, §2.1, §2.3, §7.2 (nuevo diagrama de deployment), §9 y §11.2 para que coincidan con el código y el deployment. |
| `docs/supabase.md` | Se añadió el procedimiento del deployment final: rol de provisionamiento, `db:grant-runtime` y CA en base64. |
| `deploy/compose.lab.yaml`, `deploy/.env.example` | Se agregó la CA de Supabase en base64 (`DATABASE_SSL_CA_CERT_BASE64`), obligatoria para `api`, que el Compose adaptado a Supabase no tenía. |
| `docs/c4/c4_level2.md` | Se agregó Supabase Auth como sistema externo y se reemplazó el PostgreSQL en contenedor por el gestionado de Supabase. |
| Raíz del repositorio | Se eliminaron `h -h github.com -s workflow` y `s13-correcciones-sonar.patch`, que no formaban parte del proyecto. |

## Entrega final — Regreso a PostgreSQL en el Compose (ADR-0011)

| Archivo / Documento | Corrección Realizada |
| :--- | :--- |
| `deploy/compose.lab.yaml`, `deploy/.env.example` | Se retiró la configuración de Supabase (URL, claves y CA). Vuelven el servicio `postgres` con el volumen de S8 y la preparación automática (`db-bootstrap`, `db-init`) antes de la API. |
| `src/modules/identidad/` | Se reemplazó Supabase Auth por `AutenticacionLocalAdapter` (scrypt y sesiones propias) detrás del puerto `AutenticacionEstudiantePort`. El contrato HTTP no cambió. |
| `scripts/` | Se eliminaron los scripts de provisionamiento y reconciliación de Supabase; se agregaron `db:bootstrap`, `db:prepare` y `db:seed-demo-students`. |
| `docs/adr/0011-volver-a-postgresql-propio-y-login-local.md` | Nuevo ADR que explica el regreso. ADR-0009 y ADR-0010 quedan marcados como reemplazados y ADR-0008 vuelve a estar vigente. |
| `docs/supabase.md` → `docs/base-de-datos.md` | Se reemplazó la guía de Supabase por la de roles, permisos y `DEMO_STUDENTS`. |
| `README.md`, `docs/arc42/arc42_gimnasio_utb.md`, `docs/c4/c4_level2.md`, `docs/Flutter/README.md`, `docs/openapi.yaml`, `docs/taller.md` | Se corrigieron las menciones a Supabase para que describan el deployment real. El contrato pasa a 3.1.1 (solo documentación). |
