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
  const AforoApiException(this.message, {this.statusCode});

  final String message;
  final int? statusCode;

  @override
  String toString() => message;
}

class SesionEstudianteExpiradaException extends AforoApiException {
  const SesionEstudianteExpiradaException()
      : super('Tu sesión venció o ya no es válida. Inicia sesión nuevamente.',
            statusCode: 401);
}

/// La contraseña de encargado no es válida o no está configurada.
class ContrasenaEncargadoInvalidaException extends AforoApiException {
  const ContrasenaEncargadoInvalidaException()
      : super('La contraseña de encargado no es válida.', statusCode: 401);
}

/// El gimnasio está cerrado: solo se pueden registrar salidas.
class GimnasioCerradoException extends AforoApiException {
  const GimnasioCerradoException(super.message) : super(statusCode: 409);
}

/// La entrada supera la capacidad máxima y falta la confirmación del
/// encargado. Repetir la operación confirmando registra el ingreso.
class CapacidadSuperadaException extends AforoApiException {
  const CapacidadSuperadaException(
    super.message, {
    required this.aforoActual,
    required this.capacidadMaxima,
  }) : super(statusCode: 409);

  final int aforoActual;
  final int capacidadMaxima;
}

class SesionEstudiante {
  const SesionEstudiante({
    required this.token,
    required this.codigoEstudiante,
    required this.correo,
    required this.nombre,
  });

  final String token;
  final String codigoEstudiante;
  final String correo;
  final String nombre;
}

class CredencialQr {
  const CredencialQr({required this.token, required this.expiresAt});

  final String token;
  final DateTime expiresAt;
}

/// Estado del gimnasio que publica el servidor (ADR-0012).
class EstadoGimnasio {
  const EstadoGimnasio({
    required this.aforoActual,
    required this.capacidadMaxima,
    required this.abierto,
    required this.porcentajeOcupacion,
    this.motivoCierre,
  });

  final int aforoActual;
  final int capacidadMaxima;
  final bool abierto;
  final String? motivoCierre;

  /// Puede pasar de 100 si el encargado confirmó ingresos por encima de la
  /// capacidad.
  final int porcentajeOcupacion;

  int get cuposDisponibles {
    final cupos = capacidadMaxima - aforoActual;
    return cupos > 0 ? cupos : 0;
  }

  bool get capacidadSuperada => aforoActual > capacidadMaxima;
  bool get capacidadCompleta => aforoActual >= capacidadMaxima;

  static EstadoGimnasio desdeJson(Map<String, dynamic> data) {
    final aforoActual = data['aforoActual'];
    final capacidadMaxima = data['capacidadMaxima'];
    final abierto = data['abierto'];
    final motivoCierre = data['motivoCierre'];
    final porcentaje = data['porcentajeOcupacion'];
    if (aforoActual is! int ||
        aforoActual < 0 ||
        capacidadMaxima is! int ||
        capacidadMaxima < 1 ||
        abierto is! bool ||
        (motivoCierre != null && motivoCierre is! String) ||
        porcentaje is! int) {
      throw const AforoApiException(AforoApi.respuestaInesperada);
    }
    return EstadoGimnasio(
      aforoActual: aforoActual,
      capacidadMaxima: capacidadMaxima,
      abierto: abierto,
      motivoCierre: motivoCierre as String?,
      porcentajeOcupacion: porcentaje,
    );
  }
}

class PreferenciasAlertaAforo {
  const PreferenciasAlertaAforo({
    required this.habilitada,
    required this.umbral,
    required this.dias,
    required this.horaInicio,
    required this.horaFin,
    required this.compatible,
  });

  final bool habilitada;
  final int? umbral;
  final List<int> dias;
  final int horaInicio;
  final int horaFin;
  final bool compatible;

  static PreferenciasAlertaAforo desdeJson(Map<String, dynamic> data) {
    final habilitada = data['habilitada'];
    final umbral = data['umbral'];
    final dias = data['dias'];
    final horaInicio = data['horaInicio'];
    final horaFin = data['horaFin'];
    final compatible = data['compatible'];
    if (habilitada is! bool ||
        (umbral != null && umbral is! int) ||
        dias is! List<dynamic> ||
        dias.any((day) => day is! int) ||
        horaInicio is! int ||
        horaFin is! int ||
        compatible is! bool) {
      throw const AforoApiException(AforoApi.respuestaInesperada);
    }
    return PreferenciasAlertaAforo(
      habilitada: habilitada,
      umbral: umbral as int?,
      dias: dias.cast<int>(),
      horaInicio: horaInicio,
      horaFin: horaFin,
      compatible: compatible,
    );
  }
}

