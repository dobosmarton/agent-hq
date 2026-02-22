import type {
  CacheEntry,
  CacheStats,
  ContextType,
  SerializedCache,
} from "./types";
import { DEFAULT_CACHE_CONFIG } from "./types";

const CACHE_VERSION = 1;
const MAX_TOTAL_SIZE_BYTES = 10 * 1024 * 1024; // 10MB hard limit
const PRUNE_INTERVAL_MS = 60 * 1000; // Prune every minute

/**
 * In-memory context cache with TTL, LRU eviction, and persistence support
 */
export const createContextCache = () => {
  const cache = new Map<string, CacheEntry>();
  let pruneTimer: NodeJS.Timeout | null = null;

  // Initialize stats
  const stats: CacheStats = {
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
  };

  /**
   * Estimate size of data in bytes (rough approximation)
   */
  const estimateSize = (data: unknown): number => {
    const json = JSON.stringify(data);
    return json.length * 2; // UTF-16 encoding approximation
  };

  /**
   * Update aggregate stats
   */
  const updateStats = (): void => {
    stats.totalSize = 0;
    stats.entryCount = cache.size;
    stats.hitRate =
      stats.hits + stats.misses > 0
        ? stats.hits / (stats.hits + stats.misses)
        : 0;

    // Reset per-type stats
    for (const type of Object.keys(stats.byType) as ContextType[]) {
      stats.byType[type] = { entries: 0, size: 0, hits: 0, misses: 0 };
    }

    // Recalculate from cache
    for (const entry of cache.values()) {
      stats.totalSize += entry.sizeBytes;
      stats.byType[entry.type].entries++;
      stats.byType[entry.type].size += entry.sizeBytes;
    }
  };

  /**
   * Check if entry is expired based on TTL
   */
  const isExpired = (entry: CacheEntry): boolean => {
    if (entry.ttlMs === Infinity) return false;
    return Date.now() - entry.createdAt > entry.ttlMs;
  };

  /**
   * Remove expired entries (called periodically)
   */
  const pruneExpired = (): void => {
    const now = Date.now();
    let pruned = 0;

    for (const [key, entry] of cache.entries()) {
      if (isExpired(entry)) {
        cache.delete(key);
        stats.evictions++;
        pruned++;
      }
    }

    if (pruned > 0) {
      updateStats();
      console.log(`[ContextCache] Pruned ${pruned} expired entries`);
    }
  };

  /**
   * Evict entries using LRU policy until size is under limit
   */
  const evictLRU = (): void => {
    if (stats.totalSize <= MAX_TOTAL_SIZE_BYTES) return;

    // Sort by lastAccessedAt (LRU)
    const entries = Array.from(cache.entries()).sort(
      ([, a], [, b]) => a.lastAccessedAt - b.lastAccessedAt,
    );

    let evicted = 0;
    for (const [key, entry] of entries) {
      if (stats.totalSize <= MAX_TOTAL_SIZE_BYTES) break;
      cache.delete(key);
      stats.totalSize -= entry.sizeBytes;
      stats.evictions++;
      evicted++;
    }

    if (evicted > 0) {
      updateStats();
      console.log(
        `[ContextCache] Evicted ${evicted} entries via LRU (size: ${(stats.totalSize / 1024).toFixed(1)}KB)`,
      );
    }
  };

  /**
   * Get cached value if exists and not expired
   */
  const get = <T = unknown>(key: string, type: ContextType): T | undefined => {
    const entry = cache.get(key);

    if (!entry) {
      stats.misses++;
      stats.byType[type].misses++;
      updateStats();
      return undefined;
    }

    if (isExpired(entry)) {
      cache.delete(key);
      stats.misses++;
      stats.byType[type].misses++;
      stats.evictions++;
      updateStats();
      return undefined;
    }

    // Update LRU timestamp
    entry.lastAccessedAt = Date.now();
    stats.hits++;
    stats.byType[type].hits++;
    updateStats();

    return entry.data as T;
  };

  /**
   * Set cached value with TTL
   */
  const set = (key: string, type: ContextType, data: unknown): void => {
    const config = DEFAULT_CACHE_CONFIG[type];
    const sizeBytes = estimateSize(data);

    // Remove old entry if exists
    const oldEntry = cache.get(key);
    if (oldEntry) {
      stats.totalSize -= oldEntry.sizeBytes;
    }

    const entry: CacheEntry = {
      key,
      type,
      data,
      createdAt: Date.now(),
      lastAccessedAt: Date.now(),
      ttlMs: config.ttlMs,
      sizeBytes,
    };

    cache.set(key, entry);
    stats.totalSize += sizeBytes;
    updateStats();

    // Evict if over limit
    evictLRU();
  };

  /**
   * Invalidate specific key or all keys of a type
   */
  const invalidate = (keyOrType: string | ContextType): void => {
    // If it's a context type, invalidate all entries of that type
    if (Object.keys(stats.byType).includes(keyOrType)) {
      const type = keyOrType as ContextType;
      let invalidated = 0;

      for (const [key, entry] of cache.entries()) {
        if (entry.type === type) {
          cache.delete(key);
          invalidated++;
        }
      }

      if (invalidated > 0) {
        updateStats();
        console.log(
          `[ContextCache] Invalidated ${invalidated} entries of type ${type}`,
        );
      }
    } else {
      // Invalidate specific key
      if (cache.delete(keyOrType)) {
        updateStats();
      }
    }
  };

  /**
   * Clear entire cache
   */
  const clear = (): void => {
    cache.clear();
    stats.hits = 0;
    stats.misses = 0;
    stats.evictions = 0;
    updateStats();
    console.log("[ContextCache] Cache cleared");
  };

  /**
   * Get current cache statistics
   */
  const getStats = (): CacheStats => ({ ...stats });

  /**
   * Serialize cache for persistence
   */
  const serialize = (): SerializedCache => ({
    version: CACHE_VERSION,
    entries: Array.from(cache.values()),
    stats: { ...stats },
  });

  /**
   * Restore cache from serialized state
   */
  const deserialize = (data: SerializedCache): void => {
    if (data.version !== CACHE_VERSION) {
      console.warn(
        `[ContextCache] Cache version mismatch (expected ${CACHE_VERSION}, got ${data.version}), clearing cache`,
      );
      return;
    }

    cache.clear();
    const now = Date.now();

    for (const entry of data.entries) {
      // Skip expired entries during restore
      if (isExpired(entry)) {
        continue;
      }

      // Restore TTL from creation time
      const age = now - entry.createdAt;
      if (entry.ttlMs !== Infinity && age >= entry.ttlMs) {
        continue;
      }

      cache.set(entry.key, entry);
    }

    // Restore stats (reset counters but keep structure)
    stats.hits = 0;
    stats.misses = 0;
    stats.evictions = 0;
    updateStats();

    console.log(
      `[ContextCache] Restored ${cache.size} entries from persistence`,
    );
  };

  /**
   * Start periodic pruning of expired entries
   */
  const startPruning = (): void => {
    if (pruneTimer) return;
    pruneTimer = setInterval(pruneExpired, PRUNE_INTERVAL_MS);
    console.log("[ContextCache] Started periodic pruning");
  };

  /**
   * Stop periodic pruning
   */
  const stopPruning = (): void => {
    if (pruneTimer) {
      clearInterval(pruneTimer);
      pruneTimer = null;
      console.log("[ContextCache] Stopped periodic pruning");
    }
  };

  // Start pruning immediately
  startPruning();

  return {
    get,
    set,
    invalidate,
    clear,
    getStats,
    serialize,
    deserialize,
    startPruning,
    stopPruning,
  };
};

export type ContextCache = ReturnType<typeof createContextCache>;
