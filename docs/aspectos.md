# Aspectos de Arquitectura

## Aspecto declarado: Consistencia de datos

La consistencia de los datos es un aspecto de calidad fundamental para la arquitectura del sistema de gestión de aforo del Gimnasio UTB.

El sistema debe mantener un registro coherente de los estudiantes que se encuentran dentro y fuera del gimnasio, ya que la información de ocupación se utiliza para calcular los cupos disponibles y enviar notificaciones a los usuarios.

## Contexto

El sistema permitirá registrar la entrada y salida de estudiantes mediante códigos QR. Sin embargo, también existirá la posibilidad de realizar una gestión manual por parte del encargado del gimnasio.

Esta combinación genera una tensión entre la consistencia de los datos y la facilidad de operación.

El escaneo obligatorio de entrada y salida permite obtener información más confiable sobre la ocupación actual. Sin embargo, puede aumentar la carga operativa y depender del correcto uso del sistema por parte de los usuarios.

Por otro lado, permitir correcciones o registros manuales facilita la operación, pero aumenta el riesgo de errores humanos.

## Decisión arquitectónica inicial

El sistema mantendrá un estado centralizado de la ocupación del gimnasio.

Cada evento de entrada o salida deberá actualizar el registro de ocupación.

Los registros realizados manualmente por el encargado deberán quedar identificados para permitir su seguimiento y control.

El sistema deberá evitar que un mismo estudiante sea contabilizado simultáneamente más de una vez dentro del gimnasio.

## Riesgo

Si las entradas y salidas no se registran correctamente, el número de cupos disponibles puede ser incorrecto.

Esto podría ocasionar que el sistema informe que existen cupos cuando el gimnasio está lleno o que indique ocupación máxima cuando realmente existen espacios disponibles.
