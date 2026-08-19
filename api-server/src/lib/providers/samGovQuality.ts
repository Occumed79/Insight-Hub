export interface SamOpportunity {
  noticeId?: string;
  title?: string;
  solicitationNumber?: string;
  fullParentPathName?: string;
  type?: string;
  baseType?: string;
  active?: string;
  naicsCode?: string;
  classificationCode?: string;
  postedDate?: string;
  responseDeadLine?: string;
  archiveDate?: string;
  typeOfSetAside?: string;
  typeOfSetAsideDescription?: string;
  placeOfPerformance?: {
    city?: { name?: string };
    state?: { code?: string };
  };
  officeAddress?: { city?: string; state?: string };
  description?: string;
  uiLink?: string;
  award?: { amount?: number | string; awardee?: { name?: string } };
}

const SAM_TITLE_PROFILES = [
  {
    title: "occupational health",
    aliases: ["occupational health", "employee health"],
  },
  {
    title: "occupational medicine",
    aliases: ["occupational medicine", "occupational medical"],
  },
  {
    title: "medical surveillance",
    aliases: ["medical surveillance", "health surveillance"],
  },
  {
    title: "drug testing",
    aliases: ["drug testing", "drug screening", "alcohol testing"],
  },
  {
    title: "medical examination",
    aliases: [
      "pre-employment physical",
      "pre employment physical",
      "pre-placement physical",
      "pre placement physical",
      "dot physical",
      "medical examination",
      "physical examination",
    ],
  },
  {
    title: "fitness for duty",
    aliases: ["fitness for duty", "fit for duty", "return to work"],
  },
  {
    title: "respiratory protection",
    aliases: [
      "respirator fit",
      "fit testing",
      "respiratory protection",
      "spirometry",
      "pulmonary function",
    ],
  },
  {
    title: "hearing conservation",
    aliases: ["audiometric", "audiogram", "hearing conservation"],
  },
] as const;

const CUSTOM_QUERY_NOISE =
  /\b(?:active|bid|bids|city|contract|contracts|county|due|federal|find|government|open|opportunities|opportunity|procurement|proposal|proposals|request|rfp|rfq|services?|solicitation|state)\b/gi;
const BID_READY_TYPE_RE = /^(?:solicitation|combined synopsis\/solicitation)$/i;

export function buildSamGovTitleQueries(keywords?: string): string[] {
  const normalized = (keywords ?? "")
    .normalize("NFKD")
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, " ")
    .replace(/\s+/g, " ")
    .trim();
  if (!normalized) return [];

  const matched = SAM_TITLE_PROFILES.filter((profile) =>
    profile.aliases.some((alias) => normalized.includes(alias)),
  ).map((profile) => profile.title);
  if (matched.length > 0) return Array.from(new Set(matched)).slice(0, 4);

  const custom = normalized
    .replace(CUSTOM_QUERY_NOISE, " ")
    .replace(/\s+/g, " ")
    .trim();
  return custom.length >= 3 ? [custom.slice(0, 80)] : [];
}

/**
 * Autonomous SAM runs should never burn the daily quota on one giant generic
 * federal result set. Instead, they rotate through two high-value Occu-Med
 * service titles per run so every few runs cover the full service ontology.
 */
export function buildSamGovAutonomousTitleQueries(
  cursor = 0,
  count = 2,
): string[] {
  const titles = SAM_TITLE_PROFILES.map((profile) => profile.title);
  if (titles.length === 0) return [];
  const normalizedCursor = ((Math.floor(cursor) % titles.length) + titles.length) % titles.length;
  const take = Math.max(1, Math.min(Math.floor(count), titles.length));
  return Array.from({ length: take }, (_, offset) =>
    titles[(normalizedCursor + offset) % titles.length]!,
  );
}

export function isBidReadySamOpportunity(
  opportunity: SamOpportunity,
  now = new Date(),
): boolean {
  if (String(opportunity.active ?? "").toLowerCase() !== "yes") return false;
  if (!BID_READY_TYPE_RE.test(opportunity.type ?? opportunity.baseType ?? "")) {
    return false;
  }
  if (
    opportunity.award?.amount != null ||
    opportunity.award?.awardee?.name?.trim()
  ) {
    return false;
  }
  const deadline = opportunity.responseDeadLine
    ? new Date(opportunity.responseDeadLine)
    : null;
  if (!deadline || Number.isNaN(deadline.getTime())) return false;
  return deadline.getTime() > now.getTime();
}
