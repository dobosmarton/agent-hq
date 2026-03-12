import { toErrorMessage } from "@agent-hq/shared-types";
import type { Notifier } from "./adapters";
import { formatAgentProgress, type ProgressStep } from "./progress-formatter";

type AgentProgressTrackerConfig = {
  notifier: Notifier;
  messageId: number;
  taskDisplayId: string;
  taskTitle: string;
  enabled?: boolean;
  updateIntervalMs?: number;
};

const DEFAULT_UPDATE_INTERVAL_MS = 2500;
const MAX_STEPS = 10;

const noopTracker = {
  update: (_step: string, _status: ProgressStep["status"]): void => {},
};

export const createAgentProgressTracker = (config: AgentProgressTrackerConfig) => {
  if (config.messageId === 0 || config.enabled === false) {
    return noopTracker;
  }

  const steps: ProgressStep[] = [];
  const startTime = Date.now();
  let lastUpdateTime = 0;
  const intervalMs = config.updateIntervalMs ?? DEFAULT_UPDATE_INTERVAL_MS;

  return {
    update: (step: string, status: ProgressStep["status"]): void => {
      const existingStepIndex = steps.findIndex((s) => s.name === step);
      const stepData: ProgressStep = {
        name: step,
        status,
        timestamp: Date.now(),
      };

      if (existingStepIndex !== -1) {
        steps[existingStepIndex] = stepData;
      } else {
        steps.push(stepData);
        if (steps.length > MAX_STEPS) {
          steps.shift();
        }
      }

      const now = Date.now();
      if (now - lastUpdateTime >= intervalMs) {
        lastUpdateTime = now;
        const message = formatAgentProgress(
          config.taskDisplayId,
          config.taskTitle,
          steps,
          startTime
        );
        void config.notifier.agentProgress(config.messageId, message).catch((err: unknown) => {
          console.error(`Progress update failed: ${toErrorMessage(err)}`);
        });
      }
    },
  };
};

export type AgentProgressTracker = ReturnType<typeof createAgentProgressTracker>;
