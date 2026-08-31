import "dotenv/config";
import { execFileSync } from "node:child_process";
import pg from "pg";

const { Client } = pg;
const databaseUrl = process.env.DATABASE_URL;
const photoMigrationName = "20260825170000_profile_photo_groups";
const chatMigrationName = "20260826010000_chat_board_visit_profile";
const recordingMigrationName = "20260826053000_call_recording_retention";
const chatRecordingMigrationName = "20260826062000_meeting_chat_recordings";
const recordingSafeguardsMigrationName = "20260826070000_recording_backend_safeguards";
const freeAndForcedCallsMigrationName = "20260831120000_free_and_forced_meeting_calls";

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
let shouldResolveRecordingMigration = false;
let shouldRollbackFailedRecordingMigration = false;
let shouldResolveChatRecordingMigration = false;
let shouldRollbackFailedChatRecordingMigration = false;
let shouldResolveRecordingSafeguardsMigration = false;
let shouldRollbackFailedRecordingSafeguardsMigration = false;
let shouldResolveFreeAndForcedCallsMigration = false;
let shouldRollbackFailedFreeAndForcedCallsMigration = false;

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

async function alignRecordingSchema() {
  const alignmentClient = new Client({ connectionString: databaseUrl });
  try {
    await alignmentClient.connect();
    await alignmentClient.query("BEGIN");
    await alignmentClient.query(`
      ALTER TABLE public."MeetingChatMessage"
      ADD COLUMN IF NOT EXISTS "messageType" TEXT NOT NULL DEFAULT 'TEXT',
      ADD COLUMN IF NOT EXISTS "callId" TEXT
    `);

    const duplicateCallIds = await alignmentClient.query(`
      SELECT "callId"
      FROM public."MeetingChatMessage"
      WHERE "callId" IS NOT NULL
      GROUP BY "callId"
      HAVING COUNT(*) > 1
      LIMIT 1
    `);
    if (duplicateCallIds.rowCount) {
      throw new Error(
        "MeetingChatMessage.callId contains duplicate values; refusing to create its unique index.",
      );
    }

    await alignmentClient.query(`
      CREATE UNIQUE INDEX IF NOT EXISTS "MeetingChatMessage_callId_key"
      ON public."MeetingChatMessage"("callId")
    `);
    await alignmentClient.query(`
      DO $$
      BEGIN
        IF NOT EXISTS (
          SELECT 1
          FROM pg_constraint
          WHERE conname = 'MeetingChatMessage_callId_fkey'
            AND conrelid = 'public."MeetingChatMessage"'::regclass
        ) THEN
          ALTER TABLE public."MeetingChatMessage"
          ADD CONSTRAINT "MeetingChatMessage_callId_fkey"
          FOREIGN KEY ("callId") REFERENCES public."MeetingCall"("id")
          ON DELETE CASCADE ON UPDATE CASCADE;
        END IF;
      END
      $$
    `);

    await alignmentClient.query(`
      ALTER TABLE public."Meeting"
      ADD COLUMN IF NOT EXISTS "retentionWarningSentAt" TIMESTAMP(3)
    `);
    await alignmentClient.query(`
      ALTER TABLE public."MeetingCall"
      ADD COLUMN IF NOT EXISTS "recordingDeleteAttempts" INTEGER NOT NULL DEFAULT 0
    `);
    await alignmentClient.query(`
      CREATE TABLE IF NOT EXISTS public."RecordingAccessLog" (
        "id" TEXT NOT NULL,
        "meetingId" TEXT NOT NULL,
        "callId" TEXT NOT NULL,
        "userId" TEXT NOT NULL,
        "outcome" TEXT NOT NULL,
        "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
        CONSTRAINT "RecordingAccessLog_pkey" PRIMARY KEY ("id")
      )
    `);
    await alignmentClient.query(`
      CREATE INDEX IF NOT EXISTS "RecordingAccessLog_callId_createdAt_idx"
      ON public."RecordingAccessLog"("callId", "createdAt")
    `);
    await alignmentClient.query(`
      CREATE INDEX IF NOT EXISTS "RecordingAccessLog_userId_createdAt_idx"
      ON public."RecordingAccessLog"("userId", "createdAt")
    `);
    await alignmentClient.query(`
      CREATE INDEX IF NOT EXISTS "RecordingAccessLog_createdAt_idx"
      ON public."RecordingAccessLog"("createdAt")
    `);
    await alignmentClient.query(`
      DO $$
      BEGIN
        IF NOT EXISTS (
          SELECT 1
          FROM pg_constraint
          WHERE conname = 'RecordingAccessLog_userId_fkey'
            AND conrelid = 'public."RecordingAccessLog"'::regclass
        ) THEN
          ALTER TABLE public."RecordingAccessLog"
          ADD CONSTRAINT "RecordingAccessLog_userId_fkey"
          FOREIGN KEY ("userId") REFERENCES public."User"("id")
          ON DELETE CASCADE ON UPDATE CASCADE;
        END IF;
      END
      $$
    `);
    await alignmentClient.query("COMMIT");
  } catch (error) {
    await alignmentClient.query("ROLLBACK").catch(() => undefined);
    throw error;
  } finally {
    await alignmentClient.end().catch(() => undefined);
  }
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
      shouldResolveRecordingMigration = true;
      shouldResolveChatRecordingMigration = true;
      shouldResolveRecordingSafeguardsMigration = true;
      shouldResolveFreeAndForcedCallsMigration = true;
    } else {
      const migrations = await client.query(
        `SELECT migration_name, finished_at, rolled_back_at
         FROM public._prisma_migrations
         WHERE migration_name IN ('0_init', $1, $2, $3, $4, $5, $6)
         ORDER BY started_at DESC`,
        [
          photoMigrationName,
          chatMigrationName,
          recordingMigrationName,
          chatRecordingMigrationName,
          recordingSafeguardsMigrationName,
          freeAndForcedCallsMigrationName,
        ],
      );
      const baseline = migrationState(migrations.rows, "0_init");
      const photoMigration = migrationState(migrations.rows, photoMigrationName);
      const chatMigration = migrationState(migrations.rows, chatMigrationName);
      const recordingMigration = migrationState(migrations.rows, recordingMigrationName);
      const chatRecordingMigration = migrationState(migrations.rows, chatRecordingMigrationName);
      const recordingSafeguardsMigration = migrationState(migrations.rows, recordingSafeguardsMigrationName);
      const freeAndForcedCallsMigration = migrationState(migrations.rows, freeAndForcedCallsMigrationName);
      shouldResolveBaseline = !baseline.applied;
      shouldRollbackFailedBaseline = shouldResolveBaseline && baseline.failed;
      shouldResolvePhotoMigration = !photoMigration.applied;
      shouldRollbackFailedPhotoMigration = shouldResolvePhotoMigration && photoMigration.failed;
      shouldResolveChatMigration = !chatMigration.applied;
      shouldRollbackFailedChatMigration = shouldResolveChatMigration && chatMigration.failed;
      shouldResolveRecordingMigration = !recordingMigration.applied;
      shouldRollbackFailedRecordingMigration = shouldResolveRecordingMigration && recordingMigration.failed;
      shouldResolveChatRecordingMigration = !chatRecordingMigration.applied;
      shouldRollbackFailedChatRecordingMigration = shouldResolveChatRecordingMigration && chatRecordingMigration.failed;
      shouldResolveRecordingSafeguardsMigration = !recordingSafeguardsMigration.applied;
      shouldRollbackFailedRecordingSafeguardsMigration = shouldResolveRecordingSafeguardsMigration && recordingSafeguardsMigration.failed;
      shouldResolveFreeAndForcedCallsMigration = !freeAndForcedCallsMigration.applied;
      shouldRollbackFailedFreeAndForcedCallsMigration = shouldResolveFreeAndForcedCallsMigration && freeAndForcedCallsMigration.failed;
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
  if (shouldRollbackFailedRecordingMigration) {
    console.log(`Failed ${recordingMigrationName} attempt detected; marking it rolled back.`);
    runPrisma(["migrate", "resolve", "--rolled-back", recordingMigrationName]);
  }
  if (shouldRollbackFailedChatRecordingMigration) {
    console.log(`Failed ${chatRecordingMigrationName} attempt detected; marking it rolled back.`);
    runPrisma(["migrate", "resolve", "--rolled-back", chatRecordingMigrationName]);
  }
  if (shouldRollbackFailedRecordingSafeguardsMigration) {
    console.log(`Failed ${recordingSafeguardsMigrationName} attempt detected; marking it rolled back.`);
    runPrisma(["migrate", "resolve", "--rolled-back", recordingSafeguardsMigrationName]);
  }
  if (shouldRollbackFailedFreeAndForcedCallsMigration) {
    console.log(`Failed ${freeAndForcedCallsMigrationName} attempt detected; marking it rolled back.`);
    runPrisma(["migrate", "resolve", "--rolled-back", freeAndForcedCallsMigrationName]);
  }
  console.log("Safely preparing recording-related columns, indexes, and constraints.");
  await alignRecordingSchema();
  console.log("Aligning the existing MeetFair database with the current schema.");
  runPrisma(["db", "push"]);
  if (shouldResolvePhotoMigration) {
    runPrisma(["migrate", "resolve", "--applied", photoMigrationName]);
  }
  if (shouldResolveChatMigration) {
    runPrisma(["migrate", "resolve", "--applied", chatMigrationName]);
  }
  if (shouldResolveRecordingMigration) {
    runPrisma(["migrate", "resolve", "--applied", recordingMigrationName]);
  }
  if (shouldResolveChatRecordingMigration) {
    runPrisma(["migrate", "resolve", "--applied", chatRecordingMigrationName]);
  }
  if (shouldResolveRecordingSafeguardsMigration) {
    runPrisma(["migrate", "resolve", "--applied", recordingSafeguardsMigrationName]);
  }
  if (shouldResolveFreeAndForcedCallsMigration) {
    runPrisma(["migrate", "resolve", "--applied", freeAndForcedCallsMigrationName]);
  }
}
