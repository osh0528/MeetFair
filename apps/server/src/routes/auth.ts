import { Router } from "express";
import { OAuth2Client } from "google-auth-library";
import { z } from "zod";
import { env } from "../config/env.js";
import { AppError } from "../lib/app-error.js";
import { createAccessToken, hashPassword, verifyPassword } from "../lib/auth.js";
import { toPublicUser } from "../lib/serializers.js";
import { prisma } from "../lib/prisma.js";
import { requireAuth, type AuthenticatedRequest } from "../middleware/auth.js";
import { accountIdSchema, nicknameSchema } from "../lib/users.js";

export const authRouter = Router();
const googleClient = new OAuth2Client();

const credentialsSchema = z.object({
  email: z.string().trim().email().max(254).transform((email) => email.toLowerCase()),
  password: z.string().min(8).max(128),
});

authRouter.post("/register", async (request, response, next) => {
  try {
    const { email, password } = credentialsSchema.parse(request.body);
    const { nickname, accountId } = z.object({ nickname: nicknameSchema, accountId: accountIdSchema }).parse(request.body);
    const exists = await prisma.user.findUnique({ where: { email } });
    if (exists) throw new AppError(409, "EMAIL_ALREADY_USED", "This email is already registered.");
    const accountIdExists = await prisma.user.findUnique({ where: { accountId } });
    if (accountIdExists) throw new AppError(409, "ACCOUNT_ID_ALREADY_USED", "This account ID is already in use.");
    const user = await prisma.user.create({ data: { email, accountId, nickname, passwordHash: await hashPassword(password) } });
    response.status(201).json({ success: true, data: { user: toPublicUser(user), accessToken: createAccessToken(user.id) } });
  } catch (error) {
    next(error);
  }
});

authRouter.post("/login", async (request, response, next) => {
  try {
    const { email, password } = credentialsSchema.parse(request.body);
    const user = await prisma.user.findUnique({ where: { email } });
    if (!user?.passwordHash || !(await verifyPassword(password, user.passwordHash))) {
      throw new AppError(401, "INVALID_CREDENTIALS", "Email or password is incorrect.");
    }
    response.json({ success: true, data: { user: toPublicUser(user), accessToken: createAccessToken(user.id) } });
  } catch (error) {
    next(error);
  }
});

authRouter.post("/google", async (request, response, next) => {
  try {
    const input = z.object({
      idToken: z.string().min(1),
      accountId: accountIdSchema.optional(),
      nickname: nicknameSchema.optional(),
    }).parse(request.body);
    if (env.GOOGLE_CLIENT_IDS.length === 0) {
      throw new AppError(503, "GOOGLE_AUTH_NOT_CONFIGURED", "Google authentication is not configured.");
    }

    let payload;
    try {
      const ticket = await googleClient.verifyIdToken({
        idToken: input.idToken,
        audience: env.GOOGLE_CLIENT_IDS,
      });
      payload = ticket.getPayload();
    } catch {
      throw new AppError(401, "INVALID_GOOGLE_TOKEN", "Google authentication failed.");
    }
    if (!payload?.sub || !payload.email || payload.email_verified !== true) {
      throw new AppError(401, "INVALID_GOOGLE_ACCOUNT", "A verified Google email is required.");
    }

    const email = payload.email.toLowerCase();
    const [subjectUser, emailUser] = await Promise.all([
      prisma.user.findUnique({ where: { googleSubject: payload.sub } }),
      prisma.user.findUnique({ where: { email } }),
    ]);
    if (subjectUser && emailUser && subjectUser.id !== emailUser.id) {
      throw new AppError(409, "GOOGLE_ACCOUNT_CONFLICT", "This Google account cannot be linked.");
    }

    let user = subjectUser ?? emailUser;
    if (!user) {
      if (!input.accountId || !input.nickname) {
        throw new AppError(409, "GOOGLE_REGISTRATION_REQUIRED", "Create an account before using Google login.");
      }
      if (await prisma.user.findUnique({ where: { accountId: input.accountId } })) {
        throw new AppError(409, "ACCOUNT_ID_ALREADY_USED", "This account ID is already in use.");
      }
      user = await prisma.user.create({
        data: {
          email,
          accountId: input.accountId,
          nickname: input.nickname,
          passwordHash: null,
          googleSubject: payload.sub,
        },
      });
    } else if (!user.googleSubject) {
      user = await prisma.user.update({
        where: { id: user.id },
        data: { googleSubject: payload.sub },
      });
    }

    response.json({
      success: true,
      data: { user: toPublicUser(user), accessToken: createAccessToken(user.id) },
    });
  } catch (error) {
    next(error);
  }
});

authRouter.get("/me", requireAuth, async (request: AuthenticatedRequest, response, next) => {
  try {
    const user = await prisma.user.findUnique({ where: { id: request.userId } });
    if (!user) throw new AppError(401, "UNAUTHORIZED", "User was not found.");
    response.json({ success: true, data: { user: toPublicUser(user) } });
  } catch (error) {
    next(error);
  }
});
