# ADR-0010: PostgreSQL gestionado en Supabase para el deployment final

## Estado

**Reemplazada por [ADR-0011](0011-volver-a-postgresql-propio-y-login-local.md)**
(22 de noviembre de 2026): el deployment no llegó a funcionar con Supabase y
PostgreSQL volvió al Compose de Dokploy, con roles separados creados
automáticamente. Se conserva este documento como historial.

Estado anterior: aceptada para la entrega final (noviembre de 2026). Formaliza el cambio de
`deploy/compose.lab.yaml` del commit `3e8d1c3` (22 de noviembre de 2026), que
retiró el PostgreSQL en contenedor de S8, y completa lo que faltaba para que
ese deployment funcione: la CA de Supabase y los permisos del rol runtime.

## Contexto

Con ADR-0009 los estudiantes se autentican con Supabase Auth y su perfil local
se vincula por `auth_user_id`. Las herramientas de provisionamiento
(`db:seed-demo-student`, `db:link-student-auth`) exigen que la base PostgreSQL
y Supabase Auth pertenezcan al mismo proyecto (`scripts/demo-environment.js`),
para no vincular cuentas Auth de un proyecto con perfiles de otra base. El
PostgreSQL del Compose de S8 no cumplía esa condición, así que con él no se
podía crear la cuenta de demostración sin relajar ese control de S13.

Al mover la base a Supabase aparecieron dos problemas que el Compose no
resolvía:

1. **TLS.** El Session Pooler de Supabase presenta un certificado firmado por
   la CA propia de Supabase (`prod-ca-2021.crt`), que no está en el almacén de
   certificados de Node. Instalar `ca-certificates` en la imagen Alpine no
   ayuda, porque Node usa su propio almacén. Con `rejectUnauthorized: true` la
   conexión falla con `SELF_SIGNED_CERT_IN_CHAIN`.
2. **Permisos.** `schema.sql` habilita RLS y revoca todo a los roles de
   Supabase; los permisos por columna y las políticas del rol
   `gimnasio_runtime` estaban documentados en `docs/supabase.md` como "SQL
   propuesto", sin un comando que los aplicara.

## Decisión

- La API sigue desplegada en Dokploy con `deploy/compose.lab.yaml`: servicio
  `api` permanente y servicio `db-migrate` de mantenimiento (perfil
  `maintenance`).
- La base es el PostgreSQL del mismo proyecto Supabase que provee Auth,
  accedido por el Session Pooler (puerto 5432) con TLS verificado.
- La CA de Supabase se entrega como PEM en base64
  (`DATABASE_SSL_CA_CERT_BASE64`), obligatoria para `api`. Se eligió base64
  porque montar archivos en un Compose de Dokploy depende de rutas internas del
  panel. La validación sigue con `rejectUnauthorized: true`; desactivarla
  (`rejectUnauthorized: false` o `NODE_TLS_REJECT_UNAUTHORIZED=0`) fue
  descartado porque permitiría suplantar la base de datos.
- `npm run db:grant-runtime` aplica, con el rol dueño de las tablas
  (`gimnasio_migrator`), los permisos por columna y las políticas RLS de
  `scripts/sql/runtime-grants.sql` para `gimnasio_runtime` y, si existe,
  `gimnasio_provisioner`. Es idempotente.
- Esquema, permisos y seed se ejecutan una vez desde un equipo del equipo con
  roles separados. El contenedor `api` solo recibe la URL runtime.

## Alternativas consideradas

1. **Volver al PostgreSQL en el Compose y relajar la validación del seed.**
   Rechazada: elimina el control que impide mezclar proyectos Auth y bases.
2. **Desactivar la verificación del certificado.** Rechazada: cifra pero no
   autentica al servidor.
3. **Montar `prod-ca-2021.crt` como archivo en Dokploy.** Viable, pero la ruta
   relativa de los *file mounts* depende de la estructura interna del panel y
   no se puede probar en el CI.
4. **Mover también la API a Supabase (Edge Functions).** Rechazada: obligaría
   a reescribir el backend Express y su arquitectura hexagonal.

## Consecuencias

- El deployment depende de un proveedor externo para datos y Auth; si
  Supabase no responde, `/ready` devuelve `503` y la app no puede leer el
  aforo.
- El plan gratuito de Supabase pausa proyectos inactivos; antes de una
  demostración hay que confirmar en el panel que el proyecto está activo.
- Los datos del volumen PostgreSQL de S8 no se migran; el contador inicia en 0
  con `db:init`.
- Las métricas de `/metrics` siguen en memoria por proceso.
