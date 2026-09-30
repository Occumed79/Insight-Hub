/**
 * Occu-Med prompt context for the AI judges and extractors.
 *
 * Until now the judge/extractor prompts carried their own hard-coded idea of
 * what Occu-Med wants, while the maintained Occu-Med reference profile
 * (OCCU_MED_AWARE: rules, agent policies, RFP phrases, NAICS/PSC, capabilities)
 * was only used for a one-paragraph ranking string. This module turns the live
 * profile into prompt text so the profile is the source of truth, and adds real
 * examples the Occu-Med team graded as good or bad.
 *
 * Everything here is best-effort: on any failure it returns empty strings and
 * the prompts fall back to their built-in text.
 */
import { desc, inArray, isNotNull, and } from "drizzle-orm";
import { opportunitiesTable, rfpDb } from "@workspace/db";
import type { OccuMedReferenceModel } from "../occumedAware/types";

export interface OccuMedPromptContext {
  /** Authoritative profile block, or "" when the live profile is unavailable. */
  profileBlock: string;
  /** Team-graded good/bad examples, or "" when none exist. */
  examplesBlock: string;
  profileLoaded: boolean;
}

const EMPTY: OccuMedPromptContext = {
  profileBlock: "",
  examplesBlock: "",
  profileLoaded: false,
};

const CACHE_TTL_MS = 10 * 60_000;
const LOAD_TIMEOUT_MS = 3_000;
const MAX_RULES = 20;
const MAX_POLICIES = 12;
const MAX_DIRECT_PHRASES = 25;
const MAX_REVIEW_PHRASES = 15;
const MAX_GOOD_EXAMPLES = 6;
const MAX_BAD_EXAMPLES = 8;

function clip(text: string | null | undefined, max: number): string {
  const cleaned = (text ?? "").replace(/\s+/g, " ").trim();
  return cleaned.length > max ? `${cleaned.slice(0, max - 1)}…` : cleaned;
}

function list(label: string, values: string[], max: number): string {
  const items = values.map((value) => value.trim()).filter(Boolean).slice(0, max);
  return items.length > 0 ? `${label}: ${items.join("; ")}` : "";
}

/** Pure: render the reference model into prompt text. Exported for tests. */
export function buildProfileBlock(ref: OccuMedReferenceModel): string {
  if (!ref.awareLoaded) return "";
  const rules = ref.hardRules
    .slice(0, MAX_RULES)
    .map((rule) => `- ${clip(rule.title, 80)}: ${clip(rule.rule_text, 240)}`);
  const policies = ref.agentPolicies
    .filter((policy) => policy.must_follow)
    .slice(0, MAX_POLICIES)
    .map((policy) => `- ${clip(policy.title, 80)}: ${clip(policy.instruction, 240)}`);

  const lines = [
    "OCCU-MED REFERENCE PROFILE (authoritative; if it conflicts with the generic rules below, follow the profile):",
    `Company: ${ref.legalName}${ref.dba && ref.dba !== ref.legalName ? ` (dba ${ref.dba})` : ""}.`,
    list("Services", ref.promptServiceList, 18),
    list("Documented capabilities", ref.documentedCapabilities, 20),
    list("Capabilities Occu-Med can arrange through its provider network", ref.arrangeableCapabilities, 20),
    list("Registered NAICS", [ref.primaryNaics, ...ref.additionalNaics], 20),
    list("Product/service codes", ref.productServiceCodes, 20),
    list("Phrases that directly indicate a relevant procurement", ref.rfpDirectPhrases, MAX_DIRECT_PHRASES),
    list("Phrases that need review before counting as relevant", ref.rfpReviewPhrases, MAX_REVIEW_PHRASES),
    list("Regulatory and standards references", ref.rfpRegulatoryRefs, 15),
    ref.workersCompInstruction ? `Workers' compensation: ${clip(ref.workersCompInstruction, 500)}` : "",
    ref.imeInstruction ? `IME: ${clip(ref.imeInstruction, 400)}` : "",
    rules.length > 0 ? `HARD RULES:\n${rules.join("\n")}` : "",
    policies.length > 0 ? `POLICIES YOU MUST FOLLOW:\n${policies.join("\n")}` : "",
  ];
  return lines.filter(Boolean).join("\n");
}

