---
titulo: "arc42 — Gimnasio UTB"
date: Agosto 2026
---

# Gimnasio UTB — Documentación de arquitectura (arc42)

**Equipo:** Sebastián Felipe Caicedo Acosta, Pedro Luis Pallares De La Hoz, Rodrigo Andrés Facio Lince Beltrán
**Curso:** Arquitectura de Software — Universidad Tecnológica de Bolívar
**Corte:** 1 (semana 4)

> Basado en arc42 Template v9.0-EN. © Dr. Peter Hruschka, Dr. Gernot Starke y colaboradores — https://arc42.org

---

# 1. Introducción y Objetivos

## 1.1 Visión general de requisitos

Los estudiantes de la UTB que quieren usar el gimnasio universitario no tienen forma de saber, antes de desplazarse, si hay cupo disponible. Esto genera desplazamientos en vano cuando el gimnasio está lleno, y en ocasiones el gimnasio permanece cerrado por ausencia del encargado sin que los estudiantes lo sepan de antemano.

**Gimnasio UTB** es una aplicación móvil que resuelve este problema mediante:

- **Registro de entrada/salida por escaneo de código QR**: El estudiante registra su entrada y salida mediante lectura de QR con la cámara de su dispositivo móvil.
- **Registro manual de excepción**: El encargado gestiona accesos de forma manual en el sistema únicamente en casos de excepción (carné olvidado o falla del lector).
- **Visualización de cupos disponibles en tiempo real**: Calculada a partir de los registros de entrada/salida.
- **Notificaciones personalizadas**: Basadas en la disponibilidad de cupos, el horario preferido del estudiante, la ocupación actual y el estado abierto/cerrado del gimnasio (que depende de un horario fijo pero también de la presencia real del encargado).

## 1.2 Objetivos de calidad

El curso define cinco atributos base para guiar el análisis (rendimiento, escalabilidad, disponibilidad, mantenibilidad, seguridad). A partir de ellos, y de las preocupaciones concretas de los interesados, el equipo priorizó lo siguiente:

| # | Atributo de calidad | Tipo | Motivación |
|---|---|---|---|
| 1 | **Consistencia de datos** | Adicional al dominio | El conteo de aforo es el dato central del sistema; un conteo incorrecto (duplicado o perdido) invalida el propósito completo de la app. |
| 2 | **Disponibilidad** | Canónico | El estado abierto/cerrado y el aforo deben reflejar la realidad operativa (presencia del encargado), y el sistema debe seguir siendo usable ante fallos de infraestructura. |
| 3 | **Rendimiento** | Canónico | Los cambios de aforo deben verse casi de inmediato en los dispositivos de los estudiantes conectados. |
| 4 | **Usabilidad operativa** | Adicional al dominio | El encargado debe poder registrar accesos manuales rápido, sin fricción, para no convertirse en cuello de botella. |
| 5 | **Escalabilidad** | Canónico | El número de usuarios concurrentes crecerá con la adopción de la app entre semestres. |
| 6 | **Seguridad** | Canónico | El aforo y los accesos deben protegerse contra QR falsificados/reutilizados y accesos no autorizados al panel del encargado. |
| 7 | **Mantenibilidad** | Canónico | Las reglas de horario y operación cambian con frecuencia (bloques, umbrales de ausencia) y deben poder ajustarse con bajo esfuerzo. |

## 1.3 Trade-off principal

**¿Qué atributo sacrificarían y a cambio de qué?**

El equipo sacrifica parte de la **velocidad de desarrollo y la disponibilidad nativa en tiempo real** que ofrecería una plataforma serverless tipo Firebase, a cambio de **consistencia transaccional garantizada** (PostgreSQL con transacciones ACID) en el conteo de aforo. La razón: un conteo de aforo incorrecto rompe la confianza del estudiante en la app y anula su propósito; en cambio, una demora de 1–2 segundos en la sincronización del dato es tolerable. Esta decisión está formalizada como restricción técnica **TC3** (sección 2.2).

## 1.4 Stakeholders

Siguiendo las dos perspectivas con las que se interpreta la calidad en este proyecto:

| Rol | Perspectiva | Preocupaciones clave | Expectativas |
|---|---|---|---|
| Estudiante (usuario primario) | Usuario y negocio | Respuesta rápida, continuidad del servicio | Saber si hay cupo antes de ir; recibir notificaciones relevantes a su horario. |
| Encargado del gimnasio (usuario operativo) | Operaciones y seguridad | Recuperación ante fallos, control del acceso | Registrar accesos rápido (QR o manual); marcar apertura/cierre sin fricción. |
| Equipo de desarrollo | Operaciones y seguridad | Trazabilidad de decisiones, control de cambios | Cumplir cortes de evaluación (semanas 5, 10, 16) con evidencia técnica defendible. |
| Docente / evaluador del curso | Operaciones y seguridad | Trazabilidad de decisiones | Decisiones de arquitectura justificadas, no solo estilo; documentación arc42 completa. |

