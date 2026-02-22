import type { CacheStats } from "../cache/types";
import type { CacheMetrics } from "../agent/runner";

/**
 * Aggregate metrics for context handling and caching
 */
export type AggregateMetrics = {
  // Cache performance
  cache: CacheStats;

  // Token usage
  tokens: {
    totalInput: number;
    totalOutput: number;
    cacheCreation: number;
    cacheRead: number;
    totalCost: number;
    averageCostPerTask: number;
  };

  // Task metrics
  tasks: {
    total: number;
    withCacheHit: number;
    averageTurns: number;
  };

  // Timing
  timing: {
    averageContextRetrievalMs: number;
    averageTaskDurationMs: number;
  };
};

/**
 * Metrics collector for tracking context and cache effectiveness
 */
export const createMetricsCollector = () => {
  const metrics: AggregateMetrics = {
    cache: {
      hits: 0,
      misses: 0,
      evictions: 0,
      totalSize: 0,
      entryCount: 0,
      hitRate: 0,
      byType: {
        project_metadata: { entries: 0, size: 0, hits: 0, misses: 0 },
        project_conventions: { entries: 0, size: 0, hits: 0, misses: 0 },
        file_content: { entries: 0, size: 0, hits: 0, misses: 0 },
        ci_workflows: { entries: 0, size: 0, hits: 0, misses: 0 },
        task_history: { entries: 0, size: 0, hits: 0, misses: 0 },
        codebase_map: { entries: 0, size: 0, hits: 0, misses: 0 },
      },
    },
    tokens: {
      totalInput: 0,
      totalOutput: 0,
      cacheCreation: 0,
      cacheRead: 0,
      totalCost: 0,
      averageCostPerTask: 0,
    },
    tasks: {
      total: 0,
      withCacheHit: 0,
      averageTurns: 0,
    },
    timing: {
      averageContextRetrievalMs: 0,
      averageTaskDurationMs: 0,
    },
  };

  /**
   * Update cache stats from cache
   */
  const updateCacheStats = (cacheStats: CacheStats): void => {
    metrics.cache = { ...cacheStats };
  };

  /**
   * Record task completion with cache metrics
   */
  const recordTask = (
    costUsd: number,
    cacheMetrics?: CacheMetrics,
    durationMs?: number,
  ): void => {
    metrics.tasks.total++;
    metrics.tokens.totalCost += costUsd;
    metrics.tokens.averageCostPerTask =
      metrics.tokens.totalCost / metrics.tasks.total;

    if (cacheMetrics) {
      metrics.tokens.totalInput += cacheMetrics.inputTokens;
      metrics.tokens.totalOutput += cacheMetrics.outputTokens || 0;
      metrics.tokens.cacheCreation +=
        cacheMetrics.cacheCreationInputTokens || 0;
      metrics.tokens.cacheRead += cacheMetrics.cacheReadInputTokens || 0;

      if (
        cacheMetrics.cacheReadInputTokens &&
        cacheMetrics.cacheReadInputTokens > 0
      ) {
        metrics.tasks.withCacheHit++;
      }
    }

    if (durationMs) {
      const totalDuration =
        metrics.timing.averageTaskDurationMs * (metrics.tasks.total - 1) +
        durationMs;
      metrics.timing.averageTaskDurationMs =
        totalDuration / metrics.tasks.total;
    }
  };

  /**
   * Record context retrieval timing
   */
  const recordContextRetrieval = (durationMs: number): void => {
    const count = metrics.tasks.total || 1;
    const totalTime =
      metrics.timing.averageContextRetrievalMs * (count - 1) + durationMs;
    metrics.timing.averageContextRetrievalMs = totalTime / count;
  };

  /**
   * Get current metrics snapshot
   */
  const getMetrics = (): AggregateMetrics => ({ ...metrics });

  /**
   * Format metrics as human-readable summary
   */
  const formatSummary = (): string => {
    const cacheHitRate = (metrics.cache.hitRate * 100).toFixed(1);
    const taskCacheUtilization =
      metrics.tasks.total > 0
        ? ((metrics.tasks.withCacheHit / metrics.tasks.total) * 100).toFixed(1)
        : "0.0";

    const tokenSavings =
      metrics.tokens.cacheRead > 0
        ? (
            (metrics.tokens.cacheRead /
              (metrics.tokens.totalInput +
                metrics.tokens.cacheRead +
                metrics.tokens.cacheCreation)) *
            100
          ).toFixed(1)
        : "0.0";

    return `Cache: ${cacheHitRate}% hit rate, ${metrics.cache.entryCount} entries, ${(metrics.cache.totalSize / 1024).toFixed(1)}KB
Tokens: ${metrics.tokens.cacheRead} cached (${tokenSavings}% savings), ${metrics.tokens.totalInput} uncached
Tasks: ${metrics.tasks.total} total, ${metrics.tasks.withCacheHit} with cache hits (${taskCacheUtilization}%)
Cost: $${metrics.tokens.totalCost.toFixed(2)} total, $${metrics.tokens.averageCostPerTask.toFixed(2)} avg/task`;
  };

  /**
   * Format metrics as HTML for Plane comments
   */
  const formatHtml = (): string => {
    const cacheHitRate = (metrics.cache.hitRate * 100).toFixed(1);
    const taskCacheUtilization =
      metrics.tasks.total > 0
        ? ((metrics.tasks.withCacheHit / metrics.tasks.total) * 100).toFixed(1)
        : "0.0";

    const tokenSavings =
      metrics.tokens.cacheRead > 0
        ? (
            (metrics.tokens.cacheRead /
              (metrics.tokens.totalInput +
                metrics.tokens.cacheRead +
                metrics.tokens.cacheCreation)) *
            100
          ).toFixed(1)
        : "0.0";

    return `<h4>Context Cache Metrics</h4>
<ul>
  <li><strong>Cache Hit Rate:</strong> ${cacheHitRate}% (${metrics.cache.hits} hits, ${metrics.cache.misses} misses)</li>
  <li><strong>Cache Size:</strong> ${(metrics.cache.totalSize / 1024).toFixed(1)}KB (${metrics.cache.entryCount} entries, ${metrics.cache.evictions} evictions)</li>
  <li><strong>Token Savings:</strong> ${tokenSavings}% (${metrics.tokens.cacheRead} cached tokens vs ${metrics.tokens.totalInput} uncached)</li>
  <li><strong>Tasks Using Cache:</strong> ${metrics.tasks.withCacheHit}/${metrics.tasks.total} (${taskCacheUtilization}%)</li>
  <li><strong>Average Cost:</strong> $${metrics.tokens.averageCostPerTask.toFixed(2)}/task</li>
</ul>`;
  };

  /**
   * Reset all metrics
   */
  const reset = (): void => {
    metrics.cache.hits = 0;
    metrics.cache.misses = 0;
    metrics.cache.evictions = 0;
    metrics.tokens.totalInput = 0;
    metrics.tokens.totalOutput = 0;
    metrics.tokens.cacheCreation = 0;
    metrics.tokens.cacheRead = 0;
    metrics.tokens.totalCost = 0;
    metrics.tokens.averageCostPerTask = 0;
    metrics.tasks.total = 0;
    metrics.tasks.withCacheHit = 0;
    metrics.timing.averageContextRetrievalMs = 0;
    metrics.timing.averageTaskDurationMs = 0;
  };

  return {
    updateCacheStats,
    recordTask,
    recordContextRetrieval,
    getMetrics,
    formatSummary,
    formatHtml,
    reset,
  };
};

export type MetricsCollector = ReturnType<typeof createMetricsCollector>;
