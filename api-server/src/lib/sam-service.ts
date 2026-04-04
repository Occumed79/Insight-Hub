import { db } from "@workspace/db";
import { opportunitiesTable } from "@workspace/db/schema";
import { settingsTable } from "@workspace/db/schema";
import { eq } from "drizzle-orm";
import { randomUUID } from "crypto";

const SAM_GOV_BASE = "https://api.sam.gov/opportunities/v2/search";

export async function getSettingValue(key: string): Promise<string | null> {
  const rows = await db
    .select()
    .from(settingsTable)
    .where(eq(settingsTable.key, key));
  return rows[0]?.value ?? null;
}

export async function fetchFromSamGov(options: {
  keywords?: string;
  dateRange?: number;
}): Promise<{ fetched: number; created: number; updated: number; skipped: number }> {
  const apiKey = await getSettingValue("samApiKey");
  if (!apiKey) {
    throw new Error("SAM_API_KEY_NOT_CONFIGURED");
  }

  const dateRange = options.dateRange ?? 30;
  const today = new Date();
  const fromDate = new Date(today);
  fromDate.setDate(today.getDate() - dateRange);

  const formatDate = (d: Date) => {
    const mm = String(d.getMonth() + 1).padStart(2, "0");
    const dd = String(d.getDate()).padStart(2, "0");
    const yyyy = d.getFullYear();
    return `${mm}/${dd}/${yyyy}`;
  };

  const params = new URLSearchParams({
    api_key: apiKey,
    postedFrom: formatDate(fromDate),
    postedTo: formatDate(today),
    limit: "100",
    offset: "0",
  });

  if (options.keywords?.trim()) {
    params.set("keywords", options.keywords.trim());
  }

  const response = await fetch(`${SAM_GOV_BASE}?${params.toString()}`);
  if (!response.ok) {
    const text = await response.text().catch(() => "");
    throw new Error(`SAM.gov API error: ${response.status} ${text}`);
  }

  const json = (await response.json()) as {
    opportunitiesData?: SamOpportunity[];
    totalRecords?: number;
  };

  const opps = json.opportunitiesData ?? [];
  let created = 0;
  let updated = 0;
  let skipped = 0;

  for (const opp of opps) {
    const noticeId = opp.noticeId ?? opp.solicitationNumber ?? null;

    const existing = noticeId
      ? await db
          .select()
          .from(opportunitiesTable)
          .where(eq(opportunitiesTable.noticeId, noticeId))
      : [];

    const record = mapSamOpportunity(opp);

    if (existing.length > 0) {
      await db
        .update(opportunitiesTable)
        .set({ ...record, updatedAt: new Date() })
        .where(eq(opportunitiesTable.id, existing[0].id));
      updated++;
    } else {
      await db.insert(opportunitiesTable).values({
        ...record,
        id: randomUUID(),
        noticeId: noticeId ?? undefined,
        source: "sam_gov",
        createdAt: new Date(),
        updatedAt: new Date(),
      });
      created++;
    }
  }

  return { fetched: opps.length, created, updated, skipped };
}

interface SamOpportunity {
  noticeId?: string;
  title?: string;
  solicitationNumber?: string;
  fullParentPathName?: string;
  organizationHierarchy?: { name?: string }[];
  type?: string;
  baseType?: string;
  active?: string;
  naicsCode?: string;
  classificationCode?: string;
  postedDate?: string;
  responseDeadLine?: string;
  typeOfSetAside?: string;
  typeOfSetAsideDescription?: string;
  placeOfPerformance?: {
    city?: { name?: string };
    state?: { code?: string };
  };
  description?: string;
  uiLink?: string;
  award?: {
    amount?: number | string;
    awardee?: { name?: string };
  };
}

function mapSamOpportunity(opp: SamOpportunity) {
  const agencyParts = (opp.fullParentPathName ?? "").split(".");
  const agency = agencyParts[0]?.trim() ?? "Unknown Agency";
  const subAgency = agencyParts[1]?.trim() ?? undefined;

  const placeCity = opp.placeOfPerformance?.city?.name ?? "";
  const placeState = opp.placeOfPerformance?.state?.code ?? "";
  const placeOfPerformance =
    [placeCity, placeState].filter(Boolean).join(", ") || undefined;

  const awardAmount = opp.award?.amount
    ? parseFloat(String(opp.award.amount))
    : undefined;

  return {
    title: opp.title ?? "Untitled",
    agency,
    subAgency: subAgency ?? null,
    type: opp.type ?? opp.baseType ?? "Solicitation",
    status: (opp.active === "Yes" ? "active" : "archived") as "active" | "archived",
    naicsCode: opp.naicsCode ?? null,
    naicsDescription: null,
    postedDate: opp.postedDate ? new Date(opp.postedDate) : new Date(),
    responseDeadline: opp.responseDeadLine ? new Date(opp.responseDeadLine) : null,
    setAside: opp.typeOfSetAsideDescription ?? opp.typeOfSetAside ?? null,
    placeOfPerformance: placeOfPerformance ?? null,
    description: opp.description ?? null,
    solicitationNumber: opp.solicitationNumber ?? null,
    samUrl: opp.uiLink ?? null,
    awardAmount: awardAmount ? String(awardAmount) : null,
    awardee: opp.award?.awardee?.name ?? null,
  };
}
