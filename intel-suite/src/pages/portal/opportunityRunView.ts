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

const REJECTION_METRIC_LABELS: Record<string, string> = {
  missing_occumed_service_evidence: "Reject: No Occu-Med evidence",
  missing_procurement_signal: "Reject: No procurement signal",
  hard_reject: "Reject: Hard-reject wording",
  conditional_false_positive: "Reject: False-positive context",
  insufficient_evidence_combination: "Reject: Weak evidence mix",
  blocked_domain: "Reject: Blocked domain",
  invalid_title: "Reject: Invalid title",
  missing_agency: "Reject: Missing agency",
  invalid_posted_date: "Reject: Invalid posted date",
  legacy_relevance_filter: "Reject: Legacy relevance rule",
};

function compactSampleTitle(value: string | null | undefined): string {
  const title = value?.replace(/\s+/g, " ").trim() || "Untitled rejected record";
  return title.length > 56 ? `${title.slice(0, 53)}...` : title;
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
  providersTimedOut?: number;
  rejectionDiagnostics?: {
    reasons?: Array<{
      code: string;
      label: string;
      count: number;
    }>;
    samples?: Array<{
      title?: string | null;
      provider?: string;
      reasonLabel?: string;
    }>;
  };
}) {
  const coreMetrics = [
    ["Fetched", run.fetched],
    ["Staged", run.staged],
    ["Accepted", run.accepted],
    ["Rejected", run.rejected],
    ["Duplicates", run.duplicates],
    ["Created", run.created],
    ["Updated", run.updated],
    ["Archived", run.archived],
    ["Errors", run.providerErrors?.length ?? 0],
    ["Timeouts", run.providersTimedOut ?? 0],
  ] as Array<readonly [string, string | number]>;
  const rejectionMetrics = (run.rejectionDiagnostics?.reasons ?? [])
    .filter((reason) => reason.count > 0)
    .slice(0, 3)
    .map(
      (reason) =>
        [
          REJECTION_METRIC_LABELS[reason.code] ?? `Reject: ${reason.label}`,
          reason.count,
        ] as const,
    );
  const sampleMetrics = (run.rejectionDiagnostics?.samples ?? [])
    .slice(0, 3)
    .map(
      (sample) =>
        [
          `Sample · ${sample.reasonLabel ?? "Rejected"}${sample.provider ? ` · ${sample.provider}` : ""}`,
          compactSampleTitle(sample.title),
        ] as const,
    );
  return [...coreMetrics, ...rejectionMetrics, ...sampleMetrics] as const;
}
