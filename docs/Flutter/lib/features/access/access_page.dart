import 'dart:async';

import 'package:flutter/material.dart';
import 'package:qr_flutter/qr_flutter.dart';

import '../../core/api/aforo_api.dart';
import '../../core/theme/app_theme.dart';
import '../../widgets/page_header.dart';
import '../../widgets/status_card.dart';
import '../dashboard/workspace_mode.dart';
import 'qr_scanner_page.dart';

class AccessPage extends StatefulWidget {
  const AccessPage({
    required this.api,
    required this.mode,
    this.onAccessRegistered,
    this.onStudentSessionExpired,
    super.key,
  });

  final AforoApi api;
  final WorkspaceMode mode;
  final VoidCallback? onAccessRegistered;
  final VoidCallback? onStudentSessionExpired;

  @override
  State<AccessPage> createState() => _AccessPageState();
}

class _AccessPageState extends State<AccessPage> {
  bool _enviando = false;
  String? _resultado;
  String? _error;
  CredencialQr? _credencialQr;
  bool _cargandoQr = false;
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
    super.dispose();
  }

  Future<void> _registrar(TipoAcceso tipo) async {
    if (_enviando) return;
    setState(() {
      _enviando = true;
      _resultado = null;
      _error = null;
    });

    try {
      final aforo = await widget.api.registrarAcceso(tipo);
      if (!mounted) return;
      setState(() {
        final accion = tipo == TipoAcceso.entrada ? 'Entrada' : 'Salida';
        _resultado = '$accion registrada. Aforo actual: $aforo personas.';
      });
      widget.onAccessRegistered?.call();
    } on AforoApiException catch (error) {
      if (!mounted) return;
      setState(() => _error = error.message);
    } finally {
      if (mounted) setState(() => _enviando = false);
    }
  }

  Future<void> _solicitarQr() async {
    if (_cargandoQr || !widget.api.tieneSesionEstudiante) return;
    setState(() {
      _cargandoQr = true;
      _error = null;
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
          _error =
              'Tu sesión venció. Inicia sesión nuevamente para generar otro QR.';
        });
        widget.onStudentSessionExpired?.call();
      }
    } on AforoApiException catch (error) {
      if (mounted) setState(() => _error = error.message);
    } finally {
      if (mounted) setState(() => _cargandoQr = false);
    }
  }

  Future<void> _escanearQr() async {
    if (_enviando) return;
    final qr = await Navigator.of(context).push<String>(
      MaterialPageRoute<String>(builder: (_) => const QrScannerPage()),
    );
    if (qr == null || qr.isEmpty || !mounted) return;
    setState(() {
      _enviando = true;
      _resultado = null;
      _error = null;
    });
    try {
      final resultado = await widget.api.registrarAccesoQr(qr);
      if (!mounted) return;
      final accion =
          resultado.tipoAcceso == TipoAcceso.entrada ? 'Entrada' : 'Salida';
      setState(() {
        _resultado =
            '$accion registrada. Aforo actual: ${resultado.aforoActual} personas.';
      });
      widget.onAccessRegistered?.call();
    } on AforoApiException catch (error) {
      if (mounted) setState(() => _error = error.message);
    } finally {
      if (mounted) setState(() => _enviando = false);
    }
  }

  @override
  Widget build(BuildContext context) {
    if (!_isOperator) {
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
              title: 'Sesión de estudiante requerida',
              message: 'El QR se vincula a una cuenta sintética de la base de '
                  'pruebas y vence después de 60 segundos.',
              icon: Icons.school_outlined,
            ),
          ],
        );
      }
      return ListView(
        padding: const EdgeInsets.fromLTRB(18, 10, 18, 24),
        children: [
          const PageHeader(
            title: 'Mi código de acceso',
            subtitle: 'Muestra este QR al encargado para registrar tu acceso.',
            icon: Icons.qr_code_2_rounded,
          ),
          const SizedBox(height: 18),
          Card(
            child: Padding(
              padding: const EdgeInsets.symmetric(horizontal: 22, vertical: 24),
              child: Column(
                children: [
                  if (_credencialQr != null)
                    QrImageView(
                      data: _credencialQr!.token,
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
                    _credencialQr == null
                        ? 'QR no disponible'
                        : 'Código temporal de un solo uso',
                    style: const TextStyle(
                      fontSize: 20,
                      fontWeight: FontWeight.w700,
                    ),
                  ),
                  if (_credencialQr != null) ...[
                    const SizedBox(height: 8),
                    Text(
                      'Vence ${_credencialQr!.expiresAt.toLocal().toString().substring(0, 16)}',
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
          if (_error != null)
            StatusCard(
              title: 'No se pudo generar el QR',
              message: _error!,
              icon: Icons.error_outline_rounded,
              color: AppTheme.danger,
            )
          else
            const StatusCard(
              title: 'Uso del código',
              message: 'El encargado escanea este código. Cada QR se invalida '
                  'después de un uso o al vencer.',
              icon: Icons.qr_code_scanner_rounded,
            ),
        ],
      );
    }

    return ListView(
      padding: const EdgeInsets.fromLTRB(18, 10, 18, 24),
      children: [
        const PageHeader(
          title: 'Registrar acceso',
          subtitle: 'Registra una entrada o salida al gimnasio.',
          icon: Icons.how_to_reg_rounded,
        ),
        const SizedBox(height: 18),
        const StatusCard(
          title: 'Operación con token de operador',
          message:
              'El registro manual cambia solo el contador. Para asociar el '
              'acceso a una cuenta sintética, escanea el QR personal del estudiante.',
          icon: Icons.warning_amber_rounded,
          color: AppTheme.warning,
        ),
        const SizedBox(height: 18),
        ElevatedButton.icon(
          onPressed: _enviando ? null : _escanearQr,
          icon: const Icon(Icons.qr_code_scanner_rounded),
          label: const Text('Escanear QR del estudiante'),
        ),
        const SizedBox(height: 10),
        ElevatedButton.icon(
          onPressed: _enviando ? null : () => _registrar(TipoAcceso.entrada),
          icon: _enviando
              ? const SizedBox(
                  height: 18,
                  width: 18,
                  child: CircularProgressIndicator(
                    strokeWidth: 2,
                    color: Colors.white,
                  ),
                )
              : const Icon(Icons.login_rounded),
          label: const Text('Registrar entrada'),
        ),
        const SizedBox(height: 10),
        OutlinedButton.icon(
          onPressed: _enviando ? null : () => _registrar(TipoAcceso.salida),
          icon: const Icon(Icons.logout_rounded),
          label: const Text('Registrar salida'),
        ),
        if (_resultado != null) ...[
          const SizedBox(height: 16),
          StatusCard(
            title: 'Operación completada',
            message: _resultado!,
            icon: Icons.check_circle_outline_rounded,
            color: AppTheme.accent,
          ),
        ],
        if (_error != null) ...[
          const SizedBox(height: 16),
          StatusCard(
            title: 'No se pudo registrar',
            message: _error!,
            icon: Icons.error_outline_rounded,
            color: AppTheme.danger,
          ),
        ],
        const SizedBox(height: 18),
        const StatusCard(
          title: 'Acceso individual de demostración',
          message:
              'El QR identifica una cuenta sintética de prueba. No se consultan '
              'cédulas ni se integra la identidad institucional UTB.',
          icon: Icons.qr_code_scanner_rounded,
        ),
      ],
    );
  }
}
