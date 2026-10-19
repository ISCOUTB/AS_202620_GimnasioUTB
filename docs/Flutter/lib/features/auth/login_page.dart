import 'package:flutter/material.dart';

import '../../core/api/aforo_api.dart';
import '../../core/theme/app_theme.dart';
import '../../widgets/status_card.dart';
import '../dashboard/home_shell.dart';
import '../dashboard/workspace_mode.dart';

class LoginPage extends StatelessWidget {
  const LoginPage({required this.api, super.key});

  final AforoApi api;

  void _openWorkspace(BuildContext context, WorkspaceMode mode) {
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
                    title: 'Inicio de sesión no disponible',
                    message:
                        'La API actual no ofrece autenticación ni roles. '
                        'No se validarán credenciales ni se iniciará una '
                        'sesión real.',
                    icon: Icons.lock_open_rounded,
                    color: AppTheme.warning,
                  ),
                  const SizedBox(height: 22),
                  Text(
                    'CONTINUAR SIN SESIÓN',
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
                  const SizedBox(height: 12),
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
                    'La operación de acceso usa un endpoint que actualmente '
                    'no exige autenticación. Úsalo solo en un entorno '
                    'controlado.',
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
