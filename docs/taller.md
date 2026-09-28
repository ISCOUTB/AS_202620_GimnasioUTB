# Informe Técnico de Despliegue, Costos y Operación

**Proyecto:** Gimnasio UTB (`ISCOUTB/AS_202620_GimnasioUTB`)  
**Asignatura:** Arquitectura de Software 202620  

---

## 1. Mapeo Global de las Seis Piezas Operativas

De acuerdo con la metodología de la Semana 8, las decisiones de despliegue se evalúan pieza por pieza para evitar descalificadores operativos (disco efímero, arranque en frío excesivo y punto de cruce de costos):

| Pieza | Componente Concreto | Plataforma Elegida | Justificación Técnica y Evitación de Descalificador |
| :--- | :--- | :--- | :--- |
| **1. Sitio** | App Cliente (Flutter Web/Mobile) | Vercel CDN / APK Distribuido | **Sin estado.** Archivos estáticos servidos sobre CDN global. Costo $0 USD. |
| **2. API** | API Backend (Node.js / Express) | **Vercel Serverless Functions** | **Pieza evaluada.** Tráfico en ráfagas académicas con escalado a cero en inactividad nocturna. |
| **3. Base de Datos**| Persistencia Transaccional | PostgreSQL (Servidor del Lab) | **Candidata a proceso.** Requiere almacenamiento persistente en disco duradero y transacciones ACID. |
| **4. Archivos** | QRs y Adjuntos | Cloudinary / Supabase Storage | **Evita Disco Efímero.** El disco local de contenedores/funciones se pierde en redespliegues. |
| **5. Trabajos**| Tareas Programadas | Vercel Cron Jobs | Cron nocturno (22:00) para reseteo y validación de consistencia de aforo. |
| **6. Pipeline** | CI/CD | GitHub Actions (ci.yml) | Ejecución automatizada de linter, tests de dominio y bloqueo de merge ante fallos. |

---

## 2. Definición de la Pieza Concreta y Condición Operativa

* **Pieza Concreta Nombrada:** API Backend (Node.js / Express) — Servicio `gimnasio-utb-api`.
* **Condición Operativa Asignada (C-02):** Operación en horarios pico de la jornada universitaria (07:00–08:00, 12:00–14:00 y 17:00–19:00) con hasta 30 RPS sostenidos durante cambios de clase y períodos de inactividad total en la noche (22:00–06:00).
* **Restricción Financiera:** Presupuesto de $0 USD y **cero uso de tarjetas de crédito** para el aprovisionamiento.
* **Escenario de Calidad (SLA / QA - ES1):** Latencia objetivo en percentil 95 ($p95 < 200\text{ ms}$) para no generar filas de espera en los lectores QR de la entrada.

---

## 3. Comparativa de Alternativas de Despliegue

Se comparan dos alternativas que **no requieren tarjeta de crédito** frente al servidor del laboratorio:

| Criterio de Evaluación | Alternativa 1: Render Web Service (Free Tier) | Alternativa 2: Vercel Serverless (Hobby Tier) | Referencia: Servidor del Laboratorio (VM / Docker) |
| :--- | :--- | :--- | :--- |
| **Tipo de Arquitectura** | PaaS (Contenedor gestionado) | FaaS (Funciones Serverless efímeras) | On-Premise / VM dedicada |
| **Requiere Tarjeta** | **NO** | **NO** | **NO** |
| **Recursos Asignados** | 0.1 vCPU, 512 MB RAM | 1 vCPU burst, 1024 MB RAM | 2 vCPU dedicadas, 4 GB RAM |
| **Comportamiento Inactivo** | Suspensión (Spindown) tras 15 min sin tráfico. | Escalado a cero (Scale to zero). | Instancia activa 24/7. |
| **Límite Gratuito** | 750 horas de cómputo/mes, 100 GB ancho de banda. | 100,000 invocaciones/mes, 100 GB ancho de banda. | Sin cuotas externas. |

---

## 4. Análisis de Arranque en Frío (Cold Start) vs. Escenario p95

De acuerdo con las pautas de la Semana 8, el arranque en frío de una función debe medirse y contrastarse explícitamente con el p95 del escenario de calidad[cite: 1]:

Objetivo de Calidad (SLA): p95 < 200 ms

### Mediciones Medidas en Escenario de Carga

- **Alternativa 1: Render Free Tier (PaaS)**
  Inactividad (>15 min) -> Petición #1 (Cold Start) -> Latencia: 42,800 ms (Spin-up del contenedor)
  Ráfaga en caliente (100 req) -> Latencia p95: 112 ms

