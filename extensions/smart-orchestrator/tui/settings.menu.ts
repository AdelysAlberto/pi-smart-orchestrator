import type {ExtensionCommandContext} from "@earendil-works/pi-coding-agent";
import type {OrchestratorCommandState} from "../command.ts";
import {saveOrchestratorConfigFile} from "../config.validator.ts";

export async function showOrchestratorSettingsMenu(
  ctx: ExtensionCommandContext,
  state: OrchestratorCommandState,
  configPath: string
): Promise<void> {
  let inMenu = true;

  while (inMenu) {
    const statusIcon = (val: boolean) => (val ? "● [ACTIVO]  " : "○ [APAGADO] ");

    const options = [
      `1. Orquestador Maestro:       ${statusIcon(state.enabled)} -> Alternar`,
      `2. Especialista / Agente:      ${statusIcon(state.switchAgent)} -> Alternar`,
      `3. Auto-Modelo por Laya:      ${statusIcon(state.switchModel)} -> Alternar`,
      `4. Auto-Thinking por Laya:    ${statusIcon(state.switchThinking)} -> Alternar`,
      "5. 💾 Guardar configuración en disco",
      "6. ✕ Salir del menú",
    ];

    const choice = await ctx.ui.select("⚙️  Configuración de Pi Smart Orchestrator:", options);
    if (!choice || choice.includes("6. ✕ Salir")) {
      inMenu = false;
      break;
    }

    if (choice.startsWith("1.")) {
      state.enabled = !state.enabled;
      ctx.ui.notify(`Orquestador general: ${state.enabled ? "ACTIVADO" : "DESACTIVADO"}`, "info");
    } else if (choice.startsWith("2.")) {
      state.switchAgent = !state.switchAgent;
      ctx.ui.notify(
        `Auto-Asignación de Agente: ${state.switchAgent ? "ACTIVADA (Prompt y Tools)" : "DESACTIVADA"}`,
        "info"
      );
    } else if (choice.startsWith("3.")) {
      state.switchModel = !state.switchModel;
      ctx.ui.notify(
        `Auto-Cambio de Modelo: ${state.switchModel ? "ACTIVADO (por Laya)" : "DESACTIVADO (conserva tu modelo actual)"}`,
        "info"
      );
    } else if (choice.startsWith("4.")) {
      state.switchThinking = !state.switchThinking;
      ctx.ui.notify(
        `Auto-Cambio de Thinking: ${state.switchThinking ? "ACTIVADO (por Laya)" : "DESACTIVADO (conserva tu thinking)"}`,
        "info"
      );
    } else if (choice.startsWith("5.")) {
      const saveRes = saveOrchestratorConfigFile(configPath, {
        enabled: state.enabled,
        switchModel: state.switchModel,
        switchThinking: state.switchThinking,
        switchAgent: state.switchAgent,
      });
      if (saveRes.ok) {
        ctx.ui.notify("Configuración guardada en orchestrator.config.json correctamente", "info");
      } else {
        ctx.ui.notify(`Error al guardar configuración: ${saveRes.reason}`, "error");
      }
      inMenu = false;
      break;
    }
  }
}
