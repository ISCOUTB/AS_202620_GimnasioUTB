import 'package:flutter/material.dart';
import 'package:flutter/services.dart';
import 'package:intl/intl.dart';

import '../../core/api/aforo_api.dart';
import '../../core/state/estado_gimnasio_controller.dart';
import '../../core/theme/app_theme.dart';
import '../../widgets/page_header.dart';
import '../../widgets/status_card.dart';
import 'workspace_mode.dart';

class DashboardPage extends StatefulWidget {
  const DashboardPage({
    required this.api,
    required this.mode,
    required this.estadoGimnasio,
    this.nombreEstudiante,
    super.key,
  });

  final AforoApi api;
  final WorkspaceMode mode;
  final EstadoGimnasioController estadoGimnasio;
  final String? nombreEstudiante;

  @override
  State<DashboardPage> createState() => _DashboardPageState();
}

class _DashboardPageState extends State<DashboardPage> {
  bool _guardando = false;

  bool get _isOperator => widget.mode == WorkspaceMode.operator;

  String get _titulo {
    if (_isOperator) return 'Panel del encargado';
    final nombre = (widget.nombreEstudiante ?? '').trim();
    if (nombre.isEmpty) return 'Bienvenido';
    return 'Hola, ${nombre.split(RegExp(r'\s+')).first}';
  }

  Future<void> _guardar(
    Future<EstadoGimnasio> Function() accion,
    String mensajeExito,
  ) async {
    if (_guardando) return;
    setState(() => _guardando = true);
    final messenger = ScaffoldMessenger.of(context);
    try {
      final estado = await accion();
      widget.estadoGimnasio.actualizarCon(estado);
      messenger.showSnackBar(SnackBar(content: Text(mensajeExito)));
    } on AforoApiException catch (error) {
      messenger.showSnackBar(SnackBar(content: Text(error.message)));
    } finally {
      if (mounted) setState(() => _guardando = false);
    }
  }

  Future<void> _cerrarGimnasio() async {
    final motivo = await showDialog<String>(
      context: context,
      builder: (_) => const _MotivoCierreDialog(),
    );
    if (motivo == null || !mounted) return;
    await _guardar(
      () => widget.api.cambiarApertura(abierto: false, motivoCierre: motivo),
      'Gimnasio cerrado. Solo se registrarán salidas.',
    );
  }

  Future<void> _abrirGimnasio() {
    return _guardar(
      () => widget.api.cambiarApertura(abierto: true),
      'Gimnasio abierto.',
    );
  }

  Future<void> _cambiarCapacidad(int actual) async {
    final nueva = await showDialog<int>(
      context: context,
      builder: (_) => _CapacidadDialog(actual: actual),
    );
    if (nueva == null || !mounted) return;
    await _guardar(
      () => widget.api.cambiarCapacidad(nueva),
      'Capacidad máxima actualizada a $nueva personas.',
    );
  }

  @override
  Widget build(BuildContext context) {
    return ListenableBuilder(
      listenable: widget.estadoGimnasio,
      builder: (context, _) => _buildContenido(context),
    );
  }

