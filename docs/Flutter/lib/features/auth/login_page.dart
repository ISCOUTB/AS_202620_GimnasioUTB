import 'package:flutter/material.dart';

import '../../core/api/aforo_api.dart';
import '../../core/theme/app_theme.dart';
import '../../widgets/status_card.dart';
import '../dashboard/home_shell.dart';
import '../dashboard/workspace_mode.dart';

class LoginPage extends StatefulWidget {
  const LoginPage({required this.api, this.notice, super.key});

  final AforoApi api;
  final String? notice;

  @override
  State<LoginPage> createState() => _LoginPageState();
}

class _LoginPageState extends State<LoginPage> {
  final TextEditingController _tokenController = TextEditingController();
  final TextEditingController _correoEstudianteController =
      TextEditingController();
  final TextEditingController _contrasenaController = TextEditingController();
  bool _ocultarToken = true;
  bool _ocultarContrasena = true;
  bool _iniciandoSesion = false;
  bool _verificandoEncargado = false;
  String? _errorToken;
  String? _errorCorreo;
  String? _errorEstudiante;

  @override
  void dispose() {
    _tokenController.dispose();
    _correoEstudianteController.dispose();
    _contrasenaController.dispose();
    super.dispose();
  }

  void _continuarComoVisitante() {
    Navigator.of(context).pushReplacement(
      MaterialPageRoute<void>(
        builder: (_) =>
            HomeShell(api: widget.api, mode: WorkspaceMode.student),
      ),
    );
  }

  /// Comprueba la contraseña de encargado con el servidor antes de abrir el
  /// panel. Solo vive en memoria (ADR-0007): no se guarda en el dispositivo.
  Future<void> _ingresarComoEncargado() async {
    if (_verificandoEncargado) return;
    final token = _tokenController.text.trim();
    if (token.isEmpty) {
      setState(() => _errorToken = 'Ingresa la contraseña de encargado.');
      return;
    }
    FocusScope.of(context).unfocus();
    setState(() {
      _verificandoEncargado = true;
      _errorToken = null;
    });
    final api = widget.api.conTokenOperador(token);
    try {
      await api.verificarEncargado();
      if (!mounted) return;
      _tokenController.clear();
      Navigator.of(context).pushReplacement(
        MaterialPageRoute<void>(
          builder: (_) => HomeShell(api: api, mode: WorkspaceMode.operator),
        ),
      );
    } on AforoApiException catch (error) {
      if (mounted) setState(() => _errorToken = error.message);
    } finally {
      if (mounted) setState(() => _verificandoEncargado = false);
    }
  }

  Future<void> _iniciarSesionEstudiante() async {
    if (_iniciandoSesion) return;
    final correo = _correoEstudianteController.text.trim();
    final contrasena = _contrasenaController.text;
    if (correo.isEmpty || contrasena.isEmpty) {
      setState(() {
        _errorCorreo = correo.isEmpty ? 'Ingresa tu correo estudiantil.' : null;
        _errorEstudiante = contrasena.isEmpty ? 'Ingresa tu contraseña.' : null;
      });
      return;
    }
    FocusScope.of(context).unfocus();
    setState(() {
      _iniciandoSesion = true;
      _errorCorreo = null;
      _errorEstudiante = null;
    });
    try {
      final sesion = await widget.api.iniciarSesionEstudiante(
        correo: correo,
        contrasena: contrasena,
      );
      if (!mounted) return;
      Navigator.of(context).pushReplacement(
        MaterialPageRoute<void>(
          builder: (_) => HomeShell(
            api: widget.api.conTokenEstudiante(sesion.token),
            mode: WorkspaceMode.student,
            nombreEstudiante: sesion.nombre,
          ),
        ),
      );
    } on AforoApiException catch (error) {
      if (mounted) setState(() => _errorEstudiante = error.message);
    } finally {
      if (mounted) setState(() => _iniciandoSesion = false);
    }
  }

