import {fail, isRecord, type Result, readNumber, readString} from "./guards.ts";

export interface LayaMeta {
  latencyMs?: number;
  inputTokens?: number;
  model?: string;
}

export interface ParseResult {
  answers: Record<string, string>;
  meta: LayaMeta;
}

export function parseAnalyzeResponse(body: unknown, criteria: Record<string, readonly string[]>): Result<ParseResult> {
  if (!isRecord(body)) return fail("invalid_body_not_object");

  const answersRaw = body.answers;
  if (!isRecord(answersRaw)) return fail("invalid_body_missing_answers");

  const answers: Record<string, string> = {};
  for (const [questionId, allowed] of Object.entries(criteria)) {
    const entry = answersRaw[questionId];
    let rawVal = "";
    if (typeof entry === "string") {
      rawVal = entry;
    } else if (isRecord(entry)) {
      rawVal = readString(entry, "choice") ?? "";
    }
    if (!rawVal) return fail(`missing_answer_${questionId}`);
    if (!allowed.includes(rawVal)) {
      return fail(`invalid_answer_${questionId}_${rawVal}`);
    }
    answers[questionId] = rawVal;
  }

  const meta: LayaMeta = {};
  const metaRaw = isRecord(body.meta) ? body.meta : undefined;
  meta.latencyMs =
    readNumber(body, "latency_ms") ??
    readNumber(body, "latencyMs") ??
    (metaRaw ? (readNumber(metaRaw, "latency_ms") ?? readNumber(metaRaw, "latencyMs")) : undefined);
  if (isRecord(body.usage)) {
    meta.inputTokens = readNumber(body.usage, "input_tokens") ?? readNumber(body.usage, "inputTokens");
  } else if (metaRaw) {
    meta.inputTokens = readNumber(metaRaw, "input_tokens") ?? readNumber(metaRaw, "inputTokens");
  }
  if (isRecord(body.routing)) {
    meta.model = readString(body.routing, "model");
  } else if (metaRaw) {
    meta.model = readString(metaRaw, "model");
  } else {
    meta.model = readString(body, "model");
  }

  return {ok: true, value: {answers, meta}};
}

export function describeLayaError(status: number, body: unknown): string {
  if (isRecord(body)) {
    const detail = readString(body, "detail") ?? readString(body, "error");
    if (detail) return `laya_http_${status}:${detail}`;
  }
  return `laya_http_${status}`;
}
