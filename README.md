# AS_202620_GimnasioUTB

## Sistema de Gestión de Aforo para el Gimnasio UTB

Este proyecto académico explora una solución para mejorar la información de disponibilidad del gimnasio de la Universidad Tecnológica de Bolívar. El alcance implementado actualmente es un backend ejecutable para consultar y actualizar un contador de aforo; no representa todavía la solución móvil completa.

## Problema y alcance

La propuesta busca ayudar a los estudiantes a conocer la ocupación del gimnasio antes de desplazarse. La solución completa contempla ideas como aplicación móvil, QR, operación del encargado y notificaciones. Esas capacidades son parte del alcance futuro, no del backend implementado hoy.

El corte vertical actual permite:

- Registrar una transición `ENTRADA` o `SALIDA`.
- Consultar el contador actual del aforo.
- Persistir el contador en PostgreSQL cuando se ejecuta el servidor real.
- Consultar liveness, readiness y un contador operacional de accesos.

El backend no identifica estudiantes, valida QR, mantiene historial de accesos ni impide duplicados por identidad. S1 se limita a la validez de las transiciones del contador y a su consistencia transaccional.

## Stack actual

- **Backend:** Node.js y Express, organizado con Arquitectura Hexagonal / Ports and Adapters. La decisión se describe en [ADR 0001](docs/adr/0001-arquitectura-hexagonal.md).
- **Persistencia del servidor real:** PostgreSQL mediante `AforoPostgresAdapter`.
- **Adapter en memoria:** disponible como implementación por defecto de `createApp()`, usada por pruebas que no requieren PostgreSQL.
- **App móvil Flutter, Render y PostgreSQL gestionado:** pendientes; no hay despliegue configurado.

## Ejecución local

Requisitos: Node.js 18 o superior y una instancia PostgreSQL accesible. El servidor real y `npm run db:init` requieren que `DATABASE_URL` esté configurada en el entorno del proceso.

```bash
npm install
npm run db:init
npm start
```

`db:init` crea la tabla `aforo_estado` e inicializa el contador si aún no existe. El servidor escucha en el puerto 3000 por defecto. Los logs se escriben como JSON en stdout.

## API actual

| Método y ruta | Comportamiento |
|---|---|
| `GET /health` | Liveness estático. Responde `200` con `{"status":"ok","service":"gimnasio-utb-backend"}`. |
| `GET /ready` | Consulta el repositorio. Responde `200` si está disponible y `503` si la consulta falla. |
| `GET /metrics` | Devuelve contadores en memoria por instancia, separados por tipo de acceso. Se reinician al reiniciar el proceso. No es una salida Prometheus. |
| `GET /api/v1/aforo` | Devuelve el aforo actual en `data.aforoActual`. |
| `POST /api/v1/aforo/acceso` | Recibe `{"tipoAcceso":"ENTRADA"}` o `{"tipoAcceso":"SALIDA"}`. Responde `201` si se registra, `400` si falla la entrada o regla de dominio, `503` si el repositorio no está disponible y `500` ante errores inesperados. |

Ejemplo de respuesta de `GET /metrics` después de una entrada y una salida:

```json
{
	"access_operations_total": {
		"entrada": 1,
		"salida": 1,
		"total": 2
	}
}
```

Los logs estructurados incluyen `timestamp`, `level`, `event` y `message`. Los callsites actuales no registran credenciales, `DATABASE_URL`, tokens ni payloads de las solicitudes.

## Arquitectura y consistencia

El dominio contiene la regla de transición del contador; la aplicación depende de `AforoRepositoryPort`, cuyo contrato actual incluye `obtenerAforoActual()` y `actualizarAforo(transicionar)`. La infraestructura ofrece el adapter PostgreSQL y el adapter en memoria.

`AforoPostgresAdapter` ejecuta la transición dentro de una transacción y bloquea la fila con `SELECT ... FOR UPDATE` antes de actualizarla. Confirma con `COMMIT`, intenta `ROLLBACK` ante errores y libera el cliente. El servidor real compone la aplicación con PostgreSQL y cierra el adapter tras drenar las solicitudes al recibir `SIGTERM`.

La prueba PostgreSQL incluye persistencia entre instancias, rollback por rechazo del dominio y por error de PostgreSQL, y 20 entradas concurrentes que terminan con aforo 20 sin lost updates. Esta evidencia prueba la consistencia del contador en ese escenario; no prueba deduplicación por estudiante ni carga HTTP general.

## Pruebas y CI

```bash
npm test
```

La suite ejecuta pruebas base, contrato y PostgreSQL. La prueba PostgreSQL requiere `DATABASE_URL` apuntando a una base cuyo nombre incluya `test`; sin esa variable se omite. Los resultados validados para el estado actual son: base 12/12, contrato 11/11 y PostgreSQL 8/8.

El workflow actual de GitHub Actions ejecuta las pruebas base y de contrato, pero aún no aprovisiona PostgreSQL ni ejecuta la suite PostgreSQL. CI con PostgreSQL, SonarCloud/Quality Gate, Render, `render.yaml`/IaC, PostgreSQL gestionado y estimación de costos siguen pendientes.

## Estructura relevante

```text
src/
├── server.js
├── shared/logger.js
└── modules/aforo/
		├── domain/aforo.js
		├── application/
		│   ├── registrar-acceso.usecase.js
		│   └── ports/aforo-repository.port.js
		└── infrastructure/
				├── http/aforo.router.js
				└── persistence/
						├── aforo-postgres.adapter.js
						├── aforo-memoria.adapter.js
						└── schema.sql

scripts/init-db.js
tests/
├── domain/aforo.test.js
├── aforo.integration.test.js
├── contrato.test.js
├── health.test.js
└── postgres/aforo-postgres.integration.test.js
```

## Documentación

- [Problema y alcance](docs/problema.md).
- [Aspectos de arquitectura](docs/aspectos.md).
- [Contrato OpenAPI](docs/openapi.yaml).
- [Documentación arc42](docs/arc42/arc42_gimnasio_utb.md).
- [Diagramas C4](docs/c4/).
- [ADR 0001: Arquitectura Hexagonal](docs/adr/0001-arquitectura-hexagonal.md).
- [ADR 0003: Comunicación síncrona y asíncrona](docs/adr/0003-comunicacion-sincrona-asincrona.md).
- [Contextos delimitados](docs/contextos-delimitados.md).
- [Registro de uso de IA](docs/ia.md).
- [S9: cadena verificada de una porción construida con IA](docs/s9-cadena-verificada.md).
- [Auditoría de erosión arquitectónica](docs/auditoria-erosion.md).
- [Auditoría de dependencias](docs/auditoria-dependencias.md).

## Integrantes

- Sebastián Felipe Caicedo Acosta
- Pedro Luis Pallares De La Hoz
- Rodrigo Andrés Facio Lince Beltrán
