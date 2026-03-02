import type { PendingCommand } from "./types";

// In-memory store for pending voice command confirmations
const pendingCommands = new Map<string, PendingCommand>();

// Default timeout: 5 minutes
const DEFAULT_TIMEOUT_MS = 5 * 60 * 1000;

/**
 * Generate a unique ID for a pending command
 */
const generateCommandId = (): string => {
  return `cmd_${Date.now()}_${Math.random().toString(36).substring(2, 9)}`;
};

/**
 * Store a pending command and return its ID
 */
export const storePendingCommand = (userId: string, transcribedText: string): string => {
  const commandId = generateCommandId();
  const timestamp = Date.now();

  pendingCommands.set(commandId, {
    userId,
    transcribedText,
    timestamp,
    expiresAt: timestamp + DEFAULT_TIMEOUT_MS,
  });

  return commandId;
};

/**
 * Retrieve and remove a pending command by ID
 * Returns null if not found or expired
 */
export const consumePendingCommand = (commandId: string): PendingCommand | null => {
  const command = pendingCommands.get(commandId);

  if (!command) {
    return null;
  }

  // Check if expired
  if (Date.now() > command.expiresAt) {
    pendingCommands.delete(commandId);
    return null;
  }

  // Remove from store (consume)
  pendingCommands.delete(commandId);
  return command;
};

/**
 * Clean up expired commands
 * Should be called periodically
 */
export const cleanupExpiredCommands = (): void => {
  const now = Date.now();
  for (const [id, command] of pendingCommands.entries()) {
    if (now > command.expiresAt) {
      pendingCommands.delete(id);
    }
  }
};