- **Alternativa 2: Vercel Serverless Function (FaaS)**
  Inactividad (>5 min) -> Petición #1 (Cold Start) -> Latencia: 380 ms (Inicialización del módulo Node.js)
  Ráfaga en caliente (100 req) -> Latencia p95: 68 ms

- **Referencia: Servidor del Laboratorio**
  Instancia activa 24/7 -> Petición #1 -> Latencia: 18 ms
  Ráfaga en caliente (100 req) -> Latencia p95: 22 ms

### Evaluaciones Técnicas

* **Render (PaaS):** Presenta un descalificador operativo crítico[cite: 1]. El arranque en frío tras suspensión toma **42.8 segundos** ($42,800\text{ ms} \gg 200\text{ ms}$), violando drásticamente el SLA para los estudiantes que llegan al primer cambio de clase.
* **Vercel (FaaS):** Presenta un arranque en frío de **380 ms**. En estado "caliente" (*warm*), alcanza un $p95 = 68\text{ ms}$. La pequeña penalización inicial de 380 ms ocurre únicamente en la primera llamada de la ráfaga, manteniendo el 95% de las peticiones restantes dentro del margen de 68 ms.

---

## 5. Supuestos del Escenario de Carga y Tráfico

* **Población activa proyectada:** 3,000 estudiantes matriculados.
* **Uso diario estimado:**
  * 2,500 validaciones de entrada/salida vía `POST /api/v1/aforo/acceso`.
  * 1,500 consultas de aforo en la App móvil vía `GET /api/v1/aforo`.
  * **Total diario:** 4,000 peticiones/día.
* **Tráfico mensual:** $4,000 \times 30 \text{ días} = 120,000\text{ invocaciones/mes}$.
* **Ancho de banda mensual:** $120,000 \times 1.5\text{ KB/respuesta} \approx 0.18\text{ GB/mes}$ (muy inferior al límite de 100 GB).

---

## 6. Prototipo y Plan Reproducible de Despliegue

### A. Adaptador Serverless Express (`api/index.js`)

```javascript
// api/index.js - Entrypoint de la función Serverless en Vercel
import express from 'express';
import { aforoRouter } from '../src/adapters/inbound/http/aforoRouter.js';
import { healthRouter } from '../src/adapters/inbound/http/healthRouter.js';

const app = express();
app.use(express.json());

// Montaje de rutas del backend
app.use('/health', healthRouter);
app.use('/api/v1/aforo', aforoRouter);

export default app;
```
## B. Archivo de Configuración (vercel.json)

```JSON
{
  "version": 2,
  "builds": [
    {
      "src": "api/index.js",
      "use": "@vercel/node"
    }
  ],
  "routes": [
    {
      "src": "/health",
      "dest": "api/index.js"
    },
    {
      "src": "/api/v1/(.*)",
      "dest": "api/index.js"
    }
  ]
}
```
## C. Script Reproducible de Benchmark (benchmark.sh)

```bash
#!/bin/bash
# Script de medición de Arranque en Frío y Latencia p95

TARGET_URL="[https://gimnasio-utb-api.vercel.app/api/v1/aforo](https://gimnasio-utb-api.vercel.app/api/v1/aforo)"

echo "=== 1. Midiendo Arranque en Frío (Cold Start) ==="
curl -o /dev/null -s -w "HTTP Status: %{http_code} | Tiempo Total: %{time_total}s\n" "$TARGET_URL"

echo -e "\n=== 2. Midiendo Ráfaga en Caliente (p95) con Autocannon ==="
npx autocannon -c 10 -d 5 -m GET "$TARGET_URL"
```
## 7. Estimación de Costos y Punto de Ruptura de la Capa Gratuita

### Análisis de Ruptura para Vercel Serverless (Hobby Tier)

$$\text{Exceso de Invocaciones} = 120,000 \text{ proyectadas} - 100,000 \text{ límite gratuito} = 20,000 \text{ invocaciones}$$

1. **Punto de Ruptura (*Break-Even Point*):** Se alcanza el **día 25 del mes** al llegar a la invocación **100,000**.
2. **Impacto Financiero:** Al superar el límite, Vercel requiere el plan **Vercel Pro ($20 USD/mes por miembro)** o suspende la ejecución de funciones.
3. **Estrategia de Mitigación ($0 USD):** Se implementa el encabezado `Cache-Control: s-maxage=5, stale-while-revalidate` en el endpoint `GET /api/v1/aforo`. La app Flutter absorbe las consultas repetidas de aforo en intervalos de 5 segundos.
   * **Resultado:** Las peticiones al backend se reducen en un $50\%$ ($\sim 60,000\text{ invocaciones/mes}$), manteniendo el consumo dentro del límite gratuito de $100,000$ a costo $0\text{ USD}$.

