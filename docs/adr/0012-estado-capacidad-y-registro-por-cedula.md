# ADR-0012: Estado del gimnasio, capacidad máxima y registro por cédula

## Estado

Aceptada e implementada (22 de noviembre de 2026). Completa el alcance del
MVP: abrir y cerrar el gimnasio y la capacidad máxima figuraban como
FUTURO en arc42 §1.2.

## Contexto

La app mostraba el aforo, pero no la capacidad máxima ni el porcentaje de
ocupación, y el encargado no podía cerrar el gimnasio. El equipo confirmó
estos requisitos:

- El encargado abre y cierra el gimnasio y puede indicar el motivo del
  cierre; estudiantes y encargado ven el estado.
- Con el gimnasio cerrado se bloquean los nuevos ingresos, pero quienes ya
  están dentro siguen registrados hasta que salen.
- El encargado define la capacidad máxima; la app muestra aforo, porcentaje
  de ocupación y cupos.
- Si un ingreso supera la capacidad, se advierte al encargado **antes** de
  registrarlo y él decide si lo registra igualmente.
- Además del QR, el encargado puede buscar y registrar a un estudiante por
  su cédula (por ejemplo, si no tiene el celular).
- Los botones de registro sin identificación se conservan para visitantes.
- No se necesita historial de movimientos ni estadísticas por día.

## Decisión

1. **El estado vive en la fila única de `aforo_estado`:** columnas
   `capacidad_maxima` (1 a 10000, 30 por defecto), `abierto` y
   `motivo_cierre` (hasta 200 caracteres, solo con el gimnasio cerrado,
   garantizado con `CHECK`). La migración `20261122_002` las agrega a bases
   existentes sin perder el aforo.
2. **Las reglas están en el dominio** (`aforo.js`):
   `aplicarAccesoConEstado` rechaza las entradas con el gimnasio cerrado
   (`GimnasioCerradoError`) y exige confirmación cuando una entrada supera la
   capacidad (`CapacidadSuperadaError`). Las salidas siempre se permiten.
   `cambiarApertura` y `cambiarCapacidad` validan los cambios del encargado.
3. **La confirmación es un segundo intento, decidido por el servidor.** Una
   entrada que supera la capacidad responde `409 CAPACIDAD_SUPERADA` con el
   aforo y la capacidad; la app pregunta al encargado y repite la misma
   solicitud con `confirmarExcesoCapacidad: true`. Como la regla se evalúa
   dentro de la transacción que bloquea `aforo_estado` (ADR-0004), dos
   encargados no pueden pasar la capacidad sin que ambos lo confirmen.
4. **QR y cédula comparten un caso de uso**
   (`registrar-acceso-estudiante.usecase.js`): identidad identifica al
   estudiante y alterna su estado dentro de la transacción del aforo. Si el
   dominio rechaza el ingreso, se revierte todo y el QR no se gasta, así que
   sirve para el segundo intento confirmado.
5. **La búsqueda por cédula usa `POST /api/v1/estudiantes/busqueda`**, para
   que la cédula no quede en la URL ni en los registros de acceso. El rol de
   la API obtiene `SELECT` sobre `estudiantes.cedula_sintetica`; nunca la
   devuelve en una respuesta.
6. **La app valida la contraseña de encargado al ingresar**
   (`POST /api/v1/operador/verificacion`) y un `EstadoGimnasioController`
   refresca el estado cada 15 segundos para todas las pestañas.

## Alternativas consideradas

1. **Registrar y avisar después** al superar la capacidad. Rechazada por el
   equipo: el encargado debe decidir antes de que el ingreso quede registrado.
2. **Que la app compare aforo y capacidad antes de enviar.** Rechazada: con el
   QR la app no sabe si será entrada o salida, y el dato local puede estar
   desactualizado; solo el servidor, dentro de la transacción, lo sabe.
3. **Tabla aparte para la configuración del gimnasio.** Rechazada: habría que
   bloquear dos filas en cada registro; la fila única ya se bloquea.
4. **Quitar los botones sin identificación.** Rechazada por el equipo: se
   necesitan para visitantes sin cuenta. Se documenta que solo cambian el
   contador.
5. **Buscar por cédula con `GET ?cedula=`.** Rechazada: la cédula quedaría en
   los registros del proxy de Dokploy.

## Consecuencias

- El contrato pasa a 4.0.0: una entrada que antes siempre se registraba puede
  responder 409. Se conserva `/api/v1` porque el único cliente es la app.
- Un cliente antiguo sin la confirmación solo verá el mensaje del 409.
- Las entradas sin identificación cuentan para el aforo pero no para el
  estado individual de ningún estudiante.
- `DEMO_STUDENTS` admite un quinto campo opcional con la cédula; sin ella, ese
  estudiante no se puede buscar por cédula.
- Sigue sin existir historial de movimientos (ADR-0006 permanece como diseño).
