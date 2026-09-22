import {
  copyToClipboard,
  type ExtensionAPI,
  type ExtensionCommandContext,
  type ExtensionContext,
} from "@earendil-works/pi-coding-agent";
import {type AgentsCatalog, createAgentsCatalog} from "./agents.catalog.ts";
import {type OrchestratorCommandState, resolveOrchestratorCommand, STATUS_KEY} from "./command.ts";
import {loadOrchestratorConfigFile, type OrchestratorConfig, type WorkflowConfig} from "./config.validator.ts";
import {createOrchestratorLogger, type OrchestratorLogger} from "./logger.ts";
import {createNativeAgentRunner, type NativeAgentRunner} from "./native.agent.runner.ts";
import {defaultConfigPath} from "./paths.ts";
import {
  PIPELINE_PROGRESS_ENTRY_TYPE,
  type PipelineProgressData,
  registerOrchestratorRenderers,
} from "./tui/decision.renderer.ts";
import {showOrchestratorSettingsMenu} from "./tui/settings.menu.ts";
import {VIASERA_PALETTE} from "./tui/theme.ts";
import {registerCollapsibleToolRenderers} from "./tui/tools.renderer.ts";
import {
  ackChannel,
  buildAck,
  buildRefusal,
  parseHandoff,
  WORKFLOW_CHANNEL,
  type WorkflowHandoff,
} from "./workflow.handoff.ts";
import {runSequentialPipeline} from "./workflow.runner.ts";

/** Characters of a step's output that reach the progress entry. */
const RESULT_PREVIEW_CHARS = 600;

export interface SmartOrchestratorOptions {
  configPath?: string;
  runner?: NativeAgentRunner;
  catalog?: AgentsCatalog;
}

/**
 * Pi Smart Orchestrator: the pipeline runner.
 *
 * It does **not** intercept `input` and does **not** decide a model. pi-laya-router
 * is the only interceptor and the only owner of the effort table; when a turn is
 * scoped as a pipeline the router hands it over on `orchestrator:workflow` and this
 * extension runs the steps with the (model, thinking) pairs that came in the
 * request. Every refusal is answered as an acknowledgement, so the router can send
 * the turn back to the main agent instead of dropping it.
 */
