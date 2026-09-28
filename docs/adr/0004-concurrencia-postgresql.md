# ADR-0004: Control de concurrencia y consistencia del aforo mediante PostgreSQL

## Estado

Aceptada.

## Contexto

El backend mantiene un contador actual de aforo. Varias operaciones de entrada o salida pueden ocurrir concurrentemente.

Una implementación basada simplemente en leer el contador, modificarlo en memoria y guardar el resultado podría perder actualizaciones si varias operaciones leen simultáneamente el mismo valor. El contador es un estado compartido y debe mantenerse consistente para las transiciones aceptadas.

## Decisión

Se utiliza PostgreSQL como mecanismo de persistencia y consistencia para las actualizaciones concurrentes del contador. `AforoPostgresAdapter` ejecuta las escrituras en una transacción:

```text
BEGIN
-> SELECT ... FOR UPDATE
-> transición del dominio
-> UPDATE
-> COMMIT
```

Ante un error después de iniciar la transacción, el adapter intenta:

```text
ROLLBACK
```

`SELECT ... FOR UPDATE` bloquea la fila de estado seleccionada mientras la transacción está activa. De esta forma, las actualizaciones concurrentes sobre esa fila se serializan. El adapter gestiona la conexión, la transacción, el bloqueo, la actualización y la confirmación o reversión; la transición sigue definida por la función de dominio `aplicarAcceso`.

El dominio no depende directamente de PostgreSQL. El caso de uso solicita `actualizarAforo(transicionar)` mediante `AforoRepositoryPort`, cuya implementación real en el servidor es `AforoPostgresAdapter`.

## Consecuencias positivas

- Evita lost updates en las actualizaciones concurrentes sobre la fila protegida.
- Mantiene la transición y su escritura dentro de una transacción.
- Permite intentar rollback ante errores y conservar el estado anterior cuando la transacción no confirma.
- Mantiene la persistencia real del contador en PostgreSQL.
- Conserva la regla de negocio en el dominio, sin acoplarla al driver.

## Consecuencias y limitaciones

Esta decisión no implica:

- deduplicación de estudiantes;
- identidad de usuario;
- historial de entradas o salidas;
- detección de accesos repetidos de una misma persona;
- garantía de resultados ante cualquier carga imaginable;
- alta disponibilidad;
- despliegue cloud.

La evidencia actual es una prueba de integración PostgreSQL que ejecuta 20 operaciones concurrentes y comprueba que el estado final coincide con esas entradas. **Esta evidencia valida la estrategia de concurrencia del adaptador bajo el escenario probado; no constituye una prueba de carga ni una garantía de comportamiento para cargas arbitrarias.**

## Alternativas consideradas

### Leer, modificar y guardar sin bloqueo

No se eligió porque varias operaciones podrían leer el mismo valor y sobrescribirse entre sí, perdiendo actualizaciones.

### Bloqueo optimista con versión

Podría detectar conflictos mediante una versión del registro y requerir reintentos. No se adoptó para el alcance actual, que protege una única fila centralizada con el bloqueo de PostgreSQL.

### Redis u otro mecanismo externo

No se añadió otra infraestructura. PostgreSQL ya es la persistencia real y `SELECT ... FOR UPDATE` controla directamente las actualizaciones concurrentes de la fila de estado.

## Evidencia

- Implementación: `src/modules/aforo/infrastructure/persistence/aforo-postgres.adapter.js`.
- Pruebas: `tests/postgres/aforo-postgres.integration.test.js`.
- El subtest de concurrencia se denomina `serializa 20 entradas concurrentes sin lost updates`. En ese escenario ejecuta 20 entradas concurrentes y verifica que el valor final sea 20.
- El mismo archivo comprueba persistencia entre instancias, rechazo de salida cuando el aforo está en cero y rollback ante un error producido por PostgreSQL.

## Relación con otros ADR

- [ADR-0001](0001-arquitectura-hexagonal.md) define Ports and Adapters y la separación del dominio respecto de la infraestructura.
- [ADR-0003](0003-comunicacion-sincrona-asincrona.md) documenta la API REST síncrona y que la persistencia termina antes de responder.