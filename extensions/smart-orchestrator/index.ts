import type {ExtensionAPI} from "@earendil-works/pi-coding-agent";
import {type AgentsCatalog, createAgentsCatalog} from "./agents.catalog.ts";
import {type OrchestratorCommandState, resolveOrchestratorCommand, STATUS_KEY} from "./command.ts";
import {loadOrchestratorConfigFile, type OrchestratorConfig} from "./config.validator.ts";
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

      const contextPrompt = extractPreviousUserPrompt(ctx.sessionManager);
      const outcome = await processInput(
        {text: event.text, contextPrompt},
        {
          config,
          classify: classifier,
          runner,
          isEnabled: () => state.enabled,
        }
      );

      if (!outcome.ok) {
        await logger.log({event: "input_fail_open", reason: outcome.reason});
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

      // Guarantee that user prompt is ALWAYS rendered along with routing details, specialist scope and armed tools
      pi.appendEntry<OrchestratorTaskCardData>(ORCHESTRATOR_TASK_ENTRY_TYPE, {
        userPrompt: event.text,
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
      });

      const currentRunner = runner;

      if (outcome.decision.mode === "fastPath") {
        if (agent) {
          pendingSpecialistPrompt = agent.systemPrompt;
          if (agent.tools.length > 0) {
            pi.setActiveTools(agent.tools);
          }
        }

        const resolveModel = createGenericModelResolver(modelRegistry ?? ctx.modelRegistry);
        const targetModel = resolveModel(outcome.decision.model);
        if (targetModel) {
          await pi.setModel(targetModel);
        }
        if (outcome.decision.thinking) {
          pi.setThinkingLevel(outcome.decision.thinking as import("@earendil-works/pi-agent-core").ThinkingLevel);
        }

        return {action: "continue"};
      }

      if (outcome.decision.mode === "workflow" && outcome.decision.workflowName) {
        const workflow = config.workflows[outcome.decision.workflowName];
        if (workflow) {
          runSequentialPipeline({
            workflowName: outcome.decision.workflowName,
            workflow,
            userPrompt: event.text,
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
      description: "Activar, desactivar o inspeccionar Pi Smart Orchestrator (/orchestrator on|off)",
      handler: async (args, ctx) => {
        const outcome = resolveOrchestratorCommand(args, state);
        state.enabled = outcome.enabled && state.configValid;
        if (outcome.changed) {
          ctx.ui.setStatus(STATUS_KEY, outcome.status);
        }
        ctx.ui.notify(outcome.message, outcome.tone);
      },
    });
  };
}

export default createSmartOrchestrator();
