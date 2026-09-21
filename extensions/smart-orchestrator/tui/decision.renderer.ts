import type {ExtensionAPI} from "@earendil-works/pi-coding-agent";
import {Box, Text} from "@earendil-works/pi-tui";
import type {ThemeColors} from "../config.validator.ts";
import {colorize, VIASERA_PALETTE} from "./theme.ts";

export const ORCHESTRATOR_TASK_ENTRY_TYPE = "smart-orchestrator-task";
export const PIPELINE_PROGRESS_ENTRY_TYPE = "smart-orchestrator-pipeline";
export const PARALLEL_SWARM_ENTRY_TYPE = "smart-orchestrator-swarm";

export interface OrchestratorTaskCardData {
  userPrompt: string;
  taskSummary?: string;
  domain: string;
  effort: string;
  handle: string;
  agentDescription?: string;
  agentTools?: string[];
  model: string;
  thinking: string | null;
  latencyMs?: number;
  mode?: "fastPath" | "workflow" | "swarm";
  workflowName?: string;
  switchModel?: boolean;
  switchThinking?: boolean;
  switchAgent?: boolean;
}

export interface PipelineProgressData {
  workflowName: string;
  currentStep: number;
  totalSteps: number;
  stepName: string;
  agent: string;
  model: string;
  status: "running" | "waiting_approval" | "completed" | "failed";
  activity?: string;
}

export interface SwarmAgentStatus {
  agent: string;
  task: string;
  status: string;
  durationMs: number;
}

export interface ParallelSwarmData {
  inFlight: SwarmAgentStatus[];
}

export type PaletteSource = ThemeColors | (() => ThemeColors);

