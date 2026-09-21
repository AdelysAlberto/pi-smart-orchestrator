# Plan de Arquitectura: Pi Smart Orchestrator (Laya Swarm & Workflow Engine)

> **Status**: `PENDING`  
> **Proyecto**: `pi-smart-orchestrator` (Extensión y Paquete Oficial de Pi)  
> **Dependencias Core**: `@earendil-works/pi-coding-agent`, `@earendil-works/pi-tui`, `laya-api` (Local MPS)  
> **Identidad Visual**: Paleta cromática oficial de Viasera (`Electric Cyan`, `Cobalt Royal`, `Volcanic Orange`, `Asfalto Profundo`)  
> **Fecha**: 2026-09-21  

---

## 1. Misión y Filosofía de Diseño

### 1.1 Simplicidad Radical y Cero Sobreingeniería
La meta de **Pi Smart Orchestrator** es resolver la ejecución multi-agente en Pi con la máxima simplicidad: **código puro, funcional y determinista**, eliminando capas burocráticas innecesarias.

- **Sin Meta-LLMs Inútiles**: Queda prohibido levantar agentes supervisores con `thinking: high` para deliberar Markdown, generar bucles de conversación o discutir formatos. Las decisiones de orquestación, secuenciación y despacho se ejecutan en **código TypeScript en microsegundos**.
- **Sistemas Que Hacen Exactamente Lo Que Deben**: Despachar tareas a los especialistas correctos, orquestar pipelines (secuenciales o paralelos) y reportar el progreso visualmente en la TUI sin oscurantismos.

---

## 2. Por Qué Nace: Diagnóstico de Problemas en `pi-subagents`

Al auditar la implementación de `@tintinweb/pi-subagents` en `/Volumes/Datos/Projects/laya/competencia/pi-subagents`, se identifican fallos estructurales graves que degradan la experiencia de usuario:

### 2.1 Opacidad y Desaparición de Prompts en la TUI
- **El Problema**: Cuando `pi-subagents` intercepta una llamada o corre en background (`isBackground: true`), Pi traga el evento con `{ action: "handled" }`. En pantalla, el texto que escribió el usuario **desaparece de la terminal**, dejando un vacío donde no se sabe qué se pidió, quién lo tomó ni con qué modelo.
- **La Solución**: Inyección determinista de tarjetas de entrada mediante `pi.appendEntry(...)` con renderers personalizados (`@earendil-works/pi-tui`) que mantienen siempre visible:
  1. El prompt original del usuario.
  2. El título de la tarea tomada (*Task Summary*).
  3. El especialista asignado, modelo, nivel de pensamiento (`thinking`) y esfuerzo catalogado por Laya.

### 2.2 Cuello de Botella y Token Bloat por Orquestadores LLM
- **El Problema**: Depender de un agente supervisor (`profesor`) para leer archivos de planes, asignar subtareas y coordinar subagentes causó cuelgues reales de **400 a 600 segundos** y consumos masivos de **hasta 950.000 tokens**, convirtiendo tareas simples en debates burocráticos.
- **La Solución**: **El Profesor está formalmente extinto.** La orquestación es un motor en TypeScript (`Workflow Engine`) que ejecuta pasos deterministas en código y consulta a Laya localmente en menos de 100 ms.

### 2.3 Fragilidad en Ejecución Secuencial y Paralela
- **El Problema**: `pi-subagents` tiene más de 50.000 líneas en `runtime.ts` para flujos experimentales con bloqueos de colisión (`collisions.ts`) y serialización compleja de estados.
- **La Solución**: Un modelo de flujo liviano con dos primitivas elementales:
  - **Pipeline Secuencial (1 por 1)**: Paso A -> Verificación/Aprobación -> Paso B -> Verificación.
  - **Swarm Paralelo (Fan-out / Fan-in)**: Despacho concurrente de tareas independientes con recolección estructurada de resultados.

### 2.4 Inyección Ineficiente de Skills
- **El Problema**: Precargar catálogos masivos de skills en los system prompts inyecta entre 10.000 y 15.000 tokens muertos por turno.
- **La Solución**: Carga perezosa (*Lazy Loading*) bajo demanda: los especialistas leen el archivo `SKILL.md` únicamente cuando su tarea concreta lo requiere.

---

## 3. Puntos Fuertes del Sistema

1. **Clasificación Neuronal Local con Laya (< 100 ms)**:
   - Inferencia en Apple Silicon (Metal MPS) sin coste de tokens ni latencia de red.
   - Determina automáticamente el dominio técnico (`code`, `architecture`, `ux`, `review`, `security`, `legal`, `finance`, `general`) y el nivel de esfuerzo (`low` vs `high`).