  Widget _buildContenido(BuildContext context) {
    final controlador = widget.estadoGimnasio;
    final estado = controlador.estado;
    final error = controlador.error;
    final actualizadoEn = controlador.actualizadoEn;
    final updatedLabel = actualizadoEn == null
        ? 'Sin datos todavía'
        : 'Actualizado ${DateFormat('HH:mm').format(actualizadoEn)}';

    return ListView(
      padding: const EdgeInsets.fromLTRB(18, 10, 18, 24),
      children: [
        PageHeader(
          title: _titulo,
          subtitle: _isOperator
              ? 'Gestiona el estado y la capacidad del gimnasio.'
              : 'Consulta el estado actual del gimnasio.',
          icon: Icons.fitness_center_rounded,
          action: IconButton(
            tooltip: 'Actualizar',
            style: IconButton.styleFrom(
              backgroundColor: Colors.white.withValues(alpha: 0.14),
              foregroundColor: Colors.white,
              minimumSize: const Size(44, 44),
            ),
            onPressed:
                controlador.consultaEnCurso ? null : controlador.refrescar,
            icon: const Icon(Icons.refresh_rounded),
          ),
        ),
        const SizedBox(height: 18),
        _AforoCard(estado: estado, actualizadoEn: updatedLabel),
        if (estado != null && !estado.abierto) ...[
          const SizedBox(height: 14),
          StatusCard(
            title: 'Gimnasio cerrado',
            message: _mensajeCierre(estado.motivoCierre),
            icon: Icons.lock_outline_rounded,
            color: AppTheme.danger,
          ),
        ],
        if (estado != null && estado.capacidadCompleta) ...[
          const SizedBox(height: 14),
          _avisoCapacidad(estado),
        ],
        if (error != null) ...[
          const SizedBox(height: 14),
          StatusCard(
            title: estado == null ? 'Aforo no disponible' : 'Datos desactualizados',
            message: estado == null
                ? error
                : 'No se pudo actualizar. Se muestra el último dato recibido.',
            icon: Icons.cloud_off_rounded,
            color: AppTheme.warning,
          ),
        ] else if (controlador.cargando && estado == null) ...[
          const SizedBox(height: 14),
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
                  Text('Consultando el gimnasio…'),
                ],
              ),
            ),
          ),
        ],
        const SizedBox(height: 14),
        Row(
          children: [
            Expanded(
              child: _AvailabilityCard(
                title: 'Capacidad máxima',
                value: estado == null
                    ? '—'
                    : '${estado.capacidadMaxima} personas',
                icon: Icons.groups_2_outlined,
              ),
            ),
            const SizedBox(width: 12),
            Expanded(
              child: _AvailabilityCard(
                title: 'Cupos disponibles',
                value: _textoCupos(estado),
                icon: Icons.event_available_outlined,
              ),
            ),
          ],
        ),
        if (_isOperator && estado != null) ...[
          const SizedBox(height: 22),
          _buildGestion(context, estado),
        ],
        const SizedBox(height: 14),
        Text(
          'Se actualiza automáticamente cada '
          '${controlador.intervalo.inSeconds} segundos · $updatedLabel',
          style: Theme.of(context).textTheme.bodySmall,
          textAlign: TextAlign.center,
        ),
      ],
    );
  }

  String _textoCupos(EstadoGimnasio? estado) {
    if (estado == null) return '—';
    if (estado.cuposDisponibles == 0) return 'Sin cupos';
    return '${estado.cuposDisponibles}';
  }

  String _mensajeCierre(String? motivo) {
    const consecuencia =
        'No se permiten nuevos ingresos; quienes ya están dentro pueden salir.';
    if (motivo == null || motivo.isEmpty) return consecuencia;
    return 'Motivo: $motivo. $consecuencia';
  }

  Widget _avisoCapacidad(EstadoGimnasio estado) {
    final cifras = '${estado.aforoActual} de ${estado.capacidadMaxima} personas.';
    if (_isOperator) {
      return StatusCard(
        title: estado.capacidadSuperada
            ? 'Capacidad superada'
            : 'Capacidad completa',
        message: '$cifras Cada nuevo ingreso te pedirá confirmación.',
        icon: Icons.warning_amber_rounded,
        color: estado.capacidadSuperada ? AppTheme.danger : AppTheme.warning,
      );
    }
    return StatusCard(
      title: 'Gimnasio lleno',
      message: 'Se alcanzó la capacidad máxima: $cifras',
      icon: Icons.groups_rounded,
      color: AppTheme.warning,
    );
  }

  Widget _buildGestion(BuildContext context, EstadoGimnasio estado) {
    final theme = Theme.of(context);
    return Column(
      crossAxisAlignment: CrossAxisAlignment.stretch,
      children: [
        Text(
          'GESTIÓN DEL GIMNASIO',
          style: theme.textTheme.labelLarge?.copyWith(
            color: AppTheme.textSecondary,
            letterSpacing: 1.1,
            fontWeight: FontWeight.w700,
          ),
        ),
        const SizedBox(height: 10),
        Card(
          child: Padding(
            padding: const EdgeInsets.all(16),
            child: Column(
              crossAxisAlignment: CrossAxisAlignment.stretch,
              children: [
                Row(
                  children: [
                    Expanded(
                      child: Text(
                        'Estado del gimnasio',
                        style: theme.textTheme.titleMedium,
                      ),
                    ),
                    _EstadoChip(abierto: estado.abierto, sobreFondoClaro: true),
                  ],
                ),
                const SizedBox(height: 6),
                Text(
                  estado.abierto
                      ? 'Al cerrarlo se bloquean los nuevos ingresos. Quienes '
                          'están dentro siguen registrados hasta que salgan.'
                      : _mensajeCierre(estado.motivoCierre),
                  style: theme.textTheme.bodyMedium,
                ),
                const SizedBox(height: 12),
                if (estado.abierto)
                  OutlinedButton.icon(
                    onPressed: _guardando ? null : _cerrarGimnasio,
                    style: OutlinedButton.styleFrom(
                      foregroundColor: AppTheme.danger,
                      side: const BorderSide(color: AppTheme.danger),
                    ),
                    icon: const Icon(Icons.lock_outline_rounded),
                    label: const Text('Cerrar gimnasio'),
                  )
                else
                  ElevatedButton.icon(
                    onPressed: _guardando ? null : _abrirGimnasio,
                    icon: const Icon(Icons.lock_open_rounded),
                    label: const Text('Abrir gimnasio'),
                  ),
              ],
            ),
          ),
        ),
        const SizedBox(height: 12),
        Card(
          child: Padding(
            padding: const EdgeInsets.all(16),
            child: Column(
              crossAxisAlignment: CrossAxisAlignment.stretch,
              children: [
                Text('Capacidad máxima', style: theme.textTheme.titleMedium),
                const SizedBox(height: 6),
                Text(
                  '${estado.capacidadMaxima} personas. Si un ingreso la '
                  'supera, la app te pide confirmación antes de registrarlo.',
                  style: theme.textTheme.bodyMedium,
                ),
                const SizedBox(height: 12),
                OutlinedButton.icon(
                  onPressed: _guardando
                      ? null
                      : () => _cambiarCapacidad(estado.capacidadMaxima),
                  icon: const Icon(Icons.edit_outlined),
                  label: const Text('Cambiar capacidad'),
                ),
              ],
            ),
          ),
        ),
      ],
    );
  }
}

