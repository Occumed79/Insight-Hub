import { createHash, randomUUID } from "crypto";
import { and, eq, or } from "drizzle-orm";
import { db } from "@workspace/db";
import { opportunitiesTable } from "@workspace/db/schema";

const UNKNOWN_POSTED_DATE = new Date(0);
const CSV_PROVIDER_KEY = "csvImport";

interface CsvImportOptions {
  filename?: string;
  batchId?: string;
}

interface ParsedCsvRow {
  values: string[];
  lineNumber: number;
}

export interface CsvImportResult {
  imported: number;
  skipped: number;
  errors: string[];
  batchId: string;
  filename?: string;
}

export async function importFromCsv(
  csvContent: string,
  options: CsvImportOptions = {},
): Promise<CsvImportResult> {
  const batchId = options.batchId?.trim() || randomUUID();
  const filename = sanitizeFilename(options.filename);
  const parsed = parseCsvDocument(csvContent);

  if (parsed.rows.length < 2) {
    return {
      imported: 0,
      skipped: 0,
      errors: [...parsed.errors, "CSV file is empty or has no data rows"],
      batchId,
      filename,
    };
  }

  const headerRow = parsed.rows[0];
  const headers = headerRow.values.map(normalizeHeader);
  const duplicateHeaders = headers.filter(
    (header, index) => header && headers.indexOf(header) !== index,
  );
  if (duplicateHeaders.length > 0) {
    parsed.errors.push(
      `Header row contains duplicate columns: ${Array.from(new Set(duplicateHeaders)).join(", ")}`,
    );
  }

  let imported = 0;
  let skipped = 0;
  const errors = [...parsed.errors];

  for (const parsedRow of parsed.rows.slice(1)) {
    const row = parsedRow.values;
    if (row.every((value) => value.trim() === "")) continue;

    if (row.length !== headers.length) {
      errors.push(
        `Row beginning on line ${parsedRow.lineNumber}: expected ${headers.length} columns but found ${row.length}`,
      );
      skipped += 1;
      continue;
    }

    const data: Record<string, string> = {};
    headers.forEach((header, index) => {
      if (header) data[header] = row[index]?.trim() ?? "";
    });

    const title = firstValue(data, ["title", "opportunity title", "name"]);
    if (!title) {
      errors.push(`Row beginning on line ${parsedRow.lineNumber}: missing title`);
      skipped += 1;
      continue;
    }

    const agency =
      firstValue(data, ["agency", "department/ind. agency", "organization", "buyer"]) ||
      "Unknown Agency";
    const suppliedNoticeId = firstValue(data, ["notice id", "noticeid", "external id"]);
    const sourceUrl = canonicalizeUrl(
      firstValue(data, ["url", "link", "sam url", "source url"]),
    );
    const responseDeadline = parseDate(
      firstValue(data, ["response deadline", "response date", "deadline", "due date"]),
    );
    const solicitationNumber = firstValue(data, [
      "solicitation number",
      "sol number",
      "solicitation id",
      "rfp number",
    ]);
    const importIdentity = buildImportIdentity({
      suppliedNoticeId,
      sourceUrl,
      title,
      agency,
      solicitationNumber,
      responseDeadline,
    });

    const identityConditions = [
      and(
        eq(opportunitiesTable.providerKey, CSV_PROVIDER_KEY),
        eq(opportunitiesTable.noticeId, importIdentity),
      ),
    ];
    if (sourceUrl) identityConditions.push(eq(opportunitiesTable.samUrl, sourceUrl));

    const existing = await db
      .select({ id: opportunitiesTable.id })
      .from(opportunitiesTable)
      .where(or(...identityConditions));
    if (existing.length > 0) {
      skipped += 1;
      continue;
    }

    const parsedPostedDate = parseDate(firstValue(data, ["posted date", "posteddate", "published date"]));
    const dateUnknown = !parsedPostedDate;
    const generatedIdentity = !suppliedNoticeId;
    const tags = [
      "csv-import",
      `import-batch:${batchId}`,
      ...(filename ? [`import-file:${filename}`] : []),
      ...(dateUnknown ? ["date-unknown"] : []),
      ...(generatedIdentity ? ["generated-import-id"] : []),
    ];

    try {
      await db.insert(opportunitiesTable).values({
        id: randomUUID(),
        noticeId: importIdentity,
        title,
        agency,
        subAgency: firstValue(data, ["sub-agency", "subagency"]) || null,
        type:
          firstValue(data, ["type", "opportunity type", "notice type"]) ||
          "Solicitation",
        status: "active",
        naicsCode: firstValue(data, ["naics code", "naics"]) || null,
        postedDate: parsedPostedDate ?? UNKNOWN_POSTED_DATE,
        responseDeadline,
        setAside: firstValue(data, ["set aside", "setaside"]) || null,
        placeOfPerformance: firstValue(data, ["place of performance", "location"]) || null,
        description: firstValue(data, ["description", "summary", "scope"]) || null,
        solicitationNumber: solicitationNumber || null,
        samUrl: sourceUrl || null,
        source: "csv_import",
        providerName: CSV_PROVIDER_KEY,
        providerKey: CSV_PROVIDER_KEY,
        sourceConfidence: "medium",
        tags: JSON.stringify(tags),
        notes: buildImportNote({ filename, batchId, dateUnknown, generatedIdentity }),
        createdAt: new Date(),
        updatedAt: new Date(),
      });
      imported += 1;
    } catch (error) {
      errors.push(`Row beginning on line ${parsedRow.lineNumber}: ${errorMessage(error)}`);
      skipped += 1;
    }
  }

  return { imported, skipped, errors, batchId, filename };
}