class NotificacionEstudiante {
  const NotificacionEstudiante({
    required this.id,
    required this.tipo,
    required this.mensaje,
    required this.creadaEn,
    this.leidaEn,
  });

  final int id;
  final String tipo;
  final String mensaje;
  final DateTime creadaEn;
  final DateTime? leidaEn;

  static NotificacionEstudiante desdeJson(Map<String, dynamic> data) {
    final id = data['id'];
    final tipo = data['tipo'];
    final mensaje = data['mensaje'];
    final creadaEn = data['creadaEn'];
    final leidaEn = data['leidaEn'];
    if (id is! int ||
        tipo is! String ||
        mensaje is! String ||
        creadaEn is! String ||
        (leidaEn != null && leidaEn is! String)) {
      throw const AforoApiException(AforoApi.respuestaInesperada);
    }
    final fecha = DateTime.tryParse(creadaEn);
    final fechaLeida = leidaEn == null ? null : DateTime.tryParse(leidaEn as String);
    if (fecha == null || (leidaEn != null && fechaLeida == null)) {
      throw const AforoApiException(AforoApi.respuestaInesperada);
    }
    return NotificacionEstudiante(
      id: id,
      tipo: tipo,
      mensaje: mensaje,
      creadaEn: fecha,
      leidaEn: fechaLeida,
    );
  }
}

/// Resultado de registrar a un estudiante por QR o por cédula.
class ResultadoAccesoEstudiante {
  const ResultadoAccesoEstudiante({
    required this.tipoAcceso,
    required this.aforoActual,
    this.nombreEstudiante,
    this.codigoEstudiante,
  });

  final TipoAcceso tipoAcceso;
  final int aforoActual;
  final String? nombreEstudiante;
  final String? codigoEstudiante;
}

typedef ResultadoAccesoQr = ResultadoAccesoEstudiante;

/// Estudiante encontrado por el encargado al buscar por cédula.
class EstudianteEncontrado {
  const EstudianteEncontrado({
    required this.codigoEstudiante,
    required this.nombre,
    required this.activa,
    required this.dentro,
  });

  final String codigoEstudiante;
  final String nombre;
  final bool activa;
  final bool dentro;
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
  static const String respuestaInesperada =
      'El servidor devolvió una respuesta inesperada. Intenta de nuevo.';

  final http.Client _client;
  final String _baseUrl;

  /// Contraseña de encargado (ADR-0007). Solo vive en memoria: no se guarda
  /// en SharedPreferences ni en disco, y se descarta al cerrar sesión.
  final String? _operatorToken;
  final String? _studentToken;

  bool get tieneTokenOperador => (_operatorToken ?? '').isNotEmpty;
  bool get tieneSesionEstudiante => (_studentToken ?? '').isNotEmpty;

