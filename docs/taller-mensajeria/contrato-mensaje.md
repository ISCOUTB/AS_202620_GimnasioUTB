# Contrato del mensaje

## Evento `aforo.acceso.registrado`, versión 1

El productor genera un objeto JSON con esta estructura:

| Campo | Tipo | Obligatorio | Regla |
|---|---|---:|---|
| `eventId` | string | Sí | Identificador no vacío y único del evento; el productor usa UUID. |
| `eventType` | string | Sí | Valor fijo `aforo.acceso.registrado`. |
| `occurredAt` | string | Sí | Fecha ISO 8601 válida con zona horaria, normalmente UTC (`Z`). |
| `schemaVersion` | integer | Sí | Valor `1`, que identifica el contrato del evento. |
| `data` | object | Sí | Contiene únicamente `tipoAcceso`. |
| `data.tipoAcceso` | string | Sí | `ENTRADA` o `SALIDA`. No lleva `estudianteId` ni otros datos personales. |

### Mensaje válido

```json
{
  "eventId": "c84c8f89-e00b-4b1b-b44c-bc1b2bf64571",
  "eventType": "aforo.acceso.registrado",
  "occurredAt": "2026-10-25T19:00:00.000Z",
  "schemaVersion": 1,
  "data": {
    "tipoAcceso": "ENTRADA"
  }
}
```

Se toleran propiedades adicionales en el nivel de la envoltura para que un consumidor v1 pueda ignorar metadatos opcionales futuros. El objeto `data` v1 es deliberadamente estricto: solo acepta `tipoAcceso`, tanto para mantener el payload mínimo como para no empezar a transportar datos no revisados.

### Mensajes inválidos

Falta `eventId`:

```json
{
  "eventType": "aforo.acceso.registrado",
  "occurredAt": "2026-10-25T19:00:00.000Z",
  "schemaVersion": 1,
  "data": { "tipoAcceso": "ENTRADA" }
}
```

Versión no soportada:

```json
{
  "eventId": "c84c8f89-e00b-4b1b-b44c-bc1b2bf64571",
  "eventType": "aforo.acceso.registrado",
  "occurredAt": "2026-10-25T19:00:00.000Z",
  "schemaVersion": 2,
  "data": { "tipoAcceso": "ENTRADA" }
}
```

También se rechazan fechas no ISO, tipos de evento desconocidos, valores distintos de `ENTRADA`/`SALIDA`, datos ausentes y cualquier propiedad adicional dentro de `data`. El consumidor lanza `InvalidMessageError` antes de ejecutar el manejador y registra el rechazo; no consume un intento de procesamiento ni agrega el mensaje a la DLQ de fallos del manejador.

## Versionado y compatibilidad

`schemaVersion` es un entero de versión mayor para la forma de `data` y la semántica del evento. El consumidor implementado solo acepta la versión 1. Un consumidor que aún no entienda una versión rechaza explícitamente el mensaje; no interpreta silenciosamente una forma nueva.

- Las propiedades opcionales de envoltura que no cambien la semántica son ignoradas por consumidores anteriores y no requieren cambio de versión.
- Cambiar, eliminar o añadir campos de `data`, modificar los valores de `tipoAcceso` o cambiar la semántica requiere acordar un contrato compatible o incrementar `schemaVersion` y desplegar soporte explícito antes de publicar esa versión.
- El productor no emite campos opcionales ni datos personales en este experimento.
- El taller no implementa negociación de capacidades, registro de esquemas ni despliegue gradual; la regla descrita es el acuerdo para evolución futura.
