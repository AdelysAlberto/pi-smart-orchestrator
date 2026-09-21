import type {OrchestratorConfig, RouteConfig} from "./config.validator.ts";
import {fail} from "./guards.ts";
import type {Classifier} from "./laya.client.ts";
import type {NativeAgentRunner} from "./native.agent.runner.ts";

export interface RoutingDecision {
  domain: string;
  effort: string;
  handle: string;
  model: string;
  thinking: string | null;
  mode: "fastPath" | "workflow";
  workflowName?: string;
}

export interface RouteSuccess {
  ok: true;
  decision: RoutingDecision;
  latencyMs?: number;
  inputTokens?: number;
}

export type RouteOutcome = RouteSuccess | {ok: false; reason: string; status?: number};

export interface RouteEngineDeps {
  config: OrchestratorConfig;
  classify: Classifier;
  runner: NativeAgentRunner;
  isEnabled: () => boolean;
}

export interface InputEvent {
  text: string;
  contextPrompt?: string;
}

export async function processInput(event: InputEvent, deps: RouteEngineDeps): Promise<RouteOutcome> {
  const {config, classify, isEnabled} = deps;

  if (!isEnabled()) {
    return fail("orchestrator_disabled");
  }

  const prompt = event.text.trim();
  if (prompt.length === 0) {
    return fail("empty_prompt");
  }

  const stateToClassify = event.contextPrompt
    ? `Contexto de la tarea anterior: "${event.contextPrompt}"\nInstrucción actual: "${prompt}"`
    : prompt;

  const classifyRes = await classify(stateToClassify);
  if (!classifyRes.ok) {
    return fail(`classification_failed:${classifyRes.reason}`);
  }

  const classification = classifyRes.value;
  const domain = classification.answers.domain ?? "general";
  const effort = classification.answers.effort ?? "low";

  const route: RouteConfig | undefined = config.routes[domain] ?? config.routes.default;
  if (!route) {
    return fail(`no_route_for_domain_${domain}`);
  }

  if (route.handle === "none") {
    return fail("route_handle_none");
  }

  const effortModel = config.effortModels[effort] ?? config.effortModels.low ?? {model: "default"};
  const mode: "fastPath" | "workflow" = route.workflow && config.workflows[route.workflow] ? "workflow" : "fastPath";

  const decision: RoutingDecision = {
    domain,
    effort,
    handle: route.handle,
    model: effortModel.model,
    thinking: effortModel.thinking ?? null,
    mode,
    workflowName: route.workflow,
  };

  return {
    ok: true,
    decision,
    latencyMs: classification.meta.latencyMs,
    inputTokens: classification.meta.inputTokens,
  };
}
