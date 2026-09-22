/**
 * The handover contract with pi-laya-router, spoken over `pi.events`.
 *
 * The router is the only interceptor and the only owner of the effort table, so
 * the pipeline does not read a model from its own configuration: every request
 * carries the `(model, thinking)` pair per effort tier, and a step resolves against
 * it. That is why this module validates the table on the way in — a request with a
 * malformed table must be refused with an acknowledgement, not silently run on the
 * wrong model.
 *
 * The acknowledgement is emitted before the first step runs: it answers "is anyone
 * listening", and the router turns its absence into a fallback to the main agent.
 */
import {fail, isRecord, type Result, readString} from "./guards.ts";

export const WORKFLOW_CHANNEL = "orchestrator:workflow";

export interface EffortModel {
  model: string;
  thinking: string | null;
}

export interface WorkflowHandoff {
  requestId: string;
  workflow: string;
  prompt: string;
  domain: string;
  effort: string;
  handle: string;
  effortModels: Record<string, EffortModel>;
}

/** Channel the router listens on for the acknowledgement of one request. */
export function ackChannel(requestId: string): string {
  return `${WORKFLOW_CHANNEL}:ack:${requestId}`;
}

export function buildAck(workflow: string): {success: true; data: {workflow: string}} {
  return {success: true, data: {workflow}};
}

export function buildRefusal(reason: string): {success: false; error: string} {
  return {success: false, error: reason};
}

/** Structural validation of the payload, field by field: no casts. */
export function parseHandoff(raw: unknown): Result<WorkflowHandoff> {
  if (!isRecord(raw)) return fail("handoff_not_an_object");
  const requestId = readString(raw, "requestId");
  const workflow = readString(raw, "workflow");
  const prompt = readString(raw, "prompt");
  if (!requestId) return fail("handoff_missing_request_id");
  if (!workflow) return fail("handoff_missing_workflow");
  if (prompt === undefined) return fail("handoff_missing_prompt");

  const effortModels = readEffortModels(raw.effortModels);
  if (!effortModels.ok) return effortModels;

  return {
    ok: true,
    value: {
      requestId,
      workflow,
      prompt,
      domain: readString(raw, "domain") ?? "",
      effort: readString(raw, "effort") ?? "",
      handle: readString(raw, "handle") ?? "",
      effortModels: effortModels.value,
    },
  };
}

export function readEffortModels(raw: unknown): Result<Record<string, EffortModel>> {
  if (!isRecord(raw)) return fail("handoff_invalid_effort_models");
  const table: Record<string, EffortModel> = {};
  for (const [tier, value] of Object.entries(raw)) {
    if (!isRecord(value)) return fail(`handoff_invalid_effort_model:${tier}`);
    const model = readString(value, "model");
    if (!model || model.trim().length === 0) return fail(`handoff_invalid_effort_model:${tier}`);
    const thinkingRaw = value.thinking;
    if (thinkingRaw !== null && thinkingRaw !== undefined && typeof thinkingRaw !== "string") {
      return fail(`handoff_invalid_effort_thinking:${tier}`);
    }
    table[tier] = {model: model.trim(), thinking: (thinkingRaw as string | null | undefined) ?? null};
  }
  return {ok: true, value: table};
}
