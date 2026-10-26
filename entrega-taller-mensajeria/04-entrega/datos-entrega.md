# Datos de entrega

## Integrantes

- Sebastián Felipe Caicedo Acosta
- Pedro Luis Pallares De La Hoz
- Rodrigo Andrés Facio Lince Beltrán

- **Asignatura:** [Arquitectura de Software]
- **Nombre del taller:** Taller de mensajería asíncrona
- **Repositorio:** [https://github.com/ISCOUTB/AS_202620_GimnasioUTB](https://github.com/ISCOUTB/AS_202620_GimnasioUTB)
- **URL del commit final:** https://github.com/ISCOUTB/AS_202620_GimnasioUTB/commit/cccd2c0b195824307afdfb5befa5826eb3cd6393

## Resumen de lo implementado

Prototipo académico aislado con productor, contrato de evento versión 1, cola en memoria, consumidor idempotente, reintentos con backoff, DLQ en memoria y logs correlacionados. No integra ni modifica el endpoint real de acceso al gimnasio.

## Pruebas ejecutadas y resultados

Comprobado desde la carpeta de entrega: `npm.cmd test` — 9 pasaron, 0 fallaron, 0 omitidas. `npm.cmd run demo:mensajeria` — procesó el mensaje publicado en el intento 1 y terminó con DLQ vacía. En la raíz del proyecto, `npm.cmd test` registró 32 pasaron y 1 omitida (prueba PostgreSQL sin `DATABASE_URL`). Detalle: [evidencia-pruebas.md](../01-documentacion/evidencia-pruebas.md).

## Limitaciones conocidas

La cola, deduplicación y DLQ son volátiles; no existe broker real ni se garantizan entrega durable, at-least-once o exactly-once. Detalles: [límites-experimento.md](../01-documentacion/limites-experimento.md).