Color _colorOcupacion(int porcentaje) {
  if (porcentaje >= 100) return AppTheme.danger;
  if (porcentaje >= 75) return AppTheme.warning;
  return AppTheme.accent;
}

class _AforoCard extends StatelessWidget {
  const _AforoCard({required this.estado, required this.actualizadoEn});

  final EstadoGimnasio? estado;
  final String actualizadoEn;

  @override
  Widget build(BuildContext context) {
    final estado = this.estado;
    final theme = Theme.of(context);
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
                style: theme.textTheme.labelLarge?.copyWith(
                  color: Colors.white.withValues(alpha: 0.85),
                  letterSpacing: 1.2,
                  fontWeight: FontWeight.w800,
                ),
              ),
              const Spacer(),
              if (estado != null) _EstadoChip(abierto: estado.abierto),
            ],
          ),
          const SizedBox(height: 22),
          Semantics(
            label: estado == null
                ? 'Aforo sin datos'
                : 'Aforo actual: ${estado.aforoActual} personas',
            child: Text(
              estado?.aforoActual.toString() ?? '—',
              style: theme.textTheme.displayLarge?.copyWith(
                color: Colors.white,
                fontWeight: FontWeight.w800,
                height: 1,
              ),
            ),
          ),
          const SizedBox(height: 4),
          Text(
            estado == null
                ? 'personas dentro'
                : 'personas dentro de ${estado.capacidadMaxima}',
            style: const TextStyle(color: Colors.white, fontSize: 17),
          ),
          if (estado != null) ...[
            const SizedBox(height: 18),
            ClipRRect(
              borderRadius: BorderRadius.circular(8),
              child: LinearProgressIndicator(
                value: (estado.porcentajeOcupacion / 100)
                    .clamp(0.0, 1.0)
                    .toDouble(),
                minHeight: 10,
                backgroundColor: Colors.white.withValues(alpha: 0.2),
                color: _colorOcupacion(estado.porcentajeOcupacion),
              ),
            ),
            const SizedBox(height: 8),
            Text(
              '${estado.porcentajeOcupacion} % de ocupación',
              style: const TextStyle(
                color: Colors.white,
                fontWeight: FontWeight.w700,
              ),
            ),
          ],
          const SizedBox(height: 14),
          Text(
            actualizadoEn,
            style: TextStyle(color: Colors.white.withValues(alpha: 0.8)),
          ),
        ],
      ),
    );
  }
}

class _EstadoChip extends StatelessWidget {
  const _EstadoChip({required this.abierto, this.sobreFondoClaro = false});

  final bool abierto;
  final bool sobreFondoClaro;

