import "dotenv/config";
import { execFileSync } from "node:child_process";
import pg from "pg";

const { Client } = pg;
const databaseUrl = process.env.DATABASE_URL;
const photoMigrationName = "20260825170000_profile_photo_groups";
const chatMigrationName = "20260826010000_chat_board_visit_profile";

if (!databaseUrl) {
  throw new Error("DATABASE_URL is required before preparing migrations.");
}

const client = new Client({ connectionString: databaseUrl });
let shouldResolveBaseline = false;
let shouldRollbackFailedBaseline = false;
let shouldAlignExistingSchema = false;
let shouldResolvePhotoMigration = false;
let shouldRollbackFailedPhotoMigration = false;
let shouldResolveChatMigration = false;
let shouldRollbackFailedChatMigration = false;

function migrationState(rows, migrationName) {
  const matchingRows = rows.filter((migration) => migration.migration_name === migrationName);
  return {
    applied: matchingRows.some((migration) => migration.finished_at && !migration.rolled_back_at),
    failed: matchingRows.some((migration) => !migration.finished_at && !migration.rolled_back_at),
  };
}

function runPrisma(args) {
  execFileSync(
    process.platform === "win32" ? "npx.cmd" : "npx",
    ["prisma", ...args],
    { env: process.env, stdio: "inherit", shell: process.platform === "win32" },
  );
}

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
    // This database predates the squashed migration history. Even when a
    // migration is recorded as applied, some newer tables can still be absent.
    // `db push` is intentionally run without --accept-data-loss so startup
    // fails instead of making a destructive schema change.
    shouldAlignExistingSchema = true;

    if (!migrationsTableExists) {
      shouldResolveBaseline = true;
      shouldResolvePhotoMigration = true;
      shouldResolveChatMigration = true;
    } else {
      const migrations = await client.query(
        `SELECT migration_name, finished_at, rolled_back_at
         FROM public._prisma_migrations
         WHERE migration_name IN ('0_init', $1, $2)
         ORDER BY started_at DESC`,
        [photoMigrationName, chatMigrationName],
      );
      const baseline = migrationState(migrations.rows, "0_init");
      const photoMigration = migrationState(migrations.rows, photoMigrationName);
      const chatMigration = migrationState(migrations.rows, chatMigrationName);
      shouldResolveBaseline = !baseline.applied;
      shouldRollbackFailedBaseline = shouldResolveBaseline && baseline.failed;
      shouldResolvePhotoMigration = !photoMigration.applied;
      shouldRollbackFailedPhotoMigration = shouldResolvePhotoMigration && photoMigration.failed;
      shouldResolveChatMigration = !chatMigration.applied;
      shouldRollbackFailedChatMigration = shouldResolveChatMigration && chatMigration.failed;
    }
  }
} finally {
  await client.end().catch(() => undefined);
}

if (shouldResolveBaseline) {
  if (shouldRollbackFailedBaseline) {
    console.log("Failed 0_init attempt detected; marking it rolled back before baselining.");
    runPrisma(["migrate", "resolve", "--rolled-back", "0_init"]);
  }
  console.log("Existing MeetFair schema detected; recording 0_init as the migration baseline.");
  runPrisma(["migrate", "resolve", "--applied", "0_init"]);
}

if (shouldAlignExistingSchema) {
  if (shouldRollbackFailedPhotoMigration) {
    console.log(`Failed ${photoMigrationName} attempt detected; marking it rolled back.`);
    runPrisma(["migrate", "resolve", "--rolled-back", photoMigrationName]);
  }
  if (shouldRollbackFailedChatMigration) {
    console.log(`Failed ${chatMigrationName} attempt detected; marking it rolled back.`);
    runPrisma(["migrate", "resolve", "--rolled-back", chatMigrationName]);
  }
  console.log("Aligning the existing MeetFair database with the current schema.");
  runPrisma(["db", "push"]);
  if (shouldResolvePhotoMigration) {
    runPrisma(["migrate", "resolve", "--applied", photoMigrationName]);
  }
  if (shouldResolveChatMigration) {
    runPrisma(["migrate", "resolve", "--applied", chatMigrationName]);
  }
}
