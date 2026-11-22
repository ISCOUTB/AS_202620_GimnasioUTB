import 'dart:async';

import 'package:flutter/foundation.dart';

import '../api/aforo_api.dart';

/// Mantiene el estado del gimnasio actualizado para todas las pestañas.
///
/// Consulta el servidor al iniciar y cada [intervalo]. Las pantallas lo
/// escuchan con un `ListenableBuilder`, y llaman a [refrescar] o
/// [actualizarCon] después de un registro o de un cambio del encargado,
/// así el aforo se ve al día sin esperar la siguiente consulta.
class EstadoGimnasioController extends ChangeNotifier {
  EstadoGimnasioController({
    required AforoApi api,
    this.intervalo = const Duration(seconds: 15),
  }) : _api = api;

  final AforoApi _api;
  final Duration intervalo;

  EstadoGimnasio? _estado;
  String? _error;
  bool _cargando = false;
  bool _consultaEnCurso = false;
  bool _descartado = false;
  DateTime? _actualizadoEn;
  Timer? _temporizador;

  EstadoGimnasio? get estado => _estado;
  String? get error => _error;
  bool get cargando => _cargando;
  bool get consultaEnCurso => _consultaEnCurso;
  DateTime? get actualizadoEn => _actualizadoEn;

  void iniciar() {
    unawaited(refrescar());
    _temporizador ??= Timer.periodic(intervalo, (_) => refrescar());
  }

  Future<void> refrescar() async {
    if (_consultaEnCurso || _descartado) return;
    _consultaEnCurso = true;
    if (_estado == null) {
      _cargando = true;
      _error = null;
    }
    _notificar();

    try {
      final estado = await _api.consultarEstado();
      _estado = estado;
      _actualizadoEn = DateTime.now();
      _error = null;
    } on AforoApiException catch (error) {
      _error = error.message;
    } finally {
      _cargando = false;
      _consultaEnCurso = false;
      _notificar();
    }
  }

  /// Usa el estado que devolvió un cambio del encargado sin consultar otra vez.
  void actualizarCon(EstadoGimnasio estado) {
    _estado = estado;
    _actualizadoEn = DateTime.now();
    _error = null;
    _notificar();
  }

  void _notificar() {
    if (!_descartado) notifyListeners();
  }

  @override
  void dispose() {
    _descartado = true;
    _temporizador?.cancel();
    _temporizador = null;
    super.dispose();
  }
}
