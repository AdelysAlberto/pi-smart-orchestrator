import {appendFile, mkdir} from "node:fs/promises";
import {dirname} from "node:path";
import {expandHome} from "./paths.ts";

export interface OrchestratorLogEvent {
  event: string;
  reason?: string;
  domain?: string;
  effort?: string;
  handle?: string;
  model?: string;
  thinking?: string | null;
  mode?: string;
  workflowName?: string;
  latencyMs?: number;
  durationMs?: number;
  turns?: number;
  error?: string;
  status?: string;
}

export interface OrchestratorLogger {
  log(event: OrchestratorLogEvent): Promise<void>;
}

export interface LoggerOptions {
  logFile?: string;
  debug?: boolean;
}

export function createOrchestratorLogger(options: LoggerOptions = {}): OrchestratorLogger {
  const logFilePath =
    options.logFile && options.logFile.trim().length > 0 ? expandHome(options.logFile.trim()) : undefined;

  return {
    async log(event: OrchestratorLogEvent): Promise<void> {
      const line = JSON.stringify({
        ts: new Date().toISOString(),
        ...event,
      });

      if (options.debug) {
        console.error(`[smart-orchestrator] ${line}`);
      }

      if (logFilePath) {
        try {
          await mkdir(dirname(logFilePath), {recursive: true});
          await appendFile(logFilePath, `${line}\n`, "utf-8");
        } catch {
          // File logging errors are non-fatal
        }
      }
    },
  };
}
