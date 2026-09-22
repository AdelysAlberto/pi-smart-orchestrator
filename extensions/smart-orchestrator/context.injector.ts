/**
 * Deterministic context injection for pipeline children.
 *
 * A child session started by `native.agent.runner.ts` is built with
 * `noContextFiles: true` and its own system prompt, so nothing reaches it by
 * accident — and nothing reaches it unless it is injected. That is what this module
 * does: it reads the rules named by a workflow step (plus the project's own
 * `AGENTS.md`) and returns one block to append to the child's system prompt.
 *
 * Why files and not a per-agent copy: the rules stay in `~/.pi/agent/rules/`, the
 * step decides which ones apply, and a change to a rule reaches every pipeline
 * without touching an agent definition. Nothing is duplicated and nothing depends
 * on the model deciding to open a file.
 *
 * A missing rule is reported inside the block instead of failing the step: a
 * pipeline that dies because a documentation file was renamed is worse than a step
 * that runs with the rest of its context and one visible gap.
 */
import {existsSync, readFileSync} from "node:fs";
import {dirname, join, resolve} from "node:path";
import {getAgentDir} from "@earendil-works/pi-coding-agent";

/**
 * Rules every pipeline step gets unless it says otherwise. The engineering
 * invariants and the verification gate apply to any file, in any language.
 */
export const DEFAULT_STEP_RULES: readonly string[] = ["engineering-invariants", "verification-checklist", "commits"];

/**
 * Marker of an already-injected context block.
 *
 * It must stay byte-identical to `INJECT_MARKER` in
 * `pi-laya-router/extensions/laya-router/rules.inject.ts`: the router injects the
 * same context lazily through `before_agent_start`, and whichever runs first wins.
 * Without the shared marker a pipeline child would carry the rules twice.
 */
export const INJECT_MARKER = "<!-- injected:agent-context -->";

/** Cap on the injected block. Beyond it the rules stop being context and start being noise. */
export const MAX_INJECTED_CHARS = 24_000;

export interface AgentContextInput {
  cwd: string;
  /** Rule names, without the `.md` extension. Empty means "none". */
  rules: readonly string[];
  /** Include the `AGENTS.md` chain of the project. Defaults to true. */
  includeProjectContext?: boolean;
}

export interface AgentContext {
  /** Markdown block ready to append to a system prompt. */
  block: string;
  /** Absolute paths that were read, in order. */
  sources: readonly string[];
  /** Rule names that could not be read. */
  missing: readonly string[];
}

/** `AGENTS.md` from `cwd` upwards, plus the global one, outermost first. */
export function findAgentsFiles(cwd: string, agentDir: string = getAgentDir()): string[] {
  const found: string[] = [];
  const global = join(agentDir, "AGENTS.md");
  if (existsSync(global)) found.push(global);

  const chain: string[] = [];
  let current = resolve(cwd);
  while (true) {
    const candidate = join(current, "AGENTS.md");
    if (existsSync(candidate)) chain.push(candidate);
    const parent = dirname(current);
    if (parent === current) break;
    current = parent;
  }
  // Outermost first, so the most specific file is the last thing the model reads.
  return [...found, ...chain.reverse()];
}

export function loadAgentContext(input: AgentContextInput): AgentContext {
  const rulesDir = join(getAgentDir(), "rules");
  const sources: string[] = [];
  const missing: string[] = [];
  const sections: string[] = [];

  if (input.includeProjectContext !== false) {
    for (const path of findAgentsFiles(input.cwd)) {
      const content = readText(path);
      if (content === undefined) continue;
      sources.push(path);
      sections.push(`# Project instructions (${path})\n\n${content}`);
    }
  }

  for (const name of input.rules) {
    const path = join(rulesDir, `${name}.md`);
    const content = readText(path);
    if (content === undefined) {
      missing.push(name);
      continue;
    }
    sources.push(path);
    sections.push(`# Rule: ${name}\n\n${content}`);
  }

  if (missing.length > 0) {
    sections.push(
      `# Rules not found\n\nThese rules were requested but could not be read from ${rulesDir}: ${missing.join(", ")}`
    );
  }

  return {block: withMarker(sections), sources, missing};
}

/**
 * The marker only goes in front of a block that has content: an empty context must
 * stay empty, or the marker itself would block the router's lazy injection later.
 */
function withMarker(sections: readonly string[]): string {
  const body = sections.join("\n\n---\n\n");
  if (body.trim().length === 0) return "";
  return cap(`${INJECT_MARKER}\n\n${body}`);
}

/** Composes the system prompt of a child: the agent's own body plus the injected context. */
export function composeSystemPrompt(agentPrompt: string, context: AgentContext): string {
  if (context.block.trim().length === 0) return agentPrompt;
  return `${agentPrompt}\n\n---\n\n${context.block}`;
}

function readText(path: string): string | undefined {
  try {
    const content = readFileSync(path, "utf-8").trim();
    return content.length === 0 ? undefined : content;
  } catch {
    return undefined;
  }
}

function cap(text: string): string {
  if (text.length <= MAX_INJECTED_CHARS) return text;
  return `${text.slice(0, MAX_INJECTED_CHARS)}\n\n[context truncated at ${MAX_INJECTED_CHARS} characters]`;
}

/** Exposed for tests: the resolved rules directory (never hardcoded to `$HOME`). */
export function rulesDirectory(): string {
  return join(getAgentDir(), "rules");
}
