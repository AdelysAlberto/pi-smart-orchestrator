import type {OrchestratorConfig, WorkflowConfig, WorkflowStepConfig} from "./config.validator.ts";
import {fail, type Result} from "./guards.ts";
import type {AgentRunOutput, NativeAgentRunner} from "./native.agent.runner.ts";
import type {PipelineProgressData, SwarmAgentStatus} from "./tui/decision.renderer.ts";

export interface StepExecutionResult {
  step: number;
  name: string;
  agent: string;
  payload: AgentRunOutput;
}

export interface SequentialPipelineOptions {
  workflowName: string;
  workflow: WorkflowConfig;
  userPrompt: string;
  config: OrchestratorConfig;
  runner: NativeAgentRunner;
  onProgress?: (progress: PipelineProgressData) => void;
  onApprovalRequired?: (step: WorkflowStepConfig, previousResult: string) => Promise<boolean>;
}

export async function runSequentialPipeline(
  options: SequentialPipelineOptions
): Promise<Result<StepExecutionResult[]>> {
  const {workflowName, workflow, userPrompt, config, runner, onProgress, onApprovalRequired} = options;
  const results: StepExecutionResult[] = [];
  let lastOutput = "";

  for (let i = 0; i < workflow.steps.length; i++) {
    const step = workflow.steps[i];
    if (!step) continue;

    const effort = step.effort ?? "low";
    const effortModel = config.effortModels[effort] ?? config.effortModels.low ?? {model: "default"};
    const modelStr = `${effortModel.model}${effortModel.thinking ? `:${effortModel.thinking}` : ""}`;

    onProgress?.({
      workflowName,
      currentStep: step.step,
      totalSteps: workflow.steps.length,
      stepName: step.name,
      agent: step.agent,
      model: modelStr,
      status: "running",
      activity: `Iniciando etapa con @${step.agent}...`,
    });

    // Build prompt with chained context if needed
    let stepPrompt = userPrompt;
    if (step.inputFrom && lastOutput) {
      stepPrompt = `${userPrompt}\n\n[Contexto del paso anterior (${step.inputFrom})]:\n${lastOutput}`;
    }

    const runRes = await runner.run({
      agentHandle: step.agent,
      prompt: stepPrompt,
      modelString: effortModel.model,
      thinkingLevel: effortModel.thinking,
      description: `${workflowName} - ${step.name}`,
      onToolActivity: activity => {
        onProgress?.({
          workflowName,
          currentStep: step.step,
          totalSteps: workflow.steps.length,
          stepName: step.name,
          agent: step.agent,
          model: modelStr,
          status: "running",
          activity: activity.type === "start" ? `Ejecutando ${activity.toolName}...` : undefined,
        });
      },
    });

    if (!runRes.ok) {
      return fail(`step_${step.step}_failed:${runRes.reason}`);
    }

    const runOutput = runRes.value;
    if (runOutput.status === "error") {
      return fail(`step_${step.step}_error:${runOutput.error ?? "unknown_error"}`);
    }

    lastOutput = runOutput.result;
    results.push({
      step: step.step,
      name: step.name,
      agent: step.agent,
      payload: runOutput,
    });

    // Check approval gate
    if (step.requireApproval && i < workflow.steps.length - 1) {
      onProgress?.({
        workflowName,
        currentStep: step.step,
        totalSteps: workflow.steps.length,
        stepName: step.name,
        agent: step.agent,
        model: modelStr,
        status: "waiting_approval",
        activity: "Esperando aprobación para avanzar a la siguiente etapa...",
      });

      if (onApprovalRequired) {
        const approved = await onApprovalRequired(step, lastOutput);
        if (!approved) {
          return fail(`workflow_aborted_by_user_at_step_${step.step}`);
        }
      }
    }
  }

  return {ok: true, value: results};
}

export interface SwarmTask {
  agent: string;
  taskName: string;
  prompt: string;
  effort?: "low" | "high" | string;
}

export interface SwarmExecutionResult {
  agent: string;
  taskName: string;
  payload: AgentRunOutput;
}

export interface ParallelSwarmOptions {
  tasks: SwarmTask[];
  config: OrchestratorConfig;
  runner: NativeAgentRunner;
  onProgress?: (inFlight: SwarmAgentStatus[]) => void;
}

export async function runParallelSwarm(options: ParallelSwarmOptions): Promise<Result<SwarmExecutionResult[]>> {
  const {tasks, config, runner, onProgress} = options;
  const maxInFlight = Math.max(1, config.maxInFlight);
  const results: SwarmExecutionResult[] = [];
  const inFlightMap = new Map<string, {agent: string; task: string; startTime: number}>();

  function notifyProgress() {
    const now = Date.now();
    const list: SwarmAgentStatus[] = Array.from(inFlightMap.entries()).map(([_id, item]) => ({
      agent: item.agent,
      task: item.task,
      status: "ejecutando",
      durationMs: now - item.startTime,
    }));
    onProgress?.(list);
  }

  let taskIndex = 0;
  const runningPromises: Promise<void>[] = [];

  async function launchTask(task: SwarmTask): Promise<void> {
    const effort = task.effort ?? "low";
    const effortModel = config.effortModels[effort] ?? config.effortModels.low ?? {model: "default"};
    const taskId = `${task.agent}_${Date.now()}_${Math.random().toString(36).slice(2, 6)}`;

    inFlightMap.set(taskId, {agent: task.agent, task: task.taskName, startTime: Date.now()});
    notifyProgress();

    try {
      const runRes = await runner.run({
        agentHandle: task.agent,
        prompt: task.prompt,
        modelString: effortModel.model,
        thinkingLevel: effortModel.thinking,
        description: task.taskName,
      });

      if (runRes.ok) {
        results.push({
          agent: task.agent,
          taskName: task.taskName,
          payload: runRes.value,
        });
      } else {
        results.push({
          agent: task.agent,
          taskName: task.taskName,
          payload: {
            agent: task.agent,
            status: "error",
            result: "",
            durationMs: 0,
            turns: 0,
            error: runRes.reason,
          },
        });
      }
    } finally {
      inFlightMap.delete(taskId);
      notifyProgress();
    }
  }

  async function runNext(): Promise<void> {
    while (taskIndex < tasks.length) {
      const currentTask = tasks[taskIndex++];
      if (currentTask) {
        await launchTask(currentTask);
      }
    }
  }

  const poolSize = Math.min(maxInFlight, tasks.length);
  for (let i = 0; i < poolSize; i++) {
    runningPromises.push(runNext());
  }

  await Promise.all(runningPromises);

  return {ok: true, value: results};
}
