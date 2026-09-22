import {describe, expect, test} from "bun:test";
import {readFileSync, writeFileSync} from "node:fs";
import {tmpdir} from "node:os";
import {join} from "node:path";
import {loadOrchestratorConfigFile, parseOrchestratorConfig, saveOrchestratorConfigFile} from "../config.validator.ts";

const validConfigRaw = {
  enabled: true,
  maxInFlight: 3,
  debug: false,
  agentsDir: "/Volumes/Datos/Projects/utils/agents/agents-pi/agents",
  logFile: "~/.pi/agent/smart-orchestrator.log",
  theme: {
    colors: {
      active: "#00E5FF",
      header: "#A3BF06",
      action: "#FF6B00",
      surface: "#0B0F17",
    },
  },
  workflows: {
    "plan-and-build": {
      description: "Plan then build",
      steps: [
        {step: 1, name: "Plan", agent: "sheldon", effort: "high", requireApproval: true},
        {step: 2, name: "Build", agent: "homero", effort: "low", inputFrom: "step 1"},
      ],
    },
  },
};

describe("Config Validator", () => {
  test("parses a valid configuration", () => {
    const res = parseOrchestratorConfig(validConfigRaw);
    expect(res.ok).toBe(true);
    if (!res.ok) return;

    expect(res.value.enabled).toBe(true);
    expect(res.value.maxInFlight).toBe(3);
    expect(res.value.theme.colors.active).toBe("#00E5FF");
    expect(res.value.workflows["plan-and-build"]?.steps.length).toBe(2);
    expect(res.value.workflows["plan-and-build"]?.steps[0]?.requireApproval).toBe(true);
    expect(res.value.workflows["plan-and-build"]?.steps[1]?.inputFrom).toBe("step 1");
  });

  test("has no model table and no classifier of its own", () => {
    const res = parseOrchestratorConfig({...validConfigRaw, effortModels: {low: {model: "x"}}, endpoint: "http://x"});
    expect(res.ok).toBe(true);
    if (!res.ok) return;

    expect("effortModels" in res.value).toBe(false);
    expect("endpoint" in res.value).toBe(false);
    expect("switchModel" in res.value).toBe(false);
    expect("routes" in res.value).toBe(false);
  });

  test("applies the documented defaults", () => {
    const res = parseOrchestratorConfig({
      workflows: {w: {description: "", steps: [{step: 1, name: "n", agent: "a"}]}},
    });
    expect(res.ok).toBe(true);
    if (!res.ok) return;

    expect(res.value.enabled).toBe(true);
    expect(res.value.maxInFlight).toBe(3);
    expect(res.value.theme.colors.surface).toBe("#0B0F17");
  });

  test("rejects a config without workflows", () => {
    expect(parseOrchestratorConfig({enabled: true}).ok).toBe(false);
  });

  test("rejects a workflow without steps", () => {
    const res = parseOrchestratorConfig({workflows: {w: {description: "d", steps: []}}});
    expect(res.ok).toBe(false);
  });

  test("rejects an incomplete workflow step", () => {
    const res = parseOrchestratorConfig({workflows: {broken: {description: "broken", steps: [{step: 1}]}}});
    expect(res.ok).toBe(false);
  });

  test("loads the shipped orchestrator.config.json", () => {
    const res = loadOrchestratorConfigFile("./orchestrator.config.json");
    expect(res.ok).toBe(true);
    if (!res.ok) return;

    expect(res.value.enabled).toBe(true);
    expect(res.value.theme.colors.header).toBe("#A3BF06");
    expect(res.value.workflows["plan-and-build"]?.steps.map(step => step.agent)).toEqual(["sheldon", "homero"]);
  });

  test("reports an unreadable file instead of throwing", () => {
    const res = loadOrchestratorConfigFile("/nonexistent/orchestrator.config.json");
    expect(res.ok).toBe(false);
    if (res.ok) return;
    expect(res.reason).toContain("cannot_load_config");
  });

  test("saves only the enabled flag and keeps the rest of the file intact", () => {
    const path = join(tmpdir(), `orch-config-${Date.now()}.json`);
    writeFileSync(path, `${JSON.stringify(validConfigRaw, null, 2)}\n`, "utf-8");

    const saved = saveOrchestratorConfigFile(path, {enabled: false});
    expect(saved.ok).toBe(true);

    const written = JSON.parse(readFileSync(path, "utf-8"));
    expect(written.enabled).toBe(false);
    expect(written.workflows["plan-and-build"].steps.length).toBe(2);
    // A legacy key from an older file is not deleted by a save.
    expect(written.maxInFlight).toBe(3);
  });
});
