import 'package:flutter/material.dart';

import 'core/theme/app_theme.dart';
import 'features/auth/login_page.dart';

void main() {
  runApp(const GymUTBApp());
}

class GymUTBApp extends StatelessWidget {
  const GymUTBApp({super.key});

  @override
  Widget build(BuildContext context) {
    return MaterialApp(
      debugShowCheckedModeBanner: false,
      title: 'Gym UTB',
      theme: AppTheme.lightTheme,
      home: const LoginPage(),
    );
  }
}
