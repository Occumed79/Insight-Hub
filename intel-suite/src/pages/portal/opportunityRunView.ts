export type OpportunityRunStatus =
  | "queued"
  | "running"
  | "completed"
  | "completed_with_errors"
  | "cancelled"
  | "failed";

export const ACTIVE_OPPORTUNITY_RUN_STATUSES = new Set<OpportunityRunStatus>([
  "queued",
  "running",
]);

export const STALE_OPPORTUNITY_RUN_AFTER_MS = 30 * 60 * 1000;

export function isOpportunityRunActive(status: OpportunityRunStatus): boolean {
  return ACTIVE_OPPORTUNITY_RUN_STATUSES.has(status);
}

export function isOpportunityRunStale(
  heartbeatAt: string | Date | null | undefined,
  now = new Date(),
): boolean {
  if (!heartbeatAt) return false;
  const timestamp = heartbeatAt instanceof Date ? heartbeatAt : new Date(heartbeatAt);
  return (
    !Number.isNaN(timestamp.getTime()) &&
    now.getTime() - timestamp.getTime() >= STALE_OPPORTUNITY_RUN_AFTER_MS
  );
}

export function opportunityApiErrorMessage(error: unknown): string {
  if (error instanceof Error && error.message.trim()) return error.message;
  if (error && typeof error === "object") {
    const data = (error as { data?: unknown }).data;
    if (data && typeof data === "object") {
      const apiMessage = (data as { error?: unknown }).error;
      if (typeof apiMessage === "string" && apiMessage.trim()) {
        return apiMessage;
      }
    }
  }
  return "The opportunities API request failed.";
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
    ["Timeouts", (run as { providersTimedOut?: number }).providersTimedOut ?? 0],
  ] as const;
}
