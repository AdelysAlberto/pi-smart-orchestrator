import {describe, expect, test} from "bun:test";
import {mkdirSync, mkdtempSync, writeFileSync} from "node:fs";
import {tmpdir} from "node:os";
import {join} from "node:path";
import {
  composeSystemPrompt,
  findAgentsFiles,
  INJECT_MARKER,
  loadAgentContext,
  rulesDirectory,
} from "../context.injector.ts";

function projectWithAgents(): {root: string; nested: string} {
  const root = mkdtempSync(join(tmpdir(), "viasera-ctx-"));
  const nested = join(root, "backend");
  mkdirSync(nested, {recursive: true});
  writeFileSync(join(root, "AGENTS.md"), "# Project rules\n\nNo emojis, i18n en 5 idiomas.\n", "utf-8");
  writeFileSync(join(nested, "AGENTS.md"), "# Backend rules\n\nResult pattern obligatorio.\n", "utf-8");
  return {root, nested};
}

describe("findAgentsFiles", () => {
  test("walks the chain outwards, most specific last", () => {
    const {root, nested} = projectWithAgents();
    const found = findAgentsFiles(nested);

    const projectFiles = found.filter(path => path.startsWith(root));
    expect(projectFiles).toEqual([join(root, "AGENTS.md"), join(nested, "AGENTS.md")]);
  });
});

describe("loadAgentContext", () => {
  test("injects the requested rules from the rules directory", () => {
    const {nested} = projectWithAgents();
    const context = loadAgentContext({cwd: nested, rules: ["engineering-invariants"]});

    expect(context.missing).toEqual([]);
    expect(context.block).toContain("# Rule: engineering-invariants");
    expect(context.sources).toContain(join(rulesDirectory(), "engineering-invariants.md"));
  });

  test("injects the project instructions and the backend ones, in order", () => {
    const {nested} = projectWithAgents();
    const context = loadAgentContext({cwd: nested, rules: []});

    const projectIndex = context.block.indexOf("No emojis, i18n en 5 idiomas");
    const backendIndex = context.block.indexOf("Result pattern obligatorio");
    expect(projectIndex).toBeGreaterThanOrEqual(0);
    expect(backendIndex).toBeGreaterThan(projectIndex);
  });

  test("skips the project instructions when the caller says so", () => {
    const {nested} = projectWithAgents();
    const context = loadAgentContext({cwd: nested, rules: ["runtime"], includeProjectContext: false});

    expect(context.block).not.toContain("No emojis");
    expect(context.block).toContain("# Rule: runtime");
  });

  test("reports a missing rule inside the block instead of failing the step", () => {
    const {nested} = projectWithAgents();
    const context = loadAgentContext({cwd: nested, rules: ["una-regla-que-no-existe"]});

    expect(context.missing).toEqual(["una-regla-que-no-existe"]);
    expect(context.block).toContain("# Rules not found");
    expect(context.block).toContain("una-regla-que-no-existe");
  });

  test("returns an empty block when there is nothing to inject", () => {
    const context = loadAgentContext({cwd: tmpdir(), rules: [], includeProjectContext: false});
    expect(context.block).toBe("");
    expect(context.sources).toEqual([]);
  });
});

describe("composeSystemPrompt", () => {
  test("keeps the agent's own prompt first and appends the context", () => {
    const composed = composeSystemPrompt("# Homero\n\nConstruye.", {block: "# Rule: x", sources: [], missing: []});

    expect(composed.startsWith("# Homero")).toBe(true);
    expect(composed).toContain("# Rule: x");
  });

  test("marks the block so the router's lazy injection can skip it", () => {
    const {nested} = projectWithAgents();
    const context = loadAgentContext({cwd: nested, rules: ["runtime"]});

    expect(context.block.startsWith(INJECT_MARKER)).toBe(true);
  });

  test("returns the agent prompt untouched when there is no context", () => {
    expect(composeSystemPrompt("# Homero", {block: "   ", sources: [], missing: []})).toBe("# Homero");
  });
});
