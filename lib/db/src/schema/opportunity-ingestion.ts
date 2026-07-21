import { sql } from "drizzle-orm";
import {
  index,
  integer,
  jsonb,
  numeric,
  pgEnum,
  pgTable,
  text,
  timestamp,
  uniqueIndex,
} from "drizzle-orm/pg-core";
import { opportunitiesTable } from "./opportunities";

export const opportunityIngestionRunStatusEnum = pgEnum(
  "opportunity_ingestion_run_status",
  ["queued", "running", "completed", "completed_with_errors", "failed"],
);

export const opportunityIngestionSourceStatusEnum = pgEnum(
  "opportunity_ingestion_source_status",
  ["queued", "running", "completed", "failed"],
);

export const opportunityQualityStatusEnum = pgEnum(
  "opportunity_quality_status",
  ["pending", "accepted", "rejected", "duplicate", "quarantined"],
);

export const opportunityIngestionRunsTable = pgTable(
  "opportunity_ingestion_runs",
  {
    id: text("id").primaryKey(),
    status: opportunityIngestionRunStatusEnum("status")
      .notNull()
      .default("queued"),
    selectedProviders: jsonb("selected_providers").$type<string[]>().notNull(),
    query: text("query"),
    dateRange: integer("date_range"),
    retryOfRunId: text("retry_of_run_id"),
    currentProvider: text("current_provider"),
    providersCompleted: integer("providers_completed").notNull().default(0),
    providersTotal: integer("providers_total").notNull().default(0),
    fetched: integer("fetched").notNull().default(0),
    staged: integer("staged").notNull().default(0),
    accepted: integer("accepted").notNull().default(0),
    rejected: integer("rejected").notNull().default(0),
    duplicates: integer("duplicates").notNull().default(0),
    created: integer("created").notNull().default(0),
    updated: integer("updated").notNull().default(0),
    archived: integer("archived").notNull().default(0),
    errors: jsonb("errors")
      .$type<string[]>()
      .notNull()
      .default(sql`'[]'::jsonb`),
    createdAt: timestamp("created_at", { withTimezone: true })
      .notNull()
      .defaultNow(),
    startedAt: timestamp("started_at", { withTimezone: true }),
    completedAt: timestamp("completed_at", { withTimezone: true }),
    updatedAt: timestamp("updated_at", { withTimezone: true })
      .notNull()
      .defaultNow(),
  },
  (table) => [
    index("idx_opportunity_ingestion_runs_created_at").on(table.createdAt),
    index("idx_opportunity_ingestion_runs_status").on(table.status),
  ],
);

export const opportunityIngestionRunSourcesTable = pgTable(
  "opportunity_ingestion_run_sources",
  {
    id: text("id").primaryKey(),
    runId: text("run_id")
      .notNull()
      .references(() => opportunityIngestionRunsTable.id, {
        onDelete: "cascade",
      }),
    provider: text("provider").notNull(),
    position: integer("position").notNull(),
    status: opportunityIngestionSourceStatusEnum("status")
      .notNull()
      .default("queued"),
    fetched: integer("fetched").notNull().default(0),
    staged: integer("staged").notNull().default(0),
    accepted: integer("accepted").notNull().default(0),
    rejected: integer("rejected").notNull().default(0),
    duplicates: integer("duplicates").notNull().default(0),
    created: integer("created").notNull().default(0),
    updated: integer("updated").notNull().default(0),
    error: text("error"),
    startedAt: timestamp("started_at", { withTimezone: true }),
    completedAt: timestamp("completed_at", { withTimezone: true }),
    updatedAt: timestamp("updated_at", { withTimezone: true })
      .notNull()
      .defaultNow(),
  },
  (table) => [
    uniqueIndex("uq_opportunity_ingestion_run_source").on(
      table.runId,
      table.provider,
    ),
    index("idx_opportunity_ingestion_run_sources_run").on(table.runId),
  ],
);

export const opportunityRawRecordsTable = pgTable(
  "opportunity_raw_records",
  {
    id: text("id").primaryKey(),
    runId: text("run_id")
      .notNull()
      .references(() => opportunityIngestionRunsTable.id, {
        onDelete: "restrict",
      }),
    runSourceId: text("run_source_id")
      .notNull()
      .references(() => opportunityIngestionRunSourcesTable.id, {
        onDelete: "restrict",
      }),
    provider: text("provider").notNull(),
    providerNativeId: text("provider_native_id"),
    sourceUrl: text("source_url"),
    providerRecord: jsonb("provider_record")
      .$type<Record<string, unknown>>()
      .notNull(),
    sourceEvidence: jsonb("source_evidence").$type<Record<
      string,
      unknown
    > | null>(),
    collectedAt: timestamp("collected_at", { withTimezone: true })
      .notNull()
      .defaultNow(),
  },
  (table) => [
    index("idx_opportunity_raw_records_run").on(table.runId),
    index("idx_opportunity_raw_records_provider_native").on(
      table.provider,
      table.providerNativeId,
    ),
  ],
);

