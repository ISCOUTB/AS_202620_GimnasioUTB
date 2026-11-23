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

    test('inicia sesión estudiantil con correo estudiantil', () async {
      final client = MockClient((request) async {
        expect(request.method, 'POST');
        expect(request.url.path, '/api/v1/estudiantes/sesion');
        expect(request.headers.containsKey('authorization'), isFalse);
        expect(
          jsonDecode(request.body),
          {'correo': 'demo-001@utb.edu.co', 'contrasena': 'clave-estudiante'},
        );
        return http.Response(
          jsonEncode({
            'status': 'success',
            'data': {
              'token': 'sesion-temporal',
              'expiresAt': '2026-11-15T12:00:00.000Z',
              'estudiante': {
                'codigoEstudiante': 'demo-001',
                'nombre': 'Ana Pérez',
              },
            },
          }),
          200,
        );
      });

      final sesion = await AforoApi(client: client, baseUrl: 'https://api.test')
          .iniciarSesionEstudiante(
        correo: 'demo-001@utb.edu.co',
        contrasena: 'clave-estudiante',
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

    test('consulta y guarda las preferencias remotas de alertas', () async {
      final client = MockClient((request) async {
        expect(request.headers['authorization'], 'Bearer sesion-estudiante');
        if (request.method == 'GET') {
          expect(request.url.path, '/api/v1/notificaciones/preferencias');
          return http.Response(
            jsonEncode({
              'status': 'success',
              'data': {
                'capacidadMaxima': 20,
                'preferencias': {
                  'habilitada': true,
                  'umbral': 8,
                  'dias': [1, 3, 5],
                  'horaInicio': 480,
                  'horaFin': 1080,
                  'compatible': true,
                },
              },
            }),
            200,
          );
        }
        expect(request.method, 'PUT');
        expect(request.url.path, '/api/v1/notificaciones/preferencias');
        expect(jsonDecode(request.body), {
          'habilitada': true,
          'umbral': 8,
          'dias': [1, 3, 5],
          'horaInicio': 480,
          'horaFin': 1080,
        });
        return http.Response(
          jsonEncode({
            'status': 'success',
            'data': {
              'capacidadMaxima': 20,
              'preferencias': {
                'habilitada': true,
                'umbral': 8,
                'dias': [1, 3, 5],
                'horaInicio': 480,
                'horaFin': 1080,
                'compatible': true,
              },
            },
          }),
          200,
        );
      });
      final api = AforoApi(client: client, baseUrl: 'https://api.test')
          .conTokenEstudiante('sesion-estudiante');

      final result = await api.consultarPreferenciasAlerta();
      expect(result.capacidadMaxima, 20);
      expect(result.preferencias?.umbral, 8);
      final saved = await api.guardarPreferenciasAlerta(
        habilitada: true,
        umbral: 8,
        dias: [1, 3, 5],
        horaInicio: 480,
        horaFin: 1080,
      );
      expect(saved.compatible, isTrue);
    });

    test('consulta la bandeja de notificaciones autenticada', () async {
      final client = MockClient((request) async {
        expect(request.method, 'GET');
        expect(request.url.path, '/api/v1/notificaciones');
        expect(request.headers['authorization'], 'Bearer sesion-estudiante');
        return http.Response(
          jsonEncode({
            'status': 'success',
            'data': {
              'notificaciones': [
                {
                  'id': 42,
                  'tipo': 'AFORO_BAJO',
                  'mensaje': 'El aforo está bajo.',
                  'creadaEn': '2026-11-23T15:00:00.000Z',
                  'leidaEn': null,
                },
              ],
            },
          }),
          200,
        );
      });

      final notifications = await AforoApi(
        client: client,
        baseUrl: 'https://api.test',
      ).conTokenEstudiante('sesion-estudiante').consultarNotificaciones();

      expect(notifications.single.id, 42);
      expect(notifications.single.tipo, 'AFORO_BAJO');
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

    test('traduce el 401 del encargado a un mensaje claro', () async {
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
          isA<ContrasenaEncargadoInvalidaException>().having(
            (error) => error.message,
            'message',
            'La contraseña de encargado no es válida.',
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

    test('consulta el estado completo del gimnasio', () async {
      final client = MockClient(
        (_) async => http.Response(
          jsonEncode({
            'status': 'success',
            'data': {
              'aforoActual': 31,
              'capacidadMaxima': 30,
              'abierto': false,
              'motivoCierre': 'Mantenimiento',
              'porcentajeOcupacion': 103,
            },
          }),
          200,
        ),
      );

      final estado = await AforoApi(client: client, baseUrl: 'https://api.test')
          .consultarEstado();

      expect(estado.abierto, isFalse);
      expect(estado.motivoCierre, 'Mantenimiento');
      expect(estado.porcentajeOcupacion, 103);
      expect(estado.cuposDisponibles, 0);
      expect(estado.capacidadSuperada, isTrue);
    });

    test(
        'la capacidad superada se reconoce y la confirmación viaja en el cuerpo',
        () async {
      final cuerpos = <Object?>[];
      final client = MockClient((request) async {
        final cuerpo = jsonDecode(request.body) as Map<String, dynamic>;
        cuerpos.add(cuerpo);
        if (cuerpo['confirmarExcesoCapacidad'] == true) {
          return http.Response(
            jsonEncode({
              'status': 'success',
              'data': {'aforoActual': 31},
            }),
            201,
          );
        }
        return http.Response(
          jsonEncode({
            'status': 'error',
            'code': 'CAPACIDAD_SUPERADA',
            'message': 'El gimnasio ya tiene 30 de 30 personas.',
            'data': {'aforoActual': 30, 'capacidadMaxima': 30},
          }),
          409,
        );
      });
      final api = AforoApi(client: client, baseUrl: 'https://api.test')
          .conTokenOperador('token-operador');

      await expectLater(
        api.registrarAcceso(TipoAcceso.entrada),
        throwsA(
          isA<CapacidadSuperadaException>()
              .having((error) => error.aforoActual, 'aforoActual', 30)
              .having((error) => error.capacidadMaxima, 'capacidad', 30),
        ),
      );
      expect(
        await api.registrarAcceso(
          TipoAcceso.entrada,
          confirmarExcesoCapacidad: true,
        ),
        31,
      );
      expect(cuerpos, [
        {'tipoAcceso': 'ENTRADA'},
        {'tipoAcceso': 'ENTRADA', 'confirmarExcesoCapacidad': true},
      ]);
    });

    test('el gimnasio cerrado se reconoce al registrar un QR', () async {
      final client = MockClient(
        (_) async => http.Response(
          jsonEncode({
            'status': 'error',
            'code': 'GIMNASIO_CERRADO',
            'message':
                'El gimnasio está cerrado. Solo se pueden registrar salidas.',
          }),
          409,
        ),
      );

      await expectLater(
        AforoApi(client: client, baseUrl: 'https://api.test')
            .conTokenOperador('token-operador')
            .registrarAccesoQr('qr'),
        throwsA(isA<GimnasioCerradoException>()),
      );
    });

    test('busca por cédula y registra con el nombre del estudiante', () async {
      final client = MockClient((request) async {
        expect(request.headers['authorization'], 'Bearer token-operador');
        final cuerpo = jsonDecode(request.body) as Map<String, dynamic>;
        if (request.url.path == '/api/v1/estudiantes/busqueda') {
          if (cuerpo['cedula'] == '99999') {
            return http.Response(
              jsonEncode({'status': 'error', 'message': 'No existe.'}),
              404,
            );
          }
          return http.Response(
            jsonEncode({
              'status': 'success',
              'data': {
                'codigoEstudiante': 'T001',
                'nombre': 'Ana Pérez',
                'activa': true,
                'dentro': false,
              },
            }),
            200,
          );
        }
        expect(request.url.path, '/api/v1/aforo/acceso-cedula');
        expect(cuerpo, {'cedula': '1012345678'});
        return http.Response(
          jsonEncode({
            'status': 'success',
            'data': {
              'tipoAcceso': 'ENTRADA',
              'aforoActual': 4,
              'estudiante': {'codigoEstudiante': 'T001', 'nombre': 'Ana Pérez'},
            },
          }),
          201,
        );
      });
      final api = AforoApi(client: client, baseUrl: 'https://api.test')
          .conTokenOperador('token-operador');

      expect(await api.buscarEstudiantePorCedula('99999'), isNull);
      final encontrado = await api.buscarEstudiantePorCedula('1012345678');
      expect(encontrado?.nombre, 'Ana Pérez');
      expect(encontrado?.dentro, isFalse);
      final resultado = await api.registrarAccesoCedula('1012345678');
      expect(resultado.tipoAcceso, TipoAcceso.entrada);
      expect(resultado.nombreEstudiante, 'Ana Pérez');
    });

    test('el encargado abre, cierra con motivo y cambia la capacidad',
        () async {
      final solicitudes = <String>[];
      final client = MockClient((request) async {
        expect(request.method, 'PUT');
        expect(request.headers['authorization'], 'Bearer token-operador');
        solicitudes.add('${request.url.path} ${request.body}');
        return http.Response(
          jsonEncode({
            'status': 'success',
            'data': {
              'aforoActual': 2,
              'capacidadMaxima': 40,
              'abierto': true,
              'motivoCierre': null,
              'porcentajeOcupacion': 5,
            },
          }),
          200,
        );
      });
      final api = AforoApi(client: client, baseUrl: 'https://api.test')
          .conTokenOperador('token-operador');

      await api.cambiarApertura(abierto: false, motivoCierre: '  Fumigación ');
      await api.cambiarApertura(abierto: true, motivoCierre: 'ignorado');
      final estado = await api.cambiarCapacidad(40);

      expect(estado.capacidadMaxima, 40);
      expect(solicitudes, [
        '/api/v1/aforo/estado {"abierto":false,"motivoCierre":"Fumigación"}',
        '/api/v1/aforo/estado {"abierto":true}',
        '/api/v1/aforo/capacidad {"capacidadMaxima":40}',
      ]);
    });

    test('verifica la contraseña de encargado antes de ingresar', () async {
      final client = MockClient((request) async {
        expect(request.url.path, '/api/v1/operador/verificacion');
        final valida =
            request.headers['authorization'] == 'Bearer contrasena-correcta';
        return valida
            ? http.Response(
                jsonEncode({
                  'status': 'success',
                  'data': {'valido': true},
                }),
                200,
              )
            : http.Response(
                jsonEncode({
                  'status': 'error',
                  'message': 'Se requiere un token de operador válido.',
                }),
                401,
              );
      });
      final api = AforoApi(client: client, baseUrl: 'https://api.test');

      await api.conTokenOperador('contrasena-correcta').verificarEncargado();
      await expectLater(
        api.conTokenOperador('otra').verificarEncargado(),
        throwsA(isA<ContrasenaEncargadoInvalidaException>()),
      );
    });
  });
}
