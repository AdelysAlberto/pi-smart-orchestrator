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

export function resolveOrchestratorCommand(args: string, state: OrchestratorCommandState): CommandOutcome {
  const token = args.trim().toLowerCase();

  if (token === "on" || token === "enable") {
    const changed = !state.enabled;
    return {
      enabled: true,
      changed,
      tone: "info",
      status: "orchestrator: active",
      message: "Pi Smart Orchestrator activado.",
    };
  }

  if (token === "off" || token === "disable") {
    const changed = state.enabled;
    return {
      enabled: false,
      changed,
      tone: "warning",
      status: "orchestrator: off",
      message: "Pi Smart Orchestrator desactivado.",
    };
  }

  // Status or unknown
  const activeStatus = state.enabled && state.configValid;
  return {
    enabled: state.enabled,
    changed: false,
    tone: "info",
    status: activeStatus ? "orchestrator: active" : "orchestrator: off",
    message: `Pi Smart Orchestrator: ${activeStatus ? "Activo" : "Inactivo"} (Config válida: ${state.configValid})`,
  };
}
