import 'package:flutter/material.dart';

import '../../core/api/aforo_api.dart';
import '../../features/access/access_page.dart';
import '../../features/auth/login_page.dart';
import '../../features/dashboard/dashboard_page.dart';
import '../../features/dashboard/workspace_mode.dart';
import '../../features/settings/settings_page.dart';

class HomeShell extends StatefulWidget {
  const HomeShell({
    required this.api,
    required this.mode,
    super.key,
  });

  final AforoApi api;
  final WorkspaceMode mode;

  @override
  State<HomeShell> createState() => _HomeShellState();
}

class _HomeShellState extends State<HomeShell> {
  final GlobalKey<DashboardPageState> _dashboardKey =
      GlobalKey<DashboardPageState>();
  int _currentIndex = 0;

  bool get _isOperator => widget.mode == WorkspaceMode.operator;

  void _refreshDashboard() {
    _dashboardKey.currentState?.refresh();
  }

  void _logout() {
    Navigator.of(context).pushAndRemoveUntil(
      MaterialPageRoute<void>(builder: (_) => LoginPage(api: widget.api)),
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

    final pages = _isOperator
        ? [
            DashboardPage(
              key: _dashboardKey,
              api: widget.api,
              mode: widget.mode,
            ),
            AccessPage(
              api: widget.api,
              mode: widget.mode,
              onAccessRegistered: _refreshDashboard,
            ),
          ]
        : [
            DashboardPage(
              key: _dashboardKey,
              api: widget.api,
              mode: widget.mode,
            ),
            AccessPage(api: widget.api, mode: widget.mode),
            const SettingsPage(),
          ];

    return Scaffold(
      appBar: AppBar(
        title: const Text('Gimnasio UTB'),
        actions: [
          IconButton(
            tooltip: 'Cerrar vista',
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
