import {describe, expect, test} from "bun:test";
import {loadOrchestratorConfigFile, parseLayaConfig, parseOrchestratorConfig} from "../config.validator.ts";

describe("Config Validator", () => {
  const validConfigRaw = {
    enabled: true,
    classifierConfig: "./laya.config.json",
    agentsDir: "/Volumes/Datos/Projects/utils/agents/agents-pi/agents",
    maxInFlight: 3,
    theme: {
      colors: {
        active: "#00E5FF",
        header: "#A3BF06",
        action: "#FF6B00",
        surface: "#0B0F17",
      },
    },
    questions: {
      domain: {
        type: "choice",
        instructions: "Pick domain",
        criteria: {
          code: "Coding",
          ux: "UI/UX",
        },
      },
      effort: {
        type: "choice",
        instructions: "Pick effort",
        criteria: {
          low: "Easy",
          high: "Hard",
        },
      },
    },
    routes: {
      code: {handle: "homero", fastPath: true},
      ux: {handle: "edna", fastPath: true},
      default: {handle: "homero"},
    },
    workflows: {
      "plan-and-build": {
        description: "Plan then build",
        steps: [
          {step: 1, name: "Plan", agent: "sheldon", effort: "high", requireApproval: true},
          {step: 2, name: "Build", agent: "homero", effort: "low", inputFrom: "step-1"},
        ],
      },
    },
    effortModels: {
      low: {model: "deepseek-flash", thinking: "low"},
      high: {model: "deepseek-v4-pro", thinking: "high"},
    },
  };

  const validLayaRaw = {
    endpoint: "http://127.0.0.1:8090/analyze",
    timeoutMs: 1500,
    checkpoint: "",
    questions: {
      intent_type: {
        type: "choice",
        instructions: "Classify intent",
        criteria: {
          continuation: "Continue",
          new_task: "New task",
        },
      },
      domain: {
        type: "choice",
        instructions: "Pick domain",
        criteria: {
          code: "Coding",
          architecture: "Architecture",
        },
      },
    },
  };

  test("parses a valid configuration correctly", () => {
    const res = parseOrchestratorConfig(validConfigRaw);
    expect(res.ok).toBe(true);
    if (!res.ok) return;

    expect(res.value.enabled).toBe(true);
    expect(res.value.routes.code?.handle).toBe("homero");
    expect(res.value.theme.colors.active).toBe("#00E5FF");
    expect(res.value.workflows["plan-and-build"]?.steps.length).toBe(2);
    expect(res.value.effortModels.high?.model).toBe("deepseek-v4-pro");
  });

  test("parses a valid laya.config.json correctly", () => {
    const res = parseLayaConfig(validLayaRaw);
    expect(res.ok).toBe(true);
    if (!res.ok) return;

    expect(res.value.endpoint).toBe("http://127.0.0.1:8090/analyze");
    expect(res.value.timeoutMs).toBe(1500);
    expect(res.value.questions.intent_type?.criteria.continuation).toBe("Continue");
  });

  test("loads orchestrator.config.json and hydrates laya.config.json", () => {
    const res = loadOrchestratorConfigFile("./orchestrator.config.json");
    expect(res.ok).toBe(true);
    if (!res.ok) return;

    expect(res.value.enabled).toBe(true);
    expect(res.value.theme.colors.header).toBe("#A3BF06");
    expect(res.value.questions.intent_type).toBeDefined();
    expect(res.value.questions.domain).toBeDefined();
    expect(res.value.routes.code?.handle).toBe("homero");
  });

  test("rejects config with missing routes", () => {
    const invalid = {...validConfigRaw, routes: undefined};
    const res = parseOrchestratorConfig(invalid);
    expect(res.ok).toBe(false);
  });

  test("rejects config with invalid workflow step structure", () => {
    const invalid = {
      ...validConfigRaw,
      workflows: {
        broken: {
          description: "broken",
          steps: [{step: 1}], // missing name and agent
        },
      },
    };
    const res = parseOrchestratorConfig(invalid);
    expect(res.ok).toBe(false);
  });
});
