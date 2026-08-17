---
titulo: "arc42 — Gimnasio UTB"
date: Agosto 2026
---

# Gimnasio UTB — Documentación de arquitectura (arc42)

**Equipo:** Sebastián Felipe Caicedo Acosta, Pedro Luis Pallares De La Hoz, Rodrigo Andrés Facio Lince Beltrán
**Curso:** Arquitectura de Software — Universidad Tecnológica de Bolívar
**Corte:** 1 (semana 2)

> Basado en arc42 Template v9.0-EN. © Dr. Peter Hruschka, Dr. Gernot Starke y colaboradores — https://arc42.org

---

# 1. Introducción y Objetivos

## 1.1 Visión general de requisitos

Los estudiantes de la UTB que quieren usar el gimnasio universitario no tienen forma de saber, antes de desplazarse, si hay cupo disponible. Esto genera desplazamientos en vano cuando el gimnasio está lleno, y en ocasiones el gimnasio permanece cerrado por ausencia del encargado sin que los estudiantes lo sepan de antemano.

**Gimnasio UTB** es una aplicación móvil que resuelve este problema mediante:

- **Registro de entrada/salida** vía escaneo de código QR (estudiante) o gestión manual (encargado, para casos de excepción como carné olvidado o falla del lector).
- **Visualización de cupos disponibles en tiempo real**, calculada a partir de los registros de entrada/salida.
- **Notificaciones personalizadas** basadas en la disponibilidad de cupos, el horario preferido del estudiante, la ocupación actual y el estado abierto/cerrado del gimnasio (que depende de un horario fijo pero también de la presencia real del encargado).

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
| Bienestar Universitario (beneficiario indirecto) | Usuario y negocio | Costo de operación, continuidad del servicio | Visibilidad indirecta del uso del gimnasio; garantía de que el servicio funciona bien. |
| Encargado del gimnasio (usuario operativo) | Operaciones y seguridad | Recuperación ante fallos, control del acceso | Registrar accesos rápido (QR o manual); marcar apertura/cierre sin fricción. |
| Equipo de desarrollo | Operaciones y seguridad | Trazabilidad de decisiones, control de cambios | Cumplir cortes de evaluación (semanas 5, 10, 16) con evidencia técnica defendible. |
| Docente / evaluador del curso | Operaciones y seguridad | Trazabilidad de decisiones | Decisiones de arquitectura justificadas, no solo estilo; documentación arc42 completa. |

---

# 2. Restricciones de Arquitectura

## 2.1 Restricciones organizacionales

| ID | Restricción | Justificación / impacto en la arquitectura |
|---|---|---|
| OC1 | Cortes de evaluación en semanas 5, 10 y 16 | Obliga a una arquitectura desplegable de forma incremental desde el inicio, no un "big bang" al final. |
| OC2 | Documentación obligatoria en plantilla **arc42** | Fuerza a comunicar y defender cada decisión de arquitectura de forma estructurada y trazable. |
| OC3 | Repositorio en **GitHub** con integración de **SonarCloud** | Condiciona el stack a lenguajes/frameworks con buen soporte de análisis estático (JS/TS encaja bien). |
| OC4 | Uso de IA generativa debe registrarse en `docs/ia.md` | No impacta la arquitectura técnica, pero sí el proceso: cada decisión asistida por IA debe verificarse y quedar trazada. |
| OC5 | Equipo de 4 personas, un semestre | Limita el alcance del MVP; favorece frameworks con alta productividad (un solo lenguaje en todo el stack cuando sea posible). |
| OC6 | Metodología ágil con evidencia semanal | Requiere incrementos demostrables; refuerza la necesidad de un entorno desplegado desde etapas tempranas. |

## 2.2 Restricciones técnicas

| ID | Restricción | Justificación / impacto en la arquitectura |
|---|---|---|
| TC1 | **URL pública requerida desde el corte 2** (semana 10) | Obliga a elegir una plataforma de despliegue continuo desde el corte 1 en vez de trabajar solo en local. |
| TC2 | App móvil en **Flutter** | Codebase único para Android/iOS, coherente con un equipo pequeño y tiempo limitado; evita duplicar lógica de UI por plataforma. |
| TC3 | Backend en **Node.js + Express**, base de datos **PostgreSQL** | Postgres da garantías **ACID**, necesarias para que el conteo de aforo (entradas/salidas concurrentes) sea consistente — esto formaliza el trade-off de la sección 1.3 (consistencia sobre velocidad/disponibilidad nativa). Node/Express tiene además buen soporte de SonarCloud (OC3). |
| TC4 | Despliegue en **Render** (free tier) | Sin costo para un proyecto académico, pero implica *cold starts* tras inactividad — restricción que debe manejarse explícitamente en el diseño (ver escenario ES5). |
| TC5 | Registro de entrada/salida por **cámara del dispositivo (QR)** | Requiere permisos de cámara y una librería de lectura de QR en Flutter; el flujo manual del encargado existe como *fallback* cuando esto falla. |

