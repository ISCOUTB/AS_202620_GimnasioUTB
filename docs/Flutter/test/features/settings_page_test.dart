import 'dart:convert';

import 'package:flutter/material.dart';
import 'package:flutter_test/flutter_test.dart';
import 'package:gimnasio_u_t_b/core/api/aforo_api.dart';
import 'package:gimnasio_u_t_b/features/settings/settings_page.dart';
import 'package:http/http.dart' as http;
import 'package:http/testing.dart';
import 'package:shared_preferences/shared_preferences.dart';

void main() {
  const localKey = 'gym_occupancy_alert_preferences_v1';

  setUp(() => SharedPreferences.setMockInitialValues({}));

  testWidgets('migra preferencias locales y muestra la bandeja del servidor',
      (tester) async {
    final preferences = await SharedPreferences.getInstance();
    await preferences.setString(
      localKey,
      jsonEncode({
        'enabled': true,
        'days': [1, 3, 5],
        'startMinutes': 480,
        'endMinutes': 1080,
        'threshold': '7',
      }),
    );
    var preferencesSaved = false;
    final client = MockClient((request) async {
      expect(request.headers['authorization'], 'Bearer sesion-estudiante');
      if (request.method == 'GET' &&
          request.url.path == '/api/v1/notificaciones/preferencias') {
        return http.Response(
          jsonEncode({
            'status': 'success',
            'data': {'preferencias': null, 'capacidadMaxima': 30},
          }),
          200,
        );
      }
      if (request.method == 'PUT') {
        expect(request.url.path, '/api/v1/notificaciones/preferencias');
        expect(jsonDecode(request.body), {
          'habilitada': true,
          'umbral': 7,
          'dias': [1, 3, 5],
          'horaInicio': 480,
          'horaFin': 1080,
        });
        preferencesSaved = true;
        return http.Response(
          jsonEncode({
            'status': 'success',
            'data': {
              'preferencias': {
                'habilitada': true,
                'umbral': 7,
                'dias': [1, 3, 5],
                'horaInicio': 480,
                'horaFin': 1080,
                'compatible': true,
              },
              'capacidadMaxima': 30,
            },
          }),
          200,
        );
      }
      expect(request.url.path, '/api/v1/notificaciones');
      return http.Response(
        jsonEncode({
          'status': 'success',
          'data': {
            'notificaciones': [
              {
                'id': 12,
                'tipo': 'AFORO_BAJO',
                'mensaje': 'El gimnasio tiene 4 personas.',
                'creadaEn': '2026-11-23T15:00:00.000Z',
                'leidaEn': null,
              },
            ],
          },
        }),
        200,
      );
    });

    await tester.pumpWidget(
      MaterialApp(
        home: Scaffold(
          body: SettingsPage(
            api: AforoApi(client: client, baseUrl: 'https://api.test')
                .conTokenEstudiante('sesion-estudiante'),
            onStudentSessionExpired: () => fail('La sesión no debe expirar'),
          ),
        ),
      ),
    );
    await tester.pumpAndSettle();
    await tester.scrollUntilVisible(
      find.text('Aforo por debajo de tu umbral'),
      250,
      scrollable: find.byType(Scrollable).first,
    );
    await tester.pumpAndSettle();

    expect(preferencesSaved, isTrue);
    expect(find.text('Aforo por debajo de tu umbral'), findsOneWidget);
    expect(
        find.textContaining('El gimnasio tiene 4 personas.'), findsOneWidget);
    expect(find.text('Umbral de aforo'), findsOneWidget);
  });
}
