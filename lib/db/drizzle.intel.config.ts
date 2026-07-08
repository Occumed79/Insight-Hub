import { defineConfig } from "drizzle-kit";
import path from "path";

if (!process.env.INTEL_DATABASE_URL) {
  throw new Error("INTEL_DATABASE_URL must be set for intel database migrations.");
}

export default defineConfig({
  schema: path.join(__dirname, "./src/schema/intel.ts"),
  out: path.join(__dirname, "./migrations/intel"),
  dialect: "postgresql",
  dbCredentials: {
    url: process.env.INTEL_DATABASE_URL,
  },
});
