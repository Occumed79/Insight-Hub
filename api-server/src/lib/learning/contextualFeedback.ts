import { createHash } from "node:crypto";
import { eq } from "drizzle-orm";
import { rfpDb, settingsTable } from "@workspace/db";
import { opportunitiesTable } from "@workspace/db/schema";
import type { FeedbackGrade } from "./feedbackModel";

const PREFIX = "feedback-context:v1:";
const MAX_ADJUSTMENT = 20;
const GRADE_WEIGHT: Record<FeedbackGrade, number> = {
  excellent: 2,
  good: 1,
  poor: -1,
  spam: -2,
};

const STOPWORDS = new Set([
  "the",
  "and",
  "for",
  "with",
  "from",
  "services",
  "service",
  "contract",
  "solicitation",
  "rfp",
  "request",
  "federal",
  "government",
]);

export interface ContextSignalState {
  context: string;
  contextHash: string;
  grades: number;
  agencies: Record<string, number>;
  naics: Record<string, number>;
  tags: Record<string, number>;
  keywords: Record<string, number>;
  updatedAt: string;
}

type OpportunityLike = Record<string, any>;

function words(value: unknown): string[] {
  return String(value ?? "")
    .toLowerCase()
    .replace(/[^a-z0-9\s-]/g, " ")
    .split(/\s+/)
    .map((word) => word.trim())
    .filter((word) => word.length >= 3 && !STOPWORDS.has(word));
}

export function normalizeQueryContext(value: unknown): string | null {
  const tokens = Array.from(new Set(words(value))).slice(0, 18);
  return tokens.length ? tokens.join(" ") : null;
}

function parseTags(raw: unknown): string[] {
  if (Array.isArray(raw)) return raw.map(String);
  if (typeof raw !== "string" || !raw.trim()) return [];
  try {
    const parsed = JSON.parse(raw);
    return Array.isArray(parsed) ? parsed.map(String) : [];
  } catch {
    return raw.split(/[,;|]/).map((value) => value.trim()).filter(Boolean);
  }
}

function serviceScopes(text: string): string[] {
  const scopes: string[] = [];
  const checks: Array<[string, RegExp]> = [
    ["occupational-health", /occupational health|occupational medicine|employee health|workforce health/i],
    ["medical-exams", /medical exam|physical exam|pre-employment|pre placement|fitness for duty|deployment medical/i],
    ["drug-alcohol", /drug test|drug screen|alcohol test|urine drug|substance testing/i],
    ["audiometry", /audiogram|audiometric|hearing conservation|hearing test/i],
    ["respiratory", /spirometry|pulmonary function|respirator|fit testing|pft\b/i],
    ["vaccines-labs", /vaccin|immuniz|titer|tuberculosis|tb test|laboratory testing/i],
    ["surveillance", /medical surveillance|health surveillance|hazmat|bloodborne/i],
    ["provider-network", /provider network|clinic network|medical network|network management/i],
  ];
  for (const [scope, pattern] of checks) if (pattern.test(text)) scopes.push(scope);
  return scopes;
}

export function deriveOpportunityContext(
  opportunity: OpportunityLike,
  explicitContext?: string | null,
): string {
  const explicit = normalizeQueryContext(explicitContext);
  if (explicit) return `query:${explicit}`;

  const text = [
    opportunity.title,
    opportunity.description,
    opportunity.naicsDescription,
    parseTags(opportunity.tags).join(" "),
  ]
    .filter(Boolean)
    .join(" ");
  const scopes = serviceScopes(text);
  const agency = normalizeQueryContext(opportunity.agency)?.split(" ").slice(0, 4).join(" ");
  if (scopes.length) return `scope:${scopes.sort().join("+")}${agency ? ` agency:${agency}` : ""}`;

  const fallback = normalizeQueryContext(`${opportunity.title ?? ""} ${opportunity.naicsCode ?? ""}`);
  return `scope:${fallback ?? "general-occupational-health"}`;
}

export function contextHash(context: string): string {
  return createHash("sha256").update(context).digest("hex").slice(0, 16);
}

function blank(context: string): ContextSignalState {
  return {
    context,
    contextHash: contextHash(context),
    grades: 0,
    agencies: {},
    naics: {},
    tags: {},
    keywords: {},
    updatedAt: new Date(0).toISOString(),
  };
}

