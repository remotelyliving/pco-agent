// Load dotenv only if available (not present in production Docker image)
try { await import("dotenv/config"); } catch { /* dotenv not installed in production */ }
import { defineConfig } from "prisma/config";

export default defineConfig({
  schema: "prisma/schema.prisma",
  migrations: {
    path: "prisma/migrations",
  },
  datasource: {
    url: process.env["DATABASE_URL"],
  },
});
