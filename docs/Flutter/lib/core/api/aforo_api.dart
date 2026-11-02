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

class AforoApi {
  AforoApi({http.Client? client, String? baseUrl, String? operatorToken})
      : _client = client ?? http.Client(),
        _baseUrl = (baseUrl ??
                const String.fromEnvironment(
                  'GYM_API_BASE_URL',
                  defaultValue: 'https://gimnasio-utb.iscoutb.dev',
                ))
            .replaceFirst(RegExp(r'/+$'), ''),
        _operatorToken = operatorToken;

  static const Duration requestTimeout = Duration(seconds: 8);

  final http.Client _client;
  final String _baseUrl;

  /// Token de operador (ADR-0007). Solo vive en memoria: no se guarda en
  /// SharedPreferences ni en disco, y se descarta al cerrar sesión.
  final String? _operatorToken;

  bool get tieneTokenOperador => (_operatorToken ?? '').isNotEmpty;

  /// Devuelve un cliente igual a este que envía el token en las escrituras.
  AforoApi conTokenOperador(String token) => AforoApi(
        client: _client,
        baseUrl: _baseUrl,
        operatorToken: token.trim(),
      );

  /// Devuelve un cliente igual a este, sin token (al cerrar sesión).
  AforoApi sinTokenOperador() => AforoApi(client: _client, baseUrl: _baseUrl);

  Future<int> consultarAforo() async {
    final response = await _get('/api/v1/aforo');
    return _parseAforo(response, expectedStatusCode: 200);
  }

  Future<int> registrarAcceso(TipoAcceso tipoAcceso) async {
    final response = await _post(
      '/api/v1/aforo/acceso',
      body: {'tipoAcceso': tipoAcceso.valor},
    );
    return _parseAforo(response, expectedStatusCode: 201);
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
  }) async {
    try {
      return await _client
          .post(
            Uri.parse('$_baseUrl$path'),
            headers: {
              'Content-Type': 'application/json',
              if (tieneTokenOperador) 'Authorization': 'Bearer $_operatorToken',
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
    final Object? decoded;
    try {
      decoded = jsonDecode(response.body);
    } on FormatException {
      throw const AforoApiException(
        'El servicio devolvió una respuesta que no se pudo interpretar.',
      );
    }

    if (response.statusCode != expectedStatusCode) {
      final message = decoded is Map<String, dynamic>
          ? decoded['message']
          : null;
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

    final aforoActual =
        (decoded['data'] as Map<String, dynamic>)['aforoActual'];
    if (aforoActual is! int || aforoActual < 0) {
      throw const AforoApiException(
        'El servicio devolvió un valor de aforo inválido.',
      );
    }
    return aforoActual;
  }
}
