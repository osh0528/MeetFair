import "dotenv/config";
import { defineConfig } from "prisma/config";

const buildDatabaseUrl = "postgresql://postgres:postgres@localhost:5432/meetfair";

export default defineConfig({
  schema: "prisma/schema.prisma",
  migrations: {
    path: "prisma/migrations",
  },
  datasource: {
    // Prisma Client generation and typechecking do not connect to the database.
    // Runtime configuration still requires DATABASE_URL in src/config/env.ts.
    url: process.env.DATABASE_URL ?? buildDatabaseUrl,
  },
});
