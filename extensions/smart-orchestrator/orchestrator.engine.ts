import type {AgentsCatalog} from "./agents.catalog.ts";
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
  catalog?: AgentsCatalog;
}

export interface InputEvent {
  text: string;
  contextPrompt?: string;
}

export function detectExplicitAgentTag(
  prompt: string,
  catalog?: AgentsCatalog
): {handle: string; cleanedPrompt: string} | undefined {
  if (!catalog) return undefined;

  // 1. Prefix: @<handle> or @<handle>: or @<handle>,
  const leadingAtMatch = prompt.match(/^@([a-zA-Z0-9_-]+)[:,\s]?\s*(.*)$/s);
  if (leadingAtMatch?.[1]) {
    const candidate = leadingAtMatch[1].toLowerCase();
    if (catalog.getAgent(candidate).ok) {
      return {handle: candidate, cleanedPrompt: leadingAtMatch[2]?.trim() ?? ""};
    }
  }

  // 2. Prefix: /agent:<handle> or /agent <handle> or agent:<handle>
  const agentCmdMatch = prompt.match(/^(?:\/agent[:\s]+|agent:)([a-zA-Z0-9_-]+)[:,\s]?\s*(.*)$/is);
  if (agentCmdMatch?.[1]) {
    const candidate = agentCmdMatch[1].toLowerCase();
    if (catalog.getAgent(candidate).ok) {
      return {handle: candidate, cleanedPrompt: agentCmdMatch[2]?.trim() ?? ""};
    }
  }

  // 3. Prefix: /<handle> (e.g. /homero or /sheldon)
  const slashAliasMatch = prompt.match(/^\/([a-zA-Z0-9_-]+)[:,\s]?\s*(.*)$/s);
  if (slashAliasMatch?.[1]) {
    const candidate = slashAliasMatch[1].toLowerCase();
    if (catalog.getAgent(candidate).ok) {
      return {handle: candidate, cleanedPrompt: slashAliasMatch[2]?.trim() ?? ""};
    }
  }

  // 4. Mention anywhere in prompt: @<handle> (e.g. "Por favor @tio-bob revisa esto")
  const mentionMatches = prompt.matchAll(/(?:^|\s)@([a-zA-Z0-9_-]+)\b/g);
  for (const match of mentionMatches) {
    if (match[1]) {
      const candidate = match[1].toLowerCase();
      if (catalog.getAgent(candidate).ok) {
        return {handle: candidate, cleanedPrompt: prompt};
      }
    }
  }

  return undefined;
}

export async function processInput(event: InputEvent, deps: RouteEngineDeps): Promise<RouteOutcome> {
  const {config, classify, isEnabled, catalog} = deps;

  if (!isEnabled()) {
    return fail("orchestrator_disabled");
  }

  const prompt = event.text.trim();
  if (prompt.length === 0) {
    return fail("empty_prompt");
  }

  // Explicit Agent Tag Detection (Direct Dispatch bypasses Laya classifier)
  if (catalog) {
    const explicit = detectExplicitAgentTag(prompt, catalog);
    if (explicit) {
      const agentRes = catalog.getAgent(explicit.handle);
      if (agentRes.ok) {
        const agent = agentRes.value;
        let matchedDomain: string | undefined;
        for (const [domainKey, route] of Object.entries(config.routes)) {
          if (route.handle === agent.name) {
            matchedDomain = domainKey;
            break;
          }
        }
        const domain = matchedDomain ?? "direct_tag";
        const effort = agent.thinking === "high" || agent.thinking === "medium" ? "high" : "low";
        const effortModel = config.effortModels[effort] ?? config.effortModels.low ?? {model: "default"};
        const model = agent.model ?? effortModel.model;
        const thinking = agent.thinking ?? effortModel.thinking ?? null;

        const decision: RoutingDecision = {
          domain,
          effort,
          handle: agent.name,
          model,
          thinking,
          mode: "fastPath",
        };

        return {
          ok: true,
          decision,
          latencyMs: 0,
          inputTokens: 0,
        };
      }
    }
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
