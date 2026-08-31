# Aspectos de Arquitectura

| ID | Aspecto | Estímulo | Fuente del estímulo | Entorno | Respuesta | Medida de respuesta | Tensión |
|---|---|---|---|---|---|---|---|
| S1 | Consistencia de datos | Se registra una entrada, una salida o una corrección manual de un estudiante. | Estudiante o encargado del gimnasio. | Operación normal del sistema de gestión de aforo. | El sistema valida el evento y actualiza de forma coherente el estado de ocupación del gimnasio. Evita que un estudiante sea contabilizado simultáneamente más de una vez dentro del gimnasio y registra las modificaciones manuales para su seguimiento. | El estado de ocupación debe permanecer coherente después de cada operación y no deben existir duplicidades en el conteo de estudiantes. | La consistencia de los datos puede entrar en tensión con la facilidad de operación, ya que permitir correcciones o registros manuales facilita el trabajo del encargado, pero aumenta el riesgo de errores humanos. |

## Desarrollo del aspecto S1

### Contexto

El sistema permitirá registrar la entrada y salida de estudiantes mediante códigos QR. También existirá la posibilidad de realizar una gestión manual por parte del encargado del gimnasio.

El sistema debe mantener un registro coherente de los estudiantes que se encuentran dentro y fuera del gimnasio, ya que esta información se utiliza para calcular los cupos disponibles y enviar notificaciones a los usuarios.

# Aspectos de Arquitectura

| ID | Aspecto | Estímulo | Fuente del estímulo | Entorno | Respuesta | Medida de respuesta | Tensión | Decisiones / ADR |
|---|---|---|---|---|---|---|---|---|
| S1 | Consistencia de datos | Se registra una entrada, una salida o una corrección manual de un estudiante. | Estudiante o encargado del gimnasio. | Operación normal del sistema de gestión de aforo. | El sistema valida el evento y actualiza de forma coherente el estado de ocupación del gimnasio. Evita que un estudiante sea contabilizado simultáneamente más de una vez dentro del gimnasio y registra las modificaciones manuales para su seguimiento. | El estado de ocupación debe permanecer coherente después de cada operación y no deben existir duplicidades en el conteo de estudiantes. | La consistencia de los datos puede entrar en tensión con la facilidad de operación, ya que permitir correcciones o registros manuales facilita el trabajo del encargado, pero aumenta el riesgo de errores humanos.[ADR-0001](./adr/0001-arquitectura-hexagonal.md) |
## Desarrollo del aspecto S1

### Contexto

El sistema permitirá registrar la entrada y salida de estudiantes mediante códigos QR. También existirá la posibilidad de realizar una gestión manual por parte del encargado del gimnasio.

El sistema debe mantener un registro coherente de los estudiantes que se encuentran dentro y fuera del gimnasio, ya que esta información se utiliza para calcular los cupos disponibles y enviar notificaciones a los usuarios.

### Decisión arquitectónica inicial

- El sistema mantendrá un estado centralizado de la ocupación del gimnasio.
- Cada evento de entrada o salida deberá actualizar el registro de ocupación.
- Los registros realizados manualmente por el encargado deberán quedar identificados para permitir su seguimiento y control.
- El sistema deberá evitar que un mismo estudiante sea contabilizado simultáneamente más de una vez dentro del gimnasio.

> **Decisión formalizada:** Para aislar la lógica de consistencia de aforo (S1 / ES1) y permitir pruebas del dominio desacopladas de la infraestructura, se definió la adopción de Arquitectura Hexagonal. Ver detalle y trade-offs en el documento > [ADR-0001: Adoptar Arquitectura Hexagonal](./adr/0001-arquitectura-hexagonal.md).
> 
### Riesgo

Si las entradas y salidas no se registran correctamente, el número de cupos disponibles puede ser incorrecto.

Esto podría ocasionar que el sistema informe que existen cupos cuando el gimnasio está lleno o que indique ocupación máxima cuando realmente existen espacios disponibles.

### Trazabilidad de Aspectos hasta Pruebas

A continuación se detalla cómo el escenario de calidad más crítico aterriza en el código y cómo se comprobará.

| Aspecto / Requerimiento | Escenario de Calidad Asociado | Decisión Arquitectónica (ADR) | Implementación (Componentes / Código) | Pruebas (Validación planificada) |
| :--- | :--- | :--- | :--- | :--- |
| **Consistencia transaccional en el conteo de aforo.** El sistema no debe perder ni duplicar registros cuando múltiples usuarios acceden al mismo tiempo. | **S1 (Consistencia de datos):** Dos estudiantes escanean su QR de entrada simultáneamente y el sistema procesa ambos sin perder el conteo. | **ADR-0001 (Arquitectura Hexagonal)** para garantizar transacciones ACID fuera de la lógica de dominio. | Implementación del `AforoRepositoryPort` en la capa de `infrastructure`. Uso del driver `pg` para ejecutar inserciones SQL con bloqueos por transacción (Row-level locking). | **Pruebas de Integración y Carga:** Ejecución de un script automatizado que lanza 20 peticiones concurrentes a `POST /api/v1/aforo/acceso`. Se verificará que el conteo final en la base de datos coincida exactamente con las peticiones exitosas (código 201), sin errores de condición de carrera. |