  @override
  Widget build(BuildContext context) {
    final color = abierto ? AppTheme.accent : AppTheme.danger;
    return Container(
      padding: const EdgeInsets.symmetric(horizontal: 10, vertical: 5),
      decoration: BoxDecoration(
        color: sobreFondoClaro
            ? color.withValues(alpha: 0.16)
            : Colors.white.withValues(alpha: 0.16),
        borderRadius: BorderRadius.circular(20),
      ),
      child: Row(
        mainAxisSize: MainAxisSize.min,
        children: [
          Icon(Icons.circle, size: 9, color: color),
          const SizedBox(width: 6),
          Text(
            abierto ? 'Abierto' : 'Cerrado',
            style: TextStyle(
              color: sobreFondoClaro ? color : Colors.white,
              fontWeight: FontWeight.w700,
            ),
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

/// Pide el motivo del cierre (opcional). Devuelve el texto, que puede estar
/// vacío, o null si el encargado cancela.
class _MotivoCierreDialog extends StatefulWidget {
  const _MotivoCierreDialog();

  @override
  State<_MotivoCierreDialog> createState() => _MotivoCierreDialogState();
}

class _MotivoCierreDialogState extends State<_MotivoCierreDialog> {
  final TextEditingController _motivo = TextEditingController();

  @override
  void dispose() {
    _motivo.dispose();
    super.dispose();
  }

  @override
  Widget build(BuildContext context) {
    return AlertDialog(
      title: const Text('Cerrar gimnasio'),
      content: Column(
        mainAxisSize: MainAxisSize.min,
        crossAxisAlignment: CrossAxisAlignment.stretch,
        children: [
          const Text(
            'Se bloquearán los nuevos ingresos. Quienes están dentro siguen '
            'registrados hasta que salgan.',
          ),
          const SizedBox(height: 14),
          TextField(
            controller: _motivo,
            autofocus: true,
            maxLength: 200,
            minLines: 1,
            maxLines: 3,
            keyboardType: TextInputType.text,
            textCapitalization: TextCapitalization.sentences,
            textInputAction: TextInputAction.done,
            decoration: const InputDecoration(
              labelText: 'Motivo del cierre (opcional)',
              hintText: 'Ej.: mantenimiento de máquinas',
            ),
            onSubmitted: (_) => Navigator.of(context).pop(_motivo.text.trim()),
          ),
        ],
      ),
      actions: [
        TextButton(
          onPressed: () => Navigator.of(context).pop(),
          child: const Text('Cancelar'),
        ),
        FilledButton(
          style: FilledButton.styleFrom(backgroundColor: AppTheme.danger),
          onPressed: () => Navigator.of(context).pop(_motivo.text.trim()),
          child: const Text('Cerrar gimnasio'),
        ),
      ],
    );
  }
}

/// Pide la nueva capacidad máxima con teclado numérico.
class _CapacidadDialog extends StatefulWidget {
  const _CapacidadDialog({required this.actual});

  final int actual;

  @override
  State<_CapacidadDialog> createState() => _CapacidadDialogState();
}

class _CapacidadDialogState extends State<_CapacidadDialog> {
  static const int _minimo = 1;
  static const int _maximo = 10000;

  late final TextEditingController _capacidad =
      TextEditingController(text: '${widget.actual}');
  String? _error;

  @override
  void dispose() {
    _capacidad.dispose();
    super.dispose();
  }

  void _guardar() {
    final valor = int.tryParse(_capacidad.text.trim());
    if (valor == null || valor < _minimo || valor > _maximo) {
      setState(() => _error = 'Escribe un número entre $_minimo y $_maximo.');
      return;
    }
    Navigator.of(context).pop(valor);
  }

  @override
  Widget build(BuildContext context) {
    return AlertDialog(
      title: const Text('Capacidad máxima'),
      content: TextField(
        controller: _capacidad,
        autofocus: true,
        keyboardType: TextInputType.number,
        inputFormatters: [FilteringTextInputFormatter.digitsOnly],
        maxLength: 5,
        textInputAction: TextInputAction.done,
        decoration: InputDecoration(
          labelText: 'Personas',
          errorText: _error,
          counterText: '',
        ),
        onSubmitted: (_) => _guardar(),
      ),
      actions: [
        TextButton(
          onPressed: () => Navigator.of(context).pop(),
          child: const Text('Cancelar'),
        ),
        FilledButton(onPressed: _guardar, child: const Text('Guardar')),
      ],
    );
  }
}
