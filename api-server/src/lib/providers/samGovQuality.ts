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
    title: "pre-employment physical",
    aliases: [
      "pre-employment physical",
      "pre employment physical",
      "pre-placement physical",
      "pre placement physical",
      "dot physical",
      "medical examination",
    ],
  },
  {
    title: "fitness for duty",
    aliases: ["fitness for duty", "fit for duty", "return to work"],
  },
  {
    title: "respirator fit testing",
    aliases: ["respirator fit", "fit testing", "spirometry"],
  },
  {
    title: "audiometric testing",
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
  if (!normalized) return SAM_TITLE_PROFILES.map((profile) => profile.title);

  const matched = SAM_TITLE_PROFILES.filter((profile) =>
    profile.aliases.some((alias) => normalized.includes(alias)),
  ).map((profile) => profile.title);
  if (matched.length > 0) return Array.from(new Set(matched)).slice(0, 4);

  const custom = normalized
    .replace(CUSTOM_QUERY_NOISE, " ")
    .replace(/\s+/g, " ")
    .trim();
  return custom.length >= 3
    ? [custom.slice(0, 80)]
    : SAM_TITLE_PROFILES.map((profile) => profile.title);
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
