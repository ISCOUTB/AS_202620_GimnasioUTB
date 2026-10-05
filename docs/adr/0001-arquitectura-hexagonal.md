# ADR-0001: Adoptar Arquitectura Hexagonal (Ports and Adapters) para el backend

## Estado

Aceptada. Este archivo es la versión canónica de ADR-0001.

## Contexto

El backend actual del Gimnasio UTB implementa un módulo de aforo en Node.js y Express. La regla de negocio debe poder probarse sin depender del framework HTTP ni del driver de PostgreSQL, y la persistencia debe poder sustituirse mediante un contrato.

La arquitectura debía dar soporte a pruebas del dominio aisladas y a una integración real con PostgreSQL, sin convertir el backend en una colección de microservicios.

## Decisión

Se adopta **Arquitectura Hexagonal (Ports and Adapters)** para un **monolito modular**. `src/server.js` es el composition root: crea la aplicación, selecciona e inyecta el repositorio, registra rutas y compone endpoints operativos.

El flujo de escritura implementado es:

```text
HTTP Router -> Use Case -> AforoRepositoryPort -> Adapter -> PostgreSQL
```

El caso de uso proporciona una función de transición que utiliza `aplicarAcceso` del dominio. El adapter PostgreSQL ejecuta la actualización transaccional. El dominio no depende de PostgreSQL, y el caso de uso depende del contrato del repositorio, no directamente de un adapter.

Componentes implementados:

- `src/server.js`: composition root.
- `src/modules/aforo/infrastructure/http/aforo.router.js`: `crearAforoRouter`.
- `src/modules/aforo/application/registrar-acceso.usecase.js`: `crearRegistrarAccesoUseCase`.
- `src/modules/aforo/application/consultar-aforo.usecase.js`: `crearConsultarAforoUseCase`.
- `src/modules/aforo/domain/aforo.js`: `aplicarAcceso`.
- `src/modules/aforo/application/ports/aforo-repository.port.js`: `AforoRepositoryPort`.
- `src/modules/aforo/infrastructure/persistence/aforo-postgres.adapter.js`: `AforoPostgresAdapter`, persistencia real del servidor.
- `src/modules/aforo/infrastructure/persistence/aforo-memoria.adapter.js`: `AforoMemoriaAdapter`, alternativa en memoria utilizada principalmente para pruebas e inyección.
- `src/shared/logger.js`: logs estructurados JSON.

`GET /api/v1/aforo` utiliza `crearConsultarAforoUseCase`, compuesto desde `server.js` e inyectado en el router. `/health`, `/ready` y `/metrics` también se componen desde `server.js`.

## Alcance y evidencia

La arquitectura descrita corresponde al módulo de aforo actual. PostgreSQL es el adapter de persistencia utilizado por el servidor real; `createApp()` permite usar memoria por defecto para pruebas. La transacción y el bloqueo de concurrencia en PostgreSQL se detallan en [ADR-0004](0004-concurrencia-postgresql.md).

## Alternativas consideradas

### A. Arquitectura en capas

Organiza el sistema por capas técnicas, por ejemplo controladores, servicios y repositorios. Puede ser sencilla al inicio, pero no impone por sí misma la regla de que el dominio permanezca aislado de Express y PostgreSQL.

### B. Monolito modular sin separación hexagonal

Organiza el código por módulos de dominio, pero deja a cada módulo definir sus propias dependencias. Ofrece menos estructura explícita para sustituir adapters y probar reglas de negocio aisladas.

### C. Arquitectura Hexagonal (elegida)

Mantiene la regla de negocio aislada y permite conectar adapters mediante puertos. Su estructura añade más archivos y requiere respetar las dependencias entre capas.

## Consecuencias

**Positivas**

- El dominio puede probarse como lógica pura, sin Express ni conexión a PostgreSQL.
- El caso de uso utiliza un puerto y puede componerse con PostgreSQL o memoria.
- La infraestructura concreta queda fuera de las reglas de transición del aforo.

**Negativas**

- La separación requiere disciplina para evitar accesos directos a adapters desde capas que deberían depender de puertos.
- La estructura agrega complejidad frente a una implementación pequeña sin capas diferenciadas.

## Evolución futura

**FUTURO / OBJETIVO, no implementado:** integración funcional del cliente Flutter, QR, identidad de estudiantes, autenticación, roles, historial, deduplicación por estudiante, operación de apertura/cierre, WebSocket y FCM. El repositorio sí contiene un proyecto Flutter con UI, pero no se ha verificado su integración con el backend. El deployment operativo actual usa Dokploy y Docker Compose; Render no es la plataforma actual, PostgreSQL gestionado no está desplegado y el Compose versionado no constituye IaC completa.

## Referencias

- [arc42, estrategia de solución](../arc42/arc42_gimnasio_utb.md#4-estrategia-de-solución).
- [Aspecto S1](../aspectos.md#desarrollo-del-aspecto-s1).
- [ADR-0004: concurrencia PostgreSQL](0004-concurrencia-postgresql.md).
