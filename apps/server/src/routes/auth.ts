import { Router } from "express";
import { z } from "zod";
import { AppError } from "../lib/app-error.js";
import { createAccessToken, hashPassword, verifyPassword } from "../lib/auth.js";
import { toPublicUser } from "../lib/serializers.js";
import { prisma } from "../lib/prisma.js";
import { requireAuth, type AuthenticatedRequest } from "../middleware/auth.js";
import { accountIdSchema, nicknameSchema } from "../lib/users.js";

export const authRouter = Router();

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
    if (!user || !(await verifyPassword(password, user.passwordHash))) {
      throw new AppError(401, "INVALID_CREDENTIALS", "Email or password is incorrect.");
    }
    response.json({ success: true, data: { user: toPublicUser(user), accessToken: createAccessToken(user.id) } });
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
