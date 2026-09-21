import {describe, expect, test} from "bun:test";
import {createLayaClassifier, type FetchLike, type LayaClientConfig} from "../laya.client.ts";

describe("Laya Client", () => {
  const sampleConfig: LayaClientConfig = {
    endpoint: "http://127.0.0.1:8090/analyze",
    timeoutMs: 150,
    checkpoint: "",
    questions: {
      domain: {
        type: "choice",
        instructions: "domain",
        criteria: {code: "code", ux: "ux"},
      },
      effort: {
        type: "choice",
        instructions: "effort",
        criteria: {low: "low", high: "high"},
      },
    },
  };

  test("parses 200 OK response from Laya successfully", async () => {
    const mockFetch: FetchLike = async () => ({
      status: 200,
      text: async () =>
        JSON.stringify({
          answers: {domain: "code", effort: "high"},
          meta: {latency_ms: 45, input_tokens: 120},
        }),
    });

    const classifier = createLayaClassifier(sampleConfig, mockFetch);
    const res = await classifier("Implement user auth service");

    expect(res.ok).toBe(true);
    if (!res.ok) return;

    expect(res.value.answers.domain).toBe("code");
    expect(res.value.answers.effort).toBe("high");
    expect(res.value.meta.latencyMs).toBe(45);
    expect(res.value.meta.inputTokens).toBe(120);
  });

  test("handles timeout gracefully with fail result", async () => {
    const timeoutFetch: FetchLike = async (_url, init) => {
      return new Promise((_, reject) => {
        init.signal.addEventListener("abort", () => {
          reject(new Error("AbortError"));
        });
      });
    };

    const classifier = createLayaClassifier(sampleConfig, timeoutFetch);
    const res = await classifier("Some prompt that hangs");

    expect(res.ok).toBe(false);
    if (res.ok) return;
    expect(res.reason).toBe("timeout");
  });

  test("handles 500 error from Laya gracefully with fail result", async () => {
    const errorFetch: FetchLike = async () => ({
      status: 500,
      text: async () => JSON.stringify({error: "Internal model error"}),
    });

    const classifier = createLayaClassifier(sampleConfig, errorFetch);
    const res = await classifier("Some prompt");

    expect(res.ok).toBe(false);
    if (res.ok) return;
    expect(res.reason).toContain("laya_http_500");
  });
});
