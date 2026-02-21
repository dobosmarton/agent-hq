import type { AgentTask } from "../types";

export type QueueEntry = {
  task: AgentTask;
  retryCount: number;
  nextAttemptAt: number;
  enqueuedAt: number;
};

export const createTaskQueue = (
  retryBaseDelayMs: number,
  onChanged?: () => void,
) => {
  const queue = new Map<string, QueueEntry>();

  const enqueue = (task: AgentTask): boolean => {
    if (queue.has(task.issueId)) return false;

    queue.set(task.issueId, {
      task,
      retryCount: 0,
      nextAttemptAt: Date.now(),
      enqueuedAt: Date.now(),
    });
    onChanged?.();
    return true;
  };

  const dequeue = (): QueueEntry | null => {
    const now = Date.now();
    for (const [id, entry] of queue) {
      if (entry.nextAttemptAt <= now) {
        queue.delete(id);
        onChanged?.();
        return entry;
      }
    }
    return null;
  };

  const requeue = (task: AgentTask, retryCount: number): void => {
    const delay = retryBaseDelayMs * Math.pow(2, retryCount - 1);
    queue.set(task.issueId, {
      task,
      retryCount,
      nextAttemptAt: Date.now() + delay,
      enqueuedAt: Date.now(),
    });
    onChanged?.();
  };

  const remove = (issueId: string): boolean => {
    const result = queue.delete(issueId);
    if (result) onChanged?.();
    return result;
  };

  const entries = (): QueueEntry[] => [...queue.values()];

  const size = (): number => queue.size;

  const has = (issueId: string): boolean => queue.has(issueId);

  const toJSON = (): QueueEntry[] => [...queue.values()];

  const hydrate = (savedEntries: QueueEntry[]): void => {
    for (const entry of savedEntries) {
      queue.set(entry.task.issueId, entry);
    }
  };

  return {
    enqueue,
    dequeue,
    requeue,
    remove,
    entries,
    size,
    has,
    toJSON,
    hydrate,
  };
};

export type TaskQueue = ReturnType<typeof createTaskQueue>;
