import { defineConfig } from "prisma/config";

// Prisma 7 no longer loads .env automatically when a config file is present.
try {
  process.loadEnvFile?.();
} catch {
  // .env is optional when DATABASE_URL is already set in the environment.
}

export default defineConfig({
  schema: "prisma/schema.prisma",
  migrations: {
    path: "prisma/migrations",
    seed: "node prisma/seed.cjs"
  },
  datasource: {
    url: process.env.DATABASE_URL || "postgresql://darroom:password@localhost:5432/darroom?schema=public"
  }
});
