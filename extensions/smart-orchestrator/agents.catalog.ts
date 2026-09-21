import {existsSync, readdirSync, readFileSync} from "node:fs";
import {join} from "node:path";
import {getAgentDir, parseFrontmatter} from "@earendil-works/pi-coding-agent";
import {fail, type Result} from "./guards.ts";
import {expandHome} from "./paths.ts";

export interface AgentMetadata {
  name: string;
  description: string;
  color?: string;
  tools: string[];
  model?: string;
  thinking?: string;
  maxTurns?: number;
  systemPrompt: string;
  filePath: string;
}

export interface AgentsCatalog {
  getAgent(handle: string): Result<AgentMetadata>;
  listAgents(): AgentMetadata[];
  reload(): void;
}

export function createAgentsCatalog(configuredDir?: string): AgentsCatalog {
  let cache = new Map<string, AgentMetadata>();

  function loadCatalog(): Map<string, AgentMetadata> {
    const map = new Map<string, AgentMetadata>();
    const searchDirs: string[] = [];

    if (configuredDir && configuredDir.trim().length > 0) {
      searchDirs.push(expandHome(configuredDir.trim()));
    }
    searchDirs.push("/Volumes/Datos/Projects/utils/agents/agents-pi/agents");
    searchDirs.push(join(getAgentDir(), "agents"));
    searchDirs.push(join(process.cwd(), ".pi/agents"));

    for (const dir of searchDirs) {
      if (!existsSync(dir)) continue;

      try {
        const files = readdirSync(dir);
        for (const file of files) {
          if (!file.endsWith(".md")) continue;
          const fullPath = join(dir, file);
          const raw = readFileSync(fullPath, "utf-8");
          const parsed = parseFrontmatter(raw);

          const frontmatter = (parsed.frontmatter ?? {}) as Record<string, unknown>;
          const name = typeof frontmatter.name === "string" ? frontmatter.name : file.replace(".md", "");
          const description = typeof frontmatter.description === "string" ? frontmatter.description : "";
          const color = typeof frontmatter.color === "string" ? frontmatter.color : undefined;
          const model = typeof frontmatter.model === "string" ? frontmatter.model : undefined;
          const thinking = typeof frontmatter.thinking === "string" ? frontmatter.thinking : undefined;
          const maxTurns = typeof frontmatter.max_turns === "number" ? frontmatter.max_turns : undefined;

          let tools: string[] = [];
          if (typeof frontmatter.tools === "string") {
            tools = frontmatter.tools
              .split(",")
              .map(t => t.trim())
              .filter(t => t.length > 0);
          } else if (Array.isArray(frontmatter.tools)) {
            tools = frontmatter.tools.filter(t => typeof t === "string");
          }

          const systemPrompt = parsed.body.trim();

          if (!map.has(name)) {
            map.set(name, {
              name,
              description,
              color,
              tools,
              model,
              thinking,
              maxTurns,
              systemPrompt,
              filePath: fullPath,
            });
          }
        }
      } catch {
        // Skip unreadable directories
      }
    }

    return map;
  }

  cache = loadCatalog();

  return {
    getAgent(handle: string): Result<AgentMetadata> {
      const clean = handle.replace(/^@/, "").trim().toLowerCase();
      const agent = cache.get(clean);
      if (!agent) {
        return fail(`agent_not_found:${clean}`);
      }
      return {ok: true, value: agent};
    },

    listAgents(): AgentMetadata[] {
      return Array.from(cache.values());
    },

    reload(): void {
      cache = loadCatalog();
    },
  };
}
