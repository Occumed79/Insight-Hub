import type { NormalizedOpportunity } from "../providers/types";

const CLOSED_STATUS = /\b(?:archived|awarded|cancelled|canceled|closed|complete|completed|expired|inactive|terminated|withdrawn)\b/i;
const DEFAULT_GRACE_MS = 2 * 60 * 60 * 1000;
const DATE_ONLY_WINDOW_MS = 24 * 60 * 60 * 1000 - 1;

export interface OpportunityExpirationDecision {
  expired: boolean;
  reason?: "archived_status" | "closed_source_status" | "past_deadline";
  effectiveDeadline?: Date;
}

export interface OpportunityExpirationFilterResult {
  records: NormalizedOpportunity[];
  expiredSkipped: number;
  reasons: Record<string, number>;
}

function sourceStatus(record: NormalizedOpportunity): string {
  const raw = record.rawData ?? {};
  return [
    record.status,
    raw.status,
    raw.listingStatus,
    raw.portalStatus,
    raw.opportunityStatus,
    raw.projectStatus,
    raw.bidStatus,
  ]
    .filter((value): value is string => typeof value === "string")
    .join(" ");
}

function isDateOnlyDeadline(record: NormalizedOpportunity, deadline: Date): boolean {
  const precision = record.rawData?.deadlinePrecision;
  if (precision === "date") return true;
  if (precision === "datetime" || precision === "timestamp") return false;
  return (
    deadline.getUTCHours() === 0 &&
    deadline.getUTCMinutes() === 0 &&
    deadline.getUTCSeconds() === 0 &&
    deadline.getUTCMilliseconds() === 0
  );
}

export function evaluateOpportunityExpiration(
  record: NormalizedOpportunity,
  now = new Date(),
  graceMs = DEFAULT_GRACE_MS,
): OpportunityExpirationDecision {
  if (record.status === "archived") {
    return { expired: true, reason: "archived_status" };
  }

  if (CLOSED_STATUS.test(sourceStatus(record))) {
    return { expired: true, reason: "closed_source_status" };
  }

  const deadline = record.responseDeadline;
  if (!deadline || Number.isNaN(deadline.getTime())) return { expired: false };

  const effectiveDeadline = new Date(
    deadline.getTime() +
      (isDateOnlyDeadline(record, deadline) ? DATE_ONLY_WINDOW_MS : 0) +
      Math.max(0, graceMs),
  );
  if (effectiveDeadline.getTime() < now.getTime()) {
    return { expired: true, reason: "past_deadline", effectiveDeadline };
  }
  return { expired: false, effectiveDeadline };
}

export function shouldFetchOpportunityDetail(
  input: Pick<NormalizedOpportunity, "status" | "responseDeadline" | "rawData">,
  now = new Date(),
): boolean {
  const placeholder: NormalizedOpportunity = {
    externalId: "expiration-check",
    title: "Expiration check",
    agency: "Unknown",
    type: "Solicitation",
    status: input.status,
    postedDate: new Date(0),
    responseDeadline: input.responseDeadline,
    source: "publicPortalProviders",
    rawData: input.rawData,
  };
  return !evaluateOpportunityExpiration(placeholder, now).expired;
}

export function filterExpiredOpportunities(
  records: readonly NormalizedOpportunity[],
  now = new Date(),
): OpportunityExpirationFilterResult {
  const kept: NormalizedOpportunity[] = [];
  const reasons: Record<string, number> = {};

  for (const record of records) {
    const decision = evaluateOpportunityExpiration(record, now);
    if (!decision.expired) {
      kept.push(record);
      continue;
    }
    const reason = decision.reason ?? "expired";
    reasons[reason] = (reasons[reason] ?? 0) + 1;
  }

  return {
    records: kept,
    expiredSkipped: records.length - kept.length,
    reasons,
  };
}
