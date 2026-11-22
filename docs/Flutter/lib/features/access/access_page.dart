import 'dart:async';

import 'package:flutter/material.dart';
import 'package:flutter/services.dart';
import 'package:intl/intl.dart';
import 'package:qr_flutter/qr_flutter.dart';

import '../../core/api/aforo_api.dart';
import '../../core/state/estado_gimnasio_controller.dart';
import '../../core/theme/app_theme.dart';
import '../../widgets/page_header.dart';
import '../../widgets/status_card.dart';
import '../dashboard/workspace_mode.dart';
import 'qr_scanner_page.dart';

enum _TipoMensaje { exito, cancelado, error }

class AccessPage extends StatefulWidget {
  const AccessPage({
    required this.api,
    required this.mode,
    required this.estadoGimnasio,
    this.onStudentSessionExpired,
    super.key,
  });

  final AforoApi api;
  final WorkspaceMode mode;
  final EstadoGimnasioController estadoGimnasio;
  final VoidCallback? onStudentSessionExpired;

  @override
  State<AccessPage> createState() => _AccessPageState();
}

class _AccessPageState extends State<AccessPage> {
  static final RegExp _cedulaRe = RegExp(r'^\d{5,12}$');

  // Encargado
  bool _enviando = false;
  String? _mensaje;
  _TipoMensaje _tipoMensaje = _TipoMensaje.exito;
  final TextEditingController _cedula = TextEditingController();
  bool _buscando = false;
  String? _errorCedula;
  String? _cedulaEncontrada;
  EstudianteEncontrado? _encontrado;

  // Estudiante
  CredencialQr? _credencialQr;
  bool _cargandoQr = false;
  String? _errorQr;
  Timer? _renovadorQr;

  bool get _isOperator => widget.mode == WorkspaceMode.operator;

  @override
  void initState() {
    super.initState();
    if (!_isOperator && widget.api.tieneSesionEstudiante) {
      _solicitarQr();
      _renovadorQr = Timer.periodic(
        const Duration(seconds: 45),
        (_) => _solicitarQr(),
      );
    }
  }

  @override
  void dispose() {
    _renovadorQr?.cancel();
    _cedula.dispose();
    super.dispose();
  }

  // ---------------------------------------------------------------------
  // Encargado: registro con confirmación cuando se supera la capacidad
  // ---------------------------------------------------------------------

  Future<bool> _preguntarExcesoCapacidad(CapacidadSuperadaException aviso) async {
    final confirmar = await showDialog<bool>(
      context: context,
      builder: (dialogContext) => AlertDialog(
        icon: const Icon(Icons.warning_amber_rounded, color: AppTheme.warning),
        title: const Text('Capacidad máxima alcanzada'),
        content: Text(
          'El gimnasio ya tiene ${aviso.aforoActual} de '
          '${aviso.capacidadMaxima} personas. ¿Quieres registrar el ingreso '
          'de todas formas?',
        ),
        actions: [
          TextButton(
            onPressed: () => Navigator.of(dialogContext).pop(false),
            child: const Text('Cancelar'),
          ),
          FilledButton(
            onPressed: () => Navigator.of(dialogContext).pop(true),
            child: const Text('Registrar de todas formas'),
          ),
        ],
      ),
    );
    return confirmar ?? false;
  }

  /// Intenta la operación; si el servidor avisa que se supera la capacidad,
  /// pregunta al encargado y la repite confirmando. Devuelve null si el
  /// encargado cancela.
  Future<({T valor, bool confirmado})?> _conConfirmacion<T>(
    Future<T> Function(bool confirmar) accion,
  ) async {
    try {
      return (valor: await accion(false), confirmado: false);
    } on CapacidadSuperadaException catch (aviso) {
      if (!mounted) return null;
      final confirmar = await _preguntarExcesoCapacidad(aviso);
      if (!confirmar) return null;
      return (valor: await accion(true), confirmado: true);
    }
  }

