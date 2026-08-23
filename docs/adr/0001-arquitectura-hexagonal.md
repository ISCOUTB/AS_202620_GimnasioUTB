# 0001 — Adoptar Arquitectura Hexagonal (Puertos y Adaptadores) para el backend

## Estado

Aceptada — semana 4, corte 1 continuación.

## Contexto

El backend de Gimnasio UTB (Node.js + Express + PostgreSQL, restricción **TC3** del arc42) necesita una forma de organizar el código antes de empezar a escribir lógica de negocio. Los atributos de calidad priorizados en el árbol de utilidad (sección "Árbol de utilidad" del arc42) que más dependen de esta decisión son:

- **ES1 — Consistencia**: el conteo de aforo debe poder probarse de forma aislada y confiable.
- **ES7 — Seguridad**: la validación de accesos (QR reutilizado, panel sin autenticación) debe poder probarse sin depender de Express.
- **ES8 — Mantenibilidad**: las reglas de horario/operación cambian con frecuencia y deben poder ajustarse sin tocar código de infraestructura.

Restricciones organizacionales relevantes: equipo de 4 personas (**OC5**), cortes de evaluación cada pocas semanas (**OC1**), lo que limita cuánto tiempo se puede invertir en andamiaje antes de mostrar funcionalidad.

## Decisión

Se adopta **Arquitectura Hexagonal (Puertos y Adaptadores)**, desplegada como un **monolito único** (no microservicios), organizada internamente por módulo de dominio. El primer módulo es `aforo` (registro de entrada/salida y conteo de ocupación).

Estructura resultante por módulo:

```
src/modules/<modulo>/
├── domain/           # entidades y reglas de negocio puras, sin dependencias externas
├── application/       # casos de uso y puertos (interfaces) que el dominio necesita
│   └── ports/
└── infrastructure/    # adaptadores concretos: HTTP (Express), persistencia (PostgreSQL), tiempo real (WebSocket)
    ├── http/
    └── persistence/
```

## Alternativas consideradas

### A. Arquitectura en Capas (Layered)

Organización tradicional por capas técnicas (controllers → services → repositories).

- **A favor**: la más rápida de escribir, el equipo ya la conoce de cursos anteriores, cero curva de aprendizaje.
- **En contra**: el dominio típicamente queda acoplado a Express y al ORM; probar una regla de negocio (ej. ES1) obliga a mockear el framework o levantar infraestructura, lo que ralentiza las pruebas automatizadas exigidas en el esqueleto de esta entrega.

### B. Monolito Modular (sin capas ni hexagonal internas)

Separar el código por carpetas de dominio (`aforo/`, `notificaciones/`, etc.) sin imponer una regla de aislamiento interna — cada módulo resuelve su propia organización.

- **A favor**: tan rápido de iniciar como capas, y ya prepara al proyecto para separar módulos en el futuro si el alcance crece.
- **En contra**: no garantiza que el dominio quede aislado de la infraestructura; el aislamiento depende de la disciplina de cada desarrollador módulo a módulo, lo cual es un riesgo real con un equipo de 4 personas trabajando en paralelo y sin convención explícita.

### C. Arquitectura Hexagonal (elegida)

- **A favor**: el dominio no depende de Express ni de PostgreSQL — se puede probar con funciones puras, lo que hace trivial mantener una prueba automatizada en verde sin infraestructura corriendo (requisito de esta entrega). Aísla exactamente los tres escenarios de calidad más críticos (ES1, ES7, ES8). Facilita extraer un módulo a futuro si el alcance escala (ES6).
- **En contra**: requiere que el equipo aprenda el patrón puertos/adaptadores (curva de aprendizaje media-alta, ver matriz comparativa en arc42 sección 4.2); el andamiaje inicial (definir puertos antes de tener funcionalidad) toma más tiempo que empezar directo con capas.

## Consecuencias

**Positivas**

- El esqueleto del repositorio puede tener una prueba automatizada en verde sin base de datos ni servidor HTTP reales corriendo, porque el dominio no depende de ellos.
- Cambiar una regla de negocio (ES8, ej. el umbral de ausencia del encargado) no debería requerir tocar los adaptadores de Express o PostgreSQL.
- Si en el futuro se necesita separar el módulo `aforo` en un servicio independiente, el trabajo de extracción es menor porque ya está desacoplado de la infraestructura.

**Negativas**

- El equipo debe invertir tiempo en entender el patrón antes de escribir la primera funcionalidad real (semana 5 en adelante); se mitiga con este esqueleto ya montado.
- Hay más archivos y carpetas que en una estructura de capas simple, lo que puede sentirse como sobre-ingeniería si no se respeta la separación con disciplina — se mitiga documentando la regla explícitamente en este ADR y revisándola en cada PR.
- Cualquier integrante nuevo del equipo necesita una introducción breve al patrón antes de contribuir con autonomía.

## Referencias

- arc42 — sección 4 "Estrategia de Solución" (matriz comparativa completa).
- arc42 — Árbol de utilidad y escenarios ES1, ES7, ES8.
