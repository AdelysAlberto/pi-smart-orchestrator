import {existsSync} from "node:fs";
import {homedir} from "node:os";
import {dirname, join, resolve} from "node:path";
import {fileURLToPath} from "node:url";

const ENV_VAR = "LAYA_ORCHESTRATOR_CONFIG";
const CONFIG_BASENAME = "orchestrator.config.json";

export function expandHome(path: string, home: string = homedir()): string {
  if (path === "~") return home;
  if (path.startsWith("~/") || path.startsWith("~\\")) {
    return join(home, path.slice(2));
  }
  return path;
}

export function defaultConfigPath(env: Record<string, string | undefined> = process.env): string {
  const overridden = env[ENV_VAR];
  if (overridden && overridden.trim().length > 0) {
    return expandHome(overridden.trim());
  }

  const currentDir = process.cwd();
  const candidateInCwd = resolve(currentDir, CONFIG_BASENAME);
  if (existsSync(candidateInCwd)) {
    return candidateInCwd;
  }

  const packageDir = resolvePackageRoot();
  const candidateInPackage = resolve(packageDir, CONFIG_BASENAME);
  if (existsSync(candidateInPackage)) {
    return candidateInPackage;
  }

  return candidateInCwd;
}

function resolvePackageRoot(): string {
  try {
    const here = dirname(fileURLToPath(import.meta.url));
    return resolve(here, "../..");
  } catch {
    return process.cwd();
  }
}