  /// Ejecuta un registro y muestra el resultado. [operacion] devuelve el
  /// mensaje de éxito, o null si el encargado canceló.
  Future<void> _ejecutar(Future<String?> Function() operacion) async {
    if (_enviando) return;
    setState(() {
      _enviando = true;
      _mensaje = null;
    });
    try {
      final mensaje = await operacion();
      if (!mounted) return;
      setState(() {
        _mensaje = mensaje ?? 'No se registró el ingreso.';
        _tipoMensaje =
            mensaje == null ? _TipoMensaje.cancelado : _TipoMensaje.exito;
      });
      if (mensaje != null) unawaited(widget.estadoGimnasio.refrescar());
    } on AforoApiException catch (error) {
      if (!mounted) return;
      setState(() {
        _mensaje = error.message;
        _tipoMensaje = _TipoMensaje.error;
      });
    } finally {
      if (mounted) setState(() => _enviando = false);
    }
  }

  String _textoExceso(bool confirmado) =>
      confirmado ? ' Se superó la capacidad máxima.' : '';

  Future<void> _registrarManual(TipoAcceso tipo) {
    return _ejecutar(() async {
      final resultado = await _conConfirmacion(
        (confirmar) => widget.api.registrarAcceso(
          tipo,
          confirmarExcesoCapacidad: confirmar,
        ),
      );
      if (resultado == null) return null;
      final accion = tipo == TipoAcceso.entrada ? 'Entrada' : 'Salida';
      return '$accion registrada. Aforo actual: ${resultado.valor} personas.'
          '${_textoExceso(resultado.confirmado)}';
    });
  }

  Future<bool> _registrarEstudiante(
    Future<ResultadoAccesoEstudiante> Function(bool confirmar) accion,
  ) async {
    await _ejecutar(() async {
      final resultado = await _conConfirmacion(accion);
      if (resultado == null) return null;
      final registro = resultado.valor;
      final accionTexto =
          registro.tipoAcceso == TipoAcceso.entrada ? 'Entrada' : 'Salida';
      final nombre = registro.nombreEstudiante;
      final quien = nombre == null ? '' : ' de $nombre';
      return '$accionTexto$quien registrada. Aforo actual: '
          '${registro.aforoActual} personas.'
          '${_textoExceso(resultado.confirmado)}';
    });
    return _tipoMensaje == _TipoMensaje.exito;
  }

  Future<void> _escanearQr() async {
    if (_enviando) return;
    final qr = await Navigator.of(context).push<String>(
      MaterialPageRoute<String>(builder: (_) => const QrScannerPage()),
    );
    if (qr == null || qr.isEmpty || !mounted) return;
    await _registrarEstudiante(
      (confirmar) => widget.api.registrarAccesoQr(
        qr,
        confirmarExcesoCapacidad: confirmar,
      ),
    );
  }

  Future<void> _buscarCedula() async {
    final cedula = _cedula.text.trim();
    if (!_cedulaRe.hasMatch(cedula)) {
      setState(() => _errorCedula = 'Escribe una cédula de 5 a 12 dígitos.');
      return;
    }
    FocusScope.of(context).unfocus();
    setState(() {
      _buscando = true;
      _errorCedula = null;
      _encontrado = null;
      _cedulaEncontrada = null;
    });
    try {
      final estudiante = await widget.api.buscarEstudiantePorCedula(cedula);
      if (!mounted) return;
      setState(() {
        _encontrado = estudiante;
        _cedulaEncontrada = estudiante == null ? null : cedula;
        if (estudiante == null) {
          _errorCedula = 'No hay ningún estudiante registrado con esa cédula.';
        }
      });
    } on AforoApiException catch (error) {
      if (mounted) setState(() => _errorCedula = error.message);
    } finally {
      if (mounted) setState(() => _buscando = false);
    }
  }

  Future<void> _registrarCedula() async {
    final cedula = _cedulaEncontrada;
    if (cedula == null) return;
    final registrado = await _registrarEstudiante(
      (confirmar) => widget.api.registrarAccesoCedula(
        cedula,
        confirmarExcesoCapacidad: confirmar,
      ),
    );
    if (registrado && mounted) {
      setState(() {
        _encontrado = null;
        _cedulaEncontrada = null;
        _cedula.clear();
      });
    }
  }

  // ---------------------------------------------------------------------
  // Estudiante: QR temporal
  // ---------------------------------------------------------------------

