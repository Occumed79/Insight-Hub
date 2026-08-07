import { createHash } from "node:crypto";
import { eq } from "drizzle-orm";
import { rfpDb, rfpPool, settingsTable } from "@workspace/db";
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
  gradesByOpportunity: Record<string, FeedbackGrade>;
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
    return raw
      .split(/[,;|]/)
      .map((value) => value.trim())
      .filter(Boolean);
  }
}

function serviceScopes(text: string): string[] {
  const scopes: string[] = [];
  const checks: Array<[string, RegExp]> = [
    [
      "occupational-health",
      /occupational health|occupational medicine|employee health|workforce health/i,
    ],
    [
      "medical-exams",
      /medical exam|physical exam|pre-employment|pre placement|fitness for duty|deployment medical/i,
    ],
    [
      "drug-alcohol",
      /drug test|drug screen|alcohol test|urine drug|substance testing/i,
    ],
    ["audiometry", /audiogram|audiometric|hearing conservation|hearing test/i],
    ["respiratory", /spirometry|pulmonary function|respirator|fit testing|pft\b/i],
    [
      "vaccines-labs",
      /vaccin|immuniz|titer|tuberculosis|tb test|laboratory testing/i,
    ],
    ["surveillance", /medical surveillance|health surveillance|hazmat|bloodborne/i],
    [
      "provider-network",
      /provider network|clinic network|medical network|network management/i,
    ],
  ];
  for (const [scope, pattern] of checks) {
    if (pattern.test(text)) scopes.push(scope);
  }
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
  const agency = normalizeQueryContext(opportunity.agency)
    ?.split(" ")
    .slice(0, 4)
    .join(" ");
  if (scopes.length) {
    return `scope:${scopes.sort().join("+")}${agency ? ` agency:${agency}` : ""}`;
  }

  const fallback = normalizeQueryContext(
    `${opportunity.title ?? ""} ${opportunity.naicsCode ?? ""}`,
  );
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
    gradesByOpportunity: {},
    agencies: {},
    naics: {},
    tags: {},
    keywords: {},
    updatedAt: new Date(0).toISOString(),
  };
}

function parseState(
  context: string,
  raw: string | undefined,
): ContextSignalState {
  if (!raw) return blank(context);
  try {
    const parsed = JSON.parse(raw) as Partial<ContextSignalState>;
    return {
      ...blank(context),
      ...parsed,
      context,
      contextHash: contextHash(context),
      gradesByOpportunity:
        parsed.gradesByOpportunity &&
        typeof parsed.gradesByOpportunity === "object" &&
        !Array.isArray(parsed.gradesByOpportunity)
          ? (parsed.gradesByOpportunity as Record<string, FeedbackGrade>)
          : {},
    };
  } catch {
    return blank(context);
  }
}

async function load(context: string): Promise<ContextSignalState> {
  const hash = contextHash(context);
  try {
    const [row] = await rfpDb
      .select({ value: settingsTable.value })
      .from(settingsTable)
      .where(eq(settingsTable.key, `${PREFIX}${hash}`))
      .limit(1);
    return parseState(context, row?.value);
  } catch {
    return blank(context);
  }
}

function add(map: Record<string, number>, key: unknown, weight: number): void {
  const normalized = String(key ?? "").trim().toLowerCase();
  if (!normalized) return;
  const next = (map[normalized] ?? 0) + weight;
  if (Math.abs(next) < 0.000001) delete map[normalized];
  else map[normalized] = next;
}

function keywordSignals(opportunity: OpportunityLike): string[] {
  return Array.from(
    new Set(
      words(`${opportunity.title ?? ""} ${opportunity.description ?? ""}`),
    ),
  ).slice(0, 40);
}

function applyContribution(
  state: ContextSignalState,
  opportunity: OpportunityLike,
  weight: number,
): void {
  add(state.agencies, opportunity.agency, weight);
  add(state.naics, opportunity.naicsCode, weight);
  for (const tag of parseTags(opportunity.tags)) add(state.tags, tag, weight);
  for (const keyword of keywordSignals(opportunity)) {
    add(state.keywords, keyword, weight);
  }
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
  const hash = contextHash(context);
  const key = `${PREFIX}${hash}`;
  const client = await rfpPool.connect();

  try {
    await client.query("BEGIN");
    // Context feedback is a JSON aggregate. Serialize read/modify/write across
    // requests and API instances so simultaneous grades cannot overwrite one
    // another and re-grading a card replaces, rather than duplicates, its vote.
    await client.query("SELECT pg_advisory_xact_lock(hashtext($1))", [key]);
    const result = await client.query<{ value: string }>(
      "SELECT value FROM settings WHERE key = $1 FOR UPDATE",
      [key],
    );
    const state = parseState(context, result.rows[0]?.value);
    const previousGrade = state.gradesByOpportunity[opportunityId];

    if (previousGrade) {
      applyContribution(state, opportunity, -GRADE_WEIGHT[previousGrade]);
    } else {
      state.grades += 1;
    }
    applyContribution(state, opportunity, GRADE_WEIGHT[grade]);
    state.gradesByOpportunity[opportunityId] = grade;
    state.updatedAt = new Date().toISOString();

    await client.query(
      `INSERT INTO settings (key, value)
       VALUES ($1, $2)
       ON CONFLICT (key) DO UPDATE SET value = EXCLUDED.value`,
      [key, JSON.stringify(state)],
    );
    await client.query("COMMIT");
    return { context, contextHash: hash };
  } catch (error) {
    await client.query("ROLLBACK").catch(() => undefined);
    throw error;
  } finally {
    client.release();
  }
}

function adjustmentFor(
  opportunity: OpportunityLike,
  state: ContextSignalState,
): number {
  if (state.grades === 0) return 0;
  let score = 0;
  const agency = String(opportunity.agency ?? "")
    .trim()
    .toLowerCase();
  const naics = String(opportunity.naicsCode ?? "")
    .trim()
    .toLowerCase();
  if (agency && state.agencies[agency] != null) {
    score += state.agencies[agency] * 5;
  }
  if (naics && state.naics[naics] != null) score += state.naics[naics] * 4;
  for (const tag of parseTags(opportunity.tags)) {
    const value = state.tags[tag.toLowerCase()];
    if (value != null) score += value * 2;
  }
  for (const keyword of keywordSignals(opportunity)) {
    const value = state.keywords[keyword];
    if (value != null) score += value;
  }
  return Math.max(
    -MAX_ADJUSTMENT,
    Math.min(MAX_ADJUSTMENT, Math.round(score)),
  );
}

export async function contextualAdjustments(
  opportunities: OpportunityLike[],
  explicitContext?: string | null,
): Promise<
  Map<string, { adjustment: number; context: string; contextHash: string }>
> {
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

  const result = new Map<
    string,
    { adjustment: number; context: string; contextHash: string }
  >();
  for (const opportunity of opportunities) {
    const context = deriveOpportunityContext(opportunity, explicitContext);
    const hash = contextHash(context);
    result.set(String(opportunity.id), {
      adjustment: adjustmentFor(
        opportunity,
        states.get(hash) ?? blank(context),
      ),
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
