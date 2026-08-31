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
- **Base de datos:** PostgreSQL
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

Para correr la prueba automatizada:

```bash
npm test
```

> Esta entrega no incluye lógica de negocio: el backend es un esqueleto arquitectónico listo para recibir funcionalidad desde la semana 5, sin necesidad de decidir estructura sobre la marcha.

## Estructura del backend

```
src/
├── server.js               # arranque del servidor (composition root)
├── modules/
│   └── aforo/               # primer módulo de dominio
│       ├── domain/          # reglas de negocio puras, sin Express ni PostgreSQL
│       ├── application/     # casos de uso y puertos (interfaces)
│       └── infrastructure/  # adaptadores concretos (HTTP, persistencia)
└── shared/                  # utilidades compartidas entre módulos

tests/                       # pruebas automatizadas
```

## Stakeholders

- Estudiantes de la Universidad Tecnológica de Bolívar.
- Encargado(s) del gimnasio.
- Bienestar Universitario.
- Área administrativa responsable del gimnasio.

## Documentación

La documentación del proyecto se encuentra en la carpeta `docs`:

- `problema.md`: descripción y delimitación del problema.
- `aspectos.md`: aspectos y atributos de calidad relevantes para la arquitectura.
- `ia.md`: registro del uso de herramientas de inteligencia artificial.
- `arc42_gimnasio_utb.md`: documentación de arquitectura completa (arc42), incluyendo restricciones, contexto, diagrama C4, árbol de utilidad y escenarios de calidad.
- `adr/0001-arquitectura-hexagonal.md`: decisión de arquitectura sobre el estilo del backend, con alternativas y consecuencias.

## Integración continua

Cada `push` corre la prueba automatizada del backend vía GitHub Actions (`.github/workflows/ci.yml`).

## Integrantes

- Sebastián Felipe Caicedo Acosta
- Pedro Luis Pallares De La Hoz
- Rodrigo Andrés Facio Lince Beltrán

- ## Esqueleto ejecutable

Este repositorio contiene el esqueleto inicial ejecutable del backend del proyecto Gimnasio UTB.

La lógica de negocio aún no está implementada completamente. En esta etapa se establece la estructura inicial de la arquitectura, un servidor funcional, un endpoint de verificación y una prueba automatizada.

### Requisitos

Para ejecutar el proyecto se requiere:

- Node.js versión 18 o superior.
- npm.

### Instalación

Desde la carpeta principal del repositorio, instalar las dependencias:

```bash
npm install
```

### Ejecución

Para iniciar el servidor ejecutar:

```bash
npm start
```

El proyecto se inicia mediante el comando definido en el archivo `package.json`.

Una vez iniciado, el servidor estará disponible en:

```text
http://localhost:3000
```

### Endpoint de verificación

El esqueleto incluye un endpoint de salud:

```text
GET /health
```

La respuesta esperada es:

```json
{
  "status": "ok"
}
```

### Prueba automatizada

El proyecto incluye una prueba automatizada para verificar el funcionamiento del endpoint de salud.

Para ejecutarla:

```bash
npm test
```

La prueba verifica que:

- El endpoint `/health` responda correctamente.
- El código de respuesta sea `200`.
- La respuesta incluya el estado `"ok"`.

### Integración continua

El repositorio cuenta con un flujo de Integración Continua (CI) mediante GitHub Actions.

Cada vez que se realiza un `push` o se abre o actualiza un `pull request`, el flujo automático:

1. Utiliza un entorno Ubuntu.
2. Configura Node.js versión 20.
3. Instala las dependencias mediante `npm install`.
4. Ejecuta las pruebas mediante `npm test`.

Esto permite verificar automáticamente que la prueba de salud continúe funcionando correctamente.

## Arquitectura inicial

El backend adopta una arquitectura hexagonal como estilo arquitectónico inicial.

El módulo principal se encuentra organizado en:

```text
src/
├── modules/
│   └── aforo/
│       ├── application/
│       │   └── ports/
│       ├── domain/
│       └── infrastructure/
│           ├── http/
│           └── persistence/
├── shared/
└── server.js
```

### Responsabilidades iniciales

- **Domain:** representa el núcleo del dominio y las reglas del negocio.
- **Application:** contendrá los casos de uso de la aplicación.
- **Ports:** define los contratos o interfaces necesarios para comunicar la aplicación con elementos externos.
- **Infrastructure:** contiene los adaptadores concretos, como HTTP y persistencia.
- **Shared:** contiene elementos que pueden ser compartidos entre módulos.

## 🚀 Corte Vertical Ejecutable (MVP)

Este repositorio contiene un corte vertical funcional que demuestra la implementación de la **Arquitectura Hexagonal** y la conexión a **PostgreSQL**. El flujo implementado atraviesa todas las capas del sistema comprobando el **Registro de Acceso y la Consulta de Aforo**.

### Requisitos previos
* Node.js v20+
* PostgreSQL en ejecución (local o mediante Docker)

### Pasos para ejecutar localmente

1. **Clonar e instalar dependencias:**
   ```bash
   git clone [https://github.com/tu-usuario/gimnasio-utb.git](https://github.com/tu-usuario/gimnasio-utb.git)
   cd gimnasio-utb/backend
   npm install
   ```

2. **Configurar variables de entorno:**
   Copia el archivo `.env.example` y renómbralo a `.env`. Ajusta la cadena de conexión a tu base de datos:
   ```env
   DATABASE_URL=postgres://usuario:password@localhost:5432/gimnasio_utb
   PORT=3000
   ```

3. **Ejecutar migraciones (Estructura inicial de BD):**
   ```bash
   npm run db:migrate
   ```

4. **Iniciar el servidor en modo desarrollo:**
   ```bash
   npm run dev
   ```
   *Deberías ver en consola: `Servidor corriendo en el puerto 3000` y `Conexión a PostgreSQL exitosa`.*

### Prueba de las capas de la arquitectura (Endpoints)
Para validar que el caso de uso se comunica correctamente con la base de datos a través de los puertos, puedes ejecutar las siguientes pruebas con cURL, Postman o ThunderClient:

**1. Registrar un acceso (Atraviesa HTTP Adapter → UseCase → Postgres Adapter):**
```bash
curl -X POST http://localhost:3000/api/v1/aforo/acceso \
     -H "Content-Type: application/json" \
     -d '{"estudianteId": "T00012345", "tipoAcceso": "ENTRADA"}'
```
*Respuesta esperada:* `201 Created` con el JSON del nuevo aforo.

**2. Consultar el aforo actual (Validación de persistencia):**
```bash
curl -X GET http://localhost:3000/api/v1/aforo
```
*Respuesta esperada:* `200 OK` devolviendo `{"status": "success", "data": {"aforoActual": 1, "cupoDisponible": 49}}`.
