# ADR-0008: Identidad sintética y acceso por QR

## Estado

Aceptada e implementada para demostración en una base PostgreSQL de pruebas.

> **Actualización:** entre el 16 y el 22 de noviembre la autenticación se movió
> a Supabase Auth ([ADR-0009](0009-supabase-auth.md)). Esa decisión fue
> reemplazada por [ADR-0011](0011-volver-a-postgresql-propio-y-login-local.md):
> la autenticación scrypt y las sesiones propias descritas aquí vuelven a estar
> vigentes, ahora detrás de `AutenticacionEstudiantePort` y con cuentas creadas
> desde `DEMO_STUDENTS`. El flujo QR temporal y su consumo transaccional no
> cambiaron.

## Contexto

El producto requiere que el estudiante presente un QR personal y que el
encargado lo escanee para registrar su entrada o salida. No hay integración con
SSO ni una fuente institucional autorizada para validar identidades. El
proyecto no debe aparentar autenticar estudiantes reales ni almacenar sus
datos personales.

## Decisión

- Se usan cuentas sintéticas creadas explícitamente con
  `npm run db:seed-demo-student`. El script solo permite bases cuyo nombre
  incluya `test` y rechaza `NODE_ENV=production`. *(Desde ADR-0011 las
  cuentas se crean en cada deploy con `npm run db:seed-demo-students` a partir
  de la variable `DEMO_STUDENTS`, que exige `DB_SEED_ENABLED=true` y la
  confirmación del host y la base.)*
- Las contraseñas se almacenan con scrypt; el servidor entrega sesiones
  aleatorias con vencimiento de ocho horas y almacena solo su hash.
- El QR contiene un token aleatorio, no datos del estudiante. Se almacena su
  hash, dura 60 segundos y solo se puede consumir una vez.
- El operador se autentica con el token compartido existente
  (`OPERADOR_TOKEN`) y escanea el código desde la aplicación Flutter.
- El consumo del QR, el cambio de estado individual y la transición del aforo
  ocurren en una transacción PostgreSQL. Un fallo de dominio revierte el
  consumo del QR.
- La entrada o salida manual del operador conserva su comportamiento actual
  y actualiza solo el contador.

## Consecuencias

- Se puede demostrar el flujo completo sin SSO ni datos personales reales.
- Los estados individuales de acceso no son un historial de eventos y pueden
  desincronizarse si se mezclan registros manuales con QR.
- El token compartido de operador no identifica qué encargado realizó una
  operación. La autenticación y autorización individual siguen pendientes.
- El mecanismo no debe presentarse como autenticación institucional ni
  utilizarse con datos reales de estudiantes.

## Referencias

- [OpenAPI](../openapi.yaml)
- [README de Flutter](../Flutter/README.md)
- [Esquema PostgreSQL](../../src/modules/aforo/infrastructure/persistence/schema.sql)
