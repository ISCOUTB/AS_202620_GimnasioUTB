/**
 * Funciones de aptitud (fitness functions) de la arquitectura hexagonal.
 * Reglas derivadas de docs/adr/0001-arquitectura-hexagonal.md y de
 * docs/contextos-delimitados.md. Se ejecutan con `npm run arch:check`
 * y en el pipeline de CI. Cualquier violación con severity "error" rompe el build.
 */
const MODULO = '^src/modules/[^/]+';

/** @type {import('dependency-cruiser').IConfiguration} */
module.exports = {
  forbidden: [
    {
      name: 'H1-dominio-puro',
      comment:
        'El dominio no puede depender de application, infrastructure, shared ni de paquetes npm (Express, pg...). ADR-0001.',
      severity: 'error',
      from: { path: `${MODULO}/domain/` },
      to: {
        path: [`${MODULO}/application/`, `${MODULO}/infrastructure/`, '^src/shared/', '^src/server\\.js$'],
      },
    },
    {
      name: 'H1b-dominio-sin-paquetes-externos',
      comment: 'El dominio no importa paquetes de npm ni módulos core de Node con efectos (http, fs, pg, express).',
      severity: 'error',
      from: { path: `${MODULO}/domain/` },
      to: { dependencyTypes: ['npm', 'npm-dev', 'npm-optional', 'npm-peer', 'npm-no-pkg', 'npm-unknown', 'core'] },
    },
    {
      name: 'H2-aplicacion-sin-infraestructura',
      comment: 'La capa de aplicación (casos de uso y puertos) depende de puertos, nunca de adaptadores ni de infraestructura.',
      severity: 'error',
      from: { path: `${MODULO}/application/` },
      to: { path: [`${MODULO}/infrastructure/`, '^src/server\\.js$'] },
    },
    {
      name: 'H2b-aplicacion-sin-paquetes-externos',
      comment: 'La capa de aplicación no importa Express, pg ni otros paquetes de infraestructura.',
      severity: 'error',
      from: { path: `${MODULO}/application/` },
      to: { dependencyTypes: ['npm', 'npm-dev', 'npm-optional', 'npm-peer', 'npm-no-pkg', 'npm-unknown'] },
    },
    {
      name: 'H3-adaptadores-no-se-conocen',
      comment: 'Los adaptadores de entrada (http) y de salida (persistence) no se importan entre sí.',
      severity: 'error',
      from: { path: `${MODULO}/infrastructure/http/` },
      to: { path: `${MODULO}/infrastructure/persistence/` },
    },
    {
      name: 'H4-solo-el-composition-root-instancia-adaptadores',
      comment:
        'Solo src/server.js (composition root) puede importar adaptadores concretos de persistencia. Los demás dependen del puerto.',
      severity: 'error',
      from: { pathNot: ['^src/server\\.js$', `${MODULO}/infrastructure/persistence/`] },
      to: { path: `${MODULO}/infrastructure/persistence/aforo-.*\\.adapter\\.js$` },
    },
    {
      name: 'M1-modulos-aislados',
      comment:
        'Un módulo no importa archivos internos de otro módulo (dueño único de datos, docs/contextos-delimitados.md). Hoy solo existe `aforo`; la regla vigila a los futuros.',
      severity: 'error',
      from: { path: '^src/modules/([^/]+)/' },
      to: { path: '^src/modules/([^/]+)/', pathNot: '^src/modules/$1/' },
    },
    {
      name: 'M2-shared-no-depende-de-modulos',
      comment: 'src/shared no puede conocer a los módulos de dominio.',
      severity: 'error',
      from: { path: '^src/shared/' },
      to: { path: '^src/modules/' },
    },
    {
      name: 'G1-sin-ciclos',
      comment: 'No se permiten dependencias circulares.',
      severity: 'error',
      from: {},
      to: { circular: true },
    },
    {
      name: 'G2-sin-modulos-huerfanos',
      comment: 'Código que nadie importa es candidato a eliminar (típico de código generado y abandonado).',
      severity: 'warn',
      from: { orphan: true, pathNot: ['^src/server\\.js$', '\\.gitkeep$'] },
      to: {},
    },
    {
      name: 'G3-sin-dependencias-no-declaradas',
      comment: 'Todo paquete importado debe estar declarado en package.json (evita dependencias fantasma).',
      severity: 'error',
      from: {},
      to: { dependencyTypes: ['npm-no-pkg', 'npm-unknown'] },
    },
  ],
  options: {
    doNotFollow: { path: 'node_modules' },
    tsPreCompilationDeps: false,
    exclude: { path: '\\.gitkeep$' },
    reporterOptions: { text: { highlightFocused: true } },
  },
};
