import { z } from "zod";

export const accountIdSchema = z
  .string()
  .trim()
  .toLowerCase()
  .regex(/^[a-z0-9_]{4,20}$/, "accountId must be 4-20 characters of lowercase letters, numbers, or underscores.");

export const nicknameSchema = z.string().trim().min(2).max(30);

export function normalizeAccountId(value: string) {
  return accountIdSchema.parse(value);
}
