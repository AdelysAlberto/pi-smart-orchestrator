import {copyToClipboard, type ExtensionAPI} from "@earendil-works/pi-coding-agent";
import {type AgentsCatalog, createAgentsCatalog} from "./agents.catalog.ts";
import {type OrchestratorCommandState, resolveOrchestratorCommand, STATUS_KEY} from "./command.ts";
import {loadOrchestratorConfigFile, type OrchestratorConfig} from "./config.validator.ts";
import {extractAndNormalizeImagesFromText} from "./image.processor.ts";
import {type Classifier, createLayaClassifier} from "./laya.client.ts";
import {createOrchestratorLogger, type OrchestratorLogger} from "./logger.ts";
import {createGenericModelResolver, createNativeAgentRunner, type NativeAgentRunner} from "./native.agent.runner.ts";
import {processInput} from "./orchestrator.engine.ts";
import {defaultConfigPath} from "./paths.ts";
import {
  ORCHESTRATOR_TASK_ENTRY_TYPE,
  type OrchestratorTaskCardData,
  PIPELINE_PROGRESS_ENTRY_TYPE,
  type PipelineProgressData,
  registerOrchestratorRenderers,
} from "./tui/decision.renderer.ts";
import {showOrchestratorSettingsMenu} from "./tui/settings.menu.ts";
import {VIASERA_PALETTE} from "./tui/theme.ts";
import {registerCollapsibleToolRenderers} from "./tui/tools.renderer.ts";
import {runSequentialPipeline} from "./workflow.runner.ts";

export interface SmartOrchestratorOptions {
  configPath?: string;
  classifier?: Classifier;
  runner?: NativeAgentRunner;
  catalog?: AgentsCatalog;
}

