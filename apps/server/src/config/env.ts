import dotenv from "dotenv";
import path from "node:path";
import { z } from "zod";

// Load .env from multiple possible cwd locations (root vs apps/server)
// `dotenv/config` only loads cwd/.env, so we explicitly try both.
dotenv.config();
dotenv.config({ path: path.resolve(process.cwd(), ".env") });
dotenv.config({ path: path.resolve(process.cwd(), "apps/server/.env") });
dotenv.config({ path: path.resolve(process.cwd(), "../..", ".env") });

const optionalUrl = z.preprocess(
  (value) => value === "" ? undefined : value,
  z.string().url().optional(),
);
const optionalSecret = z.preprocess(
  (value) => value === "" ? undefined : value,
  z.string().min(1).optional(),
);

const envSchema = z.object({
  NODE_ENV: z.enum(["development", "test", "production"]).default("development"),
  PORT: z.coerce.number().int().positive().default(4000),
  CLIENT_ORIGIN: z.string().default("*"),
  DATABASE_URL: z.string().url(),
  JWT_SECRET: z.string().min(32),
  LIVEKIT_URL: optionalUrl,
  LIVEKIT_API_KEY: optionalSecret,
  LIVEKIT_API_SECRET: optionalSecret,
  RECORDING_S3_ENDPOINT: optionalUrl,
  RECORDING_S3_REGION: z.string().default("auto"),
  RECORDING_S3_BUCKET: optionalSecret,
  RECORDING_S3_ACCESS_KEY: optionalSecret,
  RECORDING_S3_SECRET_KEY: optionalSecret,
  RECORDING_S3_FORCE_PATH_STYLE: z.string().default("false").transform((value) => value === "true"),
  EXPO_PUSH_ACCESS_TOKEN: optionalSecret,
  GOOGLE_CLIENT_IDS: z.string().default("").transform((value) =>
    value.split(",").map((clientId) => clientId.trim()).filter(Boolean)
  ),
  NAVER_MAP_CLIENT_ID: z.string().default(""),
  NAVER_MAP_CLIENT_SECRET: z.string().default(""),
  NAVER_SEARCH_CLIENT_ID: z.string().default(""),
  NAVER_SEARCH_CLIENT_SECRET: z.string().default(""),
  ODSAY_API_KEY: z.string().default(""),
});

let parsed: z.infer<typeof envSchema>;
try {
  parsed = envSchema.parse(process.env);
} catch (error) {
  if (error instanceof z.ZodError) {
    const missing = error.issues.map((i) => `${i.path.join(".")}: ${i.message}`).join("; ");
    throw new Error(
      `환경 변수 오류: ${missing} — apps/server/.env 파일을 확인하세요. (Copy-Item apps/server/.env.example apps/server/.env 후 DATABASE_URL, JWT_SECRET 32자 이상 설정)`,
    );
  }
  throw error;
}
export const env = parsed;
