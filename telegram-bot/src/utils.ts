/**
 * Extract a Plane task ID (e.g. "HQ-123", "VERDANDI-42") from text.
 * Returns the first match or null.
 */
export const extractTaskId = (text: string): string | null => {
  const match = text.match(/([A-Z0-9]+-\d+)/);
  return match?.[1] ?? null;
};

/**
 * Split a message into chunks that fit Telegram's 4096 character limit.
 */
export const chunkMessage = (text: string, maxLen = 4096): string[] => {
  if (text.length <= maxLen) return [text];
  const chunks: string[] = [];
  for (let i = 0; i < text.length; i += maxLen) {
    chunks.push(text.slice(i, i + maxLen));
  }
  return chunks;
};
