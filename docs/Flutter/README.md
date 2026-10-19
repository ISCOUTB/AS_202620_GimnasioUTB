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

En un emulador Android, usa la dirección de host accesible desde ese emulador
para el servidor local; `localhost` dentro del emulador no es el equipo host.

El build web requiere que el servidor API habilite CORS para el origen de la
app. El backend actual no configura CORS; los clientes móviles nativos no están
sujetos a esa restricción del navegador.

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

- **Autenticación y roles:** no existe endpoint ni mecanismo de identidad. El
  login real y la autorización por rol no están disponibles. La app no valida
  credenciales ficticias; ofrece explícitamente consulta y operación sin sesión.
  El endpoint de acceso no está protegido por autenticación, por lo que la vista
  de operación no debe tratarse como una herramienta administrativa segura.
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
- **Sesiones:** no se almacena token ni sesión porque el backend no emite
  credenciales.

Las capacidades de autenticación, QR e identidad, historial y notificaciones
también se identifican como futuras en [`ADR 0001`](../adr/0001-arquitectura-hexagonal.md).
