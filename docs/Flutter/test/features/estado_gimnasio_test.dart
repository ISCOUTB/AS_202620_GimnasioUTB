import 'dart:convert';

import 'package:flutter/material.dart';
import 'package:flutter_test/flutter_test.dart';
import 'package:gimnasio_u_t_b/core/api/aforo_api.dart';
import 'package:gimnasio_u_t_b/features/auth/login_page.dart';
import 'package:gimnasio_u_t_b/features/dashboard/home_shell.dart';
import 'package:gimnasio_u_t_b/features/dashboard/workspace_mode.dart';
import 'package:http/http.dart' as http;
import 'package:http/testing.dart';
import 'package:shared_preferences/shared_preferences.dart';

http.Response _estado({
  required int aforo,
  int capacidad = 30,
  bool abierto = true,
  String? motivo,
}) {
  return http.Response(
    jsonEncode({
      'status': 'success',
      'data': {
        'aforoActual': aforo,
        'capacidadMaxima': capacidad,
        'abierto': abierto,
        'motivoCierre': motivo,
        'porcentajeOcupacion': (aforo * 100 / capacidad).round(),
      },
    }),
    200,
  );
}

void main() {
  setUp(() => SharedPreferences.setMockInitialValues({}));

  testWidgets('el estudiante ve el gimnasio cerrado, el motivo y la ocupación',
      (tester) async {
    final client = MockClient((request) async {
      expect(request.url.path, '/api/v1/aforo');
      return _estado(aforo: 10, abierto: false, motivo: 'Mantenimiento');
    });

    await tester.pumpWidget(
      MaterialApp(
        home: HomeShell(
          api: AforoApi(client: client, baseUrl: 'https://api.test'),
          mode: WorkspaceMode.student,
          nombreEstudiante: 'Ana Pérez',
        ),
      ),
    );
    await tester.pumpAndSettle();

    expect(find.text('Hola, Ana'), findsOneWidget);
    expect(find.text('Cerrado'), findsOneWidget);
    expect(find.text('Gimnasio cerrado'), findsOneWidget);
    expect(find.textContaining('Motivo: Mantenimiento'), findsOneWidget);
    expect(find.text('33 % de ocupación'), findsOneWidget);
    await tester.scrollUntilVisible(
      find.text('30 personas'),
      250,
      scrollable: find.byType(Scrollable).first,
    );
    expect(find.text('30 personas'), findsOneWidget);
    expect(find.text('20'), findsOneWidget);
    expect(find.text('API'), findsNothing);
  });

  testWidgets('la pantalla de ingreso usa los nombres finales', (tester) async {
    final client = MockClient((_) async => fail('No debe consultar al abrir'));

    await tester.pumpWidget(
      MaterialApp(
        home: LoginPage(
          api: AforoApi(client: client, baseUrl: 'https://api.test'),
        ),
      ),
    );

    expect(find.text('Correo estudiantil'), findsOneWidget);
    expect(find.text('Contraseña de encargado'), findsOneWidget);
    expect(find.text('Ingresar como encargado'), findsOneWidget);
    expect(find.textContaining('sintétic'), findsNothing);
    expect(find.textContaining('Token'), findsNothing);
  });

  testWidgets('superar la capacidad pide confirmación y luego registra',
      (tester) async {
    var registros = 0;
    final client = MockClient((request) async {
      if (request.method == 'GET') return _estado(aforo: 30);
      expect(request.url.path, '/api/v1/aforo/acceso');
      registros += 1;
      final cuerpo = jsonDecode(request.body) as Map<String, dynamic>;
      if (cuerpo['confirmarExcesoCapacidad'] != true) {
        return http.Response(
          jsonEncode({
            'status': 'error',
            'code': 'CAPACIDAD_SUPERADA',
            'message': 'El gimnasio ya tiene 30 de 30 personas.',
            'data': {'aforoActual': 30, 'capacidadMaxima': 30},
          }),
          409,
        );
      }
      return http.Response(
        jsonEncode({
          'status': 'success',
          'data': {'aforoActual': 31},
        }),
        201,
      );
    });

    await tester.pumpWidget(
      MaterialApp(
        home: HomeShell(
          api: AforoApi(client: client, baseUrl: 'https://api.test')
              .conTokenOperador('contrasena-encargado'),
          mode: WorkspaceMode.operator,
        ),
      ),
    );
    await tester.pumpAndSettle();

    await tester.tap(find.text('Accesos'));
    await tester.pumpAndSettle();
    await tester.ensureVisible(find.text('Entrada'));
    await tester.pumpAndSettle();
    // Mientras el registro está en curso hay un indicador de carga animado,
    // así que se avanza el reloj a mano en vez de usar pumpAndSettle.
    await tester.tap(find.text('Entrada'));
    await tester.pump();
    await tester.pump(const Duration(milliseconds: 500));

    expect(find.text('Capacidad máxima alcanzada'), findsOneWidget);
    await tester.tap(find.text('Registrar de todas formas'));
    await tester.pump();
    await tester.pump(const Duration(milliseconds: 500));
    await tester.pumpAndSettle();

    expect(registros, 2);
    expect(find.text('Registro completado'), findsOneWidget);
    expect(
        find.textContaining('Se superó la capacidad máxima'), findsOneWidget);
  });
}
