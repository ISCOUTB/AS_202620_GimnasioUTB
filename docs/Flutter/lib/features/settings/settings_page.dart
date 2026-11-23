import 'dart:async';
import 'dart:convert';

import 'package:flutter/material.dart';
import 'package:intl/intl.dart';
import 'package:shared_preferences/shared_preferences.dart';

import '../../core/api/aforo_api.dart';
import '../../core/theme/app_theme.dart';
import '../../widgets/page_header.dart';
import '../../widgets/status_card.dart';

class SettingsPage extends StatefulWidget {
  const SettingsPage({
    required this.api,
    required this.onStudentSessionExpired,
    super.key,
  });

  final AforoApi api;
  final VoidCallback onStudentSessionExpired;

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
  bool _refreshingNotifications = false;
  int? _capacity;
  Set<int> _selectedDays = {};
  TimeOfDay _startTime = const TimeOfDay(hour: 8, minute: 0);
  TimeOfDay _endTime = const TimeOfDay(hour: 18, minute: 0);
  String? _error;
  String? _savedMessage;
  List<NotificacionEstudiante> _notifications = [];
  Timer? _refreshTimer;

  @override
  void initState() {
    super.initState();
    _loadPreferences();
    _refreshTimer = Timer.periodic(
      const Duration(seconds: 30),
      (_) => _loadNotifications(showErrors: false),
    );
  }

  @override
  void dispose() {
    _thresholdController.dispose();
    _refreshTimer?.cancel();
    super.dispose();
  }

