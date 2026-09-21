import {describe, expect, test} from "bun:test";
import type {OrchestratorConfig} from "../config.validator.ts";
import type {AgentRunOutput, NativeAgentRunner} from "../native.agent.runner.ts";
import {runParallelSwarm, runSequentialPipeline} from "../workflow.runner.ts";

describe("Workflow Runner", () => {
  const dummyConfig: OrchestratorConfig = {
    enabled: true,
    switchModel: true,
    switchThinking: true,
    switchAgent: true,
    endpoint: "http://127.0.0.1:8090/analyze",
    timeoutMs: 200,
    checkpoint: "",
    maxInFlight: 2,
    debug: false,
    theme: {colors: {active: "#00E5FF", header: "#0055FF", action: "#FF6B00", surface: "#0B0F17"}},
    questions: {},
    routes: {},
    workflows: {
      "plan-and-build": {
        description: "Plan and build",
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

  test("runs sequential pipeline and chains step context", async () => {
    const executedAgents: string[] = [];
    const receivedPrompts: string[] = [];

    const mockRunner: NativeAgentRunner = {
      run: async req => {
        executedAgents.push(req.agentHandle);
        receivedPrompts.push(req.prompt);
        const output: AgentRunOutput = {
          agent: req.agentHandle,
          status: "completed",
          result: req.agentHandle === "sheldon" ? "BLUEPRINT_OUTPUT" : "CODE_OUTPUT",
          durationMs: 150,
          turns: 2,
        };
        return {ok: true, value: output};
      },
    };

    let approvalRequested = false;
    const planWorkflow = dummyConfig.workflows["plan-and-build"];
    if (!planWorkflow) throw new Error("Missing workflow in test config");

    const res = await runSequentialPipeline({
      workflowName: "plan-and-build",
      workflow: planWorkflow,
      userPrompt: "Build user auth",
      config: dummyConfig,
      runner: mockRunner,
      onApprovalRequired: async (_step, _output) => {
        approvalRequested = true;
        return true; // Approve
      },
    });

    expect(res.ok).toBe(true);
    if (!res.ok) return;

    expect(res.value.length).toBe(2);
    expect(approvalRequested).toBe(true);
    expect(executedAgents.length).toBe(2);
    expect(executedAgents[0]).toBe("sheldon");
    expect(executedAgents[1]).toBe("homero");
    // Context chaining check
    expect(receivedPrompts[1]).toContain("BLUEPRINT_OUTPUT");
  });

  test("runs parallel swarm and aggregates results", async () => {
    const executedAgents: string[] = [];

    const mockRunner: NativeAgentRunner = {
      run: async req => {
        executedAgents.push(req.agentHandle);
        const output: AgentRunOutput = {
          agent: req.agentHandle,
          status: "completed",
          result: `Output from ${req.agentHandle}`,
          durationMs: 80,
          turns: 1,
        };
        return {ok: true, value: output};
      },
    };

    const res = await runParallelSwarm({
      tasks: [
        {agent: "edna", taskName: "UI Design", prompt: "Design login"},
        {agent: "homero", taskName: "API Implementation", prompt: "Build /login"},
      ],
      config: dummyConfig,
      runner: mockRunner,
    });

    expect(res.ok).toBe(true);
    if (!res.ok) return;

    expect(res.value.length).toBe(2);
    expect(executedAgents.length).toBe(2);
  });
});
