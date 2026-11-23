import 'package:flutter/material.dart';

import '../../core/api/aforo_api.dart';
import '../../core/state/estado_gimnasio_controller.dart';
import '../../features/access/access_page.dart';
import '../../features/auth/login_page.dart';
import '../../features/dashboard/dashboard_page.dart';
import '../../features/dashboard/workspace_mode.dart';
import '../../features/settings/settings_page.dart';

class HomeShell extends StatefulWidget {
  const HomeShell({
    required this.api,
    required this.mode,
    this.nombreEstudiante,
    super.key,
  });

  final AforoApi api;
  final WorkspaceMode mode;

  /// Nombre del estudiante que inició sesión; null para visitantes y para
  /// el encargado.
  final String? nombreEstudiante;

  @override
  State<HomeShell> createState() => _HomeShellState();
}

class _HomeShellState extends State<HomeShell> {
  late final EstadoGimnasioController _estadoGimnasio;
  int _currentIndex = 0;

  bool get _isOperator => widget.mode == WorkspaceMode.operator;

  @override
  void initState() {
    super.initState();
    _estadoGimnasio = EstadoGimnasioController(api: widget.api)..iniciar();
  }

  @override
  void dispose() {
    _estadoGimnasio.dispose();
    super.dispose();
  }

  void _logout() {
    Navigator.of(context).pushAndRemoveUntil(
      MaterialPageRoute<void>(
        builder: (_) => LoginPage(api: widget.api.sinSesiones()),
      ),
      (_) => false,
    );
  }

  void _studentSessionExpired() {
    if (!mounted || _isOperator) return;
    Navigator.of(context).pushAndRemoveUntil(
      MaterialPageRoute<void>(
        builder: (_) => LoginPage(
          api: widget.api.sinSesiones(),
          notice: 'Tu sesión expiró. Inicia sesión nuevamente.',
        ),
      ),
      (_) => false,
    );
  }

  @override
  Widget build(BuildContext context) {
    final destinations = _isOperator
        ? const [
            NavigationDestination(
              icon: Icon(Icons.space_dashboard_outlined),
              selectedIcon: Icon(Icons.space_dashboard_rounded),
              label: 'Aforo',
            ),
            NavigationDestination(
              icon: Icon(Icons.how_to_reg_outlined),
              selectedIcon: Icon(Icons.how_to_reg_rounded),
              label: 'Accesos',
            ),
          ]
        : const [
            NavigationDestination(
              icon: Icon(Icons.space_dashboard_outlined),
              selectedIcon: Icon(Icons.space_dashboard_rounded),
              label: 'Inicio',
            ),
            NavigationDestination(
              icon: Icon(Icons.qr_code_2_outlined),
              selectedIcon: Icon(Icons.qr_code_2_rounded),
              label: 'Mi QR',
            ),
            NavigationDestination(
              icon: Icon(Icons.notifications_active_outlined),
              selectedIcon: Icon(Icons.notifications_active_rounded),
              label: 'Alertas',
            ),
          ];

    final dashboard = DashboardPage(
      api: widget.api,
      mode: widget.mode,
      estadoGimnasio: _estadoGimnasio,
      nombreEstudiante: widget.nombreEstudiante,
    );
    final pages = _isOperator
        ? [
            dashboard,
            AccessPage(
              api: widget.api,
              mode: widget.mode,
              estadoGimnasio: _estadoGimnasio,
            ),
          ]
        : [
            dashboard,
            AccessPage(
              api: widget.api,
              mode: widget.mode,
              estadoGimnasio: _estadoGimnasio,
              onStudentSessionExpired: _studentSessionExpired,
            ),
            SettingsPage(
              api: widget.api,
              onStudentSessionExpired: _studentSessionExpired,
            ),
          ];

    return Scaffold(
      appBar: AppBar(
        title: const Text('Gimnasio UTB'),
        actions: [
          IconButton(
            tooltip: 'Cerrar sesión',
            onPressed: _logout,
            icon: const Icon(Icons.logout_rounded),
          ),
        ],
      ),
      body: SafeArea(
        child: IndexedStack(index: _currentIndex, children: pages),
      ),
      bottomNavigationBar: NavigationBar(
        selectedIndex: _currentIndex,
        onDestinationSelected: (index) {
          setState(() => _currentIndex = index);
        },
        destinations: destinations,
      ),
    );
  }
}