  Future<void> _solicitarQr() async {
    if (_cargandoQr || !widget.api.tieneSesionEstudiante) return;
    setState(() {
      _cargandoQr = true;
      _errorQr = null;
    });
    try {
      final credencial = await widget.api.emitirQrEstudiante();
      if (!mounted) return;
      setState(() => _credencialQr = credencial);
    } on SesionEstudianteExpiradaException {
      _renovadorQr?.cancel();
      if (mounted) {
        setState(() {
          _credencialQr = null;
          _errorQr =
              'Tu sesión venció. Inicia sesión nuevamente para generar otro QR.';
        });
        widget.onStudentSessionExpired?.call();
      }
    } on AforoApiException catch (error) {
      if (mounted) setState(() => _errorQr = error.message);
    } finally {
      if (mounted) setState(() => _cargandoQr = false);
    }
  }

  @override
  Widget build(BuildContext context) {
    return ListenableBuilder(
      listenable: widget.estadoGimnasio,
      builder: (context, _) =>
          _isOperator ? _buildEncargado(context) : _buildEstudiante(context),
    );
  }

  Widget? _avisoCierre({required bool paraEstudiante}) {
    final estado = widget.estadoGimnasio.estado;
    if (estado == null || estado.abierto) return null;
    final motivo = estado.motivoCierre;
    final textoMotivo =
        motivo == null || motivo.isEmpty ? '' : ' Motivo: $motivo.';
    return StatusCard(
      title: 'Gimnasio cerrado',
      message: paraEstudiante
          ? 'No se permiten nuevos ingresos. Si ya estás dentro, muestra tu '
              'código al salir.$textoMotivo'
          : 'Solo se pueden registrar salidas.$textoMotivo',
      icon: Icons.lock_outline_rounded,
      color: AppTheme.danger,
    );
  }

  Widget _buildEstudiante(BuildContext context) {
    final avisoCierre = _avisoCierre(paraEstudiante: true);
    if (!widget.api.tieneSesionEstudiante) {
      return ListView(
        padding: const EdgeInsets.fromLTRB(18, 10, 18, 24),
        children: [
          const PageHeader(
            title: 'Mi código de acceso',
            subtitle: 'Inicia sesión para generar tu QR personal.',
            icon: Icons.qr_code_2_rounded,
          ),
          const SizedBox(height: 18),
          const StatusCard(
            title: 'Inicia sesión para ver tu código',
            message: 'Cierra esta vista e inicia sesión con tu correo '
                'estudiantil. Tu QR personal se renueva solo y sirve para '
                'entrar y salir del gimnasio.',
            icon: Icons.school_outlined,
          ),
          if (avisoCierre != null) ...[
            const SizedBox(height: 14),
            avisoCierre,
          ],
        ],
      );
    }

    final credencial = _credencialQr;
    return ListView(
      padding: const EdgeInsets.fromLTRB(18, 10, 18, 24),
      children: [
        const PageHeader(
          title: 'Mi código de acceso',
          subtitle: 'Muestra este QR al encargado para registrar tu acceso.',
          icon: Icons.qr_code_2_rounded,
        ),
        if (avisoCierre != null) ...[
          const SizedBox(height: 14),
          avisoCierre,
        ],
        const SizedBox(height: 18),
        Card(
          child: Padding(
            padding: const EdgeInsets.symmetric(horizontal: 22, vertical: 24),
            child: Column(
              children: [
                if (credencial != null)
                  QrImageView(
                    data: credencial.token,
                    size: 240,
                    backgroundColor: Colors.white,
                    semanticsLabel: 'QR personal de acceso al gimnasio',
                  )
                else if (_cargandoQr)
                  const Padding(
                    padding: EdgeInsets.all(36),
                    child: CircularProgressIndicator(),
                  )
                else
                  const Icon(
                    Icons.qr_code_2_rounded,
                    size: 76,
                    color: AppTheme.textSecondary,
                  ),
                const SizedBox(height: 16),
                Text(
                  credencial == null
                      ? 'QR no disponible'
                      : 'Código temporal de un solo uso',
                  style: const TextStyle(
                    fontSize: 20,
                    fontWeight: FontWeight.w700,
                  ),
                ),
                if (credencial != null) ...[
                  const SizedBox(height: 8),
                  Text(
                    'Vence a las '
                    '${DateFormat('HH:mm:ss').format(credencial.expiresAt.toLocal())}'
                    ' y se renueva solo.',
                    textAlign: TextAlign.center,
                  ),
                ],
                const SizedBox(height: 12),
                OutlinedButton.icon(
                  onPressed: _cargandoQr ? null : _solicitarQr,
                  icon: const Icon(Icons.refresh_rounded),
                  label: const Text('Generar un nuevo QR'),
                ),
              ],
            ),
          ),
        ),
        const SizedBox(height: 16),
        if (_errorQr != null)
          StatusCard(
            title: 'No se pudo generar el QR',
            message: _errorQr!,
            icon: Icons.error_outline_rounded,
            color: AppTheme.danger,
          )
        else
          const StatusCard(
            title: 'Uso del código',
            message: 'El encargado escanea este código al entrar y al salir. '
                'Cada QR sirve una sola vez y vence en 60 segundos.',
            icon: Icons.qr_code_scanner_rounded,
          ),
      ],
    );
  }