  @override
  Widget build(BuildContext context) {
    return Scaffold(
      body: SafeArea(
        child: LayoutBuilder(
          builder: (context, constraints) => SingleChildScrollView(
            padding: const EdgeInsets.fromLTRB(24, 28, 24, 24),
            child: ConstrainedBox(
              constraints:
                  BoxConstraints(minHeight: constraints.maxHeight - 52),
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
                          style:
                              Theme.of(context).textTheme.bodyLarge?.copyWith(
                                    color: Colors.white.withValues(alpha: 0.86),
                                  ),
                        ),
                      ],
                    ),
                  ),
                  const SizedBox(height: 24),
                  const StatusCard(
                    title: 'Acceso por perfil',
                    message: 'Estudiantes: inicia sesión con tu correo '
                        'estudiantil para ver tu código de acceso. Encargados: '
                        'ingresa con la contraseña de encargado.',
                    icon: Icons.lock_outline_rounded,
                  ),
                  if (widget.notice != null) ...[
                    const SizedBox(height: 12),
                    StatusCard(
                      title: 'Inicia sesión nuevamente',
                      message: widget.notice!,
                      icon: Icons.info_outline_rounded,
                    ),
                  ],
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
                    onPressed: _continuarComoVisitante,
                    icon: const Icon(Icons.insights_rounded),
                    label: const Text('Continuar como visitante'),
                  ),
                  const SizedBox(height: 20),
                  TextField(
                    controller: _correoEstudianteController,
                    autocorrect: false,
                    enableSuggestions: false,
                    keyboardType: TextInputType.emailAddress,
                    textInputAction: TextInputAction.next,
                    autofillHints: const [AutofillHints.email],
                    decoration: InputDecoration(
                      labelText: 'Correo estudiantil',
                      hintText: 'usuario@utb.edu.co',
                      errorText: _errorCorreo,
                      prefixIcon: const Icon(Icons.email_outlined),
                    ),
                    onChanged: (_) {
                      if (_errorCorreo != null) {
                        setState(() => _errorCorreo = null);
                      }
                    },
                  ),
                  const SizedBox(height: 12),
                  TextField(
                    controller: _contrasenaController,
                    obscureText: _ocultarContrasena,
                    autocorrect: false,
                    enableSuggestions: false,
                    keyboardType: TextInputType.visiblePassword,
                    textInputAction: TextInputAction.done,
                    autofillHints: const [AutofillHints.password],
                    decoration: InputDecoration(
                      labelText: 'Contraseña',
                      errorText: _errorEstudiante,
                      prefixIcon: const Icon(Icons.lock_outline_rounded),
                      suffixIcon: IconButton(
                        tooltip: _ocultarContrasena ? 'Mostrar' : 'Ocultar',
                        onPressed: () => setState(
                          () => _ocultarContrasena = !_ocultarContrasena,
                        ),
                        icon: Icon(
                          _ocultarContrasena
                              ? Icons.visibility_outlined
                              : Icons.visibility_off_outlined,
                        ),
                      ),
                    ),
                    onChanged: (_) {
                      if (_errorEstudiante != null) {
                        setState(() => _errorEstudiante = null);
                      }
                    },
                    onSubmitted: (_) => _iniciarSesionEstudiante(),
                  ),
                  const SizedBox(height: 10),
                  OutlinedButton.icon(
                    onPressed:
                        _iniciandoSesion ? null : _iniciarSesionEstudiante,
                    icon: _iniciandoSesion
                        ? const SizedBox(
                            height: 18,
                            width: 18,
                            child: CircularProgressIndicator(strokeWidth: 2),
                          )
                        : const Icon(Icons.login_rounded),
                    label: const Text('Iniciar sesión como estudiante'),
                  ),
                  const SizedBox(height: 20),
                  TextField(
                    controller: _tokenController,
                    obscureText: _ocultarToken,
                    autocorrect: false,
                    enableSuggestions: false,
                    keyboardType: TextInputType.visiblePassword,
                    textInputAction: TextInputAction.done,
                    decoration: InputDecoration(
                      labelText: 'Contraseña de encargado',
                      errorText: _errorToken,
                      prefixIcon: const Icon(Icons.admin_panel_settings_outlined),
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
                    onSubmitted: (_) => _ingresarComoEncargado(),
                  ),
                  const SizedBox(height: 10),
                  OutlinedButton.icon(
                    onPressed:
                        _verificandoEncargado ? null : _ingresarComoEncargado,
                    icon: _verificandoEncargado
                        ? const SizedBox(
                            height: 18,
                            width: 18,
                            child: CircularProgressIndicator(strokeWidth: 2),
                          )
                        : const Icon(Icons.badge_outlined),
                    label: const Text('Ingresar como encargado'),
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
