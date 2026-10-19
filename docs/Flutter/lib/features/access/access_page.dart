import 'package:flutter/material.dart';

import '../../core/api/aforo_api.dart';
import '../../core/theme/app_theme.dart';
import '../../widgets/page_header.dart';
import '../../widgets/status_card.dart';
import '../dashboard/workspace_mode.dart';

class AccessPage extends StatefulWidget {
  const AccessPage({
    required this.api,
    required this.mode,
    this.onAccessRegistered,
    super.key,
  });

  final AforoApi api;
  final WorkspaceMode mode;
  final VoidCallback? onAccessRegistered;

  @override
  State<AccessPage> createState() => _AccessPageState();
}

class _AccessPageState extends State<AccessPage> {
  bool _enviando = false;
  String? _resultado;
  String? _error;

  bool get _isOperator => widget.mode == WorkspaceMode.operator;

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

  @override
  Widget build(BuildContext context) {
    if (!_isOperator) {
      return ListView(
        padding: const EdgeInsets.fromLTRB(18, 10, 18, 24),
        children: [
          const PageHeader(
            title: 'Mi código de acceso',
            subtitle: 'Consulta el estado de tu código de acceso.',
            icon: Icons.qr_code_2_rounded,
          ),
          const SizedBox(height: 18),
          const Card(
            child: Padding(
              padding: EdgeInsets.symmetric(horizontal: 22, vertical: 34),
              child: Column(
                children: [
                  Icon(
                    Icons.qr_code_2_rounded,
                    size: 76,
                    color: AppTheme.textSecondary,
                  ),
                  SizedBox(height: 16),
                  Text(
                    'QR no disponible',
                    style: TextStyle(fontSize: 20, fontWeight: FontWeight.w700),
                  ),
                  SizedBox(height: 8),
                  Text(
                    'El backend todavía no emite un identificador o token '
                    'de acceso. No se genera un QR de prueba que pueda '
                    'confundirse con uno válido.',
                    textAlign: TextAlign.center,
                  ),
                ],
              ),
            ),
          ),
          const SizedBox(height: 16),
          const StatusCard(
            title: 'Integración pendiente',
            message:
                'Se necesita identidad de estudiante y un contrato backend '
                'para emitir y validar credenciales QR.',
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
          title: 'Operación sin autenticación',
          message:
              'La API recibe solo ENTRADA o SALIDA; no recibe cédula ni '
              'identifica a la persona. Esta pantalla no es un registro '
              'individual de estudiantes.',
          icon: Icons.warning_amber_rounded,
          color: AppTheme.warning,
        ),
        const SizedBox(height: 18),
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
          title: 'Registro por cédula y escaneo QR',
          message:
              'No está habilitado: el backend no ofrece consulta de estudiantes, '
              'validación de QR ni deduplicación. El contrato actual no define '
              'cómo interpretar un QR.',
          icon: Icons.qr_code_scanner_rounded,
        ),
      ],
    );
  }
}
