# Informe de auditoría funcional

**Proyecto:** AS_202620_GimnasioUTB  
**Fecha:** 14 de noviembre de 2026 (UTC-05:00)  
**Nota:** este informe conserva los hallazgos de la auditoría en esa fecha. El
flujo de cuentas sintéticas y QR se implementó después; su validación puntual
se registra en la actualización al final de este documento.
**Alcance:** backend/API, persistencia, cliente Flutter/Android, mensajería,
pruebas, arquitectura/documentación y configuración de seguridad disponible en
el repositorio.

## 1. Resumen ejecutivo

El backend de aforo, sus contratos y reglas principales tienen pruebas
automatizadas que pasaron. El taller de mensajería también pasa sus pruebas y
demo, pero es explícitamente un prototipo en memoria, no un broker durable.
Flutter analiza sin errores y sus seis pruebas API pasan. La APK release fue
generada y su manifiesto inspeccionado.

La auditoría encontró y corrigió dos defectos funcionales de Android: el cliente
enviaba un literal enmascarado en vez del token de operador, y la APK release no
incluía permiso de Internet. La prueba Flutter solo afirmaba el literal errado;
ahora verifica el esquema `Bearer` definido por el backend. Se reconstruyó la
APK después de ambas correcciones y se confirmó que contiene el permiso.

En la fecha de esta auditoría no se ejecutó la app en un dispositivo Android,
no se probó la integración Flutter-backend de extremo a extremo y no se
ejecutó PostgreSQL: no había dispositivo/emulador conectado ni `DATABASE_URL`.
Por ello, la compilación no se presenta como prueba de instalación o ejecución
móvil. El flujo QR se implementó posteriormente y se valida en la sección 15.

## 2. Alcance y método

Se inspeccionaron los módulos principales, pruebas, manifiestos y documentos
relevantes. Se ejecutaron las pruebas disponibles que no requerían una base
externa. No se usaron bases de producción ni se enviaron solicitudes al
backend externo. `flutter pub get` descargó dependencias desde sus
repositorios de paquetes.

La matriz de este informe contiene **15 criterios de verificación**, derivados
de los flujos y límites documentados en el repositorio. Se consideran
“verificados” solo los criterios con evidencia de prueba directa para el
alcance indicado. La cobertura de Flutter mediante dobles (`MockClient`) no se
cuenta como integración real.

## 3. Estructura y componentes

- **Backend Node.js:** API HTTP y dominio de aforo en `src/`; adaptadores de
  persistencia en memoria y PostgreSQL.
- **Cliente Flutter:** `docs/Flutter/lib/`, con vistas para consultar aforo,
  registrar transiciones, preferencias locales y pantalla de código QR no
  disponible.
- **Android:** plataforma nativa Flutter generada en `docs/Flutter/android/`.
- **Mensajería:** prototipo principal bajo `experiments/messaging/` y copia
  independiente para entrega en `entrega-taller-mensajeria/`.
- **Persistencia:** PostgreSQL en el adaptador de producción; inicialización
  mediante SQL. No se encontró un sistema de migraciones versionadas.
- **Documentación/CI:** OpenAPI, ADR, arc42, documentos del taller y workflow
  de CI en `.github/workflows/ci.yml`.

No se encontró evidencia de gestión de usuarios individuales ni de roles:
“estudiante” y “operador” son modos de interfaz; las escrituras usan un token
compartido.

## 4. Matriz de requisitos y funcionalidades