---

# 2. Restricciones de Arquitectura

## 2.1 Restricciones organizacionales

| ID | Restricción | Origen | Justificación / impacto en la arquitectura |
|---|---|---|---|
| OC1 | Cortes de evaluación en semanas 5, 10 y 16 | Sílabo del curso | Obliga a una arquitectura desplegable de forma incremental desde el inicio, no un "big bang" al final. |
| OC2 | Documentación obligatoria en plantilla **arc42** | Criterio de evaluación del docente | Fuerza a comunicar y defender cada decisión de arquitectura de forma estructurada y trazable. |
| OC3 | Repositorio en **GitHub** con integración de **SonarCloud** | Plataforma oficial del curso | Condiciona el stack a lenguajes/frameworks con buen soporte de análisis estático (JS/TS encaja bien). |
| OC4 | Uso de IA generativa debe registrarse en `docs/ia.md` | Políticas académicas UTB | Cada decisión asistida por IA debe verificarse y quedar trazada formalmente. |
| OC5 | Equipo de 4 personas, un semestre | Limitación del proyecto académico | Limita el alcance del MVP; favorece frameworks con alta productividad (un solo lenguaje en todo el stack). |
| OC6 | Metodología ágil con evidencia semanal | Plan de trabajo de la asignatura | Requiere incrementos demostrables; refuerza la necesidad de un entorno desplegado desde etapas tempranas. |

## 2.2 Restricciones técnicas

| ID | Restricción | Origen | Justificación / impacto en la arquitectura |
|---|---|---|---|
| TC1 | **URL pública requerida desde el corte 2** (semana 10) | Requisito de evaluación del curso | Obliga a elegir una plataforma de despliegue continuo desde el corte 1 en vez de trabajar solo en local. |
| TC2 | App móvil en **Flutter** | Decisión técnica del equipo | Codebase único para Android/iOS, coherente con un equipo pequeño y tiempo limitado; evita duplicar lógica de UI. |
| TC3 | Backend en **Node.js + Express**, base de datos **PostgreSQL** | Decisión de arquitectura del equipo | Postgres da garantías **ACID**, necesarias para que el conteo de aforo sea consistente (trade-off sección 1.3). Node/Express tiene además soporte directo en SonarCloud (OC3). |
| TC4 | Despliegue en **Render** (free tier) | Presupuesto del equipo (0 USD) | Sin costo, pero implica *cold starts* tras inactividad — restricción que debe manejarse explícitamente en la app. |
| TC5 | Dependencia de hardware de cámara y API del SO | Plataformas Android / iOS | La captura de imágenes depende de la disponibilidad física de la cámara y permisos de privacidad concedidos por el usuario en el dispositivo móvil. |

## 2.3 Restricciones legales

| ID | Restricción | Origen | Justificación / impacto en la arquitectura |
|---|---|---|---|
| LC1 | Cumplimiento de la **Ley 1581 de 2012** (Protección de Datos Personales en Colombia) | Marco legal colombiano y normatividad UTB | El sistema maneja datos de identificación de estudiantes (código/carné y registros de asistencia); la arquitectura debe garantizar la encriptación de datos en tránsito y reposo, minimización de datos almacenados y consentimiento expreso para el tratamiento de su información. |

---

# 3. Contexto y Alcance

## 3.1 Contexto de negocio

El sistema tiene dos actores externos que interactúan con él directamente:

- **Estudiante**: consulta el aforo disponible, escanea su QR para registrar entrada/salida, recibe notificaciones según su horario preferido.
- **Encargado del gimnasio**: gestiona el registro manual cuando el QR no es viable, marca la apertura/cierre real del gimnasio.

*(Ver "Diagrama C4 de contexto" más abajo, con versión en código e imagen.)*

## 3.2 Contexto técnico

| Canal | Origen → Destino | Protocolo | Formato |
|---|---|---|---|
| App móvil ↔ API backend | Flutter app ↔ Node/Express | HTTPS (REST) | JSON |
| Actualización de aforo en tiempo real | Node/Express ↔ Flutter app | WebSocket (Socket.io) | JSON |
| Registro de acceso | Flutter app (lector QR) → API backend | HTTPS (REST) | JSON |
| Persistencia | API backend ↔ PostgreSQL | SQL (driver `pg`) | Filas relacionales |
| Notificaciones push | API backend → Servicio de notificaciones (FCM) → dispositivo del estudiante | HTTPS / FCM | JSON |

**Mapeo entrada/salida a canales:**

- *Entrada*: escaneo QR o registro manual → API REST → escritura transaccional en PostgreSQL.
- *Salida*: aforo actualizado → difusión por WebSocket a clientes conectados; alertas → notificación push vía FCM.

---

# 4. Estrategia de Solución

## 4.1 Decisiones tecnológicas clave

