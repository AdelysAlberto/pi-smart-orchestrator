import {describe, expect, test} from "bun:test";
import type {OrchestratorConfig} from "../config.validator.ts";
import type {AgentRunOutput, NativeAgentRunner} from "../native.agent.runner.ts";
import type {EffortModel} from "../workflow.handoff.ts";
import {runParallelSwarm, runSequentialPipeline} from "../workflow.runner.ts";

describe("Workflow Runner", () => {
  const dummyConfig: OrchestratorConfig = {
    enabled: true,
    maxInFlight: 2,
    debug: false,
    theme: {colors: {active: "#00E5FF", header: "#0055FF", action: "#FF6B00", surface: "#0B0F17"}},
    workflows: {
      "plan-and-build": {
        description: "Plan and build",
        steps: [
          {step: 1, name: "Plan", agent: "sheldon", effort: "high", requireApproval: true},
          {step: 2, name: "Build", agent: "homero", effort: "low", inputFrom: "step-1"},
        ],
      },
    },
  };

  /** The table the router sends with every handover. */
  const effortModels: Record<string, EffortModel> = {
    low: {model: "deepseek-ryg/deepseek-flash", thinking: "low"},
    high: {model: "deepseek-ryg/deepseek-v4-pro", thinking: "high"},
  };

  test("runs sequential pipeline and chains step context", async () => {
    const executedAgents: string[] = [];
    const receivedPrompts: string[] = [];
    const models: {model?: string; thinking?: string}[] = [];

    const mockRunner: NativeAgentRunner = {
      run: async req => {
        executedAgents.push(req.agentHandle);
        receivedPrompts.push(req.prompt);
        models.push({model: req.modelString, thinking: req.thinkingLevel});
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
      effortModels,
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
    expect(executedAgents).toEqual(["sheldon", "homero"]);
    // The pair travels together: the plan step gets the pro model at high effort.
    expect(models[0]).toEqual({model: "deepseek-ryg/deepseek-v4-pro", thinking: "high"});
    expect(models[1]).toEqual({model: "deepseek-ryg/deepseek-flash", thinking: "low"});
    expect(res.value[0]?.model).toBe("deepseek-ryg/deepseek-v4-pro:high");
    // Context chaining check
    expect(receivedPrompts[1]).toContain("BLUEPRINT_OUTPUT");
  });

  test("refuses a step whose effort has no model in the table", async () => {
    const mockRunner: NativeAgentRunner = {
      run: async req => ({
        ok: true,
        value: {agent: req.agentHandle, status: "completed", result: "x", durationMs: 1, turns: 1},
      }),
    };
    const planWorkflow = dummyConfig.workflows["plan-and-build"];
    if (!planWorkflow) throw new Error("Missing workflow in test config");

    const res = await runSequentialPipeline({
      workflowName: "plan-and-build",
      workflow: planWorkflow,
      userPrompt: "Build user auth",
      effortModels: {},
      runner: mockRunner,
    });

    expect(res.ok).toBe(false);
    if (res.ok) return;
    expect(res.reason).toBe("effort_model_missing:high");
  });

  test("stops the pipeline when the approval gate is declined", async () => {
    const mockRunner: NativeAgentRunner = {
      run: async req => ({
        ok: true,
        value: {agent: req.agentHandle, status: "completed", result: "x", durationMs: 1, turns: 1},
      }),
    };
    const planWorkflow = dummyConfig.workflows["plan-and-build"];
    if (!planWorkflow) throw new Error("Missing workflow in test config");

    const res = await runSequentialPipeline({
      workflowName: "plan-and-build",
      workflow: planWorkflow,
      userPrompt: "Build user auth",
      effortModels,
      runner: mockRunner,
      onApprovalRequired: async () => false,
    });

    expect(res.ok).toBe(false);
    if (res.ok) return;
    expect(res.reason).toBe("workflow_aborted_by_user_at_step_1");
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
      effortModels,
      runner: mockRunner,
    });

    expect(res.ok).toBe(true);
    if (!res.ok) return;

    expect(res.value.length).toBe(2);
    expect(executedAgents.length).toBe(2);
  });

  test("reports a swarm task whose effort has no model instead of running it", async () => {
    let called = false;
    const mockRunner: NativeAgentRunner = {
      run: async req => {
        called = true;
        return {ok: true, value: {agent: req.agentHandle, status: "completed", result: "x", durationMs: 1, turns: 1}};
      },
    };

    const res = await runParallelSwarm({
      tasks: [{agent: "edna", taskName: "UI", prompt: "Design login", effort: "high"}],
      config: dummyConfig,
      effortModels: {},
      runner: mockRunner,
    });

    expect(res.ok).toBe(true);
    expect(called).toBe(false);
    if (!res.ok) return;
    expect(res.value[0]?.payload.error).toBe("effort_model_missing:high");
  });
});
