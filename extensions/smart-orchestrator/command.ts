export interface OrchestratorCommandState {
  enabled: boolean;
  configValid: boolean;
}

export interface CommandOutcome {
  enabled: boolean;
  changed: boolean;
  message: string;
  tone: "info" | "warning" | "error";
  status: string;
}

export const STATUS_KEY = "smart-orchestrator";

/**
 * `/orchestrator on|off|status`.
 *
 * There is no model or thinking toggle here by design: the router owns both, and a
 * second switch would be a second truth. Turning the orchestrator off stops the
 * pipelines and nothing else — the router keeps routing single specialists.
 */
export function resolveOrchestratorCommand(args: string, state: OrchestratorCommandState): CommandOutcome {
  const target = args.trim().toLowerCase().split(/\s+/).filter(Boolean)[0];

  if (target === "on" || target === "enable") {
    return {
      enabled: true,
      changed: !state.enabled,
      tone: "info",
      status: state.configValid ? "orchestrator: active" : "orchestrator: off",
      message: "Pi Smart Orchestrator activado (los pipelines vuelven a estar disponibles).",
    };
  }

  if (target === "off" || target === "disable") {
    return {
      enabled: false,
      changed: state.enabled,
      tone: "warning",
      status: "orchestrator: off",
      message: "Pi Smart Orchestrator desactivado: los pipelines no arrancaran, el router sigue enrutando.",
    };
  }

  const active = state.enabled && state.configValid;
  return {
    enabled: state.enabled,
    changed: false,
    tone: "info",
    status: active ? "orchestrator: active" : "orchestrator: off",
    message: `Pi Smart Orchestrator: ${active ? "Activo" : "Inactivo"} (modelo y thinking los decide el router)`,
  };
}
