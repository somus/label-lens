import { join } from "node:path";
import { defineConfig } from "drizzle-kit";

// drizzle-kit studio + push + pull need a concrete db path; generate doesn't.
// Resolve from LL_DB_PATH (explicit) or LL_DEV_DIR (the seeded playground).
// libsql url scheme: `file:/absolute/path`.
const rawPath =
  process.env.LL_DB_PATH ??
  (process.env.LL_DEV_DIR
    ? join(process.env.LL_DEV_DIR, ".labellens", "state.db")
    : "./.labellens/state.db");

const url = rawPath.startsWith("file:") ? rawPath : `file:${rawPath}`;

export default defineConfig({
  dialect: "sqlite",
  schema: "./src/store/schema.ts",
  out: "./migration",
  dbCredentials: { url },
});