  Widget _buildEncargado(BuildContext context) {
    final theme = Theme.of(context);
    final avisoCierre = _avisoCierre(paraEstudiante: false);
    return ListView(
      padding: const EdgeInsets.fromLTRB(18, 10, 18, 24),
      children: [
        const PageHeader(
          title: 'Registrar acceso',
          subtitle: 'Escanea el QR del estudiante o búscalo por su cédula.',
          icon: Icons.how_to_reg_rounded,
        ),
        if (avisoCierre != null) ...[
          const SizedBox(height: 14),
          avisoCierre,
        ],
        if (_mensaje != null) ...[
          const SizedBox(height: 14),
          _buildMensaje(),
        ],
        const SizedBox(height: 18),
        const _Seccion('CÓDIGO QR'),
        ElevatedButton.icon(
          onPressed: _enviando ? null : _escanearQr,
          icon: _enviando
              ? const SizedBox(
                  height: 18,
                  width: 18,
                  child: CircularProgressIndicator(
                    strokeWidth: 2,
                    color: Colors.white,
                  ),
                )
              : const Icon(Icons.qr_code_scanner_rounded),
          label: const Text('Escanear QR del estudiante'),
        ),
        const SizedBox(height: 22),
        const _Seccion('CÉDULA'),
        Card(
          child: Padding(
            padding: const EdgeInsets.all(16),
            child: Column(
              crossAxisAlignment: CrossAxisAlignment.stretch,
              children: [
                Row(
                  crossAxisAlignment: CrossAxisAlignment.start,
                  children: [
                    Expanded(
                      child: TextField(
                        controller: _cedula,
                        keyboardType: TextInputType.number,
                        inputFormatters: [
                          FilteringTextInputFormatter.digitsOnly,
                        ],
                        maxLength: 12,
                        textInputAction: TextInputAction.search,
                        decoration: InputDecoration(
                          labelText: 'Cédula del estudiante',
                          prefixIcon: const Icon(Icons.badge_outlined),
                          errorText: _errorCedula,
                          counterText: '',
                        ),
                        onChanged: (_) {
                          if (_errorCedula != null || _encontrado != null) {
                            setState(() {
                              _errorCedula = null;
                              _encontrado = null;
                              _cedulaEncontrada = null;
                            });
                          }
                        },
                        onSubmitted: (_) => _buscarCedula(),
                      ),
                    ),
                    const SizedBox(width: 10),
                    SizedBox(
                      height: 56,
                      child: FilledButton(
                        onPressed: _buscando ? null : _buscarCedula,
                        child: _buscando
                            ? const SizedBox(
                                height: 18,
                                width: 18,
                                child:
                                    CircularProgressIndicator(strokeWidth: 2),
                              )
                            : const Text('Buscar'),
                      ),
                    ),
                  ],
                ),
                if (_encontrado != null) ...[
                  const SizedBox(height: 14),
                  _buildEstudianteEncontrado(context, _encontrado!),
                ],
              ],
            ),
          ),
        ),
        const SizedBox(height: 22),
        const _Seccion('SIN IDENTIFICACIÓN'),
        Text(
          'Para visitantes que no tienen cuenta estudiantil. Solo actualiza '
          'el contador del aforo.',
          style: theme.textTheme.bodySmall,
        ),
        const SizedBox(height: 10),
        Row(
          children: [
            Expanded(
              child: OutlinedButton.icon(
                onPressed:
                    _enviando ? null : () => _registrarManual(TipoAcceso.entrada),
                icon: const Icon(Icons.login_rounded),
                label: const Text('Entrada'),
              ),
            ),
            const SizedBox(width: 10),
            Expanded(
              child: OutlinedButton.icon(
                onPressed:
                    _enviando ? null : () => _registrarManual(TipoAcceso.salida),
                icon: const Icon(Icons.logout_rounded),
                label: const Text('Salida'),
              ),
            ),
          ],
        ),
      ],
    );
  }

