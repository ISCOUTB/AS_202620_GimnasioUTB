# Aspectos de Arquitectura

| ID | Aspecto | Estímulo | Fuente del estímulo | Entorno | Respuesta | Medida de respuesta | Tensión |
|---|---|---|---|---|---|---|---|
| S1 | Consistencia de datos | Se registra una entrada, una salida o una corrección manual de un estudiante. | Estudiante o encargado del gimnasio. | Operación normal del sistema de gestión de aforo. | El sistema valida el evento y actualiza de forma coherente el estado de ocupación del gimnasio. Evita que un estudiante sea contabilizado simultáneamente más de una vez dentro del gimnasio y registra las modificaciones manuales para su seguimiento. | El estado de ocupación debe permanecer coherente después de cada operación y no deben existir duplicidades en el conteo de estudiantes. | La consistencia de los datos puede entrar en tensión con la facilidad de operación, ya que permitir correcciones o registros manuales facilita el trabajo del encargado, pero aumenta el riesgo de errores humanos. |

## Desarrollo del aspecto S1

### Contexto

El sistema permitirá registrar la entrada y salida de estudiantes mediante códigos QR. También existirá la posibilidad de realizar una gestión manual por parte del encargado del gimnasio.

El sistema debe mantener un registro coherente de los estudiantes que se encuentran dentro y fuera del gimnasio, ya que esta información se utiliza para calcular los cupos disponibles y enviar notificaciones a los usuarios.

### Decisión arquitectónica inicial

El sistema mantendrá un estado centralizado de la ocupación del gimnasio.

Cada evento de entrada o salida deberá actualizar el registro de ocupación.

Los registros realizados manualmente por el encargado deberán quedar identificados para permitir su seguimiento y control.

El sistema deberá evitar que un mismo estudiante sea contabilizado simultáneamente más de una vez dentro del gimnasio.

### Riesgo

Si las entradas y salidas no se registran correctamente, el número de cupos disponibles puede ser incorrecto.

Esto podría ocasionar que el sistema informe que existen cupos cuando el gimnasio está lleno o que indique ocupación máxima cuando realmente existen espacios disponibles.
