import 'dart:convert';

import 'package:flutter_test/flutter_test.dart';
import 'package:gimnasio_u_t_b/core/api/aforo_api.dart';
import 'package:http/http.dart' as http;
import 'package:http/testing.dart';

void main() {
  group('AforoApi', () {
    test('consulta el aforo usando la respuesta documentada', () async {
      final client = MockClient((request) async {
        expect(request.method, 'GET');
        expect(request.url.toString(), 'https://api.test/api/v1/aforo');
        return http.Response(
          jsonEncode({
            'status': 'success',
            'data': {'aforoActual': 7},
          }),
          200,
        );
      });

      final aforo = await AforoApi(
        client: client,
        baseUrl: 'https://api.test/',
      ).consultarAforo();

      expect(aforo, 7);
    });

    test('registra la transición con el cuerpo definido por OpenAPI', () async {
      final client = MockClient((request) async {
        expect(request.method, 'POST');
        expect(request.url.path, '/api/v1/aforo/acceso');
        expect(request.headers['content-type'], 'application/json');
        expect(jsonDecode(request.body), {'tipoAcceso': 'SALIDA'});
        return http.Response(
          jsonEncode({
            'status': 'success',
            'data': {'aforoActual': 6},
          }),
          201,
        );
      });

      final aforo = await AforoApi(
        client: client,
        baseUrl: 'https://api.test',
      ).registrarAcceso(TipoAcceso.salida);

      expect(aforo, 6);
    });

    test('envía el token de operador como Bearer al registrar', () async {
      final client = MockClient((request) async {
        expect(request.headers['authorization'], 'Bearer token-operador');
        return http.Response(
          jsonEncode({
            'status': 'success',
            'data': {'aforoActual': 1},
          }),
          201,
        );
      });

      final aforo = await AforoApi(client: client, baseUrl: 'https://api.test')
          .conTokenOperador(' token-operador ')
          .registrarAcceso(TipoAcceso.entrada);

      expect(aforo, 1);
    });

    test('inicia sesión estudiantil con correo sintético', () async {
      final client = MockClient((request) async {
        expect(request.method, 'POST');
        expect(request.url.path, '/api/v1/estudiantes/sesion');
        expect(request.headers.containsKey('authorization'), isFalse);
        expect(
          jsonDecode(request.body),
          {'correo': 'demo-001@utb.edu.co', 'contrasena': 'clave-sintetica'},
        );
        return http.Response(
          jsonEncode({
            'status': 'success',
            'data': {
              'token': 'sesion-temporal',
              'expiresAt': '2026-11-15T12:00:00.000Z',
              'estudiante': {
                'codigoEstudiante': 'demo-001',
                'nombre': 'Estudiante de prueba',
              },
            },
          }),
          200,
        );
      });

      final sesion = await AforoApi(client: client, baseUrl: 'https://api.test')
          .iniciarSesionEstudiante(
        correo: 'demo-001@utb.edu.co',
        contrasena: 'clave-sintetica',
      );

      expect(sesion.token, 'sesion-temporal');
      expect(sesion.codigoEstudiante, 'demo-001');
      expect(sesion.correo, 'demo-001@utb.edu.co');
    });

    test('solicita un QR con la sesión del estudiante', () async {
      final client = MockClient((request) async {
        expect(request.url.path, '/api/v1/estudiantes/qr');
        expect(request.headers['authorization'], 'Bearer sesion-estudiante');
        return http.Response(
          jsonEncode({
            'status': 'success',
            'data': {
              'token': 'qr-temporal',
              'expiresAt': '2026-11-15T12:00:00.000Z',
            },
          }),
          201,
        );
      });

      final qr = await AforoApi(client: client, baseUrl: 'https://api.test')
          .conTokenEstudiante('sesion-estudiante')
          .emitirQrEstudiante();

      expect(qr.token, 'qr-temporal');
      expect(qr.expiresAt, DateTime.parse('2026-11-15T12:00:00.000Z'));
    });

    test('clasifica un 401 al solicitar el QR como sesión expirada', () async {
      final client = MockClient(
        (_) async => http.Response(
          jsonEncode({
            'status': 'error',
            'message': 'La sesión de estudiante no es válida o expiró.',
          }),
          401,
        ),
      );

      await expectLater(
        AforoApi(client: client, baseUrl: 'https://api.test')
            .conTokenEstudiante('token-vencido')
            .emitirQrEstudiante(),
        throwsA(isA<SesionEstudianteExpiradaException>()),
      );
    });

    test('el cierre local descarta el token estudiantil', () async {
      final client = MockClient((request) async {
        expect(request.headers.containsKey('authorization'), isFalse);
        return http.Response(
          jsonEncode({
            'status': 'success',
            'data': {'aforoActual': 2},
          }),
          200,
        );
      });

      final api = AforoApi(client: client, baseUrl: 'https://api.test')
          .conTokenEstudiante('token-estudiante')
          .sinSesiones();

      expect(api.tieneSesionEstudiante, isFalse);
      expect(await api.consultarAforo(), 2);
    });

    test('registra el QR escaneado con el token del operador', () async {
      final client = MockClient((request) async {
        expect(request.url.path, '/api/v1/aforo/acceso-qr');
        expect(request.headers['authorization'], 'Bearer token-operador');
        expect(jsonDecode(request.body), {'qr': 'qr-temporal'});
        return http.Response(
          jsonEncode({
            'status': 'success',
            'data': {'tipoAcceso': 'ENTRADA', 'aforoActual': 2},
          }),
          201,
        );
      });

      final resultado = await AforoApi(
        client: client,
        baseUrl: 'https://api.test',
      ).conTokenOperador('token-operador').registrarAccesoQr('qr-temporal');

      expect(resultado.tipoAcceso, TipoAcceso.entrada);
      expect(resultado.aforoActual, 2);
    });

    test('no envía Authorization en las consultas ni sin token', () async {
      final client = MockClient((request) async {
        expect(request.headers.containsKey('authorization'), isFalse);
        return http.Response(
          jsonEncode({
            'status': 'success',
            'data': {'aforoActual': 3},
          }),
          request.method == 'GET' ? 200 : 201,
        );
      });

      final api = AforoApi(client: client, baseUrl: 'https://api.test');
      expect(await api.consultarAforo(), 3);
      expect(await api.registrarAcceso(TipoAcceso.entrada), 3);
    });

    test('muestra el mensaje 401 cuando el token no es válido', () async {
      final client = MockClient(
        (_) async => http.Response(
          jsonEncode({
            'status': 'error',
            'message': 'Se requiere un token de operador válido.',
          }),
          401,
        ),
      );

      await expectLater(
        AforoApi(client: client, baseUrl: 'https://api.test')
            .conTokenOperador('incorrecto')
            .registrarAcceso(TipoAcceso.entrada),
        throwsA(
          isA<AforoApiException>().having(
            (error) => error.message,
            'message',
            contains('token de operador'),
          ),
        ),
      );
    });

    test('expone el mensaje de error del contrato', () async {
      final client = MockClient(
        (_) async => http.Response(
          jsonEncode({
            'status': 'error',
            'message':
                'No se puede registrar una salida: el aforo ya está en 0.',
          }),
          400,
        ),
      );

      await expectLater(
        AforoApi(client: client, baseUrl: 'https://api.test')
            .registrarAcceso(TipoAcceso.salida),
        throwsA(
          isA<AforoApiException>().having(
            (error) => error.message,
            'message',
            contains('aforo ya está en 0'),
          ),
        ),
      );
    });
  });
}
