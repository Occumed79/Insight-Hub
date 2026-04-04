import { db } from "@workspace/db";
import { opportunitiesTable } from "@workspace/db/schema";
import { eq } from "drizzle-orm";
import { randomUUID } from "crypto";

export async function importFromCsv(
  csvContent: string
): Promise<{ imported: number; skipped: number; errors: string[] }> {
  const lines = csvContent.split(/\r?\n/).filter((l) => l.trim());
  if (lines.length < 2) {
    return { imported: 0, skipped: 0, errors: ["CSV file is empty or has no data rows"] };
  }

  const headers = parseCsvRow(lines[0]).map((h) => h.trim().toLowerCase());
  let imported = 0;
  let skipped = 0;
  const errors: string[] = [];

  for (let i = 1; i < lines.length; i++) {
    const row = parseCsvRow(lines[i]);
    const data: Record<string, string> = {};
    headers.forEach((h, idx) => {
      data[h] = row[idx]?.trim() ?? "";
    });

    const title = data["title"] || data["opportunity title"] || data["name"];
    if (!title) {
      errors.push(`Row ${i + 1}: missing title`);
      skipped++;
      continue;
    }

    const agency =
      data["agency"] ||
      data["department/ind. agency"] ||
      data["organization"] ||
      "Unknown Agency";

    const noticeId = data["notice id"] || data["noticeid"] || null;

    if (noticeId) {
      const existing = await db
        .select()
        .from(opportunitiesTable)
        .where(eq(opportunitiesTable.noticeId, noticeId));
      if (existing.length > 0) {
        skipped++;
        continue;
      }
    }

    try {
      await db.insert(opportunitiesTable).values({
        id: randomUUID(),
        noticeId: noticeId ?? undefined,
        title,
        agency,
        subAgency: data["sub-agency"] || data["subagency"] || null,
        type: data["type"] || data["opportunity type"] || data["notice type"] || "Solicitation",
        status: "active",
        naicsCode: data["naics code"] || data["naics"] || null,
        postedDate: parseDate(data["posted date"] || data["posteddate"]) ?? new Date(),
        responseDeadline: parseDate(data["response deadline"] || data["response date"] || data["deadline"]),
        setAside: data["set aside"] || data["setaside"] || null,
        placeOfPerformance: data["place of performance"] || data["location"] || null,
        description: data["description"] || null,
        solicitationNumber: data["solicitation number"] || data["sol number"] || null,
        samUrl: data["url"] || data["link"] || data["sam url"] || null,
        source: "csv_import",
        createdAt: new Date(),
        updatedAt: new Date(),
      });
      imported++;
    } catch (err) {
      errors.push(`Row ${i + 1}: ${String(err)}`);
      skipped++;
    }
  }

  return { imported, skipped, errors };
}

function parseCsvRow(line: string): string[] {
  const result: string[] = [];
  let current = "";
  let inQuotes = false;

  for (let i = 0; i < line.length; i++) {
    const char = line[i];
    if (char === '"') {
      if (inQuotes && line[i + 1] === '"') {
        current += '"';
        i++;
      } else {
        inQuotes = !inQuotes;
      }
    } else if (char === "," && !inQuotes) {
      result.push(current);
      current = "";
    } else {
      current += char;
    }
  }
  result.push(current);
  return result;
}

function parseDate(val?: string): Date | null {
  if (!val || val.trim() === "") return null;
  const d = new Date(val.trim());
  return isNaN(d.getTime()) ? null : d;
}
