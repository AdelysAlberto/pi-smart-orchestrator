import type {ThinkingLevel} from "@earendil-works/pi-agent-core";
import type {Api, Model} from "@earendil-works/pi-ai";
import {
  type AgentSessionEvent,
  createAgentSession,
  DefaultResourceLoader,
  getAgentDir,
  type ModelRegistry,
  SessionManager,
} from "@earendil-works/pi-coding-agent";
import type {AgentsCatalog} from "./agents.catalog.ts";
import {fail, type Result} from "./guards.ts";

export interface AgentRunRequest {
  agentHandle: string;
  prompt: string;
  modelString?: string;
  thinkingLevel?: string;
  description?: string;
  maxTurns?: number;
  signal?: AbortSignal;
  onTextDelta?: (delta: string, accumulated: string) => void;
  onToolActivity?: (activity: {type: "start" | "end"; toolName: string}) => void;
  onTurnEnd?: (turn: number) => void;
}

export interface AgentRunOutput {
  agent: string;
  status: "completed" | "error";
  result: string;
  error?: string;
  durationMs: number;
  turns: number;
}

export interface NativeRunnerDeps {
  catalog: AgentsCatalog;
  modelRegistry?: ModelRegistry;
  cwd?: string;
}

export interface NativeAgentRunner {
  run(request: AgentRunRequest): Promise<Result<AgentRunOutput>>;
}

export function createGenericModelResolver(modelRegistry?: ModelRegistry) {
  return (modelString?: string): Model<Api> | undefined => {
    if (!modelRegistry) return undefined;
    if (!modelString || modelString.trim().length === 0) {
      return modelRegistry.getAvailable()[0];
    }

    const clean = modelString.trim();
    const slashIdx = clean.indexOf("/");
    if (slashIdx !== -1) {
      const provider = clean.slice(0, slashIdx);
      const modelId = clean.slice(slashIdx + 1);
      const found = modelRegistry.find(provider, modelId);
      if (found) return found;
    }

    // Lookup in available
    const available = modelRegistry.getAvailable();
    return available.find(m => m.id === clean || `${m.provider}/${m.id}` === clean) ?? available[0];
  };
}

export function createNativeAgentRunner(deps: NativeRunnerDeps): NativeAgentRunner {
  const {catalog, modelRegistry} = deps;
  const cwd = deps.cwd ?? process.cwd();
  const resolveModel = createGenericModelResolver(modelRegistry);

  return {
    async run(request: AgentRunRequest): Promise<Result<AgentRunOutput>> {
      const agentRes = catalog.getAgent(request.agentHandle);
      if (!agentRes.ok) {
        return fail(`agent_not_found:${request.agentHandle}`);
      }
      const agent = agentRes.value;

      const modelTarget = request.modelString ?? agent.model;
      const model = resolveModel(modelTarget);
      const thinkingLevel = (request.thinkingLevel ?? agent.thinking ?? "low") as ThinkingLevel;

      const loader = new DefaultResourceLoader({
        cwd,
        agentDir: getAgentDir(),
        systemPromptOverride: () => agent.systemPrompt,
        noPromptTemplates: true,
        noThemes: true,
        noContextFiles: true,
      });

      let sessionResult: Awaited<ReturnType<typeof createAgentSession>>;
      try {
        sessionResult = await createAgentSession({
          cwd,
          agentDir: getAgentDir(),
          sessionManager: SessionManager.inMemory(cwd),
          model,
          thinkingLevel,
          tools: agent.tools.length > 0 ? agent.tools : undefined,
          resourceLoader: loader,
        });
      } catch (err: unknown) {
        const msg = err instanceof Error ? err.message : String(err);
        return fail(`session_creation_failed:${msg}`);
      }

      const {session} = sessionResult;
      let responseText = "";
      let turnCount = 0;
      const effectiveMaxTurns = request.maxTurns ?? agent.maxTurns ?? 30;

      const unsub = session.subscribe((event: AgentSessionEvent) => {
        if (event.type === "turn_end") {
          turnCount++;
          request.onTurnEnd?.(turnCount);
          if (turnCount >= effectiveMaxTurns) {
            session.abort();
          }
        }
        if (event.type === "message_update" && event.assistantMessageEvent.type === "text_delta") {
          responseText += event.assistantMessageEvent.delta;
          request.onTextDelta?.(event.assistantMessageEvent.delta, responseText);
        }
        if (event.type === "tool_execution_start") {
          request.onToolActivity?.({type: "start", toolName: event.toolName});
        }
        if (event.type === "tool_execution_end") {
          request.onToolActivity?.({type: "end", toolName: event.toolName});
        }
      });

      // Forward abort signal if supplied
      if (request.signal) {
        request.signal.addEventListener("abort", () => {
          session.abort();
        });
      }

      const startTime = Date.now();
      let status: "completed" | "error" = "completed";
      let errorMessage: string | undefined;

      try {
        await session.prompt(request.prompt);
      } catch (err: unknown) {
        status = "error";
        errorMessage = err instanceof Error ? err.message : String(err);
      } finally {
        unsub();
      }

      const durationMs = Date.now() - startTime;

      return {
        ok: true,
        value: {
          agent: agent.name,
          status,
          result: responseText,
          error: errorMessage,
          durationMs,
          turns: turnCount,
        },
      };
    },
  };
}
