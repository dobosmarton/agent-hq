import { createClient } from "@libsql/client";
import type { Client } from "@libsql/client";
import type { ActiveAgent, RunnerState, SerializedQueueEntry } from "@agent-hq/shared-types";
import { mkdirSync } from "node:fs";
import { dirname } from "node:path";

export type StatePersistence = {
  load: () => Promise<RunnerState>;
  save: (state: RunnerState) => Promise<void>;
};

const initSchema = async (db: Client): Promise<void> => {
  // WAL mode must be set outside a transaction
  await db.execute("PRAGMA journal_mode=WAL");
  await db.batch(
    [
      `CREATE TABLE IF NOT EXISTS agent_state (
        agent_id      TEXT PRIMARY KEY,
        task_json     TEXT NOT NULL,
        phase         TEXT NOT NULL,
        session_id    TEXT,
        worktree_path TEXT NOT NULL,
        branch_name   TEXT NOT NULL,
        started_at    INTEGER NOT NULL,
        status        TEXT NOT NULL,
        cost_usd      REAL,
        alerted_stale INTEGER NOT NULL DEFAULT 0,
        retry_count   INTEGER NOT NULL DEFAULT 0
      )`,
      `CREATE TABLE IF NOT EXISTS daily_budget (
        id         INTEGER PRIMARY KEY DEFAULT 1,
        spend_usd  REAL NOT NULL DEFAULT 0,
        spend_date TEXT NOT NULL
      )`,
      `CREATE TABLE IF NOT EXISTS queued_tasks (
        task_id         TEXT PRIMARY KEY,
        retry_count     INTEGER NOT NULL DEFAULT 0,
        next_attempt_at INTEGER NOT NULL,
        enqueued_at     INTEGER NOT NULL,
        task_json       TEXT NOT NULL
      )`,
    ],
    "write"
  );
};

const load = async (db: Client): Promise<RunnerState> => {
  const agentsResult = await db.execute("SELECT * FROM agent_state");
  const activeAgents: Record<string, ActiveAgent> = {};
  for (const row of agentsResult.rows) {
    const agentId = row["agent_id"] as string;
    activeAgents[agentId] = {
      task: JSON.parse(row["task_json"] as string) as ActiveAgent["task"],
      phase: row["phase"] as ActiveAgent["phase"],
      sessionId: (row["session_id"] as string | null) ?? undefined,
      worktreePath: row["worktree_path"] as string,
      branchName: row["branch_name"] as string,
      startedAt: row["started_at"] as number,
      status: row["status"] as ActiveAgent["status"],
      costUsd: (row["cost_usd"] as number | null) ?? undefined,
      alertedStale: (row["alerted_stale"] as number) === 1,
      retryCount: row["retry_count"] as number,
    };
  }

  const budgetResult = await db.execute("SELECT * FROM daily_budget WHERE id = 1");
  const budgetRow = budgetResult.rows[0];
  const dailySpendUsd = budgetRow ? (budgetRow["spend_usd"] as number) : 0;
  const dailySpendDate = budgetRow
    ? (budgetRow["spend_date"] as string)
    : new Date().toISOString().slice(0, 10);

  const queueResult = await db.execute(
    "SELECT * FROM queued_tasks ORDER BY enqueued_at ASC"
  );
  const queuedTasks: SerializedQueueEntry[] = queueResult.rows.map((row) => ({
    task: JSON.parse(row["task_json"] as string) as SerializedQueueEntry["task"],
    retryCount: row["retry_count"] as number,
    nextAttemptAt: row["next_attempt_at"] as number,
    enqueuedAt: row["enqueued_at"] as number,
  }));

  return {
    activeAgents,
    dailySpendUsd,
    dailySpendDate,
    ...(queuedTasks.length > 0 ? { queuedTasks } : {}),
  };
};

const save = async (db: Client, state: RunnerState): Promise<void> => {
  const tx = await db.transaction("write");
  try {
    await tx.execute("DELETE FROM agent_state");
    for (const [agentId, agent] of Object.entries(state.activeAgents)) {
      await tx.execute({
        sql: `INSERT INTO agent_state
              (agent_id, task_json, phase, session_id, worktree_path, branch_name,
               started_at, status, cost_usd, alerted_stale, retry_count)
              VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
        args: [
          agentId,
          JSON.stringify(agent.task),
          agent.phase,
          agent.sessionId ?? null,
          agent.worktreePath,
          agent.branchName,
          agent.startedAt,
          agent.status,
          agent.costUsd ?? null,
          agent.alertedStale ? 1 : 0,
          agent.retryCount,
        ],
      });
    }

    await tx.execute({
      sql: `INSERT OR REPLACE INTO daily_budget (id, spend_usd, spend_date) VALUES (1, ?, ?)`,
      args: [state.dailySpendUsd, state.dailySpendDate],
    });

    await tx.execute("DELETE FROM queued_tasks");
    for (const entry of state.queuedTasks ?? []) {
      await tx.execute({
        sql: `INSERT INTO queued_tasks
              (task_id, retry_count, next_attempt_at, enqueued_at, task_json)
              VALUES (?, ?, ?, ?, ?)`,
        args: [
          entry.task.issueId,
          entry.retryCount,
          entry.nextAttemptAt,
          entry.enqueuedAt,
          JSON.stringify(entry.task),
        ],
      });
    }

    await tx.commit();
  } catch (err) {
    await tx.rollback();
    throw err;
  }
};

export const createStatePersistence = async (dbPath: string): Promise<StatePersistence> => {
  mkdirSync(dirname(dbPath), { recursive: true });
  const db = createClient({ url: `file:${dbPath}` });
  await initSchema(db);
  return {
    load: () => load(db),
    save: (state) => save(db, state),
  };
};
