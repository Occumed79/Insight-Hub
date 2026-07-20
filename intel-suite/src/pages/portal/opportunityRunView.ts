export type OpportunityRunStatus =
  | "queued"
  | "running"
  | "completed"
  | "completed_with_errors"
  | "failed";

export const ACTIVE_OPPORTUNITY_RUN_STATUSES = new Set<OpportunityRunStatus>([
  "queued",
  "running",
]);

export function isOpportunityRunActive(status: OpportunityRunStatus): boolean {
  return ACTIVE_OPPORTUNITY_RUN_STATUSES.has(status);
}

export function opportunityRunProgress(
  completed: number,
  total: number,
): number {
  if (total <= 0) return 0;
  return Math.min(100, Math.max(0, Math.round((completed / total) * 100)));
}

export function opportunityRunMetrics(run: {
  fetched: number;
  staged: number;
  accepted: number;
  rejected: number;
  duplicates: number;
  created: number;
  updated: number;
  archived: number;
  providerErrors?: unknown[];
}) {
  return [
    ["Fetched", run.fetched],
    ["Staged", run.staged],
    ["Accepted", run.accepted],
    ["Rejected", run.rejected],
    ["Duplicates", run.duplicates],
    ["Created", run.created],
    ["Updated", run.updated],
    ["Archived", run.archived],
    ["Errors", run.providerErrors?.length ?? 0],
  ] as const;
}