function parseCsvDocument(content: string): { rows: ParsedCsvRow[]; errors: string[] } {
  const input = content.replace(/^\uFEFF/, "");
  const rows: ParsedCsvRow[] = [];
  const errors: string[] = [];
  let currentRow: string[] = [];
  let currentField = "";
  let inQuotes = false;
  let lineNumber = 1;
  let rowStartLine = 1;

  const finishField = () => {
    currentRow.push(currentField);
    currentField = "";
  };
  const finishRow = () => {
    finishField();
    rows.push({ values: currentRow, lineNumber: rowStartLine });
    currentRow = [];
    rowStartLine = lineNumber + 1;
  };

  for (let index = 0; index < input.length; index += 1) {
    const char = input[index];

    if (char === '"') {
      if (inQuotes && input[index + 1] === '"') {
        currentField += '"';
        index += 1;
      } else if (inQuotes) {
        inQuotes = false;
      } else if (currentField.length === 0) {
        inQuotes = true;
      } else {
        currentField += char;
      }
      continue;
    }

    if (char === "," && !inQuotes) {
      finishField();
      continue;
    }

    if ((char === "\n" || char === "\r") && !inQuotes) {
      if (char === "\r" && input[index + 1] === "\n") index += 1;
      finishRow();
      lineNumber += 1;
      continue;
    }

    if (char === "\n") lineNumber += 1;
    currentField += char;
  }

  if (inQuotes) {
    errors.push(`Unterminated quoted field beginning on or before line ${rowStartLine}`);
  }

  if (currentField.length > 0 || currentRow.length > 0) finishRow();
  return { rows, errors };
}

function normalizeHeader(value: string): string {
  return value.trim().toLowerCase().replace(/\s+/g, " ");
}

function firstValue(data: Record<string, string>, keys: string[]): string {
  for (const key of keys) {
    const value = data[key]?.trim();
    if (value) return value;
  }
  return "";
}

function buildImportIdentity(input: {
  suppliedNoticeId: string;
  sourceUrl: string;
  title: string;
  agency: string;
  solicitationNumber: string;
  responseDeadline: Date | null;
}): string {
  if (input.suppliedNoticeId) return input.suppliedNoticeId.trim();
  if (input.sourceUrl) {
    return `csv-url-${hash(input.sourceUrl).slice(0, 32)}`;
  }
  const fingerprint = [
    input.title,
    input.agency,
    input.solicitationNumber,
    input.responseDeadline?.toISOString() ?? "",
  ]
    .map((value) => value.toLowerCase().replace(/[^a-z0-9]+/g, " ").trim())
    .join("|");
  return `csv-row-${hash(fingerprint).slice(0, 32)}`;
}

function canonicalizeUrl(value: string): string {
  if (!value) return "";
  try {
    const url = new URL(value);
    url.hash = "";
    for (const key of Array.from(url.searchParams.keys())) {
      if (/^(utm_|fbclid$|gclid$)/i.test(key)) url.searchParams.delete(key);
    }
    url.searchParams.sort();
    return url.toString();
  } catch {
    return value.trim();
  }
}

function buildImportNote(input: {
  filename?: string;
  batchId: string;
  dateUnknown: boolean;
  generatedIdentity: boolean;
}): string {
  const parts = [
    `Imported from CSV${input.filename ? ` file ${input.filename}` : ""}.`,
    `Import batch: ${input.batchId}.`,
  ];
  if (input.dateUnknown) parts.push("Posted date was not supplied and remains unknown.");
  if (input.generatedIdentity) parts.push("A stable import identity was generated because no notice ID was supplied.");
  return parts.join(" ");
}

function sanitizeFilename(value?: string): string | undefined {
  const filename = value?.trim().replace(/[\r\n\t]/g, " ").slice(0, 180);
  return filename || undefined;
}

function parseDate(value?: string): Date | null {
  if (!value?.trim()) return null;
  const date = new Date(value.trim());
  return Number.isNaN(date.getTime()) ? null : date;
}

function hash(value: string): string {
  return createHash("sha256").update(value).digest("hex");
}

function errorMessage(error: unknown): string {
  return error instanceof Error ? error.message : String(error);
}