export function createSmartOrchestrator(options: SmartOrchestratorOptions = {}): (pi: ExtensionAPI) => void {
  return pi => {
    const configPath = options.configPath ?? defaultConfigPath();
    const loaded = loadOrchestratorConfigFile(configPath);
    const config: OrchestratorConfig | undefined = loaded.ok ? loaded.value : undefined;

    registerOrchestratorRenderers(pi, () => config?.theme?.colors ?? VIASERA_PALETTE);
    registerCollapsibleToolRenderers(pi);

    const classifier = options.classifier ?? (config ? createLayaClassifier(config) : undefined);

    const state: OrchestratorCommandState = {
      enabled: config?.enabled === true,
      configValid: loaded.ok,
      switchModel: config?.switchModel ?? true,
      switchThinking: config?.switchThinking ?? true,
      switchAgent: config?.switchAgent ?? true,
    };

    const logger: OrchestratorLogger = createOrchestratorLogger({
      logFile: config?.logFile,
      debug: config?.debug,
    });

    let catalog: AgentsCatalog = options.catalog ?? createAgentsCatalog(config?.agentsDir);
    let modelRegistry: import("@earendil-works/pi-coding-agent").ModelRegistry | undefined;
    let runner: NativeAgentRunner | undefined = options.runner;
    let pendingSpecialistPrompt: string | undefined;

    pi.on("session_start", async (_event, ctx) => {
      catalog = options.catalog ?? createAgentsCatalog(config?.agentsDir);
      modelRegistry = ctx.modelRegistry;
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

    pi.on("tool_execution_update", (event, ctx) => {
      if (event.partialResult) {
        const elapsedSec = Math.floor((Date.now() - toolStartTime) / 1000);
        const secText = elapsedSec > 0 ? ` (${elapsedSec}s)` : "";
        ctx.ui.setStatus("tool_activity", `⚡ ${currentToolName}${secText}: ${currentToolArgs}`);
      }
    });

    pi.on("tool_execution_end", (_event, ctx) => {
      if (activeToolTimer) {
        clearInterval(activeToolTimer);
        activeToolTimer = undefined;
      }
      ctx.ui.setStatus("tool_activity", undefined);
    });

    pi.on("before_agent_start", async event => {
      if (pendingSpecialistPrompt) {
        const promptToInject = pendingSpecialistPrompt;
        pendingSpecialistPrompt = undefined;
        return {
          systemPrompt: `${event.systemPrompt}\n\n${promptToInject}`,
        };
      }
      return undefined;
    });

    // Support context_with_system event in new Pi runtime for verbatim prompt injection
    (pi as unknown as {on(event: string, handler: (event: {messages: readonly unknown[]}) => unknown): void}).on(
      "context_with_system",
      async (event: {messages: readonly unknown[]}) => {
        if (pendingSpecialistPrompt && event.messages.length > 0) {
          const promptToInject = pendingSpecialistPrompt;
          pendingSpecialistPrompt = undefined;

          const updatedMessages = [...event.messages] as Array<{role?: string; content?: unknown}>;
          const lead = updatedMessages[0];
          if (lead && lead.role === "system") {
            const leadContent = Array.isArray(lead.content)
              ? lead.content
              : [{type: "text", text: String(lead.content ?? "")}];

            const textPart = leadContent.find((p: {type?: string; text?: string}) => p?.type === "text") as
              | {type: string; text: string}
              | undefined;
            if (textPart && typeof textPart.text === "string") {
              textPart.text = `${textPart.text}\n\n${promptToInject}`;
            } else {
              leadContent.push({type: "text", text: promptToInject});
            }
            updatedMessages[0] = {...lead, content: leadContent};
            return {messages: updatedMessages};
          }
        }
        return undefined;
      }
    );

    interface EntriesProvider {
      getEntries(): readonly unknown[];
    }

    function extractPreviousUserPrompt(sessionManager?: EntriesProvider): string | undefined {
      if (!sessionManager) return undefined;
      try {
        const entries = sessionManager.getEntries();
        for (let i = entries.length - 1; i >= 0; i--) {
          const entry = entries[i];
          if (
            entry &&
            typeof entry === "object" &&
            "type" in entry &&
            (entry as {type: string}).type === "message" &&
            "message" in entry
          ) {
            const msg = (entry as {message: {role?: string; content?: unknown}}).message;
            if (msg?.role === "user") {
              if (typeof msg.content === "string" && msg.content.trim().length > 0) {
                return msg.content.trim();
              }
              if (Array.isArray(msg.content)) {
                const textPart = msg.content.find(
                  (p: {type?: string; text?: string}) => p?.type === "text" && typeof p?.text === "string"
                );
                if (textPart?.text && textPart.text.trim().length > 0) return textPart.text.trim();
              }
            }
          }
        }
      } catch {
        return undefined;
      }
      return undefined;
    }

    pi.on("input", async (event, ctx) => {
      if (!modelRegistry && ctx.modelRegistry) {
        modelRegistry = ctx.modelRegistry;
      }
      if (!runner) {
        runner =
          options.runner ??
          createNativeAgentRunner({
            catalog,
            modelRegistry: ctx.modelRegistry,
            cwd: ctx.cwd,
          });
      }

      if (!state.enabled || !state.configValid || !config || !classifier || !runner) {
        await logger.log({event: "input_ignored", reason: "orchestrator_disabled_or_invalid_config"});
        return {action: "continue"};
      }

      // Extract and normalize any pasted image paths (e.g. TIFF / HEIC / PNG / JPG)
      const imageResult = await extractAndNormalizeImagesFromText(event.text);
      const effectiveText = imageResult.cleanedText;
      const combinedImages =
        imageResult.images.length > 0 ? [...(event.images ?? []), ...imageResult.images] : event.images;

      const contextPrompt = extractPreviousUserPrompt(ctx.sessionManager);
      const outcome = await processInput(
        {text: effectiveText, contextPrompt},
        {
          config,
          classify: classifier,
          runner,
          isEnabled: () => state.enabled,
          catalog,
        }
      );

      if (!outcome.ok) {
        await logger.log({event: "input_fail_open", reason: outcome.reason});
        if (imageResult.images.length > 0) {
          return {
            action: "transform",
            text: effectiveText,
            images: combinedImages,
          };
        }
        return {action: "continue"};
      }

      await logger.log({
        event: "dispatched",
        domain: outcome.decision.domain,
        effort: outcome.decision.effort,
        handle: outcome.decision.handle,
        model: outcome.decision.model,
        thinking: outcome.decision.thinking,
        mode: outcome.decision.mode,
        workflowName: outcome.decision.workflowName,
        latencyMs: outcome.latencyMs,
      });

      const agentRes = catalog.getAgent(outcome.decision.handle);
      const agent = agentRes.ok ? agentRes.value : undefined;

      // Render routing details, specialist scope and armed tools
      pi.appendEntry<OrchestratorTaskCardData>(ORCHESTRATOR_TASK_ENTRY_TYPE, {
        userPrompt: effectiveText,
        domain: outcome.decision.domain,
        effort: outcome.decision.effort,
        handle: outcome.decision.handle,
        agentDescription: agent?.description,
        agentTools: agent?.tools,
        model: outcome.decision.model,
        thinking: outcome.decision.thinking,
        latencyMs: outcome.latencyMs,
        mode: outcome.decision.mode,
        workflowName: outcome.decision.workflowName,
        switchModel: state.switchModel,
        switchThinking: state.switchThinking,
        switchAgent: state.switchAgent,
      });

      const currentRunner = runner;

      if (outcome.decision.mode === "fastPath") {
        if (state.switchAgent && agent) {
          pendingSpecialistPrompt = agent.systemPrompt;
          if (agent.tools.length > 0) {
            pi.setActiveTools(agent.tools);
          }
        }

        if (state.switchModel) {
          const resolveModel = createGenericModelResolver(modelRegistry ?? ctx.modelRegistry);
          const targetModel = resolveModel(outcome.decision.model);
          if (targetModel) {
            await pi.setModel(targetModel);
          }
        }

        if (state.switchThinking && outcome.decision.thinking) {
          pi.setThinkingLevel(outcome.decision.thinking as import("@earendil-works/pi-agent-core").ThinkingLevel);
        }

        if (imageResult.images.length > 0) {
          return {
            action: "transform",
            text: effectiveText,
            images: combinedImages,
          };
        }

        return {action: "continue"};
      }

      if (outcome.decision.mode === "workflow" && outcome.decision.workflowName) {
        const workflow = config.workflows[outcome.decision.workflowName];
        if (workflow) {
          runSequentialPipeline({
            workflowName: outcome.decision.workflowName,
            workflow,
            userPrompt: effectiveText,
            config,
            runner: currentRunner,
            onProgress: progress => {
              pi.appendEntry<PipelineProgressData>(PIPELINE_PROGRESS_ENTRY_TYPE, progress);
            },
          })
            .then(async res => {
              await logger.log({
                event: "workflow_finished",
                workflowName: outcome.decision.workflowName,
                status: res.ok ? "completed" : "error",
                error: res.ok ? undefined : res.reason,
              });
            })
            .catch(async (err: unknown) => {
              await logger.log({
                event: "workflow_crash",
                workflowName: outcome.decision.workflowName,
                error: String(err),
              });
            });
        }

        return {action: "handled"};
      }

      return {action: "continue"};
    });

    pi.registerCommand("orchestrator", {
      description: "Configurar o alternar Pi Smart Orchestrator (/orchestrator [settings|on|off|model|thinking|agent])",
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
        state.switchModel = outcome.switchModel;
        state.switchThinking = outcome.switchThinking;
        state.switchAgent = outcome.switchAgent;
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
    const activateAgentInEditor = (
      agentName: string,
      ctx: import("@earendil-works/pi-coding-agent").ExtensionCommandContext
    ) => {
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
    const copyInputHandler = async (
      _args: string,
      ctx: import("@earendil-works/pi-coding-agent").ExtensionCommandContext
    ) => {
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
