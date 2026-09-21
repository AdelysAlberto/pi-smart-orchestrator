import {describeLayaError, type LayaMeta, parseAnalyzeResponse} from "./analyze.parser.ts";
import {fail, type Result} from "./guards.ts";

export interface LayaQuestion {
  type: "choice";
  instructions: string;
  criteria: Record<string, string>;
}

export interface LayaClientConfig {
  endpoint: string;
  timeoutMs: number;
  checkpoint: string;
  questions: Record<string, LayaQuestion>;
  maxResponseBytes?: number;
}

export interface Classification {
  answers: Record<string, string>;
  meta: LayaMeta;
}

export type Classifier = (input: string) => Promise<Result<Classification>>;

export interface BodyReader {
  read(): Promise<{done: boolean; value?: Uint8Array | undefined}>;
  cancel?(reason?: unknown): Promise<void>;
}

export interface ResponseLike {
  status: number;
  headers?: {get(name: string): string | null} | undefined;
  body?: {getReader(): BodyReader} | null | undefined;
  text(): Promise<string>;
}

export type FetchLike = (
  url: string,
  init: {method: string; headers: Record<string, string>; body: string; signal: AbortSignal; redirect: "error"}
) => Promise<ResponseLike>;

export const DEFAULT_MAX_RESPONSE_BYTES = 1024 * 1024;

interface AnalyzeRequestBody {
  state: string;
  questions: Record<string, LayaQuestion>;
  model?: string;
}

export function buildRequestBody(config: LayaClientConfig, state: string): AnalyzeRequestBody {
  const body: AnalyzeRequestBody = {state, questions: config.questions};
  if (config.checkpoint.trim().length > 0) body.model = config.checkpoint.trim();
  return body;
}

export function criteriaOf(questions: Record<string, LayaQuestion>): Record<string, readonly string[]> {
  const criteria: Record<string, readonly string[]> = {};
  for (const [questionId, question] of Object.entries(questions)) {
    criteria[questionId] = Object.keys(question.criteria);
  }
  return criteria;
}

export function createLayaClassifier(config: LayaClientConfig, fetchImpl: FetchLike = fetch): Classifier {
  const criteria = criteriaOf(config.questions);
  const maxBytes = config.maxResponseBytes ?? DEFAULT_MAX_RESPONSE_BYTES;

  return async (input: string): Promise<Result<Classification>> => {
    const controller = new AbortController();
    const timer = setTimeout(() => controller.abort(), config.timeoutMs);
    let status = 0;
    let raw = "";
    try {
      const response = await fetchImpl(config.endpoint, {
        method: "POST",
        headers: {
          "content-type": "application/json",
          "x-client": "pi-smart-orchestrator",
          "user-agent": "pi-smart-orchestrator/0.1.0",
        },
        body: JSON.stringify(buildRequestBody(config, input)),
        signal: controller.signal,
        redirect: "error",
      });
      status = response.status;
      const read = await readBounded(response, maxBytes);
      if (!read.ok) return read;
      raw = read.value;
    } catch {
      return fail(controller.signal.aborted ? "timeout" : "network_error");
    } finally {
      clearTimeout(timer);
    }

    let body: unknown;
    try {
      body = JSON.parse(raw);
    } catch {
      return fail(status === 200 ? "invalid_json" : `http_${status}`, status);
    }
    if (status !== 200) return fail(describeLayaError(status, body), status);

    const parsed = parseAnalyzeResponse(body, criteria);
    if (!parsed.ok) return fail(parsed.reason, status);
    return parsed;
  };
}

async function readBounded(response: ResponseLike, maxBytes: number): Promise<Result<string>> {
  const declared = Number(response.headers?.get("content-length") ?? Number.NaN);
  if (Number.isFinite(declared) && declared > maxBytes) return fail("response_too_large");
  const reader = response.body?.getReader();
  if (!reader) {
    const text = await response.text();
    return text.length > maxBytes ? fail("response_too_large") : {ok: true, value: text};
  }

  const decoder = new TextDecoder();
  const chunks: string[] = [];
  let total = 0;
  while (true) {
    const {done, value} = await reader.read();
    if (done) break;
    if (!value) continue;
    total += value.byteLength;
    if (total > maxBytes) {
      await reader.cancel?.();
      return fail("response_too_large");
    }
    chunks.push(decoder.decode(value, {stream: true}));
  }
  chunks.push(decoder.decode());
  return {ok: true, value: chunks.join("")};
}
