# Evidencia de pruebas

## Comandos ejecutados

Los comandos de npm se ejecutaron con `npm.cmd` en PowerShell porque la política de ejecución local impide cargar `npm.ps1`.

| Comando | Resultado observado |
|---|---|
| `npm.cmd ci` | Correcto: restauró 129 paquetes; auditoría informó 0 vulnerabilidades. |
| `npm.cmd run test:mensajeria` | Correcto tras los cambios de esta revisión: 9 pruebas pasaron, 0 fallaron, 0 omitidas. |
| `npm.cmd run demo:mensajeria` | Correcto tras los cambios: el log `published` y los logs de consumidor comparten `eventId`/`correlationId`; procesó en el intento 1, la proyección mostró `ENTRADA: 1` y la DLQ quedó vacía. |
| `npm.cmd test` | Correcto tras los cambios: 12 pruebas base, 11 de contrato y 9 del taller pasaron; la prueba PostgreSQL se omitió. Total: 32 pasaron y 1 omitida. |
| `npm.cmd run arch:check` | Correcto tras los cambios: `no dependency violations found` (11 módulos, 15 dependencias). |

`tests/postgres/aforo-postgres.integration.test.js` se omite cuando falta `DATABASE_URL`; este entorno no configuró esa variable, por lo que no se verificó integración con PostgreSQL.

Las pruebas usan `node:test`, mocks del efecto de negocio y un `sleep` inyectado, sin broker, base de datos ni esperas deliberadas.

## Casos cubiertos

1. **Duplicado:** dos llamadas secuenciales con el mismo `eventId` devuelven `processed` y `duplicate`; el efecto se ejecuta una sola vez.
2. **Duplicado concurrente:** dos entregas del mismo ID mientras la primera sigue activa comparten el procesamiento y el manejador se invoca una vez.
3. **Fallo recuperable:** dos fallos temporales y un tercer intento exitoso; se comprueban las esperas `100` y `200` ms usando el mock de `sleep`.
4. **Agotamiento:** tres errores recuperables dejan el mensaje en la DLQ con `attempts: 3`; se prueban los dos intervalos de backoff.
5. **Fallo definitivo:** se envía a DLQ después de un intento, sin esperar ni reintentar.
6. **Contrato inválido:** campo obligatorio ausente y `schemaVersion: 2` producen rechazo controlado antes de llamar al procesador o incrementar los intentos.
7. **Observabilidad:** los logs del consumidor incluyen ID y tipo de evento, intento y resultado.
8. **Correlación de extremo a extremo:** comprobado por prueba y demo; el log `published` del productor y el log `processed` del consumidor registran el mismo `eventId`, `correlationId` y `eventType`.
9. **Entrega concurrente fallida:** comprobado por prueba; una entrega simultánea que comparte un procesamiento terminado en DLQ devuelve ese mismo fallo y no se informa incorrectamente como `duplicate` exitoso.

La demostración no es evidencia de persistencia, entrega en broker ni comportamiento de producción. Los logs se generan en cada ejecución; no se adjuntan capturas ni métricas persistentes.