El stack ya quedó fijado y justificado como restricción técnica en la sección 2.2: **Flutter** (app móvil), **Node.js + Express** (backend) y **PostgreSQL** (persistencia), con despliegue en **Render**. La estrategia de solución de esta entrega se enfoca en **cómo se organiza el código dentro de ese backend**, para que desde la semana 4 el equipo pueda avanzar sobre una base ya montada en vez de decidir estructura sobre la marcha.

## 4.2 Matriz comparativa de estilos arquitectónicos

Se evaluaron tres estilos para organizar el backend, frente a los atributos de calidad priorizados en la sección 1.2 y las restricciones organizacionales (equipo pequeño, entregas incrementales):

| Criterio | Arquitectura en Capas | Arquitectura Hexagonal (Puertos y Adaptadores) | Monolito Modular (sin capas ni hexagonal) |
|---|---|---|---|
| Acoplamiento del dominio con el framework/DB | Alto — la lógica de negocio suele mezclarse con Express y el ORM | Bajo — el dominio no conoce Express ni PostgreSQL, solo interfaces (puertos) | Medio-alto — cada módulo resuelve su propio acoplamiento, sin regla explícita |
| Testabilidad del dominio (ES1) | Media — requiere mocks del framework para probar reglas de negocio | Alta — el dominio se prueba con funciones puras, sin levantar servidor ni DB | Variable — depende de la disciplina de cada módulo, no está garantizado por la estructura |
| Curva de aprendizaje para el equipo (OC5) | Baja — es el estilo más conocido y usado en cursos previos | Media-alta — requiere entender puertos/adaptadores, nuevo para el equipo | Baja-media — es organizar por carpetas de dominio, sin conceptos nuevos |
| Facilidad de cambio ante nuevas reglas (Mantenibilidad) | Media — un cambio de regla puede tocar varias capas transversales | Alta — cambiar una regla de negocio no toca los adaptadores de infraestructura | Media — depende de qué tan bien delimitado esté cada módulo |
| Aislamiento para validar seguridad | Media — la validación suele vivir en el controlador, junto al framework | Alta — las políticas de acceso pueden probarse como parte del dominio, desacopladas de Express | Media — igual que capas, depende del módulo |
| Velocidad para el MVP con los cortes actuales (OC1) | Alta — se escribe rápido, hay muchos ejemplos y plantillas | Media — el andamiaje inicial (puertos, adaptadores) toma más tiempo antes de la primera funcionalidad | Alta — igual de rápido que capas al inicio |
| Preparación para crecer (Escalabilidad) | Baja-media — separar módulos después implica refactor grande | Alta — cada módulo hexagonal ya está desacoplado, es más fácil extraerlo si hace falta | Media-alta — ya está modularizado, pero sin el aislamiento de dominio que facilita extraer un módulo limpiamente |
| Riesgo de sobre-ingeniería para un MVP académico | Bajo | Medio — si no se disciplina, los puertos pueden volverse ceremonia sin beneficio real | Bajo |

**Lectura de la matriz:** Capas gana en velocidad inicial y curva de aprendizaje; Monolito Modular es un punto intermedio razonable; Hexagonal es el único que responde directamente a los escenarios de calidad con mayor prioridad del árbol de utilidad (ES1, ES4), a costa de una curva de aprendizaje algo mayor. La decisión final y sus consecuencias completas están documentadas en `docs/adr/0001-arquitectura-hexagonal.md`.

## 4.3 Decisión adoptada

El equipo adopta **Arquitectura Hexagonal (Puertos y Adaptadores)**, desplegada como **un único monolito** (no microservicios), organizada internamente por módulo de dominio (empezando por el módulo `aforo`). Esto significa:

- El **dominio** (reglas de negocio puras, ej. cómo se calcula el aforo) no importa ni Express ni el driver de PostgreSQL.
- La **aplicación** define casos de uso y puertos (interfaces) que el dominio necesita (ej. "guardar un registro de acceso").
- La **infraestructura** implementa esos puertos con tecnología concreta: adaptadores HTTP (Express), de persistencia (PostgreSQL) y de tiempo real (WebSocket).

Ver el detalle completo de alternativas y consecuencias en el ADR 0001.

---

# Diagrama C4 de contexto (Nivel 1)

```mermaid
graph TD
    Estudiante[Estudiante - Usuario Principal]
    Encargado[Encargado del Gimnasio - Operaciones]
    
    Sistema[Sistema Gimnasio UTB]
    FCM[Firebase Cloud Messaging - FCM]

    Estudiante -->|Escanea QR, consulta aforo y recibe notificaciones| Sistema
    Encargado -->|Registra accesos manuales y gestiona apertura/cierre| Sistema
    Sistema -->|Envía alertas push| FCM
    FCM -->|Entrega notificaciones| Estudiante
    Estudiante -->|Escanea QR, consulta aforo y recibe notificaciones| Sistema
    Encargado -->|Registra accesos manuales y gestiona apertura/cierre| Sistema
    Sistema -->|Envía alertas push| FCM
    FCM -->|Entrega notificaciones| Estudiante
