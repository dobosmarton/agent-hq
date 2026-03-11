import type { PlaneClient } from "@agent-hq/plane-client";

export type AddLabelsResult =
  | { success: true; mergedLabelIds: string[] }
  | { success: false; notFound: string[]; availableLabelNames: string[] };

export const addLabelsToTaskExecutor = async (
  plane: PlaneClient,
  projectId: string,
  issueId: string,
  labelNames: string[]
): Promise<AddLabelsResult> => {
  const [issue, availableLabels] = await Promise.all([
    plane.getIssue(projectId, issueId),
    plane.listLabels(projectId),
  ]);

  const labelMap = new Map(availableLabels.map((l) => [l.name.toLowerCase(), l.id]));
  const notFound: string[] = [];
  const labelIdsToAdd: string[] = [];

  for (const name of labelNames) {
    const labelId = labelMap.get(name.toLowerCase());
    if (labelId !== undefined) {
      labelIdsToAdd.push(labelId);
    } else {
      notFound.push(name);
    }
  }

  if (notFound.length > 0) {
    return {
      success: false,
      notFound,
      availableLabelNames: availableLabels.map((l) => l.name),
    };
  }

  const currentLabels = issue.labels ?? [];
  const mergedLabels = Array.from(new Set([...currentLabels, ...labelIdsToAdd]));
  await plane.updateIssue(projectId, issueId, { labels: mergedLabels });

  return { success: true, mergedLabelIds: mergedLabels };
};

export type RemoveLabelsResult = {
  updatedLabelIds: string[];
  removedLabelNames: string[];
};

export const removeLabelsFromTaskExecutor = async (
  plane: PlaneClient,
  projectId: string,
  issueId: string,
  labelNames: string[]
): Promise<RemoveLabelsResult> => {
  const [issue, availableLabels] = await Promise.all([
    plane.getIssue(projectId, issueId),
    plane.listLabels(projectId),
  ]);

  const labelMap = new Map(availableLabels.map((l) => [l.name.toLowerCase(), l.id]));
  const labelIdsToRemove = new Set(
    labelNames
      .map((name) => labelMap.get(name.toLowerCase()))
      .filter((id): id is string => id !== undefined)
  );

  const currentLabels = issue.labels ?? [];
  const removedLabelNames = labelNames.filter((name) => {
    const id = labelMap.get(name.toLowerCase());
    return id !== undefined && currentLabels.includes(id);
  });

  const updatedLabels = currentLabels.filter((id) => !labelIdsToRemove.has(id));
  await plane.updateIssue(projectId, issueId, { labels: updatedLabels });

  return { updatedLabelIds: updatedLabels, removedLabelNames };
};
