# AS_202620_GimnasioUTB

## Sistema de Gestión de Aforo para el Gimnasio UTB

Este proyecto propone el diseño de una solución de software para mejorar la experiencia de los estudiantes que utilizan el gimnasio de la Universidad Tecnológica de Bolívar.

## Problema

El gimnasio de la Universidad Tecnológica de Bolívar alcanza su máxima capacidad en ciertos horarios. Actualmente, los estudiantes solo se enteran de esta situación cuando llegan al gimnasio e intentan ingresar, lo que puede generar desplazamientos innecesarios y una mala experiencia.

Además, la disponibilidad del gimnasio no depende únicamente de su horario habitual, ya que puede permanecer cerrado cuando el encargado no se encuentra presente.

## Solución propuesta

Se propone una aplicación móvil, potencialmente integrable con la aplicación institucional de la UTB, que permita:

- Registrar la entrada y salida de estudiantes mediante códigos QR.
- Permitir el registro o corrección manual por parte del encargado.
- Mostrar los cupos disponibles en tiempo real.
- Mostrar el estado actual del gimnasio: abierto o cerrado.
- Enviar notificaciones personalizadas según las horas preferidas del estudiante.
- Considerar la ocupación actual y la disponibilidad real del gimnasio.

## Stack tecnológico

- **App móvil:** Flutter
- **Backend:** Node.js + Express, organizado con Arquitectura Hexagonal (ver `docs/adr/0001-arquitectura-hexagonal.md`)
- **Base de datos:** PostgreSQL — **pendiente de implementar** (ver sección "Corte Vertical Ejecutable" más abajo; hoy el aforo se persiste en memoria)
- **Despliegue:** Render

## Cómo ejecutar el backend

Requisitos: Node.js ≥ 18.

```bash
npm install && npm start
```

Levanta el servidor en `http://localhost:3000`. Verifica que está corriendo con:

```bash
curl http://localhost:3000/health
# {"status":"ok","service":"gimnasio-utb-backend"}
```

Para correr las pruebas automatizadas (dominio, integración del corte vertical, y health check):

```bash
npm test
```

## Estructura del backend

```
src/
├── server.js                # arranque del servidor (composition root) — conecta HTTP, caso de uso y adaptador de persistencia
├── modules/
│   └── aforo/
│       ├── domain/          # regla de negocio pura (aplicarAcceso) — sin Express ni PostgreSQL
│       ├── application/
│       │   ├── registrar-acceso.usecase.js
│       │   └── ports/
│       │       └── aforo-repository.port.js   # contrato de persistencia
│       └── infrastructure/
│           ├── http/
│           │   └── aforo.router.js            # endpoints POST /acceso y GET /
│           └── persistence/
│               └── aforo-memoria.adapter.js   # implementación EN MEMORIA (ver más abajo)
└── shared/                  # utilidades compartidas entre módulos

tests/
├── health.test.js
├── domain/aforo.test.js      # prueba del dominio, sin servidor
└── aforo.integration.test.js # prueba del corte vertical de punta a punta
```

## Corte Vertical Ejecutable

Este repositorio contiene un corte vertical **funcional y ejecutable** que atraviesa las cuatro capas de la Arquitectura Hexagonal (HTTP → caso de uso → dominio → persistencia) para un único flujo: **registrar un acceso y consultar el aforo actual**.

**Estado real de la persistencia (léase con atención):** el aforo se guarda hoy en un **adaptador en memoria** (`aforo-memoria.adapter.js`) — una variable que vive mientras el servidor está corriendo y se reinicia a 0 al reiniciar el proceso. El adaptador de **PostgreSQL es trabajo pendiente**: el puerto (`AforoRepositoryPort`) ya está definido para que, cuando se implemente, el dominio y el caso de uso no necesiten cambiar en absoluto — esa es la garantía concreta que ofrece la Arquitectura Hexagonal adoptada en el ADR 0001.

### Requisitos previos

- Node.js ≥ 18 (no requiere PostgreSQL para esta entrega)

### Pasos para ejecutar localmente

```bash
npm install
npm start
```

Deberías ver en consola: `Gimnasio UTB backend escuchando en el puerto 3000`.

### Probar el corte vertical (HTTP Adapter → UseCase → Dominio → Adaptador en memoria)

**1. Registrar un acceso de entrada:**

```bash
Invoke-RestMethod -Uri "http://localhost:3000/api/v1/aforo/acceso" -Method Post -ContentType "application/json" -Body '{"tipoAcceso": "ENTRADA"}'
```


**2. Consultar el aforo actual:**

```bash
Invoke-RestMethod -Uri "http://localhost:3000/api/v1/aforo"
```


**3. Ejemplo de la regla de dominio aplicándose de punta a punta** (una salida sin aforo previo debe rechazarse):

```bash
Invoke-RestMethod -Uri "http://localhost:3000/api/v1/aforo/acceso" -Method Post -ContentType "application/json" -Body '{"tipoAcceso": "SALIDA"}'
```

Si el aforo está en 0, responde `400 Bad Request` — la regla vive en `domain/aforo.js` y se prueba también de forma aislada en `tests/domain/aforo.test.js`, sin necesidad de levantar el servidor.

## Stakeholders

- Estudiantes de la Universidad Tecnológica de Bolívar.
- Encargado(s) del gimnasio.
- Bienestar Universitario.
- Área administrativa responsable del gimnasio.

## Documentación

La documentación del proyecto se encuentra en la carpeta `docs`:

- `problema.md`: descripción y delimitación del problema.
- `aspectos.md`: aspectos y atributos de calidad relevantes para la arquitectura, con trazabilidad hasta pruebas.
- `ia.md`: registro del uso de herramientas de inteligencia artificial.
- `arc42/arc42_gimnasio_utb.md`: documentación de arquitectura completa (arc42).
- `c4/`: diagramas C4 de contexto (nivel 1) y contenedores (nivel 2).
- `adr/0001-arquitectura-hexagonal.md`: decisión de arquitectura sobre el estilo del backend, con alternativas y consecuencias.

## Integración continua

Cada `push` corre las pruebas automatizadas del backend vía GitHub Actions (`.github/workflows/ci.yml`), incluyendo la prueba de integración del corte vertical.

## Integrantes

- Sebastián Felipe Caicedo Acosta
- Pedro Luis Pallares De La Hoz
- Rodrigo Andrés Facio Lince Beltrán
