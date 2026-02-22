/**
 * Context types that can be cached with different TTLs and eviction policies
 */
export type ContextType =
  | "project_metadata" // Project info, rarely changes
  | "project_conventions" // Code conventions, skills, standards
  | "file_content" // Individual file contents
  | "ci_workflows" // CI/CD workflow definitions
  | "task_history" // Completed task summaries
  | "codebase_map"; // Repository structure and file map

/**
 * Cache entry with metadata for TTL and LRU eviction
 */
export type CacheEntry<T = unknown> = {
  key: string;
  type: ContextType;
  data: T;
  createdAt: number;
  lastAccessedAt: number;
  ttlMs: number;
  sizeBytes: number;
};

/**
 * Cache configuration per context type
 */
export type CacheConfig = {
  ttlMs: number; // Time-to-live in milliseconds
  maxSizeBytes: number; // Maximum size for this context type
};

/**
 * Default cache configurations by context type
 */
export const DEFAULT_CACHE_CONFIG: Record<ContextType, CacheConfig> = {
  project_metadata: { ttlMs: 30 * 60 * 1000, maxSizeBytes: 500 * 1024 }, // 30 min, 500KB
  project_conventions: { ttlMs: 60 * 60 * 1000, maxSizeBytes: 1024 * 1024 }, // 60 min, 1MB
  file_content: { ttlMs: 10 * 60 * 1000, maxSizeBytes: 5 * 1024 * 1024 }, // 10 min, 5MB total
  ci_workflows: { ttlMs: Infinity, maxSizeBytes: 100 * 1024 }, // Until restart, 100KB
  task_history: { ttlMs: 24 * 60 * 60 * 1000, maxSizeBytes: 2 * 1024 * 1024 }, // 24 hours, 2MB
  codebase_map: { ttlMs: 60 * 60 * 1000, maxSizeBytes: 500 * 1024 }, // 60 min, 500KB
};

/**
 * Cache metrics for monitoring effectiveness
 */
export type CacheStats = {
  hits: number;
  misses: number;
  evictions: number;
  totalSize: number;
  entryCount: number;
  hitRate: number; // Calculated: hits / (hits + misses)
  byType: Record<
    ContextType,
    {
      entries: number;
      size: number;
      hits: number;
      misses: number;
    }
  >;
};

/**
 * Serialized cache state for persistence
 */
export type SerializedCache = {
  entries: CacheEntry[];
  stats: CacheStats;
  version: number;
};