| ID | Criterio | Implementación e integración encontrada | Prueba/evidencia de esta auditoría | Estado |
|---|---|---|---|---|
| V01 | Salud y disponibilidad de la API | Rutas health/ready y errores de disponibilidad | `npm.cmd run test:base` (19/19) y `npm.cmd run test:contrato` (14/14) | Verificado |
| V02 | Reglas de aforo | Entrada incrementa, salida decrementa y el dominio evita aforo negativo | `npm.cmd run test:base` | Verificado |
| V03 | Autorización de escrituras | Backend exige `Authorization: Bearer`; comparación y configuración fallan cerradas. Cliente ahora envía `Bearer {token}` | Pruebas backend de autorización y regresión Flutter (`flutter test`, 6/6). No hubo prueba app-servidor conjunta | Verificado para los componentes por separado |
| V04 | Contrato HTTP/OpenAPI | GET y POST validan cuerpo, respuestas y errores documentados | `npm.cmd run test:contrato` (14/14) | Verificado |
| V05 | Persistencia PostgreSQL y concurrencia | Adaptador usa transacción y bloqueo de fila; esquema crea estado acotado | `npm.cmd run test:postgres`: 1 prueba omitida al no haber `DATABASE_URL` | Parcial |
| V06 | Consulta de aforo desde Flutter | Cliente valida JSON/status; panel refresca al abrir, manualmente y cada 30 s | Pruebas con `MockClient`; análisis estático. Sin backend/dispositivo integrado | Parcial |
| V07 | Registro desde Flutter | Formulario envía tipo de acceso y maneja respuestas; token corregido al esquema Bearer | Pruebas API con `MockClient`; el backend prueba POST por separado | Parcial |
| V08 | Navegación y pantallas móviles | Modos estudiante/operador, navegación, estados de error/carga | Revisión de código; no hay pruebas de widgets y no se ejecutó en dispositivo | Parcial |
| V09 | Preferencias/alertas | Preferencias se guardan localmente con `SharedPreferences`; no se evalúa umbral ni se envían notificaciones | Inspección de implementación/documentación; sin prueba automatizada de UI o notificación | Parcial; alerta real pendiente |
| V10 | Identidad, usuarios y QR | No hay contrato de identidad/QR; UI informa que la capacidad no está disponible | Confirmado en cliente y limitaciones documentadas | Pendiente |
| V11 | Mensajería asíncrona | Contrato v1, correlación, deduplicación, concurrencia, backoff y DLQ en memoria | Suite raíz 9/9, suite de entrega 9/9 y ambos demos procesan en intento 1 con DLQ vacía | Verificado como prototipo |
| V12 | Broker durable y entrega garantizada | No hay broker ni persistencia durable en el prototipo | Las limitaciones del taller lo declaran; no se atribuyen garantías exactly-once/at-least-once | No implementado; fuera del alcance del prototipo |
| V13 | APK Android release | APK compilada; inspección confirma permiso `INTERNET`, paquete y metadatos | `flutter build apk --release`; `aapt dump permissions` y `aapt dump badging` | Verificado para compilación/artefacto; instalación no verificada |
| V14 | Arquitectura modular | Verificación de dependencias entre módulos | `npm.cmd run arch:check`: 13 módulos, 17 dependencias, sin violaciones | Verificado |
| V15 | Trazabilidad/documentación y seguridad | OpenAPI/ADR/arc42 y documentación de límites; revisión estática acotada | Se identificaron brechas descritas en secciones 9 y 10; no se ejecutó escáner de dependencias/secretos | Parcial |

### Porcentaje de verificación

**7 de 15 criterios (46,7 %) están verificados completamente** para el alcance
descrito en cada fila. Los restantes son parciales, pendientes o no
implementados. Es un porcentaje de criterios con evidencia directa, **no**
porcentaje de desarrollo ni de funcionalidades implementadas. Los criterios
V11 y V12 separan expresamente el prototipo en memoria de un broker durable.

## 5. Backend y lógica de negocio

- Las rutas cubren health, readiness, métricas, lectura de aforo y registro de
  acceso (`src/server.js`, `src/modules/aforo/infrastructure/http/aforo.router.js`).
- El dominio permite `ENTRADA`/`SALIDA` y evita decrementos por debajo de cero
  (`src/modules/aforo/domain/aforo.js`).
- El backend limita cuerpos JSON y protege la escritura con token de operador.
  La autorización requiere el esquema Bearer; los tests comprueban token
  ausente, inválido y válido.
- El adaptador de memoria es volátil; el backend usa PostgreSQL cuando se
  configura el almacenamiento (`src/server.js`).
- No se constató CRUD de personas, autenticación de cuentas individuales ni
  autorización basada en roles. No se marcan como terminados.

## 6. Base de datos

El motor previsto es PostgreSQL. El adaptador abre transacción, bloquea la fila
de estado y revierte ante fallo
(`src/modules/aforo/infrastructure/persistence/aforo-postgres.adapter.js`).
El esquema define una fila restringida para el estado de aforo
(`src/modules/aforo/infrastructure/persistence/schema.sql`); el bootstrap se
realiza con `npm run db:init`.

La prueba `npm.cmd run test:postgres` se omitió porque `DATABASE_URL` no estaba
configurada. No se modificó ni se conectó una base de datos. No hay evidencia
de que se haya probado persistencia o concurrencia contra PostgreSQL en esta
ejecución; las pruebas backend que pasaron usan el repositorio de prueba/en
memoria.

## 7. Flutter y APK Android

### Resultados

- `flutter pub get`: completó. Informó 10 paquetes con versiones más nuevas
  incompatibles con las restricciones actuales; no se actualizaron
  arbitrariamente.
- `flutter analyze`: **sin incidencias**.
- `flutter test`: **6 pasaron, 0 fallaron**. Son pruebas del cliente API con
  `MockClient`, no pruebas de widgets ni de red real.
- `flutter build apk --release`: **completó correctamente**, APK de 52 841 625
  bytes (50,4 MiB).
