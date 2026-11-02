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

    test('envía el token de operador como Bearer en el registro', () async {
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
