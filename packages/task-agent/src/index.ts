export { createAgentManager } from "./manager";
export type { AgentManager, OnAgentDone } from "./manager";
export { runAgent } from "./runner";
export type { AgentResult, ResumeContext } from "./runner";
export type {
  Notifier,
  TaskPollerAdapter,
  StatePersistence,
  WorktreeAdapter,
  WorktreeResult,
  ProjectCache,
  AgentConfig,
  TaskAgentConfig,
  ProjectConfig,
} from "./adapters";
