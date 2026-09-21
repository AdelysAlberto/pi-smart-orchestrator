import {describe, expect, test} from "bun:test";
import type {Api, Model} from "@earendil-works/pi-ai";
import type {ModelRegistry} from "@earendil-works/pi-coding-agent";
import {createAgentsCatalog} from "../agents.catalog.ts";
import {createGenericModelResolver, createNativeAgentRunner} from "../native.agent.runner.ts";

describe("Native Agent Runner", () => {
  const catalog = createAgentsCatalog("/Volumes/Datos/Projects/utils/agents/agents-pi/agents");

  test("generic model resolver resolves provider and modelId or fallbacks", () => {
    const dummyRegistry = {
      find: (provider: string, modelId: string) => {
        if (provider === "deepseek-ryg" && modelId === "deepseek-flash") {
          return {provider, id: modelId} as unknown as Model<Api>;
        }
        return undefined;
      },
      getAvailable: () => [{provider: "test-provider", id: "default-model"} as unknown as Model<Api>],
    } as unknown as ModelRegistry;

    const resolver = createGenericModelResolver(dummyRegistry);
    const resolved = resolver("deepseek-ryg/deepseek-flash");
    expect(resolved).toBeDefined();
    expect(resolved?.id).toBe("deepseek-flash");

    const fallback = resolver("non-existent-provider/model");
    expect(fallback?.id).toBe("default-model");
  });

  test("returns error if requested agent is not found in catalog", async () => {
    const runner = createNativeAgentRunner({catalog});
    const res = await runner.run({
      agentHandle: "agente_inexistente",
      prompt: "test",
    });

    expect(res.ok).toBe(false);
    if (res.ok) return;
    expect(res.reason).toContain("agent_not_found");
  });
});
