# Aplicación Flutter — Gimnasio UTB

Cliente móvil del backend existente. La interfaz usa un tema oscuro azul y
permite consultar el contador y registrar transiciones de aforo conforme al
contrato OpenAPI. Las vistas de visitante y operación son modos de interfaz,
**no roles autenticados**.

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

### Conexión con el backend (S13)

| Escenario | Comando | Qué configurar en el backend |
|---|---|---|
| Windows contra el deployment | `flutter run -d windows` | Nada: las apps nativas no usan CORS. |
| Navegador contra el deployment | `flutter run -d chrome --web-port 8080` | `CORS_ORIGINS=http://localhost:8080` en Dokploy. |
| Navegador contra backend local | `flutter run -d chrome --web-port 8080 --dart-define=GYM_API_BASE_URL=http://localhost:3000` | `CORS_ORIGINS=http://localhost:8080` y `OPERADOR_TOKEN` en el entorno del proceso (p. ej. `node --env-file=.env src/server.js`). |
| Emulador Android contra backend local | `flutter run --dart-define=GYM_API_BASE_URL=http://10.0.2.2:3000` | Nada. Requiere crear antes la plataforma: `flutter create --platforms=android .` (el proyecto hoy solo trae `web/` y `windows/`). |

`--web-port 8080` fija el puerto: sin él Flutter elige uno aleatorio y el
origen no coincidiría con la lista blanca de CORS.

La consulta del aforo funciona sin credenciales. Para **Operación de aforo**
hay que escribir el token de operador (`OPERADOR_TOKEN` del servidor) en la
pantalla de inicio. Si el token es incorrecto, el registro muestra el mensaje
`401` del backend.

## Integración disponible

- `GET /api/v1/aforo`: lee `data.aforoActual`. Se refresca al abrir el panel,
  manualmente y cada 30 segundos; si falla una actualización conserva y marca
  como desactualizado el último valor recibido.
- `POST /api/v1/aforo/acceso`: envía exactamente
  `{"tipoAcceso":"ENTRADA"}` o `{"tipoAcceso":"SALIDA"}` y muestra el aforo
  devuelto.

No se consulta `/metrics` para presentar accesos del día: ese endpoint cuenta
operaciones de la instancia desde su inicio, no ofrece historial diario.

## Limitaciones del backend y estado de las pantallas

- **Autenticación y roles:** el registro de accesos exige un token de
  operador compartido (ADR-0007), que se escribe en la pantalla de inicio y se
  mantiene solo en memoria. No hay usuarios individuales ni roles: cualquiera
  que conozca el token puede operar. La consulta del aforo es pública.
- **Capacidad:** la API devuelve solo el contador actual. No hay capacidad
  máxima ni forma correcta de calcular porcentaje o cupos; la interfaz lo
  identifica como no disponible.
- **Cédula y QR:** no hay endpoint de estudiantes, formato QR, token de acceso
  ni deduplicación. No se intenta escanear ni registrar una persona por cédula;
  tampoco se genera un QR que parezca válido.
- **Alertas:** días, horario, umbral y activación se guardan en el dispositivo
  mediante `SharedPreferences`. No se sincronizan con el servidor, el umbral no
  se evalúa automáticamente y no se envían notificaciones push. La API tendría
  que implementar persistencia de preferencias, evaluación y un canal de envío
  para completar ese flujo.
- **Sesiones:** el token de operador no se persiste (ni en `SharedPreferences`
  ni en disco); se descarta al cerrar la vista de operación.

Las capacidades de autenticación, QR e identidad, historial y notificaciones
también se identifican como futuras en [`ADR 0001`](../adr/0001-arquitectura-hexagonal.md).
