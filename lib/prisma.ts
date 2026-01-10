import { PrismaPg } from "@prisma/adapter-pg";
import { PrismaClient } from "../generated/prisma/client";

declare global {
  // eslint-disable-next-line no-var
  var prisma: PrismaClient | undefined;
}

// Prisma ORM v7 uses the query compiler by default (no Rust engine), so an adapter is required.
// We use the `pg` adapter for Postgres.
const adapter = new PrismaPg({
  connectionString: process.env.RUNTIME_DATABASE_URL ?? process.env.DATABASE_URL ?? "",
});

export const prisma = globalThis.prisma ?? new PrismaClient({ adapter });

if (process.env.NODE_ENV !== "production") {
  globalThis.prisma = prisma;
}