  Future<void> _loadPreferences() async {
    if (!widget.api.tieneSesionEstudiante) {
      if (mounted) {
        setState(() {
          _loading = false;
          _error = 'Inicia sesión como estudiante para sincronizar las alertas.';
        });
      }
      return;
    }
    try {
      final preferences = await SharedPreferences.getInstance();
      final raw = preferences.getString(_preferencesKey);
      final local = raw == null ? null : _decodeLocalPreferences(raw);
      final remote = await widget.api.consultarPreferenciasAlerta();
      _capacity = remote.capacidadMaxima;
      final serverPreferences = remote.preferencias;
      if (serverPreferences != null) {
        _applyPreferences(
          enabled: serverPreferences.habilitada,
          threshold: serverPreferences.umbral?.toString() ?? '',
          days: serverPreferences.dias,
          startMinutes: serverPreferences.horaInicio,
          endMinutes: serverPreferences.horaFin,
        );
        await _saveLocalPreferences();
      } else if (local != null) {
        final thresholdText = local['threshold'] as String;
        final threshold = thresholdText.isEmpty ? null : int.tryParse(thresholdText);
        if (thresholdText.isNotEmpty && (threshold == null || threshold < 1)) {
          throw const FormatException('El umbral local guardado no es válido.');
        }
        final enabled = local['enabled'] as bool;
        if (enabled && threshold == null) {
          throw const FormatException('El umbral local guardado no es válido.');
        }
        final days = (local['days'] as List<dynamic>).cast<int>();
        final startMinutes = local['startMinutes'] as int;
        final endMinutes = local['endMinutes'] as int;
        _applyPreferences(
          enabled: enabled,
          threshold: thresholdText,
          days: days,
          startMinutes: startMinutes,
          endMinutes: endMinutes,
        );
        final saved = await widget.api.guardarPreferenciasAlerta(
          habilitada: enabled,
          umbral: threshold,
          dias: days,
          horaInicio: startMinutes,
          horaFin: endMinutes,
        );
        _applyPreferences(
          enabled: saved.habilitada,
          threshold: saved.umbral?.toString() ?? '',
          days: saved.dias,
          startMinutes: saved.horaInicio,
          endMinutes: saved.horaFin,
        );
      }
      await _saveLocalPreferences();
      await _loadNotifications(showErrors: false);
      if (!mounted) return;
      setState(() => _loading = false);
    } on SesionEstudianteExpiradaException {
      widget.onStudentSessionExpired();
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
        _error = 'No se pudieron sincronizar las preferencias: $error';
      });
    }
  }

  Map<String, dynamic> _decodeLocalPreferences(String raw) {
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
        .toList();
    final startMinutes = decoded['startMinutes'] as int;
    final endMinutes = decoded['endMinutes'] as int;
    if (days.length != (decoded['days'] as List<dynamic>).length ||
        startMinutes < 0 ||
        startMinutes >= 24 * 60 ||
        endMinutes < 0 ||
        endMinutes >= 24 * 60) {
      throw const FormatException('Preferencias locales inválidas.');
    }
    return {...decoded, 'days': days};
  }

  void _applyPreferences({
    required bool enabled,
    required String threshold,
    required List<int> days,
    required int startMinutes,
    required int endMinutes,
  }) {
    if (startMinutes < 0 ||
        startMinutes >= 24 * 60 ||
        endMinutes < 0 ||
        endMinutes >= 24 * 60) {
      throw const FormatException('Horario guardado inválido.');
    }
    _enabled = enabled;
    _selectedDays = days.toSet();
    _startTime = _timeFromMinutes(startMinutes);
    _endTime = _timeFromMinutes(endMinutes);
    _thresholdController.text = threshold;
  }

  Future<void> _saveLocalPreferences() async {
    final preferences = await SharedPreferences.getInstance();
    final saved = await preferences.setString(
      _preferencesKey,
      jsonEncode({
        'enabled': _enabled,
        'days': _selectedDays.toList()..sort(),
        'startMinutes': _minutesFromTime(_startTime),
        'endMinutes': _minutesFromTime(_endTime),
        'threshold': _thresholdController.text.trim(),
      }),
    );
    if (!saved) throw StateError('El almacenamiento local rechazó el cambio.');
  }

  Future<void> _loadNotifications({bool showErrors = true}) async {
    if (_refreshingNotifications || !widget.api.tieneSesionEstudiante) return;
    _refreshingNotifications = true;
    try {
      final notifications = await widget.api.consultarNotificaciones();
      if (mounted) setState(() => _notifications = notifications);
    } on SesionEstudianteExpiradaException {
      widget.onStudentSessionExpired();
    } on AforoApiException catch (error) {
      if (showErrors && mounted) {
        setState(() => _error = 'No se pudieron actualizar las notificaciones: $error');
      }
    } finally {
      _refreshingNotifications = false;
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
    if (thresholdText.isNotEmpty && (threshold == null || threshold <= 0)) {
      setState(() {
        _error = 'El umbral debe ser un entero positivo.';
        _savedMessage = null;
      });
      return;
    }
    if (_enabled && _capacity != null && threshold! > _capacity!) {
      setState(() {
        _error = 'El umbral no puede superar la capacidad máxima de $_capacity personas.';
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
      final saved = await widget.api.guardarPreferenciasAlerta(
        habilitada: _enabled,
        umbral: threshold,
        dias: _selectedDays.toList()..sort(),
        horaInicio: _minutesFromTime(_startTime),
        horaFin: _minutesFromTime(_endTime),
      );
      _capacity = (await widget.api.consultarPreferenciasAlerta()).capacidadMaxima;
      _applyPreferences(
        enabled: saved.habilitada,
        threshold: saved.umbral?.toString() ?? '',
        days: saved.dias,
        startMinutes: saved.horaInicio,
        endMinutes: saved.horaFin,
      );
      await _saveLocalPreferences();
      await _loadNotifications(showErrors: false);
      if (!mounted) return;
      setState(() {
        _savedMessage = 'Preferencias sincronizadas con el gimnasio.';
      });
    } on SesionEstudianteExpiradaException {
      widget.onStudentSessionExpired();
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
    final thresholdValue = int.tryParse(thresholdText);

    return RefreshIndicator(
      onRefresh: () => _loadNotifications(),
      child: ListView(
      physics: const AlwaysScrollableScrollPhysics(),
      padding: const EdgeInsets.fromLTRB(18, 10, 18, 24),
      children: [
        const PageHeader(
          title: 'Alertas de aforo',
          subtitle: 'Elige cuándo te gustaría recibir un aviso.',
          icon: Icons.notifications_active_rounded,
        ),
        const SizedBox(height: 18),
        const StatusCard(
          title: 'Alertas automáticas de aforo',
          message:
              'Las preferencias se sincronizan con el servidor. Las alertas '
              'automáticas respetan la hora de Colombia; los demás avisos del '
              'sistema no dependen de estos horarios. Los avisos aparecen aquí; '
              'Firebase push no está configurado.',
          icon: Icons.notifications_active_outlined,
          color: AppTheme.accent,
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
          if (_capacity != null) ...[
            Text('Capacidad máxima vigente: $_capacity personas'),
            const SizedBox(height: 8),
          ],
          if (_enabled &&
              thresholdValue != null &&
              _capacity != null &&
              thresholdValue > _capacity!) ...[
            StatusCard(
              title: 'Alerta pausada por capacidad',
              message:
                  'Tu umbral supera la capacidad máxima actual. La '
                  'preferencia se conserva, pero la alerta se reanudará al '
                  'ajustar el umbral a $_capacity personas o menos.',
              icon: Icons.pause_circle_outline_rounded,
              color: AppTheme.warning,
            ),
            const SizedBox(height: 14),
          ],
          Card(
            child: SwitchListTile.adaptive(
              contentPadding:
                  const EdgeInsets.symmetric(horizontal: 16, vertical: 6),
              title: const Text('Activar preferencias de alerta'),
              subtitle: const Text('Activa solo las alertas automáticas de aforo.'),
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
              helperText: 'Debe ser compatible con la capacidad máxima vigente.',
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
          const SizedBox(height: 24),
          Text(
            'Notificaciones',
            style: Theme.of(context).textTheme.titleLarge,
          ),
          const SizedBox(height: 8),
          if (_notifications.isEmpty)
            const Card(
            child: ListTile(
              leading: Icon(Icons.notifications_none_rounded),
              title: Text('No tienes notificaciones todavía'),
              subtitle: Text('Las alertas automáticas aparecerán aquí.'),
            ),
            )
          else
            ..._notifications.map((notification) => Card(
                child: ListTile(
                  leading: Icon(
                    notification.tipo == 'AFORO_BAJO'
                        ? Icons.groups_rounded
                        : Icons.info_outline_rounded,
                  ),
                  title: Text(
                    notification.tipo == 'AFORO_BAJO'
                        ? 'Aforo por debajo de tu umbral'
                        : 'Aviso del gimnasio',
                  ),
                  subtitle: Text(
                    '${notification.mensaje}\n'
                    '${DateFormat('d MMM, HH:mm').format(notification.creadaEn.toLocal())}',
                  ),
                  isThreeLine: true,
                ),
              )),
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
      ),
    );
  }
}
