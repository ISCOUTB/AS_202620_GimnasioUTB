import 'dart:async';

import 'package:flutter/material.dart';
import 'package:intl/intl.dart';

import '../../core/api/aforo_api.dart';
import '../../core/theme/app_theme.dart';
import '../../widgets/page_header.dart';
import '../../widgets/status_card.dart';
import 'workspace_mode.dart';

class DashboardPage extends StatefulWidget {
  const DashboardPage({
    required this.api,
    required this.mode,
    super.key,
  });

  final AforoApi api;
  final WorkspaceMode mode;

  @override
  State<DashboardPage> createState() => DashboardPageState();
}

class DashboardPageState extends State<DashboardPage> {
  static const Duration refreshInterval = Duration(seconds: 30);

  int? _aforoActual;
  DateTime? _actualizadoEn;
  String? _error;
  bool _cargando = true;
  bool _solicitudEnCurso = false;
  Timer? _timer;

  @override
  void initState() {
    super.initState();
    unawaited(refresh());
    _timer = Timer.periodic(refreshInterval, (_) => refresh());
  }

  @override
  void dispose() {
    _timer?.cancel();
    super.dispose();
  }

  Future<void> refresh() async {
    if (_solicitudEnCurso) return;
    _solicitudEnCurso = true;
    if (_aforoActual == null && mounted) {
      setState(() {
        _cargando = true;
        _error = null;
      });
    }

    try {
      final aforo = await widget.api.consultarAforo();
      if (!mounted) return;
      setState(() {
        _aforoActual = aforo;
        _actualizadoEn = DateTime.now();
        _error = null;
        _cargando = false;
      });
    } on AforoApiException catch (error) {
      if (!mounted) return;
      setState(() {
        _error = error.message;
        _cargando = false;
      });
    } finally {
      _solicitudEnCurso = false;
    }
  }

  @override
  Widget build(BuildContext context) {
    final isOperator = widget.mode == WorkspaceMode.operator;
    final updatedLabel = _actualizadoEn == null
        ? 'Aún no hay datos de actualización'
        : 'Actualizado ${DateFormat('HH:mm').format(_actualizadoEn!)}';

    return ListView(
      padding: const EdgeInsets.fromLTRB(18, 10, 18, 24),
      children: [
        PageHeader(
          title: isOperator ? 'Panel de operación' : 'Hola, estudiante',
          subtitle: 'Consulta el estado actual del gimnasio.',
          icon: Icons.fitness_center_rounded,
          action: IconButton(
            tooltip: 'Actualizar aforo',
            style: IconButton.styleFrom(
              backgroundColor: Colors.white.withValues(alpha: 0.14),
              foregroundColor: Colors.white,
              minimumSize: const Size(44, 44),
            ),
            onPressed: _solicitudEnCurso ? null : refresh,
            icon: const Icon(Icons.refresh_rounded),
          ),
        ),
        const SizedBox(height: 18),
        if (isOperator) ...[
          const StatusCard(
            title: 'Vista de operación sin autenticar',
            message:
                'El backend no valida roles ni protege el registro de accesos. '
                'No se está comprobando que seas administrador.',
            icon: Icons.warning_amber_rounded,
            color: AppTheme.warning,
          ),
          const SizedBox(height: 16),
        ],
        _buildAforoCard(context, updatedLabel),
        const SizedBox(height: 14),
        if (_error != null)
          StatusCard(
            title: _aforoActual == null
                ? 'Aforo no disponible'
                : 'Datos desactualizados',
            message: _aforoActual == null
                ? _error!
                : 'No se pudo actualizar. Se conserva el último dato recibido. $_error',
            icon: Icons.cloud_off_rounded,
            color: AppTheme.warning,
          )
        else if (_cargando && _aforoActual == null)
          const Card(
            child: Padding(
              padding: EdgeInsets.all(18),
              child: Row(
                children: [
                  SizedBox(
                    width: 20,
                    height: 20,
                    child: CircularProgressIndicator(strokeWidth: 2),
                  ),
                  SizedBox(width: 12),
                  Text('Consultando aforo…'),
                ],
              ),
            ),
          ),
        const SizedBox(height: 14),
        Row(
          children: [
            Expanded(
              child: _AvailabilityCard(
                title: 'Capacidad máxima',
                value: 'No disponible',
                icon: Icons.groups_2_outlined,
              ),
            ),
            const SizedBox(width: 12),
            Expanded(
              child: _AvailabilityCard(
                title: 'Cupos disponibles',
                value: 'No disponible',
                icon: Icons.event_available_outlined,
              ),
            ),
          ],
        ),
        const SizedBox(height: 16),
        const StatusCard(
          title: 'Sin porcentaje de ocupación',
          message:
              'La API solo entrega el número actual de personas; no publica '
              'la capacidad máxima. Por eso no se calcula una barra ni cupos '
              'que podrían ser incorrectos.',
          icon: Icons.data_usage_rounded,
        ),
        const SizedBox(height: 12),
        Text(
          'Actualización automática cada ${refreshInterval.inSeconds} segundos · $updatedLabel',
          style: Theme.of(context).textTheme.bodySmall,
          textAlign: TextAlign.center,
        ),
      ],
    );
  }

