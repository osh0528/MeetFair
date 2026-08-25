import "dotenv/config";
import { execFileSync } from "node:child_process";
import pg from "pg";

const { Client } = pg;
const databaseUrl = process.env.DATABASE_URL;

if (!databaseUrl) {
  throw new Error("DATABASE_URL is required before preparing migrations.");
}

const client = new Client({ connectionString: databaseUrl });
let shouldResolveBaseline = false;

try {
  await client.connect();
  const existingSchema = await client.query(
    `SELECT
      to_regclass('public."User"') AS "userTable",
      to_regclass('public._prisma_migrations') AS "migrationsTable"`,
  );
  const userTableExists = Boolean(existingSchema.rows[0]?.userTable);
  const migrationsTableExists = Boolean(existingSchema.rows[0]?.migrationsTable);

  if (userTableExists) {
    if (!migrationsTableExists) {
      shouldResolveBaseline = true;
    } else {
      const baseline = await client.query(
        `SELECT 1
         FROM public._prisma_migrations
         WHERE migration_name = '0_init' AND rolled_back_at IS NULL
         LIMIT 1`,
      );
      shouldResolveBaseline = baseline.rowCount === 0;
    }
  }
} finally {
  await client.end().catch(() => undefined);
}

if (shouldResolveBaseline) {
  console.log("Existing MeetFair schema detected; recording 0_init as the migration baseline.");
  execFileSync(
    process.platform === "win32" ? "npx.cmd" : "npx",
    ["prisma", "migrate", "resolve", "--applied", "0_init"],
    { env: process.env, stdio: "inherit" },
  );
}
