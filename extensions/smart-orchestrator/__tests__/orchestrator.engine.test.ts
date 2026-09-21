import {describe, expect, test} from "bun:test";
import type {OrchestratorConfig} from "../config.validator.ts";
import type {NativeAgentRunner} from "../native.agent.runner.ts";
import {processInput} from "../orchestrator.engine.ts";

describe("Orchestrator Engine", () => {
  const dummyConfig: OrchestratorConfig = {
    enabled: true,
    endpoint: "http://127.0.0.1:8090/analyze",
    timeoutMs: 200,
    checkpoint: "",
    maxInFlight: 3,
    debug: false,
    theme: {colors: {active: "#00E5FF", header: "#0055FF", action: "#FF6B00", surface: "#0B0F17"}},
    questions: {},
    routes: {
      code: {handle: "homero", fastPath: true},
      architecture: {handle: "sheldon", fastPath: false, workflow: "plan-and-build"},
      general: {handle: "none"},
      default: {handle: "homero"},
    },
    workflows: {
      "plan-and-build": {
        description: "Plan and build",
        steps: [{step: 1, name: "Plan", agent: "sheldon"}],
      },
    },
    effortModels: {
      low: {model: "deepseek-flash", thinking: "low"},
      high: {model: "deepseek-v4-pro", thinking: "high"},
    },
  };

  const mockRunner: NativeAgentRunner = {
    run: async req => ({
      ok: true,
      value: {
        agent: req.agentHandle,
        status: "completed",
        result: "OK",
        durationMs: 10,
        turns: 1,
      },
    }),
  };

  test("routes code domain directly via Fast Path", async () => {
    const outcome = await processInput(
      {text: "Fix bug in auth controller"},
      {
        config: dummyConfig,
        classify: async () => ({
          ok: true,
          value: {
            answers: {domain: "code", effort: "low"},
            meta: {latencyMs: 32, inputTokens: 50},
          },
        }),
        runner: mockRunner,
        isEnabled: () => true,
      }
    );

    expect(outcome.ok).toBe(true);
    if (!outcome.ok) return;

    expect(outcome.decision.handle).toBe("homero");
    expect(outcome.decision.mode).toBe("fastPath");
    expect(outcome.latencyMs).toBe(32);
  });

  test("routes architecture domain to workflow mode", async () => {
    const outcome = await processInput(
      {text: "Design microservices architecture"},
      {
        config: dummyConfig,
        classify: async () => ({
          ok: true,
          value: {
            answers: {domain: "architecture", effort: "high"},
            meta: {latencyMs: 40, inputTokens: 60},
          },
        }),
        runner: mockRunner,
        isEnabled: () => true,
      }
    );

    expect(outcome.ok).toBe(true);
    if (!outcome.ok) return;

    expect(outcome.decision.handle).toBe("sheldon");
    expect(outcome.decision.mode).toBe("workflow");
    expect(outcome.decision.workflowName).toBe("plan-and-build");
  });

  test("fails open when domain handle is 'none'", async () => {
    const outcome = await processInput(
      {text: "Hello, good morning!"},
      {
        config: dummyConfig,
        classify: async () => ({
          ok: true,
          value: {
            answers: {domain: "general", effort: "low"},
            meta: {latencyMs: 10, inputTokens: 20},
          },
        }),
        runner: mockRunner,
        isEnabled: () => true,
      }
    );

    expect(outcome.ok).toBe(false);
    if (outcome.ok) return;
    expect(outcome.reason).toBe("route_handle_none");
  });

  test("passes enriched context to classifier when contextPrompt is present", async () => {
    let receivedInput = "";
    const outcome = await processInput(
      {text: "Retoma...", contextPrompt: "Diseña arquitectura de pagos"},
      {
        config: dummyConfig,
        classify: async input => {
          receivedInput = input;
          return {
            ok: true,
            value: {
              answers: {domain: "architecture", effort: "high"},
              meta: {latencyMs: 15, inputTokens: 40},
            },
          };
        },
        runner: mockRunner,
        isEnabled: () => true,
      }
    );

    expect(outcome.ok).toBe(true);
    expect(receivedInput).toContain("Diseña arquitectura de pagos");
    expect(receivedInput).toContain("Retoma...");
    if (!outcome.ok) return;
    expect(outcome.decision.handle).toBe("sheldon");
  });
});