async function load(context: string): Promise<ContextSignalState> {
  const hash = contextHash(context);
  try {
    const [row] = await rfpDb
      .select({ value: settingsTable.value })
      .from(settingsTable)
      .where(eq(settingsTable.key, `${PREFIX}${hash}`))
      .limit(1);
    if (!row?.value) return blank(context);
    const parsed = JSON.parse(row.value) as Partial<ContextSignalState>;
    return { ...blank(context), ...parsed, context, contextHash: hash };
  } catch {
    return blank(context);
  }
}

async function save(state: ContextSignalState): Promise<void> {
  await rfpDb
    .insert(settingsTable)
    .values({ key: `${PREFIX}${state.contextHash}`, value: JSON.stringify(state) })
    .onConflictDoUpdate({
      target: settingsTable.key,
      set: { value: JSON.stringify(state) },
    });
}

function add(map: Record<string, number>, key: unknown, weight: number): void {
  const normalized = String(key ?? "").trim().toLowerCase();
  if (!normalized) return;
  map[normalized] = (map[normalized] ?? 0) + weight;
}

function keywordSignals(opportunity: OpportunityLike): string[] {
  return Array.from(
    new Set(words(`${opportunity.title ?? ""} ${opportunity.description ?? ""}`)),
  ).slice(0, 40);
}

export async function recordContextFeedback(
  opportunityId: string,
  grade: FeedbackGrade,
  explicitContext?: string | null,
): Promise<{ context: string; contextHash: string }> {
  const [opportunity] = await rfpDb
    .select()
    .from(opportunitiesTable)
    .where(eq(opportunitiesTable.id, opportunityId))
    .limit(1);
  if (!opportunity) throw new Error(`Opportunity ${opportunityId} not found`);

  const context = deriveOpportunityContext(opportunity, explicitContext);
  const state = await load(context);
  const weight = GRADE_WEIGHT[grade];
  state.grades += 1;
  add(state.agencies, opportunity.agency, weight);
  add(state.naics, opportunity.naicsCode, weight);
  for (const tag of parseTags(opportunity.tags)) add(state.tags, tag, weight);
  for (const keyword of keywordSignals(opportunity)) add(state.keywords, keyword, weight);
  state.updatedAt = new Date().toISOString();
  await save(state);
  return { context, contextHash: state.contextHash };
}

function adjustmentFor(opportunity: OpportunityLike, state: ContextSignalState): number {
  if (state.grades === 0) return 0;
  let score = 0;
  const agency = String(opportunity.agency ?? "").trim().toLowerCase();
  const naics = String(opportunity.naicsCode ?? "").trim().toLowerCase();
  if (agency && state.agencies[agency] != null) score += state.agencies[agency] * 5;
  if (naics && state.naics[naics] != null) score += state.naics[naics] * 4;
  for (const tag of parseTags(opportunity.tags)) {
    const value = state.tags[tag.toLowerCase()];
    if (value != null) score += value * 2;
  }
  for (const keyword of keywordSignals(opportunity)) {
    const value = state.keywords[keyword];
    if (value != null) score += value;
  }
  return Math.max(-MAX_ADJUSTMENT, Math.min(MAX_ADJUSTMENT, Math.round(score)));
}

export async function contextualAdjustments(
  opportunities: OpportunityLike[],
  explicitContext?: string | null,
): Promise<Map<string, { adjustment: number; context: string; contextHash: string }>> {
  const contexts = new Map<string, string>();
  for (const opportunity of opportunities) {
    const context = deriveOpportunityContext(opportunity, explicitContext);
    contexts.set(contextHash(context), context);
  }
  const states = new Map<string, ContextSignalState>();
  await Promise.all(
    Array.from(contexts.entries()).map(async ([hash, context]) => {
      states.set(hash, await load(context));
    }),
  );

  const result = new Map<string, { adjustment: number; context: string; contextHash: string }>();
  for (const opportunity of opportunities) {
    const context = deriveOpportunityContext(opportunity, explicitContext);
    const hash = contextHash(context);
    result.set(String(opportunity.id), {
      adjustment: adjustmentFor(opportunity, states.get(hash) ?? blank(context)),
      context,
      contextHash: hash,
    });
  }
  return result;
}

export async function contextualFeedbackSummary(context?: string | null) {
  const normalized = normalizeQueryContext(context);
  if (!normalized) return { context: null, state: null };
  const resolved = `query:${normalized}`;
  return { context: resolved, state: await load(resolved) };
}
