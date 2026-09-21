import {describe, expect, test} from "bun:test";
import {type OrchestratorCommandState, resolveOrchestratorCommand} from "../command.ts";

describe("Orchestrator Command", () => {
  const baseState: OrchestratorCommandState = {
    enabled: true,
    configValid: true,
    switchModel: true,
    switchThinking: true,
    switchAgent: true,
  };

  test("toggles orchestrator off and on", () => {
    const offRes = resolveOrchestratorCommand("off", baseState);
    expect(offRes.enabled).toBe(false);
    expect(offRes.changed).toBe(true);

    const onRes = resolveOrchestratorCommand("on", {...baseState, enabled: false});
    expect(onRes.enabled).toBe(true);
    expect(onRes.changed).toBe(true);
  });

  test("toggles model switch independently", () => {
    const modelOff = resolveOrchestratorCommand("model off", baseState);
    expect(modelOff.switchModel).toBe(false);
    expect(modelOff.switchThinking).toBe(true);
    expect(modelOff.switchAgent).toBe(true);
    expect(modelOff.changed).toBe(true);

    const modelOn = resolveOrchestratorCommand("model on", {...baseState, switchModel: false});
    expect(modelOn.switchModel).toBe(true);
    expect(modelOn.changed).toBe(true);
  });

  test("toggles thinking switch independently", () => {
    const thinkingOff = resolveOrchestratorCommand("thinking off", baseState);
    expect(thinkingOff.switchThinking).toBe(false);
    expect(thinkingOff.switchModel).toBe(true);
    expect(thinkingOff.switchAgent).toBe(true);
    expect(thinkingOff.changed).toBe(true);

    const thinkingOn = resolveOrchestratorCommand("thinking on", {...baseState, switchThinking: false});
    expect(thinkingOn.switchThinking).toBe(true);
    expect(thinkingOn.changed).toBe(true);
  });

  test("toggles agent switch independently", () => {
    const agentOff = resolveOrchestratorCommand("agent off", baseState);
    expect(agentOff.switchAgent).toBe(false);
    expect(agentOff.switchModel).toBe(true);
    expect(agentOff.switchThinking).toBe(true);
    expect(agentOff.changed).toBe(true);

    const agentOn = resolveOrchestratorCommand("agent on", {...baseState, switchAgent: false});
    expect(agentOn.switchAgent).toBe(true);
    expect(agentOn.changed).toBe(true);
  });

  test("reports detailed status on unknown command", () => {
    const statusRes = resolveOrchestratorCommand("status", baseState);
    expect(statusRes.changed).toBe(false);
    expect(statusRes.message).toContain("Agente: ON");
    expect(statusRes.message).toContain("Modelo: ON");
    expect(statusRes.message).toContain("Thinking: ON");
  });
});
