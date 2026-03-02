import type { TaskExecution } from "./collector";

const MAX_HISTORY_SIZE = 1000;

export const createExecutionHistory = () => {
  const history: TaskExecution[] = [];

  const add = (execution: TaskExecution): void => {
    history.push(execution);

    // Maintain circular buffer
    if (history.length > MAX_HISTORY_SIZE) {
      history.shift();
    }
  };

  const getRecent = (limit: number = 50): TaskExecution[] => {
    return history.slice(-limit).reverse();
  };

  const getByTimeRange = (startMs: number, endMs: number): TaskExecution[] => {
    return history
      .filter((e) => e.completedAt >= startMs && e.completedAt <= endMs)
      .reverse();
  };

  const getByProject = (projectIdentifier: string): TaskExecution[] => {
    return history.filter((e) => e.projectIdentifier === projectIdentifier);
  };

  const getErrors = (limit: number = 50): TaskExecution[] => {
    return history
      .filter((e) => !e.success)
      .slice(-limit)
      .reverse();
  };

  const getAll = (): TaskExecution[] => {
    return [...history];
  };

  const toJSON = (): TaskExecution[] => {
    return [...history];
  };

  const hydrate = (savedHistory: TaskExecution[]): void => {
    history.length = 0;
    history.push(...savedHistory.slice(-MAX_HISTORY_SIZE));
  };

  return {
    add,
    getRecent,
    getByTimeRange,
    getByProject,
    getErrors,
    getAll,
    toJSON,
    hydrate,
  };
};

export type ExecutionHistory = ReturnType<typeof createExecutionHistory>;
