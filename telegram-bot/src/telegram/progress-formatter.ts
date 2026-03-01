export type ProgressStepStatus = "pending" | "in_progress" | "completed" | "error";

export type ProgressStep = {
  name: string;
  status: ProgressStepStatus;
  details?: string;
  timestamp: number;
};

const STATUS_EMOJIS: Record<ProgressStepStatus, string> = {
  pending: "⏳",
  in_progress: "🔄",
  completed: "✅",
  error: "❌",
};

const formatElapsedTime = (startTime: number): string => {
  const elapsed = Math.floor((Date.now() - startTime) / 1000);
  if (elapsed < 60) {
    return `${elapsed}s`;
  }
  const minutes = Math.floor(elapsed / 60);
  const seconds = elapsed % 60;
  return `${minutes}m ${seconds}s`;
};

export const formatProgressMessage = (
  steps: readonly ProgressStep[],
  startTime: number
): string => {
  if (steps.length === 0) {
    return "⏳ Processing your request...";
  }

  const lines: string[] = [];

  // Add step indicators
  for (const step of steps) {
    const emoji = STATUS_EMOJIS[step.status];
    let line = `${emoji} ${step.name}`;
    if (step.details) {
      line += ` <i>(${step.details})</i>`;
    }
    lines.push(line);
  }

  // Add elapsed time at the bottom
  const elapsed = formatElapsedTime(startTime);
  lines.push("");
  lines.push(`<i>Elapsed: ${elapsed}</i>`);

  return lines.join("\n");
};

export const formatFinalMessage = (message: string): string => {
  return message;
};

export const formatErrorMessage = (error: string): string => {
  return `❌ <b>Error</b>\n\n${error}`;
};