2. **Ecosistema Plano de 7 Especialistas Puros**:
   - `homero`: Construcción políglota, fixes y tests.
   - `sheldon`: Arquitectura de sistemas, esquemas DDL y planes técnicos (`plan/<TAG>.md`).
   - `edna`: Diseño visual, wireframes y tokens UI.
   - `tio-bob`: Revisión de diffs, MRs y Clean Code.
   - `gorgory`: Seguridad OWASP y auditoría de secrets.
   - `saul`: Cumplimiento legal, RGPD y contratos.
   - `contador`: Fiscalidad, IRPF y contabilidad.
3. **Flujos Mixtos en Código Puro**:
   - Modo directo (*Fast Path*): Enrutamiento directo al especialista sin intermediarios.
   - Modo arquitectura (*Plan -> Build -> Review*): Sheldon genera el blueprint, el usuario confirma y Homero construye.
   - Modo swarm (*Paralelo*): Edna diseña UI y Homero implementa API de forma concurrente.
4. **Resiliencia Fail-Open**:
   - Si Laya está apagada o el clasificador supera el timeout (250 ms), el sistema no interrumpe al usuario y delega fluidamente a la sesión principal.

---

## 4. Identidad Visual y Estilo TUI (Inspirado en Viasera)

Siguiendo el manual de marca de **Viasera** ([`branding_identity.md`](file:///Volumes/Datos/Projects/viasera/artifacts/design/branding_identity.md)), la interfaz de terminal abandona la frialdad monocromática y adopta una estética técnica de alta legibilidad, contraste y elegancia:

### 4.1 Tokens Cromáticos Oficiales

```
  [ #00E5FF ]        [ #0055FF ]        [ #FF6B00 ]        [ #0B0F17 ]
 Electric Cyan      Cobalt Royal      Volcanic Orange    Asfalto Profundo
 (Active/Running)   (Borders/Headers)  (Action/Approval)    (Background)
```

- **Electric Cyan (`#00E5FF`)**:
  - Indica actividad, progreso en tiempo real, latencias óptimas y trazado de rutas de ejecución.
  - Se utiliza para resaltar el agente activo (`@homero`, `@sheldon`) y el spinner de progreso.
- **Cobalt Royal (`#0055FF`)**:
  - Proporciona sobriedad técnica y solidez arquitectónica.
  - Se aplica en bordes estructurales de las tarjetas, títulos de encabezado y etiquetas de metadatos.
- **Volcanic Orange (`#FF6B00`)**:
  - Evoca acción inmediata, curvas exigentes y alertas.
  - Se utiliza para destacar el esfuerzo `[high]`, avisos de seguridad, errores críticos y el estado **Esperando Aprobación del Usuario**.
- **Asfalto Profundo (`#0B0F17`)**:
  - Fondo oscuro de alto contraste y antideslumbrante para los bloques `Box` de la TUI.

### 4.2 Componentes Visuales en `@earendil-works/pi-tui`

#### A. Tarjeta de Despacho Inmediato (`OrchestratorTaskCard`)
Renderizada al recibir la solicitud para que el prompt jamás desaparezca:

```text
┌─ [Cobalt Royal] ◆ Pi Smart Orchestrator ──────────── [Electric Cyan] (112 ms) ─┐
│ Solicitud:  "Implementa el endpoint de usuarios en Bun con tests"              │
│ Tarea:      Creación de ruta REST /users y suite Vitest                        │
│ Despacho:   [Electric Cyan] @homero ──► deepseek/deepseek-flash:low            │
│ Dominio:    code  │  Esfuerzo: [Volcanic Orange] high                          │
└────────────────────────────────────────────────────────────────────────────────┘
```

#### B. Pipeline Secuencial en Progreso (`PipelineProgressBox`)
Muestra visualmente las etapas de un flujo multi-paso:

```text
┌─ [Cobalt Royal] Pipeline: Feature Authentication ──────────────────────────────┐
│  [1. Plan: Sheldon ✓] ──► [2. Build: Homero ⚡] ──► [3. Review: Tio Bob ○]     │
│                                                                                │
│  Etapa Activa: [Electric Cyan] 2. Build                                        │
│  Agente:       @homero (deepseek-v4-pro:high)                                  │
│  Actividad:    Escribiendo src/modules/auth/service.ts...                      │
└────────────────────────────────────────────────────────────────────────────────┘
```

#### C. Swarm Concurrente (`ParallelSwarmBox`)
Muestra el estado de múltiples especialistas trabajando en paralelo:

```text
┌─ [Cobalt Royal] Swarm Paralelo Activo (2 en vuelo) ────────────────────────────┐
│  • [Electric Cyan] @edna   │ UI Tokens & Login Layout   │ ⚡ Ejecutando (4s)     │
│  • [Electric Cyan] @homero │ JWT Controller & Routes    │ ⚡ Ejecutando (3s)     │
└────────────────────────────────────────────────────────────────────────────────┘
```

---

## 5. Estructura del Archivo de Configuración (`orchestrator.config.json`)

El orquestador es totalmente configurable mediante un archivo JSON declarativo validado al arranque:

```json
{
  "enabled": true,
  "endpoint": "http://127.0.0.1:8090/analyze",
  "timeoutMs": 250,
  "maxInFlight": 3,
  "theme": {
    "colors": {
      "active": "#00E5FF",
      "header": "#0055FF",
      "action": "#FF6B00",
      "surface": "#0B0F17"
    }
  },
  "routes": {
    "code": { "handle": "homero", "fastPath": true },
    "architecture": { "handle": "sheldon", "fastPath": false, "workflow": "plan-and-build" },
    "ux": { "handle": "edna", "fastPath": true },
    "review": { "handle": "tio-bob", "fastPath": true },
    "security": { "handle": "gorgory", "fastPath": true },
    "legal": { "handle": "saul", "fastPath": true },
    "finance": { "handle": "contador", "fastPath": true },
    "general": { "handle": "none" },
    "default": { "handle": "homero" }
  },
  "workflows": {
    "plan-and-build": {
      "description": "Planificación arquitectónica previa antes de construir",
      "steps": [
        {
          "step": 1,
          "name": "Architectural Plan",
          "agent": "sheldon",
          "effort": "high",
          "output": "plan/{TAG}.md",
          "requireApproval": true
        },
        {
          "step": 2,
          "name": "Implementation",
          "agent": "homero",
          "effort": "low",
          "inputFrom": "step-1"
        },
        {
          "step": 3,
          "name": "Quality Review",
          "agent": "tio-bob",
          "effort": "low",
          "inputFrom": "git-diff"
        }
      ]
    }
  },
  "effortModels": {
    "low": {
      "model": "deepseek/deepseek-flash",
      "thinking": "low"
    },
    "high": {
      "model": "deepseek/deepseek-v4-pro",
      "thinking": "high"
    }
  }
}
```

---

## 6. Arquitectura del Paquete Pi (`pi-package`)

Conforme a la especificación oficial de paquetes de Pi ([https://pi.dev/docs/latest/packages#creating-a-pi-package](https://pi.dev/docs/latest/packages#creating-a-pi-package)):

```text
pi-smart-orchestrator/
├── package.json                    # Manifiesto npm con metadatos de Pi
├── orchestrator.config.json        # SSOT de configuración y workflows
├── README.md                       # Documentación técnica de uso e instalación
├── plan/
│   └── SMART-ORCHESTRATOR-01.md    # Este documento arquitectónico
└── extensions/
    └── smart-orchestrator/
        ├── index.ts                # Entrada y composición de la extensión
        ├── orchestrator.engine.ts  # Motor de ejecución (Fast Path, Secuencial, Paralelo)
        ├── workflow.runner.ts      # Ejecutor de pipelines declarativos
        ├── laya.client.ts          # Cliente HTTP ultra liviano hacia Laya
        ├── subagents.rpc.ts        # Comunicación RPC limpia con subagentes
        ├── decision.renderer.ts    # Componentes TUI con paleta Viasera
        ├── config.validator.ts     # Validador de modelos, rutas y esquemas
        └── __tests__/              # Suite completa de tests deterministas
```

### Manifiesto de Paquete (`package.json`)
```json
{
  "name": "pi-smart-orchestrator",
  "version": "0.1.0",
  "description": "Orquestador visual y determinista para Pi impulsado por Laya y estética Viasera",
  "type": "module",
  "license": "MIT",
  "keywords": ["pi-package"],
  "pi": {
    "extensions": ["./extensions"]
  },
  "files": [
    "extensions",
    "orchestrator.config.json",
    "README.md"
  ],
  "scripts": {
    "biome:check": "biome check .",
    "biome:format": "biome check --write .",
    "check": "tsc --noEmit",
    "test": "bun test"
  },
  "peerDependencies": {
    "@earendil-works/pi-coding-agent": "*"
  }
}
```

---

## 7. Fases de Implementación Técnica

### Fase 1: Fundaciones y Configuración
- Definir tipos e interfaces TypeScript para workflows, pipelines y pasos.
- Construir el lector y validador de `orchestrator.config.json`.
- Pruebas unitarias de parsing y reglas de fallback.

### Fase 2: Componentes Visuales TUI (Estilo Viasera)
- Implementar `OrchestratorTaskCard` con `@earendil-works/pi-tui`.
- Implementar `PipelineProgressBox` y `ParallelSwarmBox` con los códigos `#00E5FF`, `#0055FF`, `#FF6B00` y `#0B0F17`.
- Registrar los renderers de entrada con `pi.registerEntryRenderer`.

### Fase 3: Motor de Flujos (Workflow Runner)
- Implementar ejecución secuencial (*step-by-step*) con pausa de aprobación humana.
- Implementar ejecución paralela (*fan-out*) controlada por `maxInFlight`.
- Implementar pasamanos de contexto limpios entre agentes sin arrastrar historiales acumulados.

### Fase 4: Integración y Verificación Determinista
- Enlazar con `laya-api` local (`http://127.0.0.1:8090/analyze`).
- Enlazar con el bus RPC de subagentes.
- Verificación completa: `bun run biome:check && bun run check && bun test` garantizando 100% de tests pasando.
