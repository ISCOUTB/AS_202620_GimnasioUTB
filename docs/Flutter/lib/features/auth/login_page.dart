import 'package:flutter/material.dart';

import '../../core/api/aforo_api.dart';
import '../../core/theme/app_theme.dart';
import '../../widgets/status_card.dart';
import '../dashboard/home_shell.dart';
import '../dashboard/workspace_mode.dart';

class LoginPage extends StatefulWidget {
  const LoginPage({required this.api, super.key});

  final AforoApi api;

  @override
  State<LoginPage> createState() => _LoginPageState();
}

class _LoginPageState extends State<LoginPage> {
  final TextEditingController _tokenController = TextEditingController();
  bool _ocultarToken = true;
  String? _errorToken;

  @override
  void dispose() {
    _tokenController.dispose();
    super.dispose();
  }

  void _openWorkspace(BuildContext context, WorkspaceMode mode) {
    var api = widget.api;
    if (mode == WorkspaceMode.operator) {
      final token = _tokenController.text.trim();
      if (token.isEmpty) {
        setState(() => _errorToken = 'Ingresa el token de operador.');
        return;
      }
      // El token queda solo en memoria (ADR-0007). El backend lo valida en
      // cada registro; si es incorrecto, la pantalla de accesos mostrará 401.
      api = api.conTokenOperador(token);
      _tokenController.clear();
    }
    Navigator.of(context).pushReplacement(
      MaterialPageRoute<void>(
        builder: (_) => HomeShell(api: api, mode: mode),
      ),
    );
  }

  @override
  Widget build(BuildContext context) {
    return Scaffold(
      body: SafeArea(
        child: LayoutBuilder(
          builder: (context, constraints) => SingleChildScrollView(
            padding: const EdgeInsets.fromLTRB(24, 28, 24, 24),
            child: ConstrainedBox(
              constraints: BoxConstraints(minHeight: constraints.maxHeight - 52),
              child: Column(
                crossAxisAlignment: CrossAxisAlignment.stretch,
                children: [
                  const SizedBox(height: 30),
                  Container(
                    width: double.infinity,
                    padding: const EdgeInsets.all(24),
                    decoration: BoxDecoration(
                      gradient: const LinearGradient(
                        colors: [
                          Color(0xFF1644B7),
                          Color(0xFF1768D2),
                          Color(0xFF237BE8),
                        ],
                        begin: Alignment.bottomLeft,
                        end: Alignment.topRight,
                      ),
                      borderRadius: BorderRadius.circular(28),
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
                        Container(
                          height: 62,
                          width: 62,
                          alignment: Alignment.center,
                          decoration: BoxDecoration(
                            color: Colors.white.withValues(alpha: 0.15),
                            borderRadius: BorderRadius.circular(20),
                          ),
                          child: const Icon(
                            Icons.fitness_center_rounded,
                            color: Colors.white,
                            size: 32,
                          ),
                        ),
                        const SizedBox(height: 24),
                        Text(
                          'Gimnasio UTB',
                          style: Theme.of(context)
                              .textTheme
                              .headlineLarge
                              ?.copyWith(color: Colors.white, fontSize: 32),
                        ),
                        const SizedBox(height: 8),
                        Text(
                          'Aforo y acceso al gimnasio, en un solo lugar.',
                          style: Theme.of(context).textTheme.bodyLarge?.copyWith(
                                color: Colors.white.withValues(alpha: 0.86),
                              ),
                        ),
                      ],
                    ),
                  ),
                  const SizedBox(height: 24),
                  const StatusCard(
                    title: 'Acceso por perfil',
                    message:
                        'Consultar el aforo es público. Registrar entradas '
                        'y salidas exige el token de operador que entrega '
                        'el administrador del gimnasio.',
                    icon: Icons.lock_outline_rounded,
                  ),
                  const SizedBox(height: 22),
                  Text(
                    'ELIGE CÓMO ENTRAR',
                    style: Theme.of(context).textTheme.labelLarge?.copyWith(
                          color: AppTheme.textSecondary,
                          letterSpacing: 1.1,
                          fontWeight: FontWeight.w700,
                        ),
                  ),
                  const SizedBox(height: 12),
                  ElevatedButton.icon(
                    onPressed: () => _openWorkspace(
                      context,
                      WorkspaceMode.student,
                    ),
                    icon: const Icon(Icons.insights_rounded),
                    label: const Text('Consultar aforo'),
                  ),
                  const SizedBox(height: 20),
                  TextField(
                    controller: _tokenController,
                    obscureText: _ocultarToken,
                    autocorrect: false,
                    enableSuggestions: false,
                    decoration: InputDecoration(
                      labelText: 'Token de operador',
                      errorText: _errorToken,
                      suffixIcon: IconButton(
                        tooltip: _ocultarToken ? 'Mostrar' : 'Ocultar',
                        onPressed: () =>
                            setState(() => _ocultarToken = !_ocultarToken),
                        icon: Icon(
                          _ocultarToken
                              ? Icons.visibility_outlined
                              : Icons.visibility_off_outlined,
                        ),
                      ),
                    ),
                    onChanged: (_) {
                      if (_errorToken != null) {
                        setState(() => _errorToken = null);
                      }
                    },
                  ),
                  const SizedBox(height: 10),
                  OutlinedButton.icon(
                    onPressed: () => _openWorkspace(
                      context,
                      WorkspaceMode.operator,
                    ),
                    icon: const Icon(Icons.admin_panel_settings_outlined),
                    label: const Text('Operación de aforo'),
                  ),
                  const SizedBox(height: 18),
                  Text(
                    'El token no se guarda en el dispositivo: se borra al '
                    'cerrar la vista de operación.',
                    style: Theme.of(context).textTheme.bodySmall,
                  ),
                ],
              ),
            ),
          ),
        ),
      ),
    );
  }
}