---

# 3. Contexto y Alcance

## 3.1 Contexto de negocio

El sistema tiene tres actores externos que interactúan con él directamente o indirectamente:

- **Estudiante**: consulta el aforo disponible, escanea su QR para registrar entrada/salida, recibe notificaciones según su horario preferido.
- **Encargado del gimnasio**: gestiona el registro manual cuando el QR no es viable, marca la apertura/cierre real del gimnasio.
- **Bienestar Universitario**: beneficiario indirecto — consume reportes de uso, no interactúa con el flujo operativo día a día.

*(Ver "Diagrama C4 de contexto" más abajo, con explicación incluida.)*

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

# Diagrama C4 de contexto (Nivel 1)

<p align="center">
  <img src="docs/C4.jpg" alt="Diagrama C4 Nivel 1 - Gimnasio UTB" width="85%">
</p>

### Descripción

El **Sistema Gimnasio UTB** es el sistema de software que gestiona el registro de entradas y salidas, el cálculo del aforo disponible, el estado operativo del gimnasio y el envío de notificaciones.

Los **estudiantes** interactúan con el sistema para consultar el aforo, registrar sus entradas y salidas y recibir información sobre la disponibilidad del gimnasio.

El **encargado del gimnasio** utiliza el sistema para gestionar los accesos y actualizar el estado real del gimnasio, incluyendo su apertura y cierre.

**Bienestar Universitario** es un beneficiario indirecto que puede consultar información y reportes relacionados con el uso del gimnasio.

El sistema utiliza **Firebase Cloud Messaging (FCM)** como servicio externo para entregar las notificaciones push a los dispositivos de los estudiantes.

> **Nota:** Este es un diagrama C4 de **Contexto (Nivel 1)**. Por eso no se muestran componentes internos como Flutter, Node.js, Express, PostgreSQL o WebSocket. Esos elementos pertenecen al nivel de contenedores o niveles inferiores.


# Árbol de utilidad

```
Calidad del sistema — Gimnasio UTB
│
├── Rendimiento [canónico]
│   └── Refinamiento: latencia de actualización de aforo bajo carga normal
│         └── ES4 · Prioridad: Alta · Dificultad: Media
│
├── Disponibilidad [canónico]
│   ├── Refinamiento: el estado abierto/cerrado refleja la presencia real del encargado
│   │     └── ES2 · Prioridad: Alta · Dificultad: Alta
│   └── Refinamiento: continuidad del servicio ante fallos de infraestructura
│         └── ES5 · Prioridad: Media · Dificultad: Alta
│
├── Escalabilidad [canónico]
│   └── Refinamiento: crecimiento de usuarios concurrentes conectados al aforo en tiempo real
│         └── ES6 · Prioridad: Media · Dificultad: Media
│
├── Seguridad [canónico]
│   └── Refinamiento: protección contra QR falsificados/reutilizados y accesos no autorizados
│         └── ES7 · Prioridad: Alta · Dificultad: Media
│
├── Mantenibilidad [canónico]
│   └── Refinamiento: esfuerzo para ajustar reglas de horario/operación
│         └── ES8 · Prioridad: Media · Dificultad: Baja
│
├── Consistencia de datos [adicional al dominio]
│   └── Refinamiento: integridad transaccional del conteo de aforo
│         └── ES1 · Prioridad: Alta · Dificultad: Media
│
└── Usabilidad operativa [adicional al dominio]
    └── Refinamiento: eficiencia de la interacción del encargado en registro manual
          └── ES3 · Prioridad: Media · Dificultad: Baja
```

---

# Escenarios de calidad (con medida)

## ES1 — Consistencia del conteo de aforo *(Consistencia de datos)*

| Campo | Descripción |
|---|---|
| **Fuente** | Dos estudiantes escaneando su QR de entrada casi simultáneamente |
| **Estímulo** | Dos solicitudes de registro de entrada llegan al backend en la misma ventana de tiempo |
| **Artefacto** | Servicio de registro de aforo (API + tabla de ocupación en PostgreSQL) |
| **Ambiente** | Operación normal, hora pico |
| **Respuesta** | El sistema procesa ambos registros de forma atómica, sin perder ni duplicar el conteo |
| **Medida** | 100% de las transacciones concurrentes reflejan el conteo correcto en una prueba de carga con ≥20 solicitudes simultáneas; 0 inconsistencias detectadas |

## ES2 — Estado real del gimnasio (abierto/cerrado) *(Disponibilidad)*

| Campo | Descripción |
|---|---|
| **Fuente** | Encargado del gimnasio |
| **Estímulo** | El encargado no ha marcado su llegada 15 minutos después del horario programado de apertura |
| **Artefacto** | Módulo de estado del gimnasio |
| **Ambiente** | Horario habitual de apertura |
| **Respuesta** | El sistema cambia automáticamente el estado visible a "cerrado" y notifica a los estudiantes con horario preferido coincidente |
| **Medida** | Cambio de estado reflejado en la app en ≤2 minutos desde que se cumple el umbral de ausencia |

