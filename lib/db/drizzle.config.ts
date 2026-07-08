import { defineConfig } from "drizzle-kit";
import path from "path";

const databaseUrl = process.env.RFP_DATABASE_URL ?? process.env.DATABASE_URL;

if (!databaseUrl) {
  throw new Error("RFP_DATABASE_URL must be set. DATABASE_URL is allowed only as a temporary fallback during migration.");
}

export default defineConfig({
  schema: path.join(__dirname, "./src/schema/rfp.ts"),
  out: path.join(__dirname, "./migrations/rfp"),
  dialect: "postgresql",
  dbCredentials: {
    url: databaseUrl,
  },
});