  /// Devuelve un cliente igual a este que envía la contraseña de encargado.
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
    final response = await _enviar('GET', '/api/v1/aforo');
    return _parseAforo(response, expectedStatusCode: 200);
  }

  /// Aforo, capacidad, estado (abierto o cerrado) y ocupación.
  Future<EstadoGimnasio> consultarEstado() async {
    final response = await _enviar('GET', '/api/v1/aforo');
    return EstadoGimnasio.desdeJson(
      _parseData(response, expectedStatusCode: 200),
    );
  }

  Future<int> registrarAcceso(
    TipoAcceso tipoAcceso, {
    bool confirmarExcesoCapacidad = false,
  }) async {
    final response = await _enviar(
      'POST',
      '/api/v1/aforo/acceso',
      body: {
        'tipoAcceso': tipoAcceso.valor,
        if (confirmarExcesoCapacidad) 'confirmarExcesoCapacidad': true,
      },
      bearerToken: _operatorToken,
    );
    return _parseAforo(response, expectedStatusCode: 201, operador: true);
  }

  Future<SesionEstudiante> iniciarSesionEstudiante({
    required String correo,
    required String contrasena,
  }) async {
    final response = await _enviar(
      'POST',
      '/api/v1/estudiantes/sesion',
      body: {
        'correo': correo,
        'contrasena': contrasena,
      },
    );
    final data = _parseData(response, expectedStatusCode: 200);
    final estudiante = data['estudiante'];
    if (data['token'] is! String ||
        estudiante is! Map<String, dynamic> ||
        estudiante['codigoEstudiante'] is! String ||
        estudiante['nombre'] is! String) {
      throw const AforoApiException(respuestaInesperada);
    }
    return SesionEstudiante(
      token: data['token'] as String,
      codigoEstudiante: estudiante['codigoEstudiante'] as String,
      correo: correo,
      nombre: estudiante['nombre'] as String,
    );
  }

  Future<CredencialQr> emitirQrEstudiante() async {
    final response = await _enviar(
      'POST',
      '/api/v1/estudiantes/qr',
      body: const {},
      bearerToken: _studentToken,
    );
    final Map<String, dynamic> data;
    try {
      data = _parseData(response, expectedStatusCode: 201);
    } on AforoApiException catch (error) {
      if (error.statusCode == 401) {
        throw const SesionEstudianteExpiradaException();
      }
      rethrow;
    }
    final expiresAt = data['expiresAt'];
    if (data['token'] is! String || expiresAt is! String) {
      throw const AforoApiException(respuestaInesperada);
    }
    final fechaExpiracion = DateTime.tryParse(expiresAt);
    if (fechaExpiracion == null) {
      throw const AforoApiException(respuestaInesperada);
    }
    return CredencialQr(
      token: data['token'] as String,
      expiresAt: fechaExpiracion,
    );
  }

  Future<({PreferenciasAlertaAforo? preferencias, int capacidadMaxima})>
      consultarPreferenciasAlerta() async {
    final response = await _enviar(
      'GET',
      '/api/v1/notificaciones/preferencias',
      bearerToken: _studentToken,
    );
    final Map<String, dynamic> data;
    try {
      data = _parseData(response, expectedStatusCode: 200);
    } on AforoApiException catch (error) {
      if (error.statusCode == 401) {
        throw const SesionEstudianteExpiradaException();
      }
      rethrow;
    }
    final capacidadMaxima = data['capacidadMaxima'];
    final rawPreferencias = data['preferencias'];
    if (capacidadMaxima is! int ||
        capacidadMaxima < 1 ||
        (rawPreferencias != null && rawPreferencias is! Map<String, dynamic>)) {
      throw const AforoApiException(respuestaInesperada);
    }
    return (
      preferencias: rawPreferencias == null
          ? null
          : PreferenciasAlertaAforo.desdeJson(
              rawPreferencias as Map<String, dynamic>,
            ),
      capacidadMaxima: capacidadMaxima,
    );
  }

  Future<PreferenciasAlertaAforo> guardarPreferenciasAlerta({
    required bool habilitada,
    required int? umbral,
    required List<int> dias,
    required int horaInicio,
    required int horaFin,
  }) async {
    final response = await _enviar(
      'PUT',
      '/api/v1/notificaciones/preferencias',
      body: {
        'habilitada': habilitada,
        'umbral': umbral,
        'dias': dias,
        'horaInicio': horaInicio,
        'horaFin': horaFin,
      },
      bearerToken: _studentToken,
    );
    final Map<String, dynamic> data;
    try {
      data = _parseData(response, expectedStatusCode: 200);
    } on AforoApiException catch (error) {
      if (error.statusCode == 401) {
        throw const SesionEstudianteExpiradaException();
      }
      rethrow;
    }
    final rawPreferencias = data['preferencias'];
    if (rawPreferencias is! Map<String, dynamic>) {
      throw const AforoApiException(respuestaInesperada);
    }
    return PreferenciasAlertaAforo.desdeJson(rawPreferencias);
  }

  Future<List<NotificacionEstudiante>> consultarNotificaciones() async {
    final response = await _enviar(
      'GET',
      '/api/v1/notificaciones',
      bearerToken: _studentToken,
    );
    final Map<String, dynamic> data;
    try {
      data = _parseData(response, expectedStatusCode: 200);
    } on AforoApiException catch (error) {
      if (error.statusCode == 401) {
        throw const SesionEstudianteExpiradaException();
      }
      rethrow;
    }
    final items = data['notificaciones'];
    if (items is! List<dynamic> ||
        items.any((item) => item is! Map<String, dynamic>)) {
      throw const AforoApiException(respuestaInesperada);
    }
    return items
        .cast<Map<String, dynamic>>()
        .map(NotificacionEstudiante.desdeJson)
        .toList(growable: false);
  }

  Future<ResultadoAccesoEstudiante> registrarAccesoQr(
    String qr, {
    bool confirmarExcesoCapacidad = false,
  }) async {
    final response = await _enviar(
      'POST',
      '/api/v1/aforo/acceso-qr',
      body: {
        'qr': qr,
        if (confirmarExcesoCapacidad) 'confirmarExcesoCapacidad': true,
      },
      bearerToken: _operatorToken,
    );
    return _parseResultadoEstudiante(response);
  }

  Future<ResultadoAccesoEstudiante> registrarAccesoCedula(
    String cedula, {
    bool confirmarExcesoCapacidad = false,
  }) async {
    final response = await _enviar(
      'POST',
      '/api/v1/aforo/acceso-cedula',
      body: {
        'cedula': cedula,
        if (confirmarExcesoCapacidad) 'confirmarExcesoCapacidad': true,
      },
      bearerToken: _operatorToken,
    );
    return _parseResultadoEstudiante(response);
  }

  /// Devuelve null si no hay ningún estudiante con esa cédula.
  Future<EstudianteEncontrado?> buscarEstudiantePorCedula(String cedula) async {
    final response = await _enviar(
      'POST',
      '/api/v1/estudiantes/busqueda',
      body: {'cedula': cedula},
      bearerToken: _operatorToken,
    );
    if (response.statusCode == 404) return null;
    final data = _parseData(response, expectedStatusCode: 200, operador: true);
    final codigo = data['codigoEstudiante'];
    final nombre = data['nombre'];
    final activa = data['activa'];
    final dentro = data['dentro'];
    if (codigo is! String ||
        nombre is! String ||
        activa is! bool ||
        dentro is! bool) {
      throw const AforoApiException(respuestaInesperada);
    }
    return EstudianteEncontrado(
      codigoEstudiante: codigo,
      nombre: nombre,
      activa: activa,
      dentro: dentro,
    );
  }

  /// Abre o cierra el gimnasio. El motivo solo se envía al cerrar.
  Future<EstadoGimnasio> cambiarApertura({
    required bool abierto,
    String? motivoCierre,
  }) async {
    final motivo = (motivoCierre ?? '').trim();
    final response = await _enviar(
      'PUT',
      '/api/v1/aforo/estado',
      body: {
        'abierto': abierto,
        if (!abierto && motivo.isNotEmpty) 'motivoCierre': motivo,
      },
      bearerToken: _operatorToken,
    );
    return EstadoGimnasio.desdeJson(
      _parseData(response, expectedStatusCode: 200, operador: true),
    );
  }

  Future<EstadoGimnasio> cambiarCapacidad(int capacidadMaxima) async {
    final response = await _enviar(
      'PUT',
      '/api/v1/aforo/capacidad',
      body: {'capacidadMaxima': capacidadMaxima},
      bearerToken: _operatorToken,
    );
    return EstadoGimnasio.desdeJson(
      _parseData(response, expectedStatusCode: 200, operador: true),
    );
  }

  /// Comprueba la contraseña de encargado antes de abrir su panel.
  Future<void> verificarEncargado() async {
    final response = await _enviar(
      'POST',
      '/api/v1/operador/verificacion',
      body: const {},
      bearerToken: _operatorToken,
    );
    _parseData(response, expectedStatusCode: 200, operador: true);
  }

  Future<http.Response> _enviar(
    String metodo,
    String path, {
    Map<String, Object?>? body,
    String? bearerToken,
  }) async {
    final uri = Uri.parse('$_baseUrl$path');
    final headers = {
      if (body != null) 'Content-Type': 'application/json',
      if ((bearerToken ?? '').isNotEmpty) 'Authorization': 'Bearer $bearerToken',
    };
    try {
      final Future<http.Response> solicitud = switch (metodo) {
        'GET' => _client.get(uri, headers: headers),
        'PUT' => _client.put(uri, headers: headers, body: jsonEncode(body)),
        _ => _client.post(uri, headers: headers, body: jsonEncode(body)),
      };
      return await solicitud.timeout(requestTimeout);
    } on TimeoutException {
      throw const AforoApiException(
        'La solicitud tardó demasiado. Intenta de nuevo.',
      );
    } on http.ClientException {
      throw const AforoApiException(
        'No fue posible conectar con el servidor. Revisa tu conexión.',
      );
    }
  }

  ResultadoAccesoEstudiante _parseResultadoEstudiante(http.Response response) {
    final data = _parseData(response, expectedStatusCode: 201, operador: true);
    final tipoAcceso = data['tipoAcceso'];
    final aforoActual = data['aforoActual'];
    final estudiante = data['estudiante'];
    if ((tipoAcceso != 'ENTRADA' && tipoAcceso != 'SALIDA') ||
        aforoActual is! int ||
        aforoActual < 0 ||
        (estudiante != null && estudiante is! Map<String, dynamic>)) {
      throw const AforoApiException(respuestaInesperada);
    }
    final datosEstudiante = estudiante as Map<String, dynamic>?;
    final nombre = datosEstudiante?['nombre'];
    final codigo = datosEstudiante?['codigoEstudiante'];
    return ResultadoAccesoEstudiante(
      tipoAcceso:
          tipoAcceso == 'ENTRADA' ? TipoAcceso.entrada : TipoAcceso.salida,
      aforoActual: aforoActual,
      nombreEstudiante: nombre is String ? nombre : null,
      codigoEstudiante: codigo is String ? codigo : null,
    );
  }

  int _parseAforo(
    http.Response response, {
    required int expectedStatusCode,
    bool operador = false,
  }) {
    final data = _parseData(
      response,
      expectedStatusCode: expectedStatusCode,
      operador: operador,
    );
    final aforoActual = data['aforoActual'];
    if (aforoActual is! int || aforoActual < 0) {
      throw const AforoApiException(respuestaInesperada);
    }
    return aforoActual;
  }

  /// [operador] indica que la solicitud usó la contraseña de encargado: un
  /// 401 se traduce a un mensaje para el encargado.
  Map<String, dynamic> _parseData(
    http.Response response, {
    required int expectedStatusCode,
    bool operador = false,
  }) {
    final Object? decoded;
    try {
      decoded = jsonDecode(response.body);
    } on FormatException {
      throw const AforoApiException(respuestaInesperada);
    }

    if (response.statusCode != expectedStatusCode) {
      throw _errorDeRespuesta(response.statusCode, decoded, operador);
    }

    if (decoded is! Map<String, dynamic> ||
        decoded['status'] != 'success' ||
        decoded['data'] is! Map<String, dynamic>) {
      throw const AforoApiException(respuestaInesperada);
    }
    return decoded['data'] as Map<String, dynamic>;
  }

  AforoApiException _errorDeRespuesta(
    int statusCode,
    Object? decoded,
    bool operador,
  ) {
    if (operador && statusCode == 401) {
      return const ContrasenaEncargadoInvalidaException();
    }
    final Map<String, dynamic> cuerpo = decoded is Map<String, dynamic>
        ? decoded
        : const <String, dynamic>{};
    final message = cuerpo['message'];
    final texto = message is String && message.isNotEmpty
        ? message
        : 'El servidor respondió con el código $statusCode.';
    final codigo = cuerpo['code'];
    if (statusCode == 409 && codigo == 'GIMNASIO_CERRADO') {
      return GimnasioCerradoException(texto);
    }
    final datos = cuerpo['data'];
    if (statusCode == 409 &&
        codigo == 'CAPACIDAD_SUPERADA' &&
        datos is Map<String, dynamic> &&
        datos['aforoActual'] is int &&
        datos['capacidadMaxima'] is int) {
      return CapacidadSuperadaException(
        texto,
        aforoActual: datos['aforoActual'] as int,
        capacidadMaxima: datos['capacidadMaxima'] as int,
      );
    }
    return AforoApiException(texto, statusCode: statusCode);
  }
}