  Widget _buildEstudianteEncontrado(
    BuildContext context,
    EstudianteEncontrado estudiante,
  ) {
    final theme = Theme.of(context);
    final bloqueado = !estudiante.activa && !estudiante.dentro;
    return Container(
      padding: const EdgeInsets.all(14),
      decoration: BoxDecoration(
        color: AppTheme.surfaceRaised,
        borderRadius: BorderRadius.circular(16),
        border: Border.all(color: AppTheme.border),
      ),
      child: Column(
        crossAxisAlignment: CrossAxisAlignment.stretch,
        children: [
          Row(
            children: [
              const Icon(Icons.person_outline_rounded,
                  color: AppTheme.primaryLight),
              const SizedBox(width: 10),
              Expanded(
                child: Column(
                  crossAxisAlignment: CrossAxisAlignment.start,
                  children: [
                    Text(estudiante.nombre, style: theme.textTheme.titleMedium),
                    Text(
                      'Código ${estudiante.codigoEstudiante}',
                      style: theme.textTheme.bodySmall,
                    ),
                  ],
                ),
              ),
              _UbicacionChip(dentro: estudiante.dentro),
            ],
          ),
          const SizedBox(height: 12),
          if (bloqueado)
            Text(
              'Esta cuenta está inactiva y no puede ingresar.',
              style: theme.textTheme.bodyMedium?.copyWith(
                color: AppTheme.danger,
              ),
            )
          else
            ElevatedButton.icon(
              onPressed: _enviando ? null : _registrarCedula,
              icon: Icon(
                estudiante.dentro ? Icons.logout_rounded : Icons.login_rounded,
              ),
              label: Text(
                estudiante.dentro ? 'Registrar salida' : 'Registrar entrada',
              ),
            ),
        ],
      ),
    );
  }

  Widget _buildMensaje() {
    final mensaje = _mensaje!;
    return switch (_tipoMensaje) {
      _TipoMensaje.exito => StatusCard(
          title: 'Registro completado',
          message: mensaje,
          icon: Icons.check_circle_outline_rounded,
          color: AppTheme.accent,
        ),
      _TipoMensaje.cancelado => StatusCard(
          title: 'Registro cancelado',
          message: mensaje,
          icon: Icons.info_outline_rounded,
        ),
      _TipoMensaje.error => StatusCard(
          title: 'No se pudo registrar',
          message: mensaje,
          icon: Icons.error_outline_rounded,
          color: AppTheme.danger,
        ),
    };
  }
}

class _Seccion extends StatelessWidget {
  const _Seccion(this.titulo);

  final String titulo;

  @override
  Widget build(BuildContext context) {
    return Padding(
      padding: const EdgeInsets.only(bottom: 10),
      child: Text(
        titulo,
        style: Theme.of(context).textTheme.labelLarge?.copyWith(
              color: AppTheme.textSecondary,
              letterSpacing: 1.1,
              fontWeight: FontWeight.w700,
            ),
      ),
    );
  }
}

class _UbicacionChip extends StatelessWidget {
  const _UbicacionChip({required this.dentro});

  final bool dentro;

  @override
  Widget build(BuildContext context) {
    final color = dentro ? AppTheme.accent : AppTheme.textSecondary;
    return Container(
      padding: const EdgeInsets.symmetric(horizontal: 10, vertical: 5),
      decoration: BoxDecoration(
        color: color.withValues(alpha: 0.14),
        borderRadius: BorderRadius.circular(20),
      ),
      child: Text(
        dentro ? 'Dentro' : 'Fuera',
        style: TextStyle(color: color, fontWeight: FontWeight.w700),
      ),
    );
  }
}
