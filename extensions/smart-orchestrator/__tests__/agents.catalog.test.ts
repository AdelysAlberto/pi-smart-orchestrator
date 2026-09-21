import {describe, expect, test} from "bun:test";
import {createAgentsCatalog} from "../agents.catalog.ts";

describe("Agents Catalog", () => {
  test("loads the 7 specialists from project directory", () => {
    const catalog = createAgentsCatalog("/Volumes/Datos/Projects/utils/agents/agents-pi/agents");
    const agents = catalog.listAgents();

    expect(agents.length).toBeGreaterThanOrEqual(7);

    const homero = catalog.getAgent("homero");
    expect(homero.ok).toBe(true);
    if (homero.ok) {
      expect(homero.value.name).toBe("homero");
      expect(homero.value.tools).toContain("read");
      expect(homero.value.tools).toContain("write");
    }

    const sheldon = catalog.getAgent("sheldon");
    expect(sheldon.ok).toBe(true);
    if (sheldon.ok) {
      expect(sheldon.value.name).toBe("sheldon");
      expect(sheldon.value.color).toBe("cyan");
      expect(sheldon.value.maxTurns).toBe(30);
    }

    const edna = catalog.getAgent("edna");
    expect(edna.ok).toBe(true);

    const tioBob = catalog.getAgent("tio-bob");
    expect(tioBob.ok).toBe(true);

    const gorgory = catalog.getAgent("gorgory");
    expect(gorgory.ok).toBe(true);

    const saul = catalog.getAgent("saul");
    expect(saul.ok).toBe(true);

    const contador = catalog.getAgent("contador");
    expect(contador.ok).toBe(true);
  });

  test("returns error for unknown agent", () => {
    const catalog = createAgentsCatalog("/Volumes/Datos/Projects/utils/agents/agents-pi/agents");
    const res = catalog.getAgent("profesor_inexistente");
    expect(res.ok).toBe(false);
    if (res.ok) return;
    expect(res.reason).toContain("agent_not_found");
  });
});
