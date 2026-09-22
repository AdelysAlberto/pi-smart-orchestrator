import {describe, expect, test} from "bun:test";
import {type OrchestratorCommandState, resolveOrchestratorCommand} from "../command.ts";

describe("Orchestrator Command", () => {
  const baseState: OrchestratorCommandState = {enabled: true, configValid: true};

  test("toggles the pipeline runner off and on", () => {
    const offRes = resolveOrchestratorCommand("off", baseState);
    expect(offRes.enabled).toBe(false);
    expect(offRes.changed).toBe(true);
    expect(offRes.tone).toBe("warning");

    const flipped = resolveOrchestratorCommand("on", {...baseState, enabled: false});
    expect(flipped.enabled).toBe(true);
    expect(flipped.changed).toBe(true);
  });

  test("reports no change when the state already matches", () => {
    expect(resolveOrchestratorCommand("on", baseState).changed).toBe(false);
    expect(resolveOrchestratorCommand("off", {...baseState, enabled: false}).changed).toBe(false);
  });

  test("says the router keeps routing when the pipeline runner is off", () => {
    const offRes = resolveOrchestratorCommand("off", baseState);
    expect(offRes.message).toContain("router sigue enrutando");
  });

  test("reports status, and never claims a model decision", () => {
    const statusRes = resolveOrchestratorCommand("status", baseState);
    expect(statusRes.changed).toBe(false);
    expect(statusRes.status).toBe("orchestrator: active");
    expect(statusRes.message).toContain("modelo y thinking los decide el router");
  });

  test("reports an invalid config as inactive even when enabled", () => {
    const statusRes = resolveOrchestratorCommand("", {...baseState, configValid: false});
    expect(statusRes.status).toBe("orchestrator: off");
    expect(statusRes.message).toContain("Inactivo");
  });
});
