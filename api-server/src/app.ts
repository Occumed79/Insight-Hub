import express, { type Express } from "express";
import cors from "cors";
import pinoHttp from "pino-http";
import path from "path";
import { fileURLToPath } from "url";
import { eq, sql } from "drizzle-orm";
import { intelDb, runWithDbContext } from "@workspace/db";
import { sourceMonitorItemsTable } from "@workspace/db/schema";
import router from "./routes";
import sourceMonitorRouter from "./routes/source-monitor";
import apiHardeningRouter from "./middleware/api-hardening";
import { logger } from "./lib/logger";

const __dirname = path.dirname(fileURLToPath(import.meta.url));

type LogicalDatabase = "rfp" | "intel";

const INTEL_API_PREFIXES = [
  "/api/federal-intel",
  "/api/state-agencies",
  "/api/intelligence-feed",
  "/api/source-monitor",
  "/api/clients",
  "/api/client-contacts",
  "/api/prospects",
  "/api/prospect-locations",
  "/api/prospect-contacts",
  "/api/competitors",
];

function logicalDatabaseForPath(pathname: string): LogicalDatabase {
  return INTEL_API_PREFIXES.some(
    (prefix) => pathname === prefix || pathname.startsWith(`${prefix}/`),
  )
    ? "intel"
    : "rfp";
}

function configuredCorsOrigins(): Set<string> {
  return new Set(
    (process.env.INSIGHT_HUB_ALLOWED_ORIGINS ?? "")
      .split(",")
      .map((value) => value.trim())
      .filter(Boolean),
  );
}

function corsOriginAllowed(origin: string | undefined): boolean {
  if (!origin) return true;
  if (configuredCorsOrigins().has(origin)) return true;
  if (process.env.NODE_ENV !== "production") {
    try {
      const url = new URL(origin);
      return url.hostname === "localhost" || url.hostname === "127.0.0.1";
    } catch {
      return false;
    }
  }
  return false;
}

(globalThis as any).safeDate = (
  value: string | number | Date | null | undefined,
): Date | null => {
  if (!value) return null;
  const d = value instanceof Date ? value : new Date(value);
  return Number.isNaN(d.getTime()) ? null : d;
};

const app: Express = express();

app.use(
  pinoHttp({
    logger,
    serializers: {
      req(req) {
        return {
          id: req.id,
          method: req.method,
          url: req.url?.split("?")[0],
        };
      },
      res(res) {
        return {
          statusCode: res.statusCode,
        };
      },
    },
  }),
);
app.use(
  cors({
    origin(origin, callback) {
      callback(null, corsOriginAllowed(origin));
    },
    methods: ["GET", "HEAD", "POST", "PUT", "PATCH", "DELETE", "OPTIONS"],
    maxAge: 600,
  }),
);
app.use(express.json({ limit: "512kb" }));
app.use(express.urlencoded({ extended: true, limit: "512kb" }));

app.use((req, _res, next) => {
  runWithDbContext(logicalDatabaseForPath(req.path), () => next());
});

app.get("/api/health", (_req, res) => {
  res.status(200).json({ ok: true, service: "insight-hub", awake: true });
});

app.head("/api/health", (_req, res) => {
  res.status(200).end();
});

// These two source-monitor write endpoints are mounted directly on the Express
// app for legacy routing compatibility, so explicitly place the same write
// hardening boundary in front of the /api/source-monitor namespace.
app.use("/api/source-monitor", apiHardeningRouter);

app.post("/api/source-monitor/items/:id/protect", async (req, res) => {
  const { id } = req.params;
  const protectedFromCleanup = req.body?.protectedFromCleanup !== false;

  try {
    const [item] = await intelDb
      .update(sourceMonitorItemsTable)
      .set({
        protectedFromCleanup,
        protectedAt: protectedFromCleanup ? new Date() : null,
        updatedAt: new Date(),
      })
      .where(eq(sourceMonitorItemsTable.id, id))
      .returning();

    if (!item) return res.status(404).json({ error: "Item not found" });
    return res.json({ item });
  } catch (err: any) {
    logger.error({ err, id }, "Failed to update source monitor item protection");
    return res.status(500).json({ error: "Failed to update item protection" });
  }
});

