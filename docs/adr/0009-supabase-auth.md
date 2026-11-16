# ADR-0009: Supabase Auth como fuente de autenticación estudiantil

## Estado

Aceptada e implementada en el backend para una cuenta configurada. La
integración real no está verificada porque aún no hay credenciales de un
proyecto Supabase.

## Contexto

La API tenía autenticación estudiantil propia: hash scrypt en PostgreSQL y
tokens de sesión opacos almacenados como hash. El requisito confirmado el
16 de noviembre de 2026 establece Supabase Auth como fuente única de
autenticación de estudiantes, manteniendo el QR temporal bajo responsabilidad
de la API.

El operador utiliza un token compartido independiente (ADR-0007). La
autenticación estudiantil no debe convertirlo automáticamente en cuentas de
operador ni en roles.

## Decisión

- Supabase Auth es la única fuente de credenciales y access tokens de
  estudiantes.
- El backend realiza el login y valida tokens mediante los endpoints Auth de
  Supabase. Flutter solo llama a la API.
- `auth_user_id` relaciona el usuario Auth con una fila de `estudiantes`.
  La relación es única y se valida al iniciar sesión y al autenticar rutas.
- `SUPABASE_PUBLISHABLE_KEY` se usa como `apikey` para login y validación; se
  admite `SUPABASE_ANON_KEY` como fallback heredado. El access token del usuario
  se envía por separado. `SUPABASE_SERVICE_ROLE_KEY` queda restringida a
  herramientas administrativas fuera de la API de runtime y nunca se envía al
  cliente.
- El backend no emite ni valida sesiones estudiantiles personalizadas. Los
  hashes scrypt legacy pueden permanecer almacenados sin uso para preservar
  datos; la tabla de sesiones antigua tampoco se elimina ni se consulta.
- El QR continúa siendo un token aleatorio, corto, de un solo uso, emitido y
  consumido por la API. No sustituye una sesión Auth ni contiene información
  personal.
- El flujo del operador permanece separado y conserva `OPERADOR_TOKEN`.
- Las tablas de aplicación habilitan RLS sin políticas para acceso directo de
  clientes. La API usa una conexión PostgreSQL privada; RLS no se considera
  una sustitución de sus validaciones.

## Alternativas consideradas

1. **Conservar la autenticación scrypt y usar Supabase solo como PostgreSQL.**
   Rechazada porque mantendría un mecanismo de credenciales propio en contra
   de la decisión de usar Supabase Auth.
2. **Mantener login Supabase y sesiones propias en paralelo.** Rechazada por
   crear dos fuentes de verdad, complicar revocación y prolongar credenciales
   legacy.
3. **Conectar Flutter directamente a Supabase.** Rechazada para este proyecto:
   la API conserva las reglas, el acceso a PostgreSQL y los secretos
   privilegiados.

## Consecuencias

- La base local y Supabase Auth son dependencias separadas. Un fallo de Auth
  hace que las rutas de identidad respondan `503`, sin impedir por sí solo
  las rutas de aforo.
- La API consulta Supabase Auth para validar access tokens; se necesita
  timeout y manejo explícito de indisponibilidad.
- La identidad Auth puede existir sin perfil local; en ese caso el acceso a
  funcionalidades de estudiante se rechaza.
- Los access tokens expiran según el proyecto Supabase. La app actual los
  mantiene solo en memoria, vuelve al login ante `401` en la solicitud de QR
  y no implementa refresh ni revocación remota.
- Los perfiles legacy sin `auth_user_id` no pueden iniciar sesión hasta
  vincularse con una cuenta Supabase.
- No se declara FK a `auth.users` en el esquema portable local. La relación se
  asegura mediante UUID único y verificación en el adapter.
- La incompatibilidad de correo en el endpoint de login se documenta como
  contrato `3.0.0`. Se conserva `/api/v1` únicamente porque el servicio no
  tiene una versión publicada con consumidores externos; no hay compatibilidad
  retroactiva para clientes que envíen solo `codigoEstudiante`.
- Seed, vínculo y reconciliación no borran automáticamente cuentas Auth o
  perfiles. La reconciliación es de solo lectura y las asociaciones dudosas
  requieren confirmación administrativa.

## Referencias

- [Guía de configuración de Supabase](../supabase.md)
- [ADR-0007: token del operador](0007-autenticacion-operador-y-cors.md)
- [ADR-0008: identidad sintética y QR](0008-identidad-de-prueba-y-qr-de-acceso.md)
- [Contrato OpenAPI](../openapi.yaml)
