import 'dart:convert';

import 'package:flutter/material.dart';
import 'package:shared_preferences/shared_preferences.dart';

import '../../core/theme/app_theme.dart';
import '../../widgets/page_header.dart';
import '../../widgets/status_card.dart';

class SettingsPage extends StatefulWidget {
  const SettingsPage({super.key});

  @override
  State<SettingsPage> createState() => _SettingsPageState();
}

class _SettingsPageState extends State<SettingsPage> {
  static const String _preferencesKey = 'gym_occupancy_alert_preferences_v1';
  static const List<String> _dayNames = [
    'Lun',
    'Mar',
    'Mié',
    'Jue',
    'Vie',
    'Sáb',
    'Dom',
  ];

  final TextEditingController _thresholdController = TextEditingController();
  bool _enabled = false;
  bool _loading = true;
  bool _saving = false;
  Set<int> _selectedDays = {};
  TimeOfDay _startTime = const TimeOfDay(hour: 8, minute: 0);
  TimeOfDay _endTime = const TimeOfDay(hour: 18, minute: 0);
  String? _error;
  String? _savedMessage;

  @override
  void initState() {
    super.initState();
    _loadPreferences();
  }

  @override
  void dispose() {
    _thresholdController.dispose();
    super.dispose();
  }

  Future<void> _loadPreferences() async {
    try {
      final preferences = await SharedPreferences.getInstance();
      final raw = preferences.getString(_preferencesKey);
      if (raw == null) {
        if (mounted) setState(() => _loading = false);
        return;
      }

      final decoded = jsonDecode(raw);
      if (decoded is! Map<String, dynamic> ||
          decoded['enabled'] is! bool ||
          decoded['days'] is! List<dynamic> ||
          decoded['startMinutes'] is! int ||
          decoded['endMinutes'] is! int ||
          decoded['threshold'] is! String) {
        throw const FormatException('Formato de preferencias inválido.');
      }

      final days = (decoded['days'] as List<dynamic>)
          .whereType<int>()
          .where((day) => day >= 1 && day <= 7)
          .toSet();
      final startMinutes = decoded['startMinutes'] as int;
      final endMinutes = decoded['endMinutes'] as int;
      if (startMinutes < 0 ||
          startMinutes >= 24 * 60 ||
          endMinutes < 0 ||
          endMinutes >= 24 * 60) {
        throw const FormatException('Horario guardado inválido.');
      }

      if (!mounted) return;
      setState(() {
        _enabled = decoded['enabled'] as bool;
        _selectedDays = days;
        _startTime = _timeFromMinutes(startMinutes);
        _endTime = _timeFromMinutes(endMinutes);
        _thresholdController.text = decoded['threshold'] as String;
        _loading = false;
      });
    } on FormatException catch (error) {
      if (!mounted) return;
      setState(() {
        _loading = false;
        _error = 'No se pudieron leer las preferencias guardadas: $error';
      });
    } on Exception catch (error) {
      if (!mounted) return;
      setState(() {
        _loading = false;
        _error = 'No se pudieron cargar las preferencias locales: $error';
      });
    }
  }

  Future<void> _savePreferences() async {
    final thresholdText = _thresholdController.text.trim();
    final threshold = int.tryParse(thresholdText);
    if (_enabled && (threshold == null || threshold <= 0)) {
      setState(() {
        _error = 'Ingresa un umbral entero mayor que cero para activar alertas.';
        _savedMessage = null;
      });
      return;
    }
    if (_enabled && _selectedDays.isEmpty) {
      setState(() {
        _error = 'Selecciona al menos un día para activar las alertas.';
        _savedMessage = null;
      });
      return;
    }
    if (_enabled && _startTime == _endTime) {
      setState(() {
        _error = 'El horario de inicio y fin debe ser diferente.';
        _savedMessage = null;
      });
      return;
    }

    setState(() {
      _saving = true;
      _error = null;
      _savedMessage = null;
    });

    try {
      final preferences = await SharedPreferences.getInstance();
      final saved = await preferences.setString(
        _preferencesKey,
        jsonEncode({
          'enabled': _enabled,
          'days': _selectedDays.toList()..sort(),
          'startMinutes': _minutesFromTime(_startTime),
          'endMinutes': _minutesFromTime(_endTime),
          'threshold': thresholdText,
        }),
      );
      if (!saved) {
        throw StateError('El almacenamiento local rechazó el cambio.');
      }
      if (!mounted) return;
      setState(() {
        _savedMessage = 'Preferencias guardadas en este dispositivo.';
      });
    } on Exception catch (error) {
      if (!mounted) return;
      setState(() {
        _error = 'No se pudieron guardar las preferencias: $error';
      });
    } finally {
      if (mounted) setState(() => _saving = false);
    }
  }

  Future<void> _chooseTime({required bool start}) async {
    final selected = await showTimePicker(
      context: context,
      initialTime: start ? _startTime : _endTime,
      helpText: start ? 'Hora de inicio' : 'Hora de finalización',
    );
    if (selected == null || !mounted) return;
    setState(() {
      if (start) {
        _startTime = selected;
      } else {
        _endTime = selected;
      }
      _error = null;
      _savedMessage = null;
    });
  }