export function registerOrchestratorRenderers(pi: ExtensionAPI, paletteSource?: PaletteSource): void {
  const getPalette = (): ThemeColors => {
    if (typeof paletteSource === "function") return paletteSource();
    if (paletteSource) return paletteSource;
    return VIASERA_PALETTE;
  };

  // 1. Task Card (Prompt bounded to max 2 lines, Smart Router call & decision, agent scope & tools)
  pi.registerEntryRenderer<OrchestratorTaskCardData>(ORCHESTRATOR_TASK_ENTRY_TYPE, (entry, _options, theme) => {
    const data = entry.data;
    if (!data) return undefined;

    const palette = getPalette();
    const box = new Box(1, 0, text => theme.bg("customMessageBg", text));

    const titleOrch = colorize("◆ Pi Smart Orchestrator", palette.header, true);
    const titleRouter = colorize("Smart Router Activo", palette.active, true);
    const divider = theme.fg("dim", " ── ");
    box.addChild(new Text(`${titleOrch}${divider}${titleRouter}`, 0, 0));

    // Smart Router Decision (explicit call & decision line)
    const routerLabel = theme.fg("dim", "  Smart Router: ");
    const latencyPart =
      data.domain === "direct_tag" || data.latencyMs === 0
        ? colorize("Invocación Directa (@tag)", palette.action, true)
        : data.latencyMs !== undefined
          ? colorize(`Llamada Laya API (${Math.round(data.latencyMs)} ms)`, palette.active)
          : colorize("Llamada Laya API", palette.active);
    const arrowDecision = theme.fg("dim", " ──► Decisión: ");
    const agentTarget = colorize(`@${data.handle}`, palette.active, true);
    const domainPart = `${theme.fg("dim", " (Dominio: ")}${colorize(data.domain, palette.active)}`;
    const effortColor = data.effort === "high" ? palette.action : palette.active;
    const effortPart = `${theme.fg("dim", " │ Esfuerzo: ")}${colorize(`[${data.effort}]`, effortColor, data.effort === "high")}${theme.fg("dim", ")")}`;
    box.addChild(
      new Text(`${routerLabel}${latencyPart}${arrowDecision}${agentTarget}${domainPart}${effortPart}`, 0, 0)
    );

    // Specialist & Scope
    if (data.agentDescription && data.agentDescription.trim().length > 0) {
      const scopeLabel = theme.fg("dim", "  Alcance:      ");
      const cleanScope = data.agentDescription.trim().replace(/\s+/g, " ");
      const scopePreview = cleanScope.length > 140 ? `${cleanScope.slice(0, 135)}…` : cleanScope;
      const scopeVal = theme.fg("text", scopePreview);
      box.addChild(new Text(`${scopeLabel}${scopeVal}`, 0, 0));
    }

    // Tools
    if (data.agentTools && data.agentTools.length > 0) {
      const toolsLabel = theme.fg("dim", "  Herramientas: ");
      const toolsVal = colorize(data.agentTools.join(", "), palette.active);
      box.addChild(new Text(`${toolsLabel}${toolsVal}`, 0, 0));
    }

    // Dispatch
    const dispatchLabel = theme.fg("dim", "  Despacho:     ");
    const agentText = `@${data.handle}${data.switchAgent === false ? " (omitido)" : ""}`;
    const agentVal = colorize(agentText, data.switchAgent === false ? palette.surface : palette.active, true);
    const arrow = theme.fg("dim", " ──► ");
    const modelStr = `${data.switchModel === false ? "(modelo actual)" : data.model}${data.thinking && data.switchThinking !== false ? `:${data.thinking}` : ""}`;
    const modelVal = theme.fg("dim", modelStr);

    let modeSuffix = "";
    if (data.mode === "workflow" && data.workflowName) {
      modeSuffix = `${theme.fg("dim", "  │  Flujo: ")}${colorize(data.workflowName, palette.header)}`;
    }
    box.addChild(new Text(`${dispatchLabel}${agentVal}${arrow}${modelVal}${modeSuffix}`, 0, 0));

    return box;
  });

  // 2. Pipeline Progress Box
  pi.registerEntryRenderer<PipelineProgressData>(PIPELINE_PROGRESS_ENTRY_TYPE, (entry, _options, theme) => {
    const data = entry.data;
    if (!data) return undefined;

    const palette = getPalette();
    const box = new Box(1, 0, text => theme.bg("customMessageBg", text));

    const title = colorize(`◆ Pipeline: ${data.workflowName}`, palette.header, true);
    const stepRatio = theme.fg("dim", ` (Paso ${data.currentStep}/${data.totalSteps})`);
    box.addChild(new Text(`${title}${stepRatio}`, 0, 0));

    const stageLabel = theme.fg("dim", "  Etapa Activa: ");
    const stageVal = colorize(`${data.currentStep}. ${data.stepName}`, palette.active, true);
    box.addChild(new Text(`${stageLabel}${stageVal}`, 0, 0));

    const agentLabel = theme.fg("dim", "  Agente:       ");
    const agentVal = colorize(`@${data.agent}`, palette.active);
    const modelVal = theme.fg("dim", ` (${data.model})`);
    box.addChild(new Text(`${agentLabel}${agentVal}${modelVal}`, 0, 0));

    if (data.status === "waiting_approval") {
      const alert = colorize("  [ESPERANDO APROBACIÓN DEL USUARIO]", palette.action, true);
      box.addChild(new Text(alert, 0, 0));
    } else if (data.activity) {
      const actLabel = theme.fg("dim", "  Actividad:    ");
      const actVal = theme.fg("text", data.activity);
      box.addChild(new Text(`${actLabel}${actVal}`, 0, 0));
    }

    return box;
  });

  // 3. Parallel Swarm Box
  pi.registerEntryRenderer<ParallelSwarmData>(PARALLEL_SWARM_ENTRY_TYPE, (entry, _options, theme) => {
    const data = entry.data;
    if (!data?.inFlight) return undefined;

    const palette = getPalette();
    const box = new Box(1, 0, text => theme.bg("customMessageBg", text));

    const count = data.inFlight.length;
    const title = colorize(`◆ Swarm Paralelo Activo (${count} en vuelo)`, palette.header, true);
    box.addChild(new Text(title, 0, 0));

    for (const item of data.inFlight) {
      const bullet = colorize("  • ", palette.active);
      const agent = colorize(`@${item.agent.padEnd(8, " ")}`, palette.active, true);
      const task = theme.fg("text", `│ ${item.task.padEnd(26, " ")}`);
      const status = colorize(`│ ⚡ ${item.status} (${Math.round(item.durationMs / 1000)}s)`, palette.action);
      box.addChild(new Text(`${bullet}${agent}${task}${status}`, 0, 0));
    }

    return box;
  });
}
