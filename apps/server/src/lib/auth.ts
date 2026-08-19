import { createHmac, randomBytes, scrypt as scryptCallback, timingSafeEqual } from "node:crypto";
import { promisify } from "node:util";
import { env } from "../config/env.js";
import { AppError } from "./app-error.js";

const scrypt = promisify(scryptCallback);
const TOKEN_LIFETIME_SECONDS = 60 * 60 * 24 * 14;

interface TokenPayload {
  sub: string;
  exp: number;
}

const toBase64Url = (value: string | Buffer) => Buffer.from(value).toString("base64url");
const sign = (value: string) => createHmac("sha256", env.JWT_SECRET).update(value).digest("base64url");

export async function hashPassword(password: string): Promise<string> {
  const salt = randomBytes(16).toString("base64url");
  const derivedKey = (await scrypt(password, salt, 64)) as Buffer;
  return `${salt}.${derivedKey.toString("base64url")}`;
}

export async function verifyPassword(password: string, passwordHash: string): Promise<boolean> {
  const [salt, storedKey] = passwordHash.split(".");
  if (!salt || !storedKey) return false;
  const derivedKey = (await scrypt(password, salt, 64)) as Buffer;
  const storedBuffer = Buffer.from(storedKey, "base64url");
  return storedBuffer.length === derivedKey.length && timingSafeEqual(storedBuffer, derivedKey);
}

export function createAccessToken(userId: string): string {
  const payload: TokenPayload = { sub: userId, exp: Math.floor(Date.now() / 1000) + TOKEN_LIFETIME_SECONDS };
  const encodedPayload = toBase64Url(JSON.stringify(payload));
  return `${encodedPayload}.${sign(encodedPayload)}`;
}

export function verifyAccessToken(token: string): TokenPayload {
  const [encodedPayload, signature] = token.split(".");
  if (!encodedPayload || !signature || signature !== sign(encodedPayload)) {
    throw new AppError(401, "INVALID_TOKEN", "유효하지 않은 로그인 토큰입니다.");
  }

  try {
    const payload = JSON.parse(Buffer.from(encodedPayload, "base64url").toString("utf8")) as TokenPayload;
    if (!payload.sub || !payload.exp || payload.exp < Math.floor(Date.now() / 1000)) {
      throw new Error("expired token");
    }
    return payload;
  } catch {
    throw new AppError(401, "INVALID_TOKEN", "만료되었거나 유효하지 않은 로그인 토큰입니다.");
  }
}
