import { z } from "zod";

export const accountIdSchema = z
  .string()
  .trim()
  .toLowerCase()
  .regex(/^[a-z0-9]{4,20}$/, "accountId must be 4-20 lowercase letters or numbers.");

export const nicknameSchema = z.string().trim().min(2).max(30);

export function normalizeAccountId(value: string) {
  return accountIdSchema.parse(value);
}