  Widget _buildAforoCard(BuildContext context, String updatedLabel) {
    return Container(
      padding: const EdgeInsets.all(22),
      decoration: BoxDecoration(
        gradient: const LinearGradient(
          colors: [Color(0xFF1644B7), Color(0xFF1268CF), Color(0xFF237BE8)],
          begin: Alignment.topLeft,
          end: Alignment.bottomRight,
        ),
        borderRadius: BorderRadius.circular(26),
        boxShadow: [
          BoxShadow(
            color: AppTheme.primary.withValues(alpha: 0.2),
            blurRadius: 24,
            offset: const Offset(0, 12),
          ),
        ],
      ),
      child: Column(
        crossAxisAlignment: CrossAxisAlignment.start,
        children: [
          Row(
            children: [
              const Icon(Icons.fitness_center_rounded, color: Colors.white),
              const SizedBox(width: 9),
              Text(
                'AFORO ACTUAL',
                style: Theme.of(context).textTheme.labelLarge?.copyWith(
                      color: Colors.white.withValues(alpha: 0.85),
                      letterSpacing: 1.2,
                      fontWeight: FontWeight.w800,
                    ),
              ),
              const Spacer(),
              const Icon(Icons.circle, size: 9, color: AppTheme.accent),
              const SizedBox(width: 6),
              const Text('API', style: TextStyle(color: Colors.white)),
            ],
          ),
          const SizedBox(height: 22),
          Semantics(
            label: _aforoActual == null
                ? 'Aforo sin datos'
                : 'Aforo actual: $_aforoActual personas',
            child: Text(
              _aforoActual?.toString() ?? '—',
              style: Theme.of(context).textTheme.displayLarge?.copyWith(
                    color: Colors.white,
                    fontWeight: FontWeight.w800,
                    height: 1,
                  ),
            ),
          ),
          const SizedBox(height: 4),
          const Text(
            'personas dentro',
            style: TextStyle(color: Colors.white, fontSize: 17),
          ),
          const SizedBox(height: 18),
          Text(
            updatedLabel,
            style: TextStyle(color: Colors.white.withValues(alpha: 0.8)),
          ),
        ],
      ),
    );
  }
}

class _AvailabilityCard extends StatelessWidget {
  const _AvailabilityCard({
    required this.title,
    required this.value,
    required this.icon,
  });

  final String title;
  final String value;
  final IconData icon;

  @override
  Widget build(BuildContext context) {
    return Card(
      child: Padding(
        padding: const EdgeInsets.all(15),
        child: Column(
          crossAxisAlignment: CrossAxisAlignment.start,
          children: [
            Icon(icon, color: AppTheme.primaryLight),
            const SizedBox(height: 10),
            Text(title, style: Theme.of(context).textTheme.bodySmall),
            const SizedBox(height: 4),
            Text(
              value,
              style: Theme.of(context)
                  .textTheme
                  .titleMedium
                  ?.copyWith(fontSize: 14),
            ),
          ],
        ),
      ),
    );
  }
}
