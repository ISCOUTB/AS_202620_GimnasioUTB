# Evidencia de pruebas

## Comandos ejecutados

Los comandos se ejecutaron con `npm.cmd` en PowerShell. Se indica explícitamente si se ejecutaron en la raíz del repositorio o en la carpeta autónoma de entrega.

| Comando | Resultado observado |
|---|---|
| Desde `entrega-taller-mensajeria`: `npm.cmd run demo:mensajeria` | Correcto: publicación y procesamiento en el intento 1; la proyección de demostración mostró `ENTRADA: 1`, métricas con `processed: 1` y DLQ vacía. Los logs `published`, `attempt_started` y `processed` compartieron `eventId` y `correlationId`. |
| Desde `entrega-taller-mensajeria`: `npm.cmd test` | Correcto: 9 pruebas pasaron, 0 fallaron, 0 omitidas. Duración observada: aproximadamente 111 ms. |
| Desde la raíz del repositorio: `npm.cmd test` | Correcto: 12 pruebas base, 11 de contrato y 9 del taller pasaron; la prueba PostgreSQL se omitió. Total: 32 pasaron y 1 omitida. |

`tests/postgres/aforo-postgres.integration.test.js` se omite cuando falta `DATABASE_URL`; esta ejecución no tenía esa variable configurada, por lo que no se verificó integración con PostgreSQL. El demo y las pruebas de la carpeta autónoma no usan base de datos ni servicios externos.

Las pruebas usan `node:test`, mocks del efecto de negocio y un `sleep` inyectado, sin broker, base de datos ni esperas deliberadas. No se crearon capturas ni evidencia simulada.

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
