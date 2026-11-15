import 'dart:async';
import 'dart:convert';

import 'package:http/http.dart' as http;

enum TipoAcceso {
  entrada('ENTRADA'),
  salida('SALIDA');

  const TipoAcceso(this.valor);

  final String valor;
}

class AforoApiException implements Exception {
  const AforoApiException(this.message);

  final String message;

  @override
  String toString() => message;
}

class SesionEstudiante {
  const SesionEstudiante({
    required this.token,
    required this.codigoEstudiante,
    required this.nombre,
  });

  final String token;
  final String codigoEstudiante;
  final String nombre;
}

class CredencialQr {
  const CredencialQr({required this.token, required this.expiresAt});

  final String token;
  final DateTime expiresAt;
}

class ResultadoAccesoQr {
  const ResultadoAccesoQr({
    required this.tipoAcceso,
    required this.aforoActual,
  });

  final TipoAcceso tipoAcceso;
  final int aforoActual;
}

class AforoApi {
  AforoApi({
    http.Client? client,
    String? baseUrl,
    String? operatorToken,
    String? studentToken,
  })  : _client = client ?? http.Client(),
        _baseUrl = (baseUrl ??
                const String.fromEnvironment(
                  'GYM_API_BASE_URL',
                  defaultValue: 'https://gimnasio-utb.iscoutb.dev',
                ))
            .replaceFirst(RegExp(r'/+$'), ''),
        _operatorToken = operatorToken,
        _studentToken = studentToken;

  static const Duration requestTimeout = Duration(seconds: 8);

  final http.Client _client;
  final String _baseUrl;

  /// Token de operador (ADR-0007). Solo vive en memoria: no se guarda en
  /// SharedPreferences ni en disco, y se descarta al cerrar sesión.
  final String? _operatorToken;
  final String? _studentToken;

  bool get tieneTokenOperador => (_operatorToken ?? '').isNotEmpty;
  bool get tieneSesionEstudiante => (_studentToken ?? '').isNotEmpty;

  /// Devuelve un cliente igual a este que envía el token en las escrituras.
  AforoApi conTokenOperador(String token) => AforoApi(
        client: _client,
        baseUrl: _baseUrl,
        operatorToken: token.trim(),
        studentToken: _studentToken,
      );

  AforoApi conTokenEstudiante(String token) => AforoApi(
        client: _client,
        baseUrl: _baseUrl,
        operatorToken: _operatorToken,
        studentToken: token,
      );

  /// Descarta las credenciales locales al cerrar la vista autenticada.
  AforoApi sinSesiones() => AforoApi(client: _client, baseUrl: _baseUrl);

  Future<int> consultarAforo() async {
    final response = await _get('/api/v1/aforo');
    return _parseAforo(response, expectedStatusCode: 200);
  }

  Future<int> registrarAcceso(TipoAcceso tipoAcceso) async {
    final response = await _post(
      '/api/v1/aforo/acceso',
      body: {'tipoAcceso': tipoAcceso.valor},
      bearerToken: _operatorToken,
    );
    return _parseAforo(response, expectedStatusCode: 201);
  }

  Future<SesionEstudiante> iniciarSesionEstudiante({
    required String codigoEstudiante,
    required String contrasena,
  }) async {
    final response = await _post(
      '/api/v1/estudiantes/sesion',
      body: {
        'codigoEstudiante': codigoEstudiante,
        'contrasena': contrasena,
      },
    );
    final data = _parseData(response, expectedStatusCode: 200);
    final estudiante = data['estudiante'];
    if (data['token'] is! String ||
        estudiante is! Map<String, dynamic> ||
        estudiante['codigoEstudiante'] is! String ||
        estudiante['nombre'] is! String) {
      throw const AforoApiException(
        'La respuesta de inicio de sesión no coincide con el contrato.',
      );
    }
    return SesionEstudiante(
      token: data['token'] as String,
      codigoEstudiante: estudiante['codigoEstudiante'] as String,
      nombre: estudiante['nombre'] as String,
    );
  }

