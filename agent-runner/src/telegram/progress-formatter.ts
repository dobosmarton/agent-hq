export type ProgressStep = {
  name: string;
  status: "pending" | "in_progress" | "completed";
  timestamp: number;
};

const STATUS_EMOJIS = {
  pending: "⏳",
  in_progress: "🔄",
  completed: "✅",
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

export const formatAgentProgress = (
  taskId: string,
  title: string,
  steps: readonly ProgressStep[],
  startTime: number,
): string => {
  const lines: string[] = [];

  lines.push(`<b>Agent progress</b>`);
  lines.push(`<code>${taskId}</code>: ${title}`);
  lines.push("");

  // Add step indicators
  for (const step of steps) {
    const emoji = STATUS_EMOJIS[step.status];
    lines.push(`${emoji} ${step.name}`);
  }

  // Add elapsed time
  const elapsed = formatElapsedTime(startTime);
  lines.push("");
  lines.push(`<i>Elapsed: ${elapsed}</i>`);

  return lines.join("\n");
};