export function createSmartOrchestrator(options: SmartOrchestratorOptions = {}): (pi: ExtensionAPI) => void {
  return pi => {
    const configPath = options.configPath ?? defaultConfigPath();
    const loaded = loadOrchestratorConfigFile(configPath);
    const config: OrchestratorConfig | undefined = loaded.ok ? loaded.value : undefined;

    registerOrchestratorRenderers(pi, () => config?.theme?.colors ?? VIASERA_PALETTE);
    registerCollapsibleToolRenderers(pi);

    const state: OrchestratorCommandState = {
      enabled: config?.enabled === true,
      configValid: loaded.ok,
    };

    const logger: OrchestratorLogger = createOrchestratorLogger({
      logFile: config?.logFile,
      debug: config?.debug,
    });

    let catalog: AgentsCatalog = options.catalog ?? createAgentsCatalog(config?.agentsDir);
    let runner: NativeAgentRunner | undefined = options.runner;
    let sessionCtx: ExtensionContext | undefined;

    pi.on("session_start", async (_event, ctx) => {
      sessionCtx = ctx;
      catalog = options.catalog ?? createAgentsCatalog(config?.agentsDir);
      runner =
        options.runner ??
        createNativeAgentRunner({
          catalog,
          modelRegistry: ctx.modelRegistry,
          cwd: ctx.cwd,
        });

      if (state.enabled && state.configValid) {
        ctx.ui.setStatus(STATUS_KEY, "orchestrator: active");
      }
      await logger.log({event: "session_start", status: state.enabled ? "active" : "disabled"});
    });

    let activeToolTimer: ReturnType<typeof setInterval> | undefined;
    let toolStartTime = 0;
    let currentToolName = "";
    let currentToolArgs = "";

    pi.on("tool_execution_start", (event, ctx) => {
      toolStartTime = Date.now();
      currentToolName = event.toolName;

      let summary = "";
      if (event.toolName === "bash" && typeof event.args?.command === "string") {
        const cmd = event.args.command.trim().replace(/\s+/g, " ");
        summary = cmd.length > 35 ? `${cmd.slice(0, 32)}…` : cmd;
      } else if (typeof event.args?.path === "string") {
        summary = event.args.path.split("/").pop() ?? event.args.path;
      } else if (typeof event.args?.pattern === "string") {
        summary = `/${event.args.pattern}/`;
      }
      currentToolArgs = summary;

      if (activeToolTimer) clearInterval(activeToolTimer);

      const updateStatus = () => {
        const elapsedSec = Math.floor((Date.now() - toolStartTime) / 1000);
        const secText = elapsedSec > 0 ? ` (${elapsedSec}s)` : "";
        ctx.ui.setStatus("tool_activity", `⚡ ${currentToolName}${secText}: ${currentToolArgs}`);
      };

      updateStatus();
      activeToolTimer = setInterval(updateStatus, 1000);
    });

    pi.on("tool_execution_update", (_event, ctx) => {
      const elapsedSec = Math.floor((Date.now() - toolStartTime) / 1000);
      const secText = elapsedSec > 0 ? ` (${elapsedSec}s)` : "";
      ctx.ui.setStatus("tool_activity", `⚡ ${currentToolName}${secText}: ${currentToolArgs}`);
    });

    pi.on("tool_execution_end", (_event, ctx) => {
      if (activeToolTimer) {
        clearInterval(activeToolTimer);
        activeToolTimer = undefined;
      }
      ctx.ui.setStatus("tool_activity", undefined);
    });

    /**
     * TUI entries are cosmetic: a pipeline must never die because the session it was
     * handed to has been replaced or reloaded. Pi invalidates a captured `pi`/ctx
     * after `newSession`/`fork`/`switchSession`/`reload`, and a detached pipeline
     * outlives any of them, so every UI call is guarded and the loss is logged.
     */
    const progress = (data: PipelineProgressData) => {
      try {
        pi.appendEntry<PipelineProgressData>(PIPELINE_PROGRESS_ENTRY_TYPE, data);
      } catch (err: unknown) {
        void logger.log({
          event: "progress_dropped",
          workflowName: data.workflowName,
          reason: err instanceof Error ? err.message : String(err),
        });
      }
    };

    /**
     * Answers the router and, when the handover is accepted, runs the pipeline.
     * The acknowledgement is emitted before the first step so the router is never
     * left waiting on a workflow that will not start.
     */
    const handleHandoff = (raw: unknown): void => {
      const parsed = parseHandoff(raw);
      if (!parsed.ok) {
        void logger.log({event: "workflow_rejected", reason: parsed.reason});
        return;
      }
      const handoff = parsed.value;
      const refuse = (reason: string): void => {
        pi.events.emit(ackChannel(handoff.requestId), buildRefusal(reason));
        void logger.log({event: "workflow_rejected", reason, workflowName: handoff.workflow});
      };

      if (!state.enabled || !state.configValid || !config) {
        refuse("orchestrator_disabled");
        return;
      }
      const workflow = config.workflows[handoff.workflow];
      if (!workflow) {
        refuse(`workflow_not_found:${handoff.workflow}`);
        return;
      }
      if (!runner) {
        refuse("runner_unavailable");
        return;
      }
      const currentRunner = runner;

      pi.events.emit(ackChannel(handoff.requestId), buildAck(handoff.workflow));
      // An unhandled rejection inside a detached pipeline kills the process, so the
      // runner is never left without a catch.
      runPipeline(handoff, workflow, currentRunner).catch(async (err: unknown) => {
        await logger.log({
          event: "workflow_crash",
          workflowName: handoff.workflow,
          error: err instanceof Error ? err.message : String(err),
        });
      });
    };

    const runPipeline = async (
      handoff: WorkflowHandoff,
      workflow: WorkflowConfig,
      currentRunner: NativeAgentRunner
    ): Promise<void> => {
      await logger.log({
        event: "workflow_started",
        workflowName: handoff.workflow,
        domain: handoff.domain,
        effort: handoff.effort,
        handle: handoff.handle,
      });

      const result = await runSequentialPipeline({
        workflowName: handoff.workflow,
        workflow,
        userPrompt: handoff.prompt,
        effortModels: handoff.effortModels,
        runner: currentRunner,
        onProgress: progress,
        onApprovalRequired: async (step, previousResult) => {
          // No UI means no way to ask: the gate closes, it never opens silently.
          if (!sessionCtx) return false;
          try {
            return await sessionCtx.ui.confirm(
              `Aprobar ${handoff.workflow}: ${step.name}`,
              `${previousResult.slice(0, 1500)}\n\n¿Continúa el pipeline?`
            );
          } catch (err: unknown) {
            await logger.log({
              event: "approval_unavailable",
              workflowName: handoff.workflow,
              reason: err instanceof Error ? err.message : String(err),
            });
            return false;
          }
        },
      });

      const [lastStep] = [...workflow.steps].reverse();
      const lastResult = result.ok && result.value.length > 0 ? result.value[result.value.length - 1] : undefined;
      const preview = lastResult?.payload.result.replace(/\s+/g, " ").slice(0, RESULT_PREVIEW_CHARS);

      if (result.ok) {
        if (lastStep) {
          progress({
            workflowName: handoff.workflow,
            currentStep: lastStep.step,
            totalSteps: workflow.steps.length,
            stepName: lastStep.name,
            agent: lastStep.agent,
            model: lastResult?.model ?? "",
            status: "completed",
            activity: preview === undefined || preview.length === 0 ? "Pipeline completado." : preview,
          });
        }
        await logger.log({event: "workflow_finished", workflowName: handoff.workflow, status: "completed"});
        return;
      }

      if (lastStep) {
        progress({
          workflowName: handoff.workflow,
          currentStep: lastStep.step,
          totalSteps: workflow.steps.length,
          stepName: lastStep.name,
          agent: lastStep.agent,
          model: "",
          status: "failed",
          activity: result.reason,
        });
      }
      await logger.log({
        event: "workflow_finished",
        workflowName: handoff.workflow,
        status: "failed",
        reason: result.reason,
      });
    };

    pi.events.on(WORKFLOW_CHANNEL, handleHandoff);

    pi.registerCommand("orchestrator", {
      description: "Configurar o alternar Pi Smart Orchestrator (/orchestrator [settings|on|off])",
      handler: async (args, ctx) => {
        const trimmed = args.trim();
        if (!trimmed || trimmed === "settings" || trimmed === "config" || trimmed === "menu") {
          await showOrchestratorSettingsMenu(ctx, state, configPath);
          const activeStatus = state.enabled && state.configValid;
          ctx.ui.setStatus(STATUS_KEY, activeStatus ? "orchestrator: active" : "orchestrator: off");
          return;
        }
        const outcome = resolveOrchestratorCommand(args, state);
        state.enabled = outcome.enabled && state.configValid;
        if (outcome.changed) {
          ctx.ui.setStatus(STATUS_KEY, outcome.status);
        }
        ctx.ui.notify(outcome.message, outcome.tone);
      },
    });

    pi.registerCommand("orchestrator-settings", {
      description: "Abrir menú interactivo de configuración de Pi Smart Orchestrator",
      handler: async (_args, ctx) => {
        await showOrchestratorSettingsMenu(ctx, state, configPath);
        const activeStatus = state.enabled && state.configValid;
        ctx.ui.setStatus(STATUS_KEY, activeStatus ? "orchestrator: active" : "orchestrator: off");
      },
    });

    // Helper to insert agent tag into main terminal editor
    const activateAgentInEditor = (agentName: string, ctx: ExtensionCommandContext) => {
      const currentText = ctx.ui.getEditorText().trim();
      if (currentText.length > 0 && !currentText.includes(`@${agentName}`)) {
        ctx.ui.setEditorText(`@${agentName} ${currentText}`);
      } else if (!currentText.includes(`@${agentName}`)) {
        ctx.ui.setEditorText(`@${agentName} `);
      }
      ctx.ui.notify(`Especialista @${agentName} activado. Escribe en el editor principal con salto de línea.`, "info");
    };

    // /agents command - Interactive catalog selector & details
    pi.registerCommand("agents", {
      description: "Listar e interactuar con los especialistas disponibles (/agents)",
      handler: async (_args, ctx) => {
        const agents = catalog.listAgents();
        if (agents.length === 0) {
          ctx.ui.notify("No se encontraron agentes especialistas configurados.", "warning");
          return;
        }

        const options = agents.map(
          a => `${a.name.padEnd(10, " ")} │ ${a.description.slice(0, 70)}${a.description.length > 70 ? "…" : ""}`
        );

        const choice = await ctx.ui.select("Especialistas Disponibles:", options);
        if (!choice) return;

        const selectedIndex = options.indexOf(choice);
        const selectedAgent = agents[selectedIndex];
        if (!selectedAgent) return;

        activateAgentInEditor(selectedAgent.name, ctx);
      },
    });

    // /agent command - Invocation with argument completions
    pi.registerCommand("agent", {
      description: "Invocar un agente especialista específico (/agent <nombre> <prompt>)",
      getArgumentCompletions: (prefix: string) => {
        const agents = catalog.listAgents();
        const clean = prefix.trim().toLowerCase();
        return agents
          .filter(a => a.name.toLowerCase().startsWith(clean))
          .map(a => ({
            value: a.name,
            label: a.name,
            description: a.description,
          }));
      },
      handler: async (args, ctx) => {
        const parts = args.trim().split(/\s+/);
        const agentName = parts[0]?.toLowerCase();
        const restPrompt = parts.slice(1).join(" ").trim();

        if (!agentName) {
          ctx.ui.notify("Uso: /agent <nombre> <prompt> (ej: /agent homero construye el auth)", "warning");
          return;
        }

        const agentRes = catalog.getAgent(agentName);
        if (!agentRes.ok) {
          ctx.ui.notify(`Agente no encontrado: "${agentName}". Usa /agents para ver los disponibles.`, "error");
          return;
        }

        if (restPrompt.length > 0) {
          pi.sendUserMessage(`@${agentRes.value.name} ${restPrompt}`);
        } else {
          activateAgentInEditor(agentRes.value.name, ctx);
        }
      },
    });

    // Register each specialist agent individually (matching /skill:* format)
    for (const agent of catalog.listAgents()) {
      // 1. /agent:<name> (e.g. /agent:homero, /agent:sheldon, etc.)
      pi.registerCommand(`agent:${agent.name}`, {
        description: `[Agente] ${agent.description}`,
        handler: async (args, ctx) => {
          const prompt = args.trim();
          if (prompt.length > 0) {
            pi.sendUserMessage(`@${agent.name} ${prompt}`);
          } else {
            activateAgentInEditor(agent.name, ctx);
          }
        },
      });

      // 2. Direct shortcut /<name> (e.g. /homero, /sheldon, etc.)
      pi.registerCommand(agent.name, {
        description: `[Agente @${agent.name}] ${agent.description}`,
        handler: async (args, ctx) => {
          const prompt = args.trim();
          if (prompt.length > 0) {
            pi.sendUserMessage(`@${agent.name} ${prompt}`);
          } else {
            activateAgentInEditor(agent.name, ctx);
          }
        },
      });
    }

    // Input Clipboard Utilities
    const copyInputHandler = async (_args: string, ctx: ExtensionCommandContext) => {
      const editorText = ctx.ui.getEditorText();
      if (editorText && editorText.trim().length > 0) {
        await copyToClipboard(editorText);
        ctx.ui.notify("Texto del input copiado al portapapeles", "info");
      } else {
        ctx.ui.notify("El editor de entrada está vacío", "warning");
      }
    };

    pi.registerCommand("copy-input", {
      description: "Copiar el texto actual del editor de entrada al portapapeles",
      handler: copyInputHandler,
    });
  };
}

export default createSmartOrchestrator();
