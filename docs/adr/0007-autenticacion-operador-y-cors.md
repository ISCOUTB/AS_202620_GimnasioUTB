# ADR-0007: Proteger el registro de accesos con un token de operador y limitar CORS a una lista blanca

## Estado

Aceptada — 1 de noviembre de 2026. **Implementada** en `src/shared/http/seguridad.js`, `src/server.js` y el cliente Flutter. Medida provisional: se revisa cuando exista el contexto Identidad (ver "Cuándo revisar").

## Contexto

El modelado de amenazas de S13 ([evidencia](../s13-seguridad-amenazas.md)) encontró que la amenaza de mayor riesgo del sistema era **T1**: `POST /api/v1/aforo/acceso` no pedía ninguna credencial. El repositorio es público, el README documenta el endpoint con ejemplos y la URL de producción es pública. Cualquiera podía cambiar el único dato del sistema con un `curl`.

Además, la app Flutter tiene que poder llamar a la API:

- Las compilaciones nativas (Windows, Android) no tienen restricción de origen.
- La compilación **web** corre en un navegador, que bloquea las respuestas de otro origen si la API no envía cabeceras CORS. La API no enviaba ninguna.

Restricciones que pesan:

- No existe el contexto Identidad: no hay usuarios, contraseñas ni roles (arc42 §8.5).
- El equipo no controla un proveedor de identidad institucional para este proyecto.
- La consulta del aforo debe seguir siendo pública: es la función principal para estudiantes.
- La regla de versionado del contrato dice que volver obligatorio algo que era opcional es un cambio MAJOR con nuevo prefijo (`/api/v2`).

## Opciones evaluadas

### A. Dejarlo abierto y documentar el riesgo

### B. Token de operador compartido (`Authorization: Bearer`) en las escrituras

Un secreto de al menos 32 caracteres en la variable `OPERADOR_TOKEN` del servidor. El middleware compara hashes SHA-256 con `timingSafeEqual`. Si la variable falta o es corta, las escrituras responden `503` (falla cerrado). La app lo pide en la pantalla de inicio para el modo operación y lo guarda solo en memoria.

### C. Usuarios y roles con JWT u OAuth institucional

Cuentas por operador, inicio de sesión y verificación de rol en el backend.

### D. Restringir por red (lista de IP del gimnasio o VPN)

### Para CORS

- **C1.** `Access-Control-Allow-Origin: *`.
- **C2.** Lista blanca configurable (`CORS_ORIGINS`) que devuelve el origen solo si coincide.
- **C3.** Sin CORS (solo apps nativas).

## Criterios y evaluación

| Criterio | A. Abierto | **B. Token compartido** | C. Usuarios y roles | D. Por red |
|---|---|---|---|---|
| Cierra T1 (cualquiera de internet) | No | **Sí** | Sí | Sí |
| Atribución por operador (T3) | No | No | Sí | No |
| Requiere contexto Identidad | No | **No** | Sí: tablas, contraseñas o IdP, recuperación de cuenta | No |
| Costo de implementación | Cero | **Un middleware, un campo en la app, pruebas** | Semanas | Configurar red; fuera de nuestro control en Dokploy |
| Funciona con el operador en datos móviles | Sí | **Sí** | Sí | **No** |
| Riesgo si se filtra la credencial | — | Hay que rotar un secreto para todos | Se revoca una cuenta | — |

| Criterio | C1. `*` | **C2. Lista blanca** | C3. Sin CORS |
|---|---|---|---|
| Habilita Flutter web | Sí | **Sí** | No |
| Una página ajena puede leer respuestas desde el navegador de un usuario | Sí | **No** | No |
| Configuración por entorno | No hace falta | **`CORS_ORIGINS`** | — |

## Decisión

Se elige **B + C2**.

