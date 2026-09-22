<h1 align="center">Pi Smart Orchestrator</h1>

<p align="center">
  <b>Autonomous, Deterministic & Visual Multi-Agent Orchestrator for Pi</b><br>
  <i>Sub-100ms local neural routing with Laya on Apple Silicon MPS, native interactive streaming, and Viasera high-fidelity TUI cards.</i>
</p>

<p align="center">
  <a href="https://github.com/badlogic/pi-mono"><img src="https://img.shields.io/badge/Platform-Pi%20Coding%20Agent-0055FF?style=for-the-badge&logo=terminal&logoColor=white" alt="Pi Coding Agent"></a>
  <a href="https://bun.sh"><img src="https://img.shields.io/badge/Runtime-Bun%201.4-00E5FF?style=for-the-badge&logo=bun&logoColor=black" alt="Bun"></a>
  <a href="https://biomejs.dev"><img src="https://img.shields.io/badge/Linter-Biome-60A5FA?style=for-the-badge&logo=biome&logoColor=white" alt="Biome"></a>
  <a href="LICENSE"><img src="https://img.shields.io/badge/License-MIT-FF6B00.svg?style=for-the-badge" alt="License"></a>
</p>

---

## Overview

Pi Smart Orchestrator is the pipeline runner for [Pi](https://github.com/badlogic/pi-mono). It executes multi-step workflows (design, approval gate, build) with real specialist subagents, and it does nothing else: it does not intercept `input`, it does not classify, and it does not choose a model.

[pi-laya-router](../pi-laya-router) is the only interceptor of the `input` event and the only owner of the `(model, thinking)` pair. When its classification says the turn needs more than one specialist, it hands the turn over on `orchestrator:workflow` — with the effort table included — and this extension runs the steps. A refused or unacknowledged handover goes back to the main agent, never into a silent void.

---

## What It Solves

* **Supervisor Overhead**: no meta-LLM decides what to do. The router classifies in ~30 ms, the pipeline is declared in JSON, and the steps run.
* **Two Truths About Models**: the model table lives in one file (`router.config.json`). This extension has no model configuration to drift out of sync.
* **Context Loss Inside Pipelines**: every child gets an explicit system prompt, the `AGENTS.md` chain, and the rules named by its step — read from disk, not left to the model's goodwill.
* **Terminal Clutter & Output Bloat**: collapsible tool renderers for `bash`, `read`, `edit`, `write`, `find`, `grep` and `ls`, so tool runs stay compact and expand with `Ctrl+O`.

---

## Key Features

* **Sequential Pipelines**: declared in `orchestrator.config.json`, run with the per-step model the router sends and an optional human approval gate between steps (`plan-and-build`: plan, approval, build).
* **Parallel Swarm**: concurrent execution governed by `maxInFlight`, for fan-out tasks.
* **Deterministic Context Injection**: `noContextFiles` children are given the `AGENTS.md` chain and the `rules/*.md` named by the step (`context.injector.ts`), with a missing rule reported inside the prompt instead of failing the step.
* **Acknowledged Handover**: the router only reports a pipeline as handled when this extension acknowledged the request; every refusal carries a reason code.
* **Viasera Visual Identity**: terminal cards built with `@earendil-works/pi-tui` using configurable theme colors (Electric Cyan, Header Lime `#A3BF06`, Volcanic Orange, Deep Asphalt).

---

## Quick Start

### 1. Prerequisites

- [Pi](https://github.com/badlogic/pi-mono) installed and configured.
- Laya API server active on `http://127.0.0.1:8090` (start via `../laya-api/scripts/up.sh`).

### 2. Installation

Add the package path to your global `~/.pi/agent/settings.json` under `"packages"`:

```json
{
  "packages": [
    "/Volumes/Datos/Projects/laya/pi-smart-orchestrator"
  ]
}
```

Or install it via the Pi CLI:

```bash
pi install /Volumes/Datos/Projects/laya/pi-smart-orchestrator
```

### 3. Verify Installation

Launch Pi in any project directory and inspect orchestrator status:

```text
/orchestrator
```

---

## Usage Reference & Commands

### Interactive Commands

| Command | Action | Description |
|---|---|---|
| `/orchestrator` | Status check | Displays current routing state, config validity, and catalog size |
| `/orchestrator on` | Activate | Enables automated neural routing |
| `/orchestrator off` | Kill switch | Disables routing immediately, returning to standard Pi turn handling |

### Keyboard Shortcuts

| Shortcut | Action |
|---|---|
| `Ctrl+O` | Toggle tool output collapse/expansion for all commands and file operations |
| `Ctrl+T` | Toggle thinking block collapse/expansion |

---

## Configuration Architecture

One file, and only for pipelines:

```json
{
  "enabled": true,
  "maxInFlight": 3,
  "debug": false,
  "agentsDir": "/Volumes/Datos/Projects/utils/agents/agents-pi/agents",
  "logFile": "~/.pi/agent/smart-orchestrator.log",
  "theme": {
    "colors": {
      "active": "#00E5FF",
      "header": "#A3BF06",
      "action": "#FF6B00",
      "surface": "#0B0F17"
    }
  },
  "workflows": {
    "plan-and-build": {
      "description": "Plan de arquitectura aprobado por el usuario, seguido de la construccion",
      "steps": [
        { "step": 1, "name": "Diseno de Arquitectura", "agent": "sheldon", "effort": "high", "requireApproval": true },
        { "step": 2, "name": "Construccion de Codigo", "agent": "homero", "effort": "low", "inputFrom": "step 1" }
      ]
    }
  }
}
```

Per step:

| Key | Meaning |
| :--- | :--- |
| `agent` | Handle resolved against `agentsDir`; its `.md` is the child's system prompt |
| `effort` | Tier (`low`/`high`) resolved against the table the **router** sends with the request |
| `inputFrom` | Name of the earlier step whose output is prepended as context |
| `requireApproval` | Stops before the next step until the user confirms |
| `rules` | Rule names from `~/.pi/agent/rules` injected into the step. Defaults to the universal set |

There is no route table and no classifier definition here. Which turn reaches a workflow is decided by `router.config.json` (`scope` axis plus `scopeWorkflows`), and the model of every step comes from that same file's `effortModels`.

---

## Repository Architecture

```text
pi-smart-orchestrator/
├── package.json                    # Package manifest with pi.extensions entrypoint
├── tsconfig.json                   # Strict TypeScript compiler options
├── biome.json                      # Code formatting and linting rules
├── orchestrator.config.json        # Workflows, per-step rules, and theme colors
├── index.ts                        # Root module re-export
├── README.md                       # Canonical technical documentation
└── extensions/
    └── smart-orchestrator/
        ├── index.ts                # Composition: lifecycle, handover listener, commands
        ├── guards.ts               # Functional Result pattern & boundary type guards
        ├── paths.ts                # Configuration & directory path resolution
        ├── agents.catalog.ts       # Specialist markdown discovery and frontmatter parser
        ├── native.agent.runner.ts  # In-process child session runner & model resolver
        ├── context.injector.ts     # AGENTS.md chain + rules injection for a child
        ├── workflow.handoff.ts     # Router handover contract and acknowledgement
        ├── config.validator.ts     # Schema validation for orchestrator.config.json
        ├── command.ts              # /orchestrator slash command handler
        ├── workflow.runner.ts      # Sequential pipeline & parallel swarm runners
        ├── logger.ts               # Structured JSON audit logging
        ├── tui/
        │   ├── theme.ts            # Dynamic Viasera color tokens and styling helpers
        │   ├── decision.renderer.ts # Pipeline and swarm UI renderers
        │   ├── settings.menu.ts    # /orchestrator menu
        │   └── tools.renderer.ts   # Minimal collapsible tool renderers (bash/read/edit/etc.)
        └── __tests__/              # Deterministic test suite (40 unit tests)
```

---

## Verification & Testing

Run the complete verification gate:

```bash
bun install
bun run biome:check
bun run check
bun test
```

---

## Author & Maintenance

**Adelys Alberto Belen**  
Software Engineer  
Website: [adalbeca.com](https://adalbeca.com)  
GitHub: [@AdelysAlberto](https://github.com/AdelysAlberto)  
Email: [dev@adalbeca.com](mailto:dev@adalbeca.com)

---

## License

This project is licensed under the MIT License. See [LICENSE](LICENSE) for details.
