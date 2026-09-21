import {existsSync, readFileSync} from "node:fs";
import {dirname, resolve} from "node:path";
import {fail, isRecord, type Result, readBoolean, readNumber, readString} from "./guards.ts";
import type {LayaClientConfig, LayaQuestion} from "./laya.client.ts";

export interface ThemeColors {
  active: string;
  header: string;
  action: string;
  surface: string;
}

export interface ThemeConfig {
  colors: ThemeColors;
}

export interface RouteConfig {
  handle: string;
  fastPath?: boolean;
  workflow?: string;
}

export interface WorkflowStepConfig {
  step: number;
  name: string;
  agent: string;
  effort?: "low" | "high" | string;
  output?: string;
  inputFrom?: string;
  requireApproval?: boolean;
}

export interface WorkflowConfig {
  description: string;
  steps: WorkflowStepConfig[];
}

export interface EffortModelConfig {
  model: string;
  thinking?: string;
}

export interface OrchestratorConfig extends LayaClientConfig {
  enabled: boolean;
  classifierConfig?: string;
  endpoint: string;
  timeoutMs: number;
  checkpoint: string;
  maxInFlight: number;
  debug: boolean;
  agentsDir?: string;
  logFile?: string;
  theme: ThemeConfig;
  questions: Record<string, LayaQuestion>;
  routes: Record<string, RouteConfig>;
  workflows: Record<string, WorkflowConfig>;
  effortModels: Record<string, EffortModelConfig>;
}

export const DEFAULT_THEME_COLORS: ThemeColors = {
  active: "#00E5FF",
  header: "#A3BF06",
  action: "#FF6B00",
  surface: "#0B0F17",
};

export function parseLayaConfig(raw: unknown): Result<LayaClientConfig> {
  if (!isRecord(raw)) return fail("laya_config_not_object");

  const endpoint = readString(raw, "endpoint") ?? "http://127.0.0.1:8090/analyze";
  const timeoutMs = readNumber(raw, "timeoutMs") ?? 1500;
  const checkpoint = readString(raw, "checkpoint") ?? "";
  const maxResponseBytes = readNumber(raw, "maxResponseBytes");

  const questionsRaw = raw.questions;
  if (!isRecord(questionsRaw)) return fail("laya_config_missing_questions");

  const questions: Record<string, LayaQuestion> = {};
  for (const [qKey, qVal] of Object.entries(questionsRaw)) {
    if (!isRecord(qVal)) return fail(`laya_config_invalid_question_${qKey}`);
    const type = readString(qVal, "type");
    if (type !== "choice") return fail(`laya_config_unsupported_question_type_${qKey}`);
    const instructions = readString(qVal, "instructions") ?? "";
    const criteriaRaw = qVal.criteria;
    if (!isRecord(criteriaRaw)) return fail(`laya_config_missing_criteria_${qKey}`);
    const criteria: Record<string, string> = {};
    for (const [cKey, cVal] of Object.entries(criteriaRaw)) {
      if (typeof cVal !== "string") return fail(`laya_config_invalid_criteria_val_${qKey}_${cKey}`);
      criteria[cKey] = cVal;
    }
    questions[qKey] = {type: "choice", instructions, criteria};
  }

  return {
    ok: true,
    value: {
      endpoint,
      timeoutMs,
      checkpoint,
      questions,
      maxResponseBytes,
    },
  };
}

export function loadLayaConfigFile(filePath: string): Result<LayaClientConfig> {
  try {
    const content = readFileSync(filePath, "utf-8");
    const parsedJson = JSON.parse(content);
    return parseLayaConfig(parsedJson);
  } catch (err: unknown) {
    const message = err instanceof Error ? err.message : String(err);
    return fail(`cannot_load_laya_config:${message}`);
  }
}

