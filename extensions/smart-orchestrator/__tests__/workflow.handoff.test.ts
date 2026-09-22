import {describe, expect, test} from "bun:test";
import {
  ackChannel,
  buildAck,
  buildRefusal,
  parseHandoff,
  readEffortModels,
  WORKFLOW_CHANNEL,
} from "../workflow.handoff.ts";

const validPayload = {
  requestId: "req-1",
  workflow: "plan-and-build",
  prompt: "anade el aviso de tunel al HUD",
  domain: "code",
  effort: "high",
  handle: "sheldon",
  effortModels: {
    low: {model: "deepseek-ryg/deepseek-flash", thinking: "low"},
    high: {model: "deepseek-ryg/deepseek-v4-pro", thinking: "high"},
  },
};

describe("workflow handoff contract", () => {
  test("parses a well-formed handover", () => {
    const res = parseHandoff(validPayload);
    expect(res.ok).toBe(true);
    if (!res.ok) return;

    expect(res.value.requestId).toBe("req-1");
    expect(res.value.workflow).toBe("plan-and-build");
    expect(res.value.prompt).toBe(validPayload.prompt);
    expect(res.value.effortModels.high?.model).toBe("deepseek-ryg/deepseek-v4-pro");
  });

  test("rejects a payload that is not an object", () => {
    expect(parseHandoff("nope").ok).toBe(false);
    expect(parseHandoff(null).ok).toBe(false);
  });

  test("rejects a handover without a request id, a workflow or a prompt", () => {
    const {requestId: _requestId, ...withoutId} = validPayload;
    const {workflow: _workflow, ...withoutWorkflow} = validPayload;
    const {prompt: _prompt, ...withoutPrompt} = validPayload;

    expect(parseHandoff(withoutId).ok).toBe(false);
    expect(parseHandoff(withoutWorkflow).ok).toBe(false);
    expect(parseHandoff(withoutPrompt).ok).toBe(false);
  });

  test("rejects a handover whose action carries no model table", () => {
    const res = parseHandoff({...validPayload, effortModels: undefined});
    expect(res.ok).toBe(false);
    if (res.ok) return;
    expect(res.reason).toBe("handoff_invalid_effort_models");
  });

  test("rejects an effort tier without a model, so a step cannot run unmodelled", () => {
    const res = parseHandoff({...validPayload, effortModels: {...validPayload.effortModels, high: {model: "  "}}});
    expect(res.ok).toBe(false);
    if (res.ok) return;
    expect(res.reason).toBe("handoff_invalid_effort_model:high");
  });

  test("keeps a null thinking, which means the model runs at its own default", () => {
    const res = readEffortModels({low: {model: "m", thinking: null}});
    expect(res.ok).toBe(true);
    if (!res.ok) return;
    expect(res.value.low).toEqual({model: "m", thinking: null});
  });

  test("names the acknowledgement channel per request", () => {
    expect(ackChannel("req-9")).toBe(`${WORKFLOW_CHANNEL}:ack:req-9`);
  });

  test("acknowledges with the workflow and refuses with a reason code", () => {
    expect(buildAck("plan-and-build")).toEqual({success: true, data: {workflow: "plan-and-build"}});
    expect(buildRefusal("workflow_not_found:x")).toEqual({success: false, error: "workflow_not_found:x"});
  });
});