- Metadatos de APK: `versionCode=1`, `versionName=1.0`, `minSdk=24`,
  `targetSdk=36`, paquete `com.example.gimnasio_u_t_b`, etiqueta `Gimnasio UTB`.
- Permisos verificados dentro del APK: `android.permission.INTERNET`.
- SHA-256: `4D5526305DDEA9D8831B04BE1544E83757C7D99F1749FA1983CCFE693FB674CF`.
- Ruta: `docs/Flutter/build/app/outputs/flutter-apk/app-release.apk`.

`flutter doctor -v` informó que faltan Android command-line tools y que el
estado de licencias es desconocido. Aun así, Gradle instaló los componentes
necesarios y la compilación release terminó. No había dispositivo/emulador
Android conectado (`adb devices` vacío; Flutter listó Windows, Chrome y Edge).
Por tanto: **APK compilada: sí; estructura/manifest inspeccionados: sí;
instalación y ejecución en Android: no verificadas**.

La variante release usa actualmente la clave debug
(`docs/Flutter/android/app/build.gradle.kts`). El `applicationId` sigue siendo
el identificador de plantilla `com.example.gimnasio_u_t_b`; se debe elegir uno
propio y configurar firma release antes de distribuir/publicar.

### Hallazgos y correcciones

1. **Alto impacto funcional, corregido:** `AforoApi` incluía un literal
   enmascarado como `Authorization` en lugar del token. El backend espera
   `Bearer {token}` (`src/shared/http/seguridad.js`; `docs/openapi.yaml`). El
   cliente ahora compone el encabezado Bearer y su prueba espera el token de
   prueba.
2. **Alto impacto funcional en release, corregido:** el manifiesto principal
   no declaraba `android.permission.INTERNET`; ese permiso solo estaba en los
   manifiestos debug/profile. Se añadió al manifiesto principal, se recompiló
   y se verificó en el APK.
3. **Pendiente para distribución:** firma debug e identificador Android de
   plantilla.
4. **Sin pruebas de widgets:** las seis pruebas existentes cubren solo el
   cliente HTTP; no se encontró una prueba automatizada que recorra las
   pantallas.

## 8. Mensajería asíncrona

Las suites raíz y de entrega validan idempotencia, errores recuperables,
reintentos, DLQ, correlación y concurrencia. Los demos publican y procesan un
evento en memoria en un intento, con DLQ vacía.

El prototipo no integra broker real ni garantiza persistencia/entrega durable.
Hay dos copias ejecutables (`experiments/messaging/` y
`entrega-taller-mensajeria/`), lo cual crea riesgo de divergencia. La ADR de la
entrega remite al prototipo principal sin aclarar del todo esa relación. Además,
el contrato documenta rechazo de tipo de evento/valores/campos extra que no
están cubiertos explícitamente por los tests revisados.

## 9. Arquitectura y documentación

La comprobación de dependencias de arquitectura pasó para 13 módulos. arc42
describe el backend implementado y separa capacidades futuras; ADR-0003
describe comunicación síncrona y posibilidades asíncronas futuras, sin
contradecir que el taller de mensajería es aislado.

Observaciones:

- arc42/escenarios de calidad no vinculan explícitamente sus criterios con el
  prototipo del taller.
- La documentación de la entrega y los dos árboles ejecutables deben
  distinguirse mejor para reducir divergencia.
- No se encontraron evidencias verificables de revisión por pares ni de
  mediciones de calidad adicionales a las que se ejecutaron aquí; no se
  inventan resultados.

## 10. Seguridad y configuración

- La escritura del backend falla cerrada sin token; el esquema Bearer se valida
  en middleware y se compara de forma segura, según la revisión de
  `src/shared/http/seguridad.js`.
- La APK usa HTTPS como URL predeterminada documentada; las URLs alternativas
  se inyectan al compilar/ejecutar.
- No había `.env` local ni `DATABASE_URL` configurada. No se muestran valores
  secretos en este informe.
- No se ejecutó `npm audit` ni un escáner de secretos/dependencias. La
  conclusión es “sin vulnerabilidad alta confirmada en la revisión acotada”,
  no una certificación de ausencia de vulnerabilidades.

## 11. Resultados de pruebas y comandos

Ejecuciones del **14-11-2026**, aproximadamente entre **17:50 y 17:58
(UTC-05:00)**:

| Componente | Comando | Resultado |
|---|---|---|
| Flutter entorno | `flutter doctor -v` | Flutter 3.47.6 / Dart 3.13.5. Windows/Chrome/Edge disponibles; toolchain Android con advertencias de command-line tools/licencias; ningún dispositivo Android |
| Flutter dependencias | `flutter pub get` | Éxito; 10 paquetes tienen versiones más nuevas incompatibles |
| Flutter análisis | `flutter analyze` | Sin incidencias |
| Flutter pruebas | `flutter test` | 6 pasaron, 0 fallaron |
| Flutter APK | `flutter build apk --release` | APK creada; 50,4 MiB |
| APK metadatos | `aapt dump permissions` y `aapt dump badging` | APK legible; INTERNET presente; paquete/versiones inspeccionados |
| Backend base | `npm.cmd run test:base` | 19 pasaron, 0 fallaron/omitidas |
| Contrato API | `npm.cmd run test:contrato` | 14 pasaron, 0 fallaron/omitidas |
| Mensajería raíz | `npm.cmd run test:mensajeria` | 9 pasaron, 0 fallaron/omitidas |
| Arquitectura | `npm.cmd run arch:check` | Sin violaciones; 13 módulos/17 dependencias |
| PostgreSQL | `npm.cmd run test:postgres` | 1 omitida; falta `DATABASE_URL` |
| Mensajería de entrega | `npm.cmd test` desde `entrega-taller-mensajeria/` | 9 pasaron, 0 fallaron/omitidas |
| Demo mensajería | `npm.cmd run demo:mensajeria` desde `entrega-taller-mensajeria/` | Evento procesado en intento 1; DLQ vacía |

En total: **57 pruebas pasaron, 0 fallaron y 1 fue omitida** entre las suites
ejecutadas (las nueve pruebas de mensajería aparecen en raíz y en la copia de
entrega). La omisión es exclusivamente la integración PostgreSQL.

## 12. Problemas encontrados, correcciones y archivos

Correcciones realizadas en esta auditoría:

- `docs/Flutter/lib/core/api/aforo_api.dart`: encabezado Bearer con token real
  de la sesión en memoria.
- `docs/Flutter/test/core/api/aforo_api_test.dart`: regresión del encabezado.
- `docs/Flutter/android/app/src/main/AndroidManifest.xml`: permiso Internet en
  manifest release y etiqueta visible `Gimnasio UTB`.
- Se generó la plataforma Android Flutter en `docs/Flutter/android/`.
- `docs/Flutter/README.md`: comando de APK, ubicación, firma actual y
  actualización del escenario Android.
- `docs/auditoria/INFORME_AUDITORIA_FUNCIONAL.md`: este informe.

Flutter también actualizó metadatos de plataforma/dependencias y
`pubspec.lock` al ejecutar `flutter create`/`flutter pub get`. No se hizo
commit ni push.

## 13. Pruebas no ejecutadas y riesgos pendientes

- PostgreSQL y persistencia real: falta `DATABASE_URL` y una base segura de
  pruebas.
- Instalación/arranque en Android: no hay emulador ni dispositivo conectado.
- Flujo combinado app-API-PostgreSQL: no verificado de extremo a extremo.
- Pruebas visuales/widgets de Flutter y accesibilidad móvil: no disponibles en
  la suite actual.
- Revisión automatizada de vulnerabilidades de dependencias y secretos:
  no ejecutada.
- Usuarios/roles individuales, SSO institucional, notificaciones push y
  alertas evaluadas: no implementados al momento de la auditoría.
- Mensajería durable con broker: no implementada ni prometida por el
  prototipo.
- Firma de publicación e identificador Android propio: pendientes.

## 14. Conclusión

**LISTO CON OBSERVACIONES** para entregar el alcance acotado que sí está
implementado: backend/API de aforo, cliente Flutter compilable y prototipo
académico de mensajería en memoria. Las pruebas automatizadas disponibles
pasaron salvo la integración PostgreSQL omitida por falta de infraestructura.

Este estado describe la auditoría del 14 de noviembre de 2026; no incluye los
cambios posteriores anotados en la sección 15. La APK no se había probado en un
teléfono. Antes de distribución pública deben configurarse firma e
identificador Android propios.

## 15. Actualización posterior: sesión sintética y acceso por QR

El flujo de demostración se añadió después de la auditoría inicial:

- Sesiones estudiantiles de ocho horas y QR de un solo uso con vencimiento de
  60 segundos. Las cuentas son sintéticas y se restringen a bases de prueba;
  no se integra SSO UTB ni se deben cargar datos personales reales.
- El operador escanea el QR con la app. Consumo, estado individual y contador
  se confirman juntos en PostgreSQL; un rechazo de dominio revierte el QR.
- Verificación local posterior: backend base 22/22, OpenAPI 25/25, mensajería
  9/9, `npm run arch:check` sin violaciones; Flutter test 9/9 y
  `flutter analyze` sin problemas. APK release compilada correctamente.
- La integración PostgreSQL se añadió, pero sus dos pruebas quedaron omitidas
  por falta de `DATABASE_URL`; no se probó en dispositivo ni contra el
  deployment. La compilación no sustituye esas verificaciones.