- **A** se rechaza: deja abierto el riesgo más alto del sistema (9 de 9) por ahorrarse unas decenas de líneas.
- **C** es el destino correcto, pero exige construir el contexto Identidad completo. No se justifica hacerlo por esta amenaza sola, y B cierra la parte de T1 que viene de internet.
- **D** no sirve con operadores que usan el celular con datos móviles, y depende de una configuración del proxy de Dokploy que el equipo no controla.
- **C1** abriría la lectura de respuestas a cualquier sitio; **C3** dejaría sin funcionar la compilación web.

Reglas de implementación:

1. La autenticación se registra en el **composition root** (`server.js`) **antes** del parseo del cuerpo, sobre `POST /api/v1/aforo/acceso`. El router y el caso de uso no cambian: no saben que existe un token. El middleware vive en `src/shared/http/` porque no conoce ningún módulo (regla M2 de `arch:check`).
2. **Falla cerrado.** Sin `OPERADOR_TOKEN` válido, el registro responde `503`; las lecturas siguen funcionando.
3. El token **nunca** se registra en logs ni se guarda en el dispositivo.
4. Las lecturas (`GET`) siguen siendo públicas.
5. CORS devuelve el origen exacto solo si está en la lista; envía `Vary: Origin` y permite solo `GET`, `POST`, `OPTIONS` y las cabeceras `Content-Type` y `Authorization`.

### Excepción a la regla de versionado del contrato

Exigir el token en `POST /acceso` es un cambio incompatible. La regla del contrato pediría publicarlo como `/api/v2` y mantener `/api/v1`. **No se hace así**, y la excepción queda explícita:

- Mantener `/api/v1` sin autenticación dejaría abierta exactamente la vulnerabilidad que se está cerrando.
- El único consumidor es la app Flutter del equipo, que se actualiza en el mismo cambio.
- El contrato sube a **2.0.0** (se comunica el cambio incompatible) pero conserva el prefijo `/api/v1`. La descripción de `docs/openapi.yaml` lo explica.

Si apareciera un consumidor externo antes de una corrección de seguridad futura, esta excepción no aplica: se publica `/api/v2` y se anuncia un plazo de retiro.

## Consecuencias

### Positivas

- T1 pasa de riesgo 9 a bajo; T5 baja porque las peticiones sin token no llegan a PostgreSQL ni se parsean.
- Flutter web puede usar la API desde los orígenes que el equipo configure.
- El cambio es reversible y no toca dominio, aplicación ni adaptadores de persistencia.
- Las pruebas de contrato fallan si alguien quita la autenticación (`401` documentado y verificado).

### Negativas y costos

- **Sin atribución:** todos los operadores comparten el mismo secreto (T3, riesgo aceptado en arc42 §11.4).
- **Rotar el token** obliga a avisar a todos los operadores y redeplegar.
- **Hay que configurar `OPERADOR_TOKEN` en Dokploy;** hasta entonces el registro de accesos en producción responde `503`.
- El token viaja en cada petición: depende de HTTPS (T13).

## Cuándo revisar esta decisión

- Cuando se implemente el contexto Identidad: reemplazar B por C y retirar `OPERADOR_TOKEN`.
- Si hay más de un punto de registro (varios operadores simultáneos que deban distinguirse).
- Si el token se filtra más de una vez en un semestre.
- Si un consumidor externo empieza a usar la API (deja de valer la excepción de versionado).

## Evidencia y referencias

- [Evidencia S13: modelado de amenazas](../s13-seguridad-amenazas.md), amenazas T1, T2, T3 y T5.
- Código: `src/shared/http/seguridad.js`, `src/server.js`, `docs/Flutter/lib/core/api/aforo_api.dart`, `docs/Flutter/lib/features/auth/login_page.dart`.
- Pruebas: `tests/seguridad.test.js`, casos `401`, `413` y `503` en `tests/contrato.test.js`, `docs/Flutter/test/core/api/aforo_api_test.dart`.
- [ADR-0001: Arquitectura hexagonal](0001-arquitectura-hexagonal.md) (por qué el middleware vive fuera del módulo).
- [ADR-0006: Log de eventos](0006-log-de-eventos-de-acceso.md) (atribución futura con `origen`).