export const opportunityStagingTable = pgTable(
  "opportunity_staging",
  {
    id: text("id").primaryKey(),
    runId: text("run_id")
      .notNull()
      .references(() => opportunityIngestionRunsTable.id, {
        onDelete: "restrict",
      }),
    rawRecordId: text("raw_record_id")
      .notNull()
      .references(() => opportunityRawRecordsTable.id, {
        onDelete: "restrict",
      }),
    provider: text("provider").notNull(),
    providerNativeId: text("provider_native_id"),
    title: text("title"),
    agency: text("agency"),
    solicitationNumber: text("solicitation_number"),
    sourceUrl: text("source_url"),
    postedDate: timestamp("posted_date", { withTimezone: true }),
    responseDeadline: timestamp("response_deadline", { withTimezone: true }),
    normalizedRecord: jsonb("normalized_record")
      .$type<Record<string, unknown>>()
      .notNull(),
    qualityStatus: opportunityQualityStatusEnum("quality_status")
      .notNull()
      .default("pending"),
    qualityReason: text("quality_reason"),
    completenessScore: numeric("completeness_score").notNull(),
    sourceConfidence: numeric("source_confidence").notNull(),
    dedupeKeys: jsonb("dedupe_keys").$type<string[]>().notNull(),
    canonicalOpportunityId: text("canonical_opportunity_id").references(
      () => opportunitiesTable.id,
      { onDelete: "set null" },
    ),
    createdAt: timestamp("created_at", { withTimezone: true })
      .notNull()
      .defaultNow(),
    updatedAt: timestamp("updated_at", { withTimezone: true })
      .notNull()
      .defaultNow(),
  },
  (table) => [
    uniqueIndex("uq_opportunity_staging_raw_record").on(table.rawRecordId),
    index("idx_opportunity_staging_run_quality").on(
      table.runId,
      table.qualityStatus,
    ),
  ],
);

export const opportunitySourceRegistryTable = pgTable(
  "opportunity_source_registry",
  {
    id: text("id").primaryKey(),
    opportunityId: text("opportunity_id")
      .notNull()
      .references(() => opportunitiesTable.id, { onDelete: "cascade" }),
    provider: text("provider").notNull(),
    providerNativeId: text("provider_native_id"),
    sourceUrl: text("source_url"),
    canonicalUrl: text("canonical_url"),
    latestRawRecordId: text("latest_raw_record_id").references(
      () => opportunityRawRecordsTable.id,
      { onDelete: "set null" },
    ),
    firstSeenAt: timestamp("first_seen_at", { withTimezone: true })
      .notNull()
      .defaultNow(),
    lastSeenAt: timestamp("last_seen_at", { withTimezone: true })
      .notNull()
      .defaultNow(),
  },
  (table) => [
    uniqueIndex("uq_opportunity_source_registry_provider_native")
      .on(table.provider, table.providerNativeId)
      .where(sql`provider_native_id IS NOT NULL`),
    index("idx_opportunity_source_registry_opportunity").on(
      table.opportunityId,
    ),
  ],
);

export const opportunityDedupeKeysTable = pgTable(
  "opportunity_dedupe_keys",
  {
    id: text("id").primaryKey(),
    opportunityId: text("opportunity_id")
      .notNull()
      .references(() => opportunitiesTable.id, { onDelete: "cascade" }),
    keyType: text("key_type").notNull(),
    dedupeKey: text("dedupe_key").notNull(),
    firstSeenAt: timestamp("first_seen_at", { withTimezone: true })
      .notNull()
      .defaultNow(),
    lastSeenAt: timestamp("last_seen_at", { withTimezone: true })
      .notNull()
      .defaultNow(),
  },
  (table) => [
    uniqueIndex("uq_opportunity_dedupe_key").on(table.dedupeKey),
    index("idx_opportunity_dedupe_keys_opportunity").on(table.opportunityId),
  ],
);

export type OpportunityIngestionRun =
  typeof opportunityIngestionRunsTable.$inferSelect;
export type OpportunityIngestionRunSource =
  typeof opportunityIngestionRunSourcesTable.$inferSelect;