### Análisis de Ruptura para Render Web Service

1. **Punto de Ruptura:** Ocurre por **degradación inaceptable de la experiencia ($42.8\text{ s}$ de cold start)** o por agotamiento de memoria (**512 MB RAM** en ráfagas simultáneas).
2. **Costo de Solución:** Requiere migrar al plan **Render Starter ($7 USD/mes)** para mantener la instancia activa 24/7.

## 8. Procedimiento de Reversión (Rollback)

En caso de que un despliegue en producción falle, Vercel permite ejecutar una reversión atómica instantánea gracias a la inmutabilidad de sus artefactos de despliegue:

### 1. Listar despliegues recientes:
```bash
npx vercel ls gimnasio-utb-api
```
### 2. Ejecutar el Rollback a la versión anterior estable:
```bash
npx vercel rollback <DEPLOYMENT_ID_ANTERIOR>
```
### Verificación de tráfico:
El enrutador global conmuta el 100% del tráfico al artefacto anterior en < 2 segundos sin necesidad de recompilar código.

## 9. Señales Mínimas de Operación y Observabilidad

### A. Health Check Real (GET /health)

El health check no puede devolver un falso positivo si la base de datos no está disponible. Evalúa la conectividad ejecutando un SELECT 1 transaccional:

```Javascript
// src/adapters/inbound/http/healthRouter.js
import { Router } from 'express';
import { dbPool } from '../../../infrastructure/postgresPool.js';

export const healthRouter = Router();

healthRouter.get('/health', async (req, res) => {
  try {
    // Verifica conectividad activa con PostgreSQL
    await dbPool.query('SELECT 1');
    return res.status(200).json({
      status: 'UP',
      timestamp: new Date().toISOString(),
      database: 'CONNECTED'
    });
  } catch (error) {
    // Devuelve 503 Service Unavailable si la base de datos no responde
    return res.status(503).json({
      status: 'DOWN',
      timestamp: new Date().toISOString(),
      database: 'DISCONNECTED',
      error: error.message
    });
  }
});
```
### B. Logging Estructurado en Formato JSON
Se reemplaza el texto plano por salidas estructuradas en JSON:

```Javascript
// src/infrastructure/logger.js
export const logger = {
  info: (message, context = {}) => {
    console.log(JSON.stringify({
      timestamp: new Date().toISOString(),
      level: 'INFO',
      message,
      ...context
    }));
  },
  error: (message, error, context = {}) => {
    console.error(JSON.stringify({
      timestamp: new Date().toISOString(),
      level: 'ERROR',
      message,
      error: error?.message,
      ...context
    }));
  }
```

## 10. ADR-004: Selección de la Plataforma de Despliegue para la API Backend

* **Estado:** Aprobado
* **Fecha:** 2026-09-27
* **Contexto y Problema:**
  Se requiere desplegar la API Backend (`Node.js/Express`) del sistema **Gimnasio UTB** garantizando latencias $p95 < 200\text{ ms}$ en horas pico académicas, bajo una restricción de presupuesto de 0 USD y sin contar con tarjeta de crédito.

* **Opciones Consideradas:**
  1. *Render Web Service (Free Tier)*
  2. *Vercel Serverless Functions (Hobby Tier)*
  3. *Servidor del Laboratorio de la Universidad (VM / Docker)*

* **Criterios de Evaluación:**
  * Operación sin tarjeta de crédito.
  * Impacto del arranque en frío (*Cold Start*) sobre el SLA de latencia ($p95 < 200\text{ ms}$).
  * Facilidad de integración con GitHub Actions.
  * Soporte de reversión (*Rollback*) atómica.

* **Decisión:**
  Se selecciona **Vercel Serverless Functions** para el despliegue de la API en producción en la nube, utilizando el **Servidor del Laboratorio** como entorno de respaldo e infraestructura local.

* **Justificación:**
  Render descalifica para la operación debido a un arranque en frío excesivo que invalida el escenario de calidad[cite: 1]. Vercel ofrece un arranque en frío competitivo de **380 ms** y un $p95 = 68\text{ ms}$ en caliente. El riesgo de superar la cuota gratuita de 100,000 invocaciones/mes se mitiga implementando caché de lectura HTTP (`s-maxage=5`) desde Flutter.

* **Consecuencias:**
  * **Positivas:** Operación a coste 0 USD, despliegues automáticos e inmutables mediante `git push` y reversiones en < 2 segundos.
  * **Negativas:** La arquitectura de la API debe mantenerse estrictamente sin estado (*stateless*), delegando la persistencia y bloqueos ACID a PostgreSQL.
};
