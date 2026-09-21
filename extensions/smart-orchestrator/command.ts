export interface OrchestratorCommandState {
  enabled: boolean;
  configValid: boolean;
  switchModel: boolean;
  switchThinking: boolean;
  switchAgent: boolean;
}

export interface CommandOutcome {
  enabled: boolean;
  switchModel: boolean;
  switchThinking: boolean;
  switchAgent: boolean;
  changed: boolean;
  message: string;
  tone: "info" | "warning" | "error";
  status: string;
}

export const STATUS_KEY = "smart-orchestrator";

export function resolveOrchestratorCommand(args: string, state: OrchestratorCommandState): CommandOutcome {
  const parts = args.trim().toLowerCase().split(/\s+/).filter(Boolean);
  const target = parts[0];
  const value = parts[1];

  let nextEnabled = state.enabled;
  let nextModel = state.switchModel;
  let nextThinking = state.switchThinking;
  let nextAgent = state.switchAgent;
  let changed = false;
  let message = "";
  let tone: "info" | "warning" | "error" = "info";

  if (target === "on" || target === "enable") {
    changed = !state.enabled;
    nextEnabled = true;
    message = "Pi Smart Orchestrator activado.";
  } else if (target === "off" || target === "disable") {
    changed = state.enabled;
    nextEnabled = false;
    tone = "warning";
    message = "Pi Smart Orchestrator desactivado.";
  } else if (target === "model") {
    if (value === "off" || value === "disable" || value === "false") {
      changed = state.switchModel;
      nextModel = false;
      tone = "warning";
      message = "Auto-cambio de modelo: DESACTIVADO (mantendrá tu modelo actual).";
    } else {
      changed = !state.switchModel;
      nextModel = true;
      message = "Auto-cambio de modelo: ACTIVADO (Laya asignará el modelo óptimo).";
    }
  } else if (target === "thinking") {
    if (value === "off" || value === "disable" || value === "false") {
      changed = state.switchThinking;
      nextThinking = false;
      tone = "warning";
      message = "Auto-cambio de thinking: DESACTIVADO (mantendrá tu nivel actual).";
    } else {
      changed = !state.switchThinking;
      nextThinking = true;
      message = "Auto-cambio de thinking: ACTIVADO (Laya ajustará según esfuerzo).";
    }
  } else if (target === "agent") {
    if (value === "off" || value === "disable" || value === "false") {
      changed = state.switchAgent;
      nextAgent = false;
      tone = "warning";
      message = "Auto-asignación de agente especialista: DESACTIVADA.";
    } else {
      changed = !state.switchAgent;
      nextAgent = true;
      message = "Auto-asignación de agente especialista: ACTIVADA.";
    }
  } else {
    // Status report
    const activeStatus = state.enabled && state.configValid;
    const modeDesc = [
      `Agente: ${state.switchAgent ? "ON" : "OFF"}`,
      `Modelo: ${state.switchModel ? "ON" : "OFF"}`,
      `Thinking: ${state.switchThinking ? "ON" : "OFF"}`,
    ].join(" | ");

    return {
      enabled: state.enabled,
      switchModel: state.switchModel,
      switchThinking: state.switchThinking,
      switchAgent: state.switchAgent,
      changed: false,
      tone: "info",
      status: activeStatus ? "orchestrator: active" : "orchestrator: off",
      message: `Pi Smart Orchestrator: ${activeStatus ? "Activo" : "Inactivo"} (${modeDesc})`,
    };
  }

  const activeStatus = nextEnabled && state.configValid;
  return {
    enabled: nextEnabled,
    switchModel: nextModel,
    switchThinking: nextThinking,
    switchAgent: nextAgent,
    changed,
    tone,
    status: activeStatus ? "orchestrator: active" : "orchestrator: off",
    message,
  };
}
