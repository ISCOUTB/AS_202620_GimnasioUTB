# Aplicación Flutter — Gimnasio UTB

Cliente móvil del backend. Permite consultar el aforo, iniciar sesión con una
cuenta sintética de demostración para mostrar un QR personal y usar el token
del operador para escanearlo o registrar una transición manual. La cuenta
estudiantil no representa una identidad institucional UTB.

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
flutter build apk --release
```

El archivo se genera en `build/app/outputs/flutter-apk/app-release.apk`. La
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

La consulta del aforo funciona sin credenciales. Para **Estudiante**, usa las
credenciales sintéticas creadas en una base de pruebas. Para **Operación de
aforo**, escribe el token de operador (`OPERADOR_TOKEN` del servidor) en la
pantalla de inicio. Si el token es incorrecto, el registro muestra el mensaje
`401` del backend. Ninguna sesión se guarda en disco.

Para crear una cuenta local, sigue los pasos de `db:seed-demo-student` en el
[README del backend](../../README.md); el script no carga datos en producción
ni en bases cuyo nombre no incluya `test`.

## Integración disponible

- `GET /api/v1/aforo`: lee `data.aforoActual`. Se refresca al abrir el panel,
  manualmente y cada 30 segundos; si falla una actualización conserva y marca
  como desactualizado el último valor recibido.
- `POST /api/v1/aforo/acceso`: envía exactamente
  `{"tipoAcceso":"ENTRADA"}` o `{"tipoAcceso":"SALIDA"}` y muestra el aforo
  devuelto.
- `POST /api/v1/estudiantes/sesion` y `POST /api/v1/estudiantes/qr`: inicio de
  sesión de demostración y emisión de QR temporal de un solo uso.
- `POST /api/v1/aforo/acceso-qr`: el operador escanea el código y el backend
  consume el QR y actualiza la presencia individual y el contador en la misma
  transacción PostgreSQL.

No se consulta `/metrics` para presentar accesos del día: ese endpoint cuenta
operaciones de la instancia desde su inicio, no ofrece historial diario.

## Limitaciones del backend y estado de las pantallas

- **Identidad:** las cuentas estudiantiles son sintéticas y deben cargarse
  únicamente en bases cuyo nombre contenga `test`. No hay SSO ni validación de
  identidad institucional. La sesión dura 8 horas; el QR dura 60 segundos y
  se invalida al consumirse.
- **Operación:** el registro exige un token de operador compartido (ADR-0007),
  que se escribe en la pantalla de inicio y se mantiene solo en memoria.
  Cualquiera que conozca ese token puede operar. La consulta del aforo es
  pública.
- **Capacidad:** la API devuelve solo el contador actual. No hay capacidad
  máxima ni forma correcta de calcular porcentaje o cupos; la interfaz lo
  identifica como no disponible.
- **Carga de prueba:** `npm run db:seed-demo-student` requiere credenciales
  explícitas y rechaza `NODE_ENV=production` y bases cuyo nombre no incluya
  `test`. No se deben cargar datos personales reales.
- **Alertas:** días, horario, umbral y activación se guardan en el dispositivo
  mediante `SharedPreferences`. No se sincronizan con el servidor, el umbral no
  se evalúa automáticamente y no se envían notificaciones push. La API tendría
  que implementar persistencia de preferencias, evaluación y un canal de envío
  para completar ese flujo.
- **Sesiones:** el token de operador no se persiste (ni en `SharedPreferences`
  ni en disco); se descarta al cerrar la vista de operación.

El historial completo de eventos, las notificaciones push y el SSO institucional
siguen fuera del alcance.
