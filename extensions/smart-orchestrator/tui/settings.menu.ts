import type {ExtensionCommandContext} from "@earendil-works/pi-coding-agent";
import type {OrchestratorCommandState} from "../command.ts";
import {saveOrchestratorConfigFile} from "../config.validator.ts";

export async function showOrchestratorSettingsMenu(
  ctx: ExtensionCommandContext,
  state: OrchestratorCommandState,
  configPath: string
): Promise<void> {
  while (true) {
    const status = state.enabled ? "● [ACTIVO]  " : "○ [APAGADO] ";

    const options = [
      `1. Orquestador de pipelines: ${status} -> Alternar`,
      "2. Guardar configuración en disco",
      "3. Salir del menú",
    ];

    const choice = await ctx.ui.select("Configuración de Pi Smart Orchestrator:", options);
    if (!choice || choice.startsWith("3.")) return;

    if (choice.startsWith("1.")) {
      state.enabled = !state.enabled;
      ctx.ui.notify(
        `Orquestador de pipelines: ${state.enabled ? "ACTIVADO" : "DESACTIVADO (el router sigue enrutando)"}`,
        "info"
      );
    } else if (choice.startsWith("2.")) {
      const saved = saveOrchestratorConfigFile(configPath, {enabled: state.enabled});
      ctx.ui.notify(
        saved.ok ? "Configuración guardada en orchestrator.config.json" : `Error al guardar: ${saved.reason}`,
        saved.ok ? "info" : "error"
      );
      return;
    }
  }
}
