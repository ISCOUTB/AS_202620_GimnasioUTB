# Aplicación Flutter — Gimnasio UTB

Cliente móvil del backend. Muestra el estado del gimnasio (abierto o cerrado
con su motivo), el aforo, la capacidad máxima, el porcentaje de ocupación y los
cupos. El estudiante inicia sesión con su correo estudiantil y muestra un QR
personal. El encargado entra con la contraseña de encargado: registra accesos
por QR, por cédula o sin identificación, abre y cierra el gimnasio y cambia la
capacidad máxima (ADR-0012). Las cuentas son sintéticas y no representan una
identidad institucional UTB.

## Ejecutar

Desde este directorio:

```bash
flutter pub get
flutter run
```

La URL base predeterminada es el deployment documentado en
[`docs/openapi.yaml`](../openapi.yaml):
`https://gimnasio-utb.iscoutb.dev`.

Para apuntar a otro servidor, se puede establecer la URL en tiempo de ejecución:

```bash
flutter run --dart-define=GYM_API_BASE_URL=https://servidor-configurado
```

### Generar APK Android

Desde este directorio:

```bash
flutter clean
flutter pub get
flutter analyze
flutter test
flutter build apk --release --split-per-abi
```

Genera una APK por tipo de procesador en `build/app/outputs/flutter-apk/`:
`app-arm64-v8a-release.apk` sirve para casi todos los celulares actuales y
`app-armeabi-v7a-release.apk` para los de 32 bits. La
configuración actual firma el APK con la clave de depuración; sirve para
instalación y pruebas, pero antes de publicarlo hay que configurar una clave de
firma de release y un identificador de aplicación propio.

### Conexión con el backend (S13)

| Escenario | Comando | Qué configurar en el backend |
|---|---|---|
| Windows contra el deployment | `flutter run -d windows` | Nada: las apps nativas no usan CORS. |
| Navegador contra el deployment | `flutter run -d chrome --web-port 8080` | `CORS_ORIGINS=http://localhost:8080` en Dokploy. |
| Navegador contra backend local | `flutter run -d chrome --web-port 8080 --dart-define=GYM_API_BASE_URL=http://localhost:3000` | `CORS_ORIGINS=http://localhost:8080` y `OPERADOR_TOKEN` en el entorno del proceso (p. ej. `node --env-file=.env src/server.js`). |
| Emulador Android contra backend local | `flutter run --dart-define=GYM_API_BASE_URL=http://10.0.2.2:3000` | Nada. |

`--web-port 8080` fija el puerto: sin él Flutter elige uno aleatorio y el
origen no coincidiría con la lista blanca de CORS.

La consulta del aforo funciona sin credenciales (**Continuar como visitante**).
Para **estudiante**, usa el correo y la contraseña de una de las cuentas de
`DEMO_STUDENTS`. Para **Ingresar como encargado**, escribe la contraseña de
encargado (el `OPERADOR_TOKEN` del servidor): la app la verifica con
`POST /api/v1/operador/verificacion` antes de abrir el panel y muestra
"La contraseña de encargado no es válida." si no coincide. Ninguna sesión se
guarda en disco.

El token de estudiante es un token de sesión opaco que emite la propia API
(ADR-0011): dura 8 horas y la base solo guarda su hash. La app lo mantiene en
memoria y no usa refresh tokens. Al recibir `401` al solicitar un QR, vuelve al
login y pide iniciar sesión nuevamente. Cerrar sesión descarta el token local,
pero no lo revoca en el servidor, que sigue válido hasta vencer. Las cuentas se
crean en cada deploy desde la variable `DEMO_STUDENTS`; consulta la
[guía de base de datos](../base-de-datos.md).

## Integración disponible

- `GET /api/v1/aforo`: estado completo del gimnasio. `EstadoGimnasioController`
  lo consulta al abrir, cada 15 segundos, con el botón de actualizar y después
  de cada registro o cambio; todas las pestañas lo comparten. Si falla una
  actualización, conserva y marca como desactualizado el último valor.
- `POST /api/v1/aforo/acceso`: registro sin identificación (visitantes).
- `PUT /api/v1/aforo/estado` y `PUT /api/v1/aforo/capacidad`: el encargado
  cierra (con motivo opcional en un diálogo), abre y cambia la capacidad con
  teclado numérico.
- `POST /api/v1/estudiantes/busqueda` y `POST /api/v1/aforo/acceso-cedula`:
  el encargado busca por cédula, ve el nombre y si el estudiante está dentro, y
  registra la entrada o la salida.
- Capacidad superada: si el servidor responde `409 CAPACIDAD_SUPERADA`, la app
  pregunta "¿Registrar de todas formas?" y, si el encargado acepta, repite la
  misma operación con `confirmarExcesoCapacidad: true`. Con el gimnasio
  cerrado (`409 GIMNASIO_CERRADO`) muestra que solo se registran salidas.
- `POST /api/v1/estudiantes/sesion` y `POST /api/v1/estudiantes/qr`: inicio de
  sesión de demostración y emisión de QR temporal de un solo uso.
- `POST /api/v1/aforo/acceso-qr`: el operador escanea el código y el backend
  consume el QR y actualiza la presencia individual y el contador en la misma
  transacción PostgreSQL.

No se consulta `/metrics` para presentar accesos del día: ese endpoint cuenta
operaciones de la instancia desde su inicio, no ofrece historial diario.

## Limitaciones del backend y estado de las pantallas

- **Identidad:** las cuentas estudiantiles son sintéticas y la API las
  autentica con contraseña (scrypt) y sesiones propias. No hay SSO ni
  validación de identidad institucional. El QR lo genera la API, dura 60
  segundos y se invalida al consumirse.
- **Operación:** la contraseña de encargado es un secreto compartido
  (ADR-0007) que se mantiene solo en memoria. Cualquiera que la conozca puede
  operar. La consulta del aforo es pública.
- **Registro sin identificación:** cuenta para el aforo, pero no para el
  estado individual de ningún estudiante.
- **Cuentas de prueba:** se crean en cada deploy con
  `npm run db:seed-demo-students` a partir de `DEMO_STUDENTS` (Dokploy), con
  autorización explícita y confirmación del host y la base. Solo correos
  `@utb.edu.co` sintéticos; no se deben cargar datos personales reales.
- **Alertas:** días, horario, umbral y activación se guardan en el dispositivo
  mediante `SharedPreferences`. No se sincronizan con el servidor, el umbral no
  se evalúa automáticamente y no se envían notificaciones push. La API tendría
  que implementar persistencia de preferencias, evaluación y un canal de envío
  para completar ese flujo.
- **Sesiones:** la contraseña de encargado no se persiste (ni en
  `SharedPreferences` ni en disco); se descarta al cerrar sesión.
  La sesión de estudiante también es local y en memoria; al expirar, la vista
  de QR regresa al login. No hay revocación ni renovación remota en esta etapa.

El historial completo de eventos, las notificaciones push y el SSO institucional
siguen fuera del alcance.