## ES3 — Registro manual del encargado *(Usabilidad operativa)*

| Campo | Descripción |
|---|---|
| **Fuente** | Encargado del gimnasio |
| **Estímulo** | Necesita registrar manualmente la entrada de un estudiante sin QR disponible (carné olvidado) |
| **Artefacto** | Interfaz de gestión manual de accesos |
| **Ambiente** | Operación normal |
| **Respuesta** | El encargado completa el registro manual sin pasos adicionales innecesarios |
| **Medida** | Registro completado en ≤10 segundos y máximo 2 toques, verificado en prueba de usabilidad con 5 usuarios |

## ES4 — Actualización de aforo en tiempo real *(Rendimiento)*

| Campo | Descripción |
|---|---|
| **Fuente** | Estudiante |
| **Estímulo** | Escanea su QR de entrada |
| **Artefacto** | API de registro + vista de aforo en tiempo real (WebSocket) |
| **Ambiente** | Hora pico, hasta 50 usuarios concurrentes conectados a la vista de aforo |
| **Respuesta** | El conteo de aforo visible para todos los usuarios conectados se actualiza |
| **Medida** | Latencia ≤2 segundos en el percentil 95 (P95). **Población:** todos los clientes con la app abierta en la vista de aforo. **Ventana:** 30 minutos continuos en hora pico. **Carga:** hasta 50 usuarios concurrentes. **Método:** tiempo medido desde el evento de escaneo registrado en el backend hasta la recepción de la actualización por WebSocket en el cliente, instrumentado en ambos extremos. |

## ES5 — Degradación ante caída/cold start del backend *(Disponibilidad)*

| Campo | Descripción |
|---|---|
| **Fuente** | Infraestructura (Render free tier) |
| **Estímulo** | El backend entra en *cold start* o cae temporalmente por inactividad |
| **Artefacto** | Sistema completo (app + backend) |
| **Ambiente** | Producción, fuera de horario pico |
| **Respuesta** | La app muestra el último estado conocido con un indicador de "datos desactualizados" en vez de fallar |
| **Medida** | La app permanece usable (sin *crash*) en el 100% de las pruebas de caída simulada; el servicio se recupera en ≤30 segundos tras el *cold start* |

## ES6 — Crecimiento de usuarios concurrentes *(Escalabilidad)*

| Campo | Descripción |
|---|---|
| **Fuente** | Crecimiento de la comunidad estudiantil que usa la app (inicio de semestre, mayor difusión) |
| **Estímulo** | El número de usuarios concurrentes conectados a la vista de aforo en tiempo real aumenta de 50 a 150 |
| **Artefacto** | Backend (API + capa WebSocket) y base de datos PostgreSQL |
| **Ambiente** | Inicio de semestre, hora pico |
| **Respuesta** | El sistema mantiene la actualización de aforo sin degradar el servicio ni perder conexiones |
| **Medida** | Con 150 usuarios concurrentes, la latencia P95 de actualización no supera 3 segundos y 0% de las conexiones WebSocket se pierden, verificado en prueba de carga |

## ES7 — Protección contra accesos fraudulentos *(Seguridad)*

| Campo | Descripción |
|---|---|
| **Fuente** | Estudiante o tercero que intenta reutilizar/falsificar un QR, o acceder sin autorización al panel del encargado |
| **Estímulo** | Se envía un QR ya escaneado, un QR inválido, o una solicitud al panel de registro manual sin sesión autenticada |
| **Artefacto** | API de registro de acceso + módulo de autenticación del panel del encargado |
| **Ambiente** | Operación normal |
| **Respuesta** | El sistema rechaza el QR inválido/reutilizado y bloquea el acceso no autenticado, registrando el intento |
| **Medida** | 100% de los intentos de QR reutilizado o acceso no autenticado son rechazados y quedan en el log de auditoría, verificado con al menos 10 casos de prueba de intento inválido |

## ES8 — Ajuste de reglas de horario/operación *(Mantenibilidad)*

| Campo | Descripción |
|---|---|
| **Fuente** | Equipo de desarrollo, a solicitud del encargado/administración |
| **Estímulo** | Se requiere modificar una regla operativa (ej.: cambiar el umbral de ausencia del encargado de 15 a 10 minutos, o añadir un nuevo bloque horario) |
| **Artefacto** | Módulo de configuración de horarios y estado del gimnasio |
| **Ambiente** | Desarrollo activo (fuera de producción) |
| **Respuesta** | El cambio se implementa modificando parámetros de configuración, sin alterar la lógica central del sistema |
| **Medida** | El cambio se implementa, prueba y despliega en menos de 4 horas de esfuerzo de un desarrollador, verificado por revisión de código |

---

*Documento generado como parte de la entrega del corte 1 del proyecto Gimnasio UTB. Uso de IA generativa registrado en `docs/ia.md` según lo requerido por el curso.*
