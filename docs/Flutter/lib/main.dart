import 'package:flutter/material.dart';

import 'core/theme/app_theme.dart';
import 'core/api/aforo_api.dart';
import 'features/auth/login_page.dart';

void main() {
  runApp(GymUTBApp(api: AforoApi()));
}

class GymUTBApp extends StatelessWidget {
  const GymUTBApp({required this.api, super.key});

  final AforoApi api;

  @override
  Widget build(BuildContext context) {
    return MaterialApp(
      debugShowCheckedModeBanner: false,
      title: 'Gimnasio UTB',
      theme: AppTheme.darkTheme,
      home: LoginPage(api: api),
    );
  }
}
