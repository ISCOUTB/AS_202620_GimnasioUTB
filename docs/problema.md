# Ficha del Problema

## Gimnasio UTB

### Integrantes del equipo

- Sebastián Felipe Caicedo Acosta
- Pedro Luis Pallares De La Hoz
- Rodrigo Andrés Facio Lince Beltrán

## Problema real y acotado

El gimnasio de la Universidad Tecnológica de Bolívar alcanza su máxima capacidad en ciertos horarios, y los estudiantes solo se enteran de esta situación al llegar e intentar ingresar.

Esto genera desplazamientos innecesarios, pérdida de tiempo y una mala experiencia para los estudiantes que desean utilizar las instalaciones.

Además, el estado del gimnasio no depende únicamente de un horario fijo. Aunque existe un horario habitual de funcionamiento, el gimnasio puede encontrarse cerrado cuando el encargado no está presente.

## Idea original y aporte del prototipo

Se propone una aplicación móvil, potencialmente integrable a la aplicación institucional de la UTB.

La aplicación permitirá llevar el registro de entrada y salida de los estudiantes mediante el escaneo de un código QR o mediante gestión manual realizada por el encargado del gimnasio.

El sistema mostrará los cupos disponibles en tiempo real y enviará notificaciones personalizadas teniendo en cuenta:

- Las horas disponibles o preferidas por el estudiante.
- La ocupación actual del gimnasio.
- Los cupos disponibles.
- El estado actual del gimnasio.
- La disponibilidad real del encargado.

## Stakeholders y beneficiarios

### Estudiantes de la UTB

Son los usuarios finales del sistema. Podrán consultar la disponibilidad del gimnasio y recibir notificaciones relacionadas con los cupos y horarios.

### Encargado(s) del gimnasio

Son los usuarios operativos encargados de gestionar o supervisar el registro de entrada y salida de los estudiantes.

### Bienestar Universitario y área administrativa

Son beneficiarios indirectos, ya que el sistema permitirá mejorar la gestión del aforo y obtener información sobre la utilización del gimnasio.

## Objetivo del proyecto

Diseñar una solución de software que permita conocer la disponibilidad real del gimnasio de la Universidad Tecnológica de Bolívar y mejorar la gestión de su aforo mediante el registro de entradas y salidas de estudiantes.

## Alcance inicial

El prototipo contemplará:

- Registro de entrada de estudiantes.
- Registro de salida de estudiantes.
- Escaneo de códigos QR.
- Gestión manual por parte del encargado.
- Consulta de cupos disponibles.
- Visualización del estado abierto o cerrado del gimnasio.
- Notificaciones relacionadas con la disponibilidad.

- ## Tensiones de calidad enfrentadas

### Tensión 1: Consistencia de datos vs. Facilidad de operación

El sistema necesita mantener información confiable sobre la cantidad real de estudiantes que se encuentran dentro del gimnasio para calcular correctamente los cupos disponibles.

Sin embargo, exigir un registro estricto de cada entrada y salida mediante código QR puede dificultar la operación cuando existen problemas de uso, olvidos por parte de los estudiantes o situaciones que requieren intervención manual.

Por esta razón, existe una tensión entre mantener una alta consistencia de los datos y permitir una operación flexible y sencilla para los usuarios y el encargado del gimnasio.

### Tensión 2: Información en tiempo real vs. Flexibilidad ante situaciones operativas

El sistema busca mostrar la disponibilidad real del gimnasio en tiempo real. Para lograrlo, es necesario que los cambios en las entradas, salidas y el estado del gimnasio se reflejen rápidamente en el sistema.

Sin embargo, el gimnasio también puede presentar situaciones operativas que requieren ajustes manuales, como correcciones realizadas por el encargado, cambios en el estado de apertura o problemas en el registro mediante códigos QR.

Por lo tanto, existe una tensión entre mantener la información actualizada inmediatamente y permitir la flexibilidad necesaria para gestionar situaciones excepcionales o correcciones manuales.
