import {readFileSync, writeFileSync} from "node:fs";
import {fail, isRecord, type Result, readArray, readBoolean, readNumber, readString} from "./guards.ts";

/**
 * Configuration of the orchestrator.
 *
 * There is deliberately no model table and no classifier endpoint here: the router
 * owns both (`router.config.json`). This file only describes the pipelines, so a
 * change of model never has to be made twice.
 */
export interface ThemeColors {
  active: string;
  header: string;
  action: string;
  surface: string;
}

export interface ThemeConfig {
  colors: ThemeColors;
}

export interface WorkflowStepConfig {
  step: number;
  name: string;
  agent: string;
  /** Effort tier resolved against the table the router sends with the request. */
  effort?: "low" | "high" | string;
  /** Name of the earlier step whose output is prepended as context. */
  inputFrom?: string;
  /** Stops the pipeline before the next step until the user confirms. */
  requireApproval?: boolean;
  /** Rules from `~/.pi/agent/rules` injected into this step. Defaults to the universal set. */
  rules?: string[];
}

export interface WorkflowConfig {
  description: string;
  steps: WorkflowStepConfig[];
}

export interface OrchestratorConfig {
  enabled: boolean;
  /** Ceiling on parallel agents inside one swarm. */
  maxInFlight: number;
  debug: boolean;
  agentsDir?: string;
  logFile?: string;
  theme: ThemeConfig;
  workflows: Record<string, WorkflowConfig>;
}

export const DEFAULT_THEME_COLORS: ThemeColors = {
  active: "#00E5FF",
  header: "#A3BF06",
  action: "#FF6B00",
  surface: "#0B0F17",
};

export function parseOrchestratorConfig(raw: unknown): Result<OrchestratorConfig> {
  if (!isRecord(raw)) return fail("config_not_object");

  const enabled = readBoolean(raw, "enabled") ?? true;
  const maxInFlight = readNumber(raw, "maxInFlight") ?? 3;
  const debug = readBoolean(raw, "debug") ?? false;
  const agentsDir = readString(raw, "agentsDir");
  const logFile = readString(raw, "logFile");

  const themeRaw = raw.theme;
  let colors = DEFAULT_THEME_COLORS;
  if (isRecord(themeRaw) && isRecord(themeRaw.colors)) {
    colors = {
      active: readString(themeRaw.colors, "active") ?? DEFAULT_THEME_COLORS.active,
      header: readString(themeRaw.colors, "header") ?? DEFAULT_THEME_COLORS.header,
      action: readString(themeRaw.colors, "action") ?? DEFAULT_THEME_COLORS.action,
      surface: readString(themeRaw.colors, "surface") ?? DEFAULT_THEME_COLORS.surface,
    };
  }

  const workflowsRaw = raw.workflows;
  if (!isRecord(workflowsRaw)) return fail("config_missing_workflows");
  const workflows: Record<string, WorkflowConfig> = {};
  for (const [wfKey, wfVal] of Object.entries(workflowsRaw)) {
    if (!isRecord(wfVal)) return fail(`config_invalid_workflow_${wfKey}`);
    const description = readString(wfVal, "description") ?? "";
    const stepsRaw = wfVal.steps;
    if (!Array.isArray(stepsRaw) || stepsRaw.length === 0) return fail(`config_missing_steps_in_workflow_${wfKey}`);
    const steps: WorkflowStepConfig[] = [];
    for (const stepVal of stepsRaw) {
      if (!isRecord(stepVal)) return fail(`config_invalid_step_in_workflow_${wfKey}`);
      const stepNum = readNumber(stepVal, "step");
      const name = readString(stepVal, "name");
      const agent = readString(stepVal, "agent");
      if (stepNum === undefined || !name || !agent) {
        return fail(`config_incomplete_step_in_workflow_${wfKey}`);
      }
      steps.push({
        step: stepNum,
        name,
        agent,
        effort: readString(stepVal, "effort"),
        inputFrom: readString(stepVal, "inputFrom"),
        requireApproval: readBoolean(stepVal, "requireApproval"),
        rules: readArray(stepVal, "rules", (item): item is string => typeof item === "string"),
      });
    }
    workflows[wfKey] = {description, steps};
  }

  return {
    ok: true,
    value: {enabled, maxInFlight, debug, agentsDir, logFile, theme: {colors}, workflows},
  };
}

export function loadOrchestratorConfigFile(filePath: string): Result<OrchestratorConfig> {
  try {
    const content = readFileSync(filePath, "utf-8");
    return parseOrchestratorConfig(JSON.parse(content));
  } catch (err: unknown) {
    const message = err instanceof Error ? err.message : String(err);
    return fail(`cannot_load_config:${message}`);
  }
}

export function saveOrchestratorConfigFile(
  filePath: string,
  updates: Partial<Pick<OrchestratorConfig, "enabled">>
): Result<void> {
  try {
    const parsed = JSON.parse(readFileSync(filePath, "utf-8"));
    if (!isRecord(parsed)) return fail("config_not_object");

    if (updates.enabled !== undefined) parsed.enabled = updates.enabled;

    writeFileSync(filePath, `${JSON.stringify(parsed, null, 2)}\n`, "utf-8");
    return {ok: true, value: undefined};
  } catch (err: unknown) {
    const message = err instanceof Error ? err.message : String(err);
    return fail(`cannot_save_config:${message}`);
  }
}
