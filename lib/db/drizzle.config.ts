import { defineConfig } from "drizzle-kit";
import path from "path";

if (!process.env.RFP_DATABASE_URL) {
  throw new Error("RFP_DATABASE_URL must be set for RFP database migrations.");
}

export default defineConfig({
  schema: path.join(__dirname, "./src/schema/rfp.ts"),
  out: "./migrations/rfp",
  dialect: "postgresql",
  dbCredentials: {
    url: process.env.RFP_DATABASE_URL,
  },
});