export interface GradedExample {
  title: string;
  agency: string;
  grade: string;
}

/** Pure: render team-graded examples. Exported for tests. */
export function buildExamplesBlock(examples: GradedExample[]): string {
  const good = examples
    .filter((example) => example.grade === "excellent" || example.grade === "good")
    .slice(0, MAX_GOOD_EXAMPLES);
  const bad = examples
    .filter((example) => example.grade === "poor" || example.grade === "spam")
    .slice(0, MAX_BAD_EXAMPLES);
  if (good.length === 0 && bad.length === 0) return "";
  const fmt = (example: GradedExample) =>
    `- "${clip(example.title, 110)}" (${clip(example.agency, 50)})`;
  return [
    "EXAMPLES GRADED BY THE OCCU-MED TEAM (learn the pattern; do not copy the wording):",
    good.length > 0 ? `Relevant, wanted:\n${good.map(fmt).join("\n")}` : "",
    bad.length > 0 ? `Not relevant, unwanted:\n${bad.map(fmt).join("\n")}` : "",
  ]
    .filter(Boolean)
    .join("\n");
}

async function withTimeout<T>(promise: Promise<T>, ms: number): Promise<T> {
  let timer: NodeJS.Timeout | undefined;
  try {
    return await Promise.race([
      promise,
      new Promise<never>((_, reject) => {
        timer = setTimeout(() => reject(new Error("timed out")), ms);
      }),
    ]);
  } finally {
    if (timer) clearTimeout(timer);
  }
}

async function loadGradedExamples(): Promise<GradedExample[]> {
  const rows = await rfpDb
    .select({
      title: opportunitiesTable.title,
      agency: opportunitiesTable.agency,
      grade: opportunitiesTable.userGrade,
    })
    .from(opportunitiesTable)
    .where(
      and(
        isNotNull(opportunitiesTable.userGrade),
        inArray(opportunitiesTable.userGrade, ["excellent", "good", "poor", "spam"]),
      ),
    )
    .orderBy(desc(opportunitiesTable.updatedAt))
    .limit(60);
  return rows.flatMap((row) =>
    row.grade ? [{ title: row.title, agency: row.agency, grade: row.grade }] : [],
  );
}

let cached: { value: OccuMedPromptContext; expiresAt: number } | null = null;
let inflight: Promise<OccuMedPromptContext> | null = null;

async function loadContext(): Promise<OccuMedPromptContext> {
  const [profile, examples] = await Promise.allSettled([
    withTimeout(
      import("../occumedAware/index").then((module) => module.getOccuMedReference()),
      LOAD_TIMEOUT_MS,
    ),
    withTimeout(loadGradedExamples(), LOAD_TIMEOUT_MS),
  ]);
  const profileBlock = profile.status === "fulfilled" ? buildProfileBlock(profile.value) : "";
  const examplesBlock =
    examples.status === "fulfilled" ? buildExamplesBlock(examples.value) : "";
  return { profileBlock, examplesBlock, profileLoaded: profileBlock.length > 0 };
}

export async function getOccuMedPromptContext(): Promise<OccuMedPromptContext> {
  const now = Date.now();
  if (cached && now < cached.expiresAt) return cached.value;
  if (!inflight) {
    inflight = loadContext()
      .then((value) => {
        // Do not cache a total miss for long; retry sooner.
        cached = {
          value,
          expiresAt: Date.now() + (value.profileLoaded || value.examplesBlock ? CACHE_TTL_MS : 60_000),
        };
        return value;
      })
      .catch(() => cached?.value ?? EMPTY)
      .finally(() => {
        inflight = null;
      });
  }
  return inflight;
}

export function clearOccuMedPromptContextCache(): void {
  cached = null;
  inflight = null;
}

/** Joins the non-empty context blocks for insertion into a prompt. */
export function renderPromptContext(context: OccuMedPromptContext): string {
  return [context.profileBlock, context.examplesBlock].filter(Boolean).join("\n\n");
}
