import 'dart:convert';

import 'package:flutter/material.dart';
import 'package:flutter_test/flutter_test.dart';
import 'package:gimnasio_u_t_b/core/api/aforo_api.dart';
import 'package:gimnasio_u_t_b/features/dashboard/home_shell.dart';
import 'package:gimnasio_u_t_b/features/dashboard/workspace_mode.dart';
import 'package:http/http.dart' as http;
import 'package:http/testing.dart';

void main() {
  testWidgets('una sesión expirada regresa al login con un aviso',
      (tester) async {
    final client = MockClient((request) async {
      if (request.url.path == '/api/v1/aforo') {
        return http.Response(
          jsonEncode({
            'status': 'success',
            'data': {'aforoActual': 0},
          }),
          200,
        );
      }
      if (request.url.path == '/api/v1/estudiantes/qr') {
        return http.Response(
          jsonEncode({
            'status': 'error',
            'message': 'La sesión de estudiante no es válida o expiró.',
          }),
          401,
        );
      }
      fail('Ruta inesperada: ${request.url.path}');
    });

    await tester.pumpWidget(
      MaterialApp(
        home: HomeShell(
          api: AforoApi(
            client: client,
            baseUrl: 'https://api.test',
          ).conTokenEstudiante('token-vencido'),
          mode: WorkspaceMode.student,
        ),
      ),
    );
    await tester.pumpAndSettle();

    expect(find.text('Tu sesión expiró. Inicia sesión nuevamente.'),
        findsOneWidget);
  });
}
