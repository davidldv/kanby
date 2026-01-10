import "dotenv/config";
import { defineConfig } from "prisma/config";

export default defineConfig({
  schema: "prisma/schema.prisma",
  migrations: {
    path: "prisma/migrations",
  },
  // Prisma CLI (migrate, db push, studio) reads the database URL from here in Prisma ORM v7.
  // Use process.env directly so `prisma generate` still works without DATABASE_URL.
  datasource: {
    url:
      process.env.MIGRATE_DATABASE_URL ??
      process.env.DATABASE_URL ??
      // Valid placeholder URL for build environments where DB creds are not provided.
      // Prisma Client generation does not require connecting to a live database.
      "postgresql://localhost:5432/postgres?schema=public",
  },
});