app.post("/api/source-monitor/cleanup-junk", async (_req, res) => {
  try {
    const result: any = await intelDb.execute(sql`
      WITH deleted AS (
        DELETE FROM source_monitor_items
        WHERE COALESCE(protected_from_cleanup, FALSE) = FALSE
          AND (
            lower(trim(title)) IN (
              'about',
              'accessibility',
              'account',
              'advertise opportunities',
              'advertise bids',
              'apply',
              'awards',
              'business registry',
              'careers',
              'contact',
              'create an account',
              'doing business with nys',
              'find bids',
              'find contracts',
              'history',
              'home',
              'how to apply',
              'log in',
              'login',
              'more information',
              'please click here',
              'policies and disclaimers',
              'privacy',
              'register',
              'sign in',
              'sitemap',
              'staff plans',
              'subscribe',
              'terms',
              'winners'
            )
            OR lower(COALESCE(item_url, '')) LIKE '%/about%'
            OR lower(COALESCE(item_url, '')) LIKE '%/accessibility%'
            OR lower(COALESCE(item_url, '')) LIKE '%/account%'
            OR lower(COALESCE(item_url, '')) LIKE '%/careers%'
            OR lower(COALESCE(item_url, '')) LIKE '%/contact%'
            OR lower(COALESCE(item_url, '')) LIKE '%/help%'
            OR lower(COALESCE(item_url, '')) LIKE '%/login%'
            OR lower(COALESCE(item_url, '')) LIKE '%/privacy%'
            OR lower(COALESCE(item_url, '')) LIKE '%/register%'
            OR lower(COALESCE(item_url, '')) LIKE '%/sitemap%'
            OR lower(COALESCE(item_url, '')) LIKE '%/terms%'
            OR length(trim(title)) < 8
            OR (
              cardinality(regexp_split_to_array(trim(title), '\\s+')) <= 2
              AND lower(title || ' ' || COALESCE(item_url, '')) NOT LIKE '%acquisition%'
              AND lower(title || ' ' || COALESCE(item_url, '')) NOT LIKE '%award%'
              AND lower(title || ' ' || COALESCE(item_url, '')) NOT LIKE '%bid%'
              AND lower(title || ' ' || COALESCE(item_url, '')) NOT LIKE '%contract%'
              AND lower(title || ' ' || COALESCE(item_url, '')) NOT LIKE '%grant%'
              AND lower(title || ' ' || COALESCE(item_url, '')) NOT LIKE '%medical%'
              AND lower(title || ' ' || COALESCE(item_url, '')) NOT LIKE '%notice%'
              AND lower(title || ' ' || COALESCE(item_url, '')) NOT LIKE '%opportunity%'
              AND lower(title || ' ' || COALESCE(item_url, '')) NOT LIKE '%procurement%'
              AND lower(title || ' ' || COALESCE(item_url, '')) NOT LIKE '%proposal%'
              AND lower(title || ' ' || COALESCE(item_url, '')) NOT LIKE '%rfi%'
              AND lower(title || ' ' || COALESCE(item_url, '')) NOT LIKE '%rfp%'
              AND lower(title || ' ' || COALESCE(item_url, '')) NOT LIKE '%rfq%'
              AND lower(title || ' ' || COALESCE(item_url, '')) NOT LIKE '%solicitation%'
              AND lower(title || ' ' || COALESCE(item_url, '')) NOT LIKE '%sources sought%'
              AND lower(title || ' ' || COALESCE(item_url, '')) NOT LIKE '%vendor%'
              AND lower(title || ' ' || COALESCE(item_url, '')) NOT LIKE '%workforce%'
            )
          )
        RETURNING id
      )
      SELECT COUNT(*)::int AS deleted_count FROM deleted
    `);

    const deletedCount = Number(
      result?.rows?.[0]?.deleted_count ?? result?.[0]?.deleted_count ?? 0,
    );
    return res.json({ deletedCount });
  } catch (err: any) {
    logger.error({ err }, "Failed to clean source monitor junk items");
    return res.status(500).json({ error: "Failed to clean junk items" });
  }
});

// Source Monitor route definitions currently include their own /api prefix.
// Mount them at root so live /api/source-monitor/* calls hit the API instead
// of falling through to the SPA/static handler.
app.use(sourceMonitorRouter);

app.use("/api", router);

// Serve frontend static files in production
if (process.env["NODE_ENV"] === "production") {
  const frontendDist = path.resolve(__dirname, "../../intel-suite/dist/public");
  app.use(express.static(frontendDist));
  app.get("*path", (_req, res) => {
    res.sendFile(path.join(frontendDist, "index.html"));
  });
}

export default app;