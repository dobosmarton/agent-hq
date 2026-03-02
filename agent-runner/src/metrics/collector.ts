export type TaskExecution = {
  issueId: string;
  projectIdentifier: string;
  sequenceId: number;
  title: string;
  phase: string;
  startedAt: number;
  completedAt: number;
  durationMs: number;
  costUsd: number;
  success: boolean;
  errorType?: string;
  retryCount: number;
};

export const createMetricsCollector = () => {
  let totalTasks = 0;
  let successfulTasks = 0;
  let failedTasks = 0;
  let totalCostUsd = 0;
  let totalDurationMs = 0;
  const startTime = Date.now();

  const recordExecution = (execution: TaskExecution): void => {
    totalTasks++;
    totalCostUsd += execution.costUsd;
    totalDurationMs += execution.durationMs;

    if (execution.success) {
      successfulTasks++;
    } else {
      failedTasks++;
    }
  };

  const getMetrics = () => ({
    uptime: Date.now() - startTime,
    totalTasks,
    successfulTasks,
    failedTasks,
    successRate: totalTasks > 0 ? successfulTasks / totalTasks : 0,
    totalCostUsd,
    avgDurationMs: totalTasks > 0 ? totalDurationMs / totalTasks : 0,
  });

  const reset = (): void => {
    totalTasks = 0;
    successfulTasks = 0;
    failedTasks = 0;
    totalCostUsd = 0;
    totalDurationMs = 0;
  };

  return {
    recordExecution,
    getMetrics,
    reset,
  };
};

export type MetricsCollector = ReturnType<typeof createMetricsCollector>;
