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

Pi Smart Orchestrator is a standalone multi-agent orchestration engine for [Pi](https://github.com/badlogic/pi-mono). It combines sub-100ms local neural intent classification via **Laya** (running directly on Apple Silicon MPS) with native in-session agent dispatch, eliminating meta-LLM supervisor loops and third-party daemon dependencies.

Unlike legacy subagent wrappers that swallow user input and hide intermediate turns in background transcripts, Pi Smart Orchestrator executes specialists directly within the interactive terminal session. Every turn features live streaming, tool activity transparency, dynamic model and reasoning-tier switching, and rich visual telemetry formatted with Viasera design tokens.

---

## What It Solves

* **Terminal Opacity & Swallowed Prompts**: Legacy extensions intercept user input with detached handlers, making prompts disappear from the terminal. Pi Smart Orchestrator renders the user prompt and routing metadata upfront via `OrchestratorTaskCard` (with 2-line ellipsis) and streams execution directly in the live session.
* **Meta-LLM Supervisor Overhead**: Eliminates slow multi-minute supervisor deliberations and token wastage by executing deterministic routing in pure TypeScript backed by local Laya neural inference (< 100 ms).
* **Dependency & Collision Fragility**: Operates completely autonomously via the `@earendil-works/pi-coding-agent` SDK with zero reliance on external process managers or third-party daemon bridges.
* **Terminal Clutter & Output Bloat**: Integrates collapsible tool renderers for `bash`, `read`, `edit`, `write`, `find`, `grep`, and `ls` so that tool runs stay compact and expand on demand with `Ctrl+O`.
* **Zero-Shot Context & Multilingual Continuation**: Disambiguates whether short phrases (*"Retoma..."*, *"carry on"*, *"let's do it"*) represent task continuations or new topics using neural context evaluation rather than brittle regex lists.

---

## Key Features

* **Sub-100ms Neural Classification**: Queries `laya-api` over loopback HTTP with explicit client tracing (`X-Client: pi-smart-orchestrator`), evaluating technical domain, intent type, and analytical effort without remote API cost or network latency.
* **Modular Configuration (DIP Architecture)**: Separates orchestration rules (`orchestrator.config.json`) from classifier definitions (`laya.config.json`).
* **Dynamic Specialist Persona & Model Switching**: Resolves the optimal specialist (`homero`, `sheldon`, `edna`, `tio-bob`, `gorgory`, `saul`, `contador`) and automatically adjusts the session model, thinking tier (`low`/`high`), authorized tools, and system prompt via `before_agent_start`.
* **Multi-Step Pipelines & Swarms**:
  - **Sequential Pipeline**: Chains multi-agent workflows (e.g. `plan-and-build`: Sheldon architecture blueprint -> Homero implementation -> Tio Bob code review) with human approval gates.
  - **Parallel Swarm**: Concurrent multi-agent execution governed by bounded `maxInFlight` limits.
* **Viasera Visual Identity**: Custom terminal cards built with `@earendil-works/pi-tui` utilizing configurable theme colors (Electric Cyan, Header Lime `#A3BF06`, Volcanic Orange, and Deep Asphalt).
* **Minimal Collapsible Tool Renderers**: Sleek one-line command previews in collapsed mode that toggle to full stdout/stderr when pressing `Ctrl+O`.

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

Configuration is partitioned into two clean, decoupled files according to the Single Responsibility Principle:

### 1. Orchestration Rules: `orchestrator.config.json`

```json
{
  "enabled": true,
  "classifierConfig": "./laya.config.json",
  "agentsDir": "/Volumes/Datos/Projects/utils/agents/agents-pi/agents",
  "logFile": "~/.pi/agent/smart-orchestrator.log",
  "maxInFlight": 3,
  "theme": {
    "colors": {
      "active": "#00E5FF",
      "header": "#A3BF06",
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
      "description": "Two-stage workflow: Formal architecture design followed by clean code construction",
      "steps": [
        { "step": 1, "name": "Architecture Design", "agent": "sheldon", "effort": "high", "output": "artifacts/architecture.md", "requireApproval": true },
        { "step": 2, "name": "Code Construction", "agent": "homero", "effort": "low", "inputFrom": "artifacts/architecture.md" }
      ]
    }
  },
  "effortModels": {
    "low": { "model": "deepseek-ryg/deepseek-flash", "thinking": "low" },
    "high": { "model": "deepseek-ryg/deepseek-v4-pro", "thinking": "high" }
  }
}
```

### 2. Neural Classifier Definition: `laya.config.json`

```json
{
  "endpoint": "http://127.0.0.1:8090/analyze",
  "timeoutMs": 1500,
  "checkpoint": "",
  "questions": {
    "intent_type": {
      "type": "choice",
      "instructions": "Determine if the current user request is continuing the previous context or introducing a new task.",
      "criteria": {
        "continuation": "Continuing, resuming, following up on, retrying, approving, or asking to proceed with the previous task.",
        "new_task": "Starting a new standalone task, asking a new question, or changing the subject."
      }
    },
    "domain": {
      "type": "choice",
      "instructions": "Classify the high-level intent into the most accurate technical discipline.",
      "criteria": {
        "code": "Direct implementation, writing code, fixing bugs, unit testing, scripting, editing existing codebase.",
        "architecture": "System design, software architecture, technical blueprints, module boundaries, domain design, workflow planning, DDL schemas.",
        "ux": "UI components, styling, CSS, themes, design tokens, UX wireframes.",
        "review": "Code review, PR/MR auditing, diff analysis, Clean Code standards.",
        "security": "Security audits, OWASP vulnerabilities, secret leaks, threat modeling.",
        "legal": "Legal compliance, GDPR, terms of service, IP, licensing.",
        "finance": "Accounting, taxes, IRPF, VAT, deductions, billing rules, financial strategy.",
        "general": "General conversation, chit-chat, greetings, trivial non-technical queries."
      }
    },
    "effort": {
      "type": "choice",
      "instructions": "Rate the analytical complexity and reasoning required for this task.",
      "criteria": {
        "low": "Straightforward changes, direct bugfixes, simple questions, routine tasks.",
        "high": "Complex architectural decisions, major features, subtle bugs, security/legal analysis."
      }
    }
  }
}
```

---

## Repository Architecture

```text
pi-smart-orchestrator/
├── package.json                    # Package manifest with pi.extensions entrypoint
├── tsconfig.json                   # Strict TypeScript compiler options
├── biome.json                      # Code formatting and linting rules
├── orchestrator.config.json        # SSOT for routes, workflows, and theme colors
├── laya.config.json                # Dedicated Laya AI zero-shot classifier configuration
├── index.ts                        # Root module re-export
├── README.md                       # Canonical technical documentation
└── extensions/
    └── smart-orchestrator/
        ├── index.ts                # Main extension bootstrap, turn interceptor & context hydration
        ├── guards.ts               # Functional Result pattern & boundary type guards
        ├── paths.ts                # Configuration & directory path resolution
        ├── agents.catalog.ts       # Specialist markdown discovery and frontmatter parser
        ├── native.agent.runner.ts  # Native agent runner & model resolver
        ├── analyze.parser.ts       # Laya API schema parser & metadata extractor
        ├── laya.client.ts          # HTTP client with timeout & X-Client header tracking
        ├── config.validator.ts     # Schema validation for orchestrator & laya configs
        ├── command.ts              # /orchestrator slash command handler
        ├── workflow.runner.ts      # Sequential pipeline & parallel swarm runners
        ├── orchestrator.engine.ts  # Fast path, context enrichment & workflow routing logic
        ├── logger.ts               # Structured JSON audit logging
        ├── tui/
        │   ├── theme.ts            # Dynamic Viasera color tokens and styling helpers
        │   ├── decision.renderer.ts # Task card, pipeline, and swarm UI renderers
        │   └── tools.renderer.ts   # Minimal collapsible tool renderers (bash/read/edit/etc.)
        └── __tests__/              # Deterministic test suite (18/18 unit tests)
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