  int _minutesFromTime(TimeOfDay time) => time.hour * 60 + time.minute;

  TimeOfDay _timeFromMinutes(int minutes) => TimeOfDay(
        hour: minutes ~/ 60,
        minute: minutes % 60,
      );

  @override
  Widget build(BuildContext context) {
    final thresholdText = _thresholdController.text.trim();
    final thresholdPhrase = thresholdText.isEmpty ? 'N' : thresholdText;

    return ListView(
      padding: const EdgeInsets.fromLTRB(18, 10, 18, 24),
      children: [
        const PageHeader(
          title: 'Alertas de aforo',
          subtitle: 'Elige cuándo te gustaría recibir un aviso.',
          icon: Icons.notifications_active_rounded,
        ),
        const SizedBox(height: 18),
        const StatusCard(
          title: 'Configuración local solamente',
          message:
              'Estas preferencias se guardan en este dispositivo. El backend '
              'no permite sincronizarlas, evaluar el umbral ni enviar '
              'notificaciones push.',
          icon: Icons.notifications_off_outlined,
          color: AppTheme.warning,
        ),
        const SizedBox(height: 14),
        if (_loading)
          const Card(
            child: Padding(
              padding: EdgeInsets.all(18),
              child: Center(child: CircularProgressIndicator()),
            ),
          )
        else ...[
          Card(
            child: SwitchListTile.adaptive(
              contentPadding:
                  const EdgeInsets.symmetric(horizontal: 16, vertical: 6),
              title: const Text('Activar preferencias de alerta'),
              subtitle: const Text('No activa el envío de notificaciones.'),
              value: _enabled,
              onChanged: (value) {
                setState(() {
                  _enabled = value;
                  _error = null;
                  _savedMessage = null;
                });
              },
            ),
          ),
          const SizedBox(height: 14),
          Text('Días de la semana', style: Theme.of(context).textTheme.titleMedium),
          const SizedBox(height: 8),
          Wrap(
            spacing: 8,
            runSpacing: 4,
            children: List<Widget>.generate(7, (index) {
              final day = index + 1;
              return FilterChip(
                label: Text(_dayNames[index]),
                selected: _selectedDays.contains(day),
                onSelected: (selected) {
                  setState(() {
                    if (selected) {
                      _selectedDays.add(day);
                    } else {
                      _selectedDays.remove(day);
                    }
                    _error = null;
                    _savedMessage = null;
                  });
                },
              );
            }),
          ),
          const SizedBox(height: 14),
          Card(
            child: Column(
              children: [
                ListTile(
                  title: const Text('Hora de inicio'),
                  subtitle: Text(_startTime.format(context)),
                  trailing: const Icon(Icons.schedule_rounded),
                  onTap: () => _chooseTime(start: true),
                ),
                const Divider(height: 1),
                ListTile(
                  title: const Text('Hora de finalización'),
                  subtitle: Text(_endTime.format(context)),
                  trailing: const Icon(Icons.schedule_rounded),
                  onTap: () => _chooseTime(start: false),
                ),
              ],
            ),
          ),
          const SizedBox(height: 14),
          TextField(
            controller: _thresholdController,
            keyboardType: TextInputType.number,
            onChanged: (_) => setState(() {
              _error = null;
              _savedMessage = null;
            }),
            decoration: const InputDecoration(
              labelText: 'Umbral de aforo',
              hintText: 'Cantidad de personas',
              helperText: 'Se aplica a la frase de preferencia, no se evalúa.',
              prefixIcon: Icon(Icons.groups_outlined),
            ),
          ),
          const SizedBox(height: 14),
          Card(
            child: Padding(
              padding: const EdgeInsets.all(16),
              child: Text(
                'Preferencia: avisarme cuando el gimnasio tenga menos de '
                '$thresholdPhrase personas durante los días y horario '
                'seleccionados.',
                style: Theme.of(context).textTheme.bodyLarge,
              ),
            ),
          ),
          const SizedBox(height: 16),
          ElevatedButton.icon(
            onPressed: _saving ? null : _savePreferences,
            icon: _saving
                ? const SizedBox(
                    height: 18,
                    width: 18,
                    child: CircularProgressIndicator(
                      strokeWidth: 2,
                      color: Colors.white,
                    ),
                  )
                : const Icon(Icons.save_outlined),
            label: const Text('Guardar preferencias'),
          ),
        ],
        if (_error != null) ...[
          const SizedBox(height: 14),
          StatusCard(
            title: 'No se pudo completar',
            message: _error!,
            icon: Icons.error_outline_rounded,
            color: AppTheme.danger,
          ),
        ],
        if (_savedMessage != null) ...[
          const SizedBox(height: 14),
          StatusCard(
            title: 'Guardado',
            message: _savedMessage!,
            icon: Icons.check_circle_outline_rounded,
            color: AppTheme.accent,
          ),
        ],
      ],
    );
  }
}