export function parseOrchestratorConfig(raw: unknown): Result<OrchestratorConfig> {
  if (!isRecord(raw)) return fail("config_not_object");

  const enabled = readBoolean(raw, "enabled") ?? true;
  const classifierConfig = readString(raw, "classifierConfig");
  const endpoint = readString(raw, "endpoint") ?? "http://127.0.0.1:8090/analyze";
  const timeoutMs = readNumber(raw, "timeoutMs") ?? 1500;
  const checkpoint = readString(raw, "checkpoint") ?? "";
  const maxInFlight = readNumber(raw, "maxInFlight") ?? 3;
  const debug = readBoolean(raw, "debug") ?? false;
  const agentsDir = readString(raw, "agentsDir");
  const logFile = readString(raw, "logFile");

  // Theme
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

  // Questions (optional inline, otherwise loaded from classifierConfig)
  const questionsRaw = raw.questions;
  const questions: Record<string, LayaQuestion> = {};
  if (isRecord(questionsRaw)) {
    for (const [qKey, qVal] of Object.entries(questionsRaw)) {
      if (!isRecord(qVal)) return fail(`config_invalid_question_${qKey}`);
      const type = readString(qVal, "type");
      if (type !== "choice") return fail(`config_unsupported_question_type_${qKey}`);
      const instructions = readString(qVal, "instructions") ?? "";
      const criteriaRaw = qVal.criteria;
      if (!isRecord(criteriaRaw)) return fail(`config_missing_criteria_${qKey}`);
      const criteria: Record<string, string> = {};
      for (const [cKey, cVal] of Object.entries(criteriaRaw)) {
        if (typeof cVal !== "string") return fail(`config_invalid_criteria_val_${qKey}_${cKey}`);
        criteria[cKey] = cVal;
      }
      questions[qKey] = {type: "choice", instructions, criteria};
    }
  }

  // Routes
  const routesRaw = raw.routes;
  if (!isRecord(routesRaw)) return fail("config_missing_routes");
  const routes: Record<string, RouteConfig> = {};
  for (const [rKey, rVal] of Object.entries(routesRaw)) {
    if (!isRecord(rVal)) return fail(`config_invalid_route_${rKey}`);
    const handle = readString(rVal, "handle");
    if (!handle) return fail(`config_missing_handle_in_route_${rKey}`);
    routes[rKey] = {
      handle,
      fastPath: readBoolean(rVal, "fastPath") ?? true,
      workflow: readString(rVal, "workflow"),
    };
  }

  // Workflows
  const workflowsRaw = raw.workflows;
  const workflows: Record<string, WorkflowConfig> = {};
  if (isRecord(workflowsRaw)) {
    for (const [wfKey, wfVal] of Object.entries(workflowsRaw)) {
      if (!isRecord(wfVal)) return fail(`config_invalid_workflow_${wfKey}`);
      const description = readString(wfVal, "description") ?? "";
      const stepsRaw = wfVal.steps;
      if (!Array.isArray(stepsRaw)) return fail(`config_missing_steps_in_workflow_${wfKey}`);
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
          output: readString(stepVal, "output"),
          inputFrom: readString(stepVal, "inputFrom"),
          requireApproval: readBoolean(stepVal, "requireApproval"),
        });
      }
      workflows[wfKey] = {description, steps};
    }
  }

  // Effort Models
  const effortModelsRaw = raw.effortModels;
  if (!isRecord(effortModelsRaw)) return fail("config_missing_effort_models");
  const effortModels: Record<string, EffortModelConfig> = {};
  for (const [efKey, efVal] of Object.entries(effortModelsRaw)) {
    if (!isRecord(efVal)) return fail(`config_invalid_effort_model_${efKey}`);
    const model = readString(efVal, "model");
    if (!model) return fail(`config_missing_model_in_effort_${efKey}`);
    effortModels[efKey] = {
      model,
      thinking: readString(efVal, "thinking"),
    };
  }

  return {
    ok: true,
    value: {
      enabled,
      classifierConfig,
      endpoint,
      timeoutMs,
      checkpoint,
      maxInFlight,
      debug,
      agentsDir,
      logFile,
      theme: {colors},
      questions,
      routes,
      workflows,
      effortModels,
    },
  };
}

export function loadOrchestratorConfigFile(filePath: string): Result<OrchestratorConfig> {
  try {
    const content = readFileSync(filePath, "utf-8");
    const parsedJson = JSON.parse(content);
    const parsedOrch = parseOrchestratorConfig(parsedJson);
    if (!parsedOrch.ok) return parsedOrch;

    const config = parsedOrch.value;

    // If questions are not defined inline, load from classifierConfig or default laya.config.json
    if (Object.keys(config.questions).length === 0) {
      const baseDir = dirname(filePath);
      const layaPath = config.classifierConfig
        ? resolve(baseDir, config.classifierConfig)
        : resolve(baseDir, "laya.config.json");

      if (existsSync(layaPath)) {
        const loadedLaya = loadLayaConfigFile(layaPath);
        if (loadedLaya.ok) {
          config.endpoint = loadedLaya.value.endpoint;
          config.timeoutMs = loadedLaya.value.timeoutMs;
          config.checkpoint = loadedLaya.value.checkpoint;
          config.questions = loadedLaya.value.questions;
          config.maxResponseBytes = loadedLaya.value.maxResponseBytes;
        } else {
          return fail(`cannot_load_classifier_config:${loadedLaya.reason}`);
        }
      } else if (config.classifierConfig) {
        return fail(`classifier_config_not_found:${layaPath}`);
      }
    }

    return {ok: true, value: config};
  } catch (err: unknown) {
    const message = err instanceof Error ? err.message : String(err);
    return fail(`cannot_load_config:${message}`);
  }
}