  Future<CredencialQr> emitirQrEstudiante() async {
    final response = await _post(
      '/api/v1/estudiantes/qr',
      body: const {},
      bearerToken: _studentToken,
    );
    final data = _parseData(response, expectedStatusCode: 201);
    final expiresAt = data['expiresAt'];
    if (data['token'] is! String || expiresAt is! String) {
      throw const AforoApiException(
        'La respuesta del QR no coincide con el contrato.',
      );
    }
    final fechaExpiracion = DateTime.tryParse(expiresAt);
    if (fechaExpiracion == null) {
      throw const AforoApiException(
        'El servicio devolvió una expiración de QR inválida.',
      );
    }
    return CredencialQr(
      token: data['token'] as String,
      expiresAt: fechaExpiracion,
    );
  }

  Future<ResultadoAccesoQr> registrarAccesoQr(String qr) async {
    final response = await _post(
      '/api/v1/aforo/acceso-qr',
      body: {'qr': qr},
      bearerToken: _operatorToken,
    );
    final data = _parseData(response, expectedStatusCode: 201);
    final tipoAcceso = data['tipoAcceso'];
    final aforoActual = data['aforoActual'];
    if ((tipoAcceso != 'ENTRADA' && tipoAcceso != 'SALIDA') ||
        aforoActual is! int ||
        aforoActual < 0) {
      throw const AforoApiException(
        'La respuesta del acceso QR no coincide con el contrato.',
      );
    }
    return ResultadoAccesoQr(
      tipoAcceso:
          tipoAcceso == 'ENTRADA' ? TipoAcceso.entrada : TipoAcceso.salida,
      aforoActual: aforoActual,
    );
  }

  Future<http.Response> _get(String path) async {
    try {
      return await _client
          .get(Uri.parse('$_baseUrl$path'))
          .timeout(requestTimeout);
    } on TimeoutException {
      throw const AforoApiException(
        'La solicitud tardó demasiado. Intenta de nuevo.',
      );
    } on http.ClientException {
      throw const AforoApiException(
        'No fue posible conectar con el servicio. Revisa tu conexión.',
      );
    }
  }

  Future<http.Response> _post(
    String path, {
    required Map<String, Object> body,
    String? bearerToken,
  }) async {
    try {
      return await _client
          .post(
            Uri.parse('$_baseUrl$path'),
            headers: {
              'Content-Type': 'application/json',
              if ((bearerToken ?? '').isNotEmpty)
                'Authorization': 'Bearer $bearerToken',
            },
            body: jsonEncode(body),
          )
          .timeout(requestTimeout);
    } on TimeoutException {
      throw const AforoApiException(
        'La solicitud tardó demasiado. Intenta de nuevo.',
      );
    } on http.ClientException {
      throw const AforoApiException(
        'No fue posible conectar con el servicio. Revisa tu conexión.',
      );
    }
  }

  int _parseAforo(
    http.Response response, {
    required int expectedStatusCode,
  }) {
    final data = _parseData(response, expectedStatusCode: expectedStatusCode);
    final aforoActual = data['aforoActual'];
    if (aforoActual is! int || aforoActual < 0) {
      throw const AforoApiException(
        'El servicio devolvió un valor de aforo inválido.',
      );
    }
    return aforoActual;
  }

  Map<String, dynamic> _parseData(
    http.Response response, {
    required int expectedStatusCode,
  }) {
    final Object? decoded;
    try {
      decoded = jsonDecode(response.body);
    } on FormatException {
      throw const AforoApiException(
        'El servicio devolvió una respuesta que no se pudo interpretar.',
      );
    }

    if (response.statusCode != expectedStatusCode) {
      final message =
          decoded is Map<String, dynamic> ? decoded['message'] : null;
      if (message is String && message.isNotEmpty) {
        throw AforoApiException(message);
      }
      throw AforoApiException(
        'El servicio respondió con el código ${response.statusCode}.',
      );
    }

    if (decoded is! Map<String, dynamic> ||
        decoded['status'] != 'success' ||
        decoded['data'] is! Map<String, dynamic>) {
      throw const AforoApiException(
        'La respuesta del servicio no coincide con el contrato de aforo.',
      );
    }

    final data = decoded['data'];
    if (data is! Map<String, dynamic>) {
      throw const AforoApiException(
        'El servicio devolvió una respuesta inválida.',
      );
    }
    return data;
  }
}
