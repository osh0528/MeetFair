import { Router } from "express";
import { z } from "zod";
import { AppError } from "../lib/app-error.js";
import { createAccessToken, hashPassword, verifyPassword } from "../lib/auth.js";
import { prisma } from "../lib/prisma.js";
import { requireAuth, type AuthenticatedRequest } from "../middleware/auth.js";

export const authRouter = Router();

const credentialsSchema = z.object({
  email: z.string().trim().email().max(254).transform((email) => email.toLowerCase()),
  password: z.string().min(8).max(128),
});

const publicUser = (user: { id: string; email: string; nickname: string }) => ({
  id: user.id,
  email: user.email,
  nickname: user.nickname,
});

authRouter.post("/register", async (request, response, next) => {
  try {
    const { email, password } = credentialsSchema.parse(request.body);
    const { nickname } = z.object({ nickname: z.string().trim().min(2).max(30) }).parse(request.body);
    const exists = await prisma.user.findUnique({ where: { email } });
    if (exists) throw new AppError(409, "EMAIL_ALREADY_USED", "This email is already registered.");
    const user = await prisma.user.create({ data: { email, nickname, passwordHash: await hashPassword(password) } });
    response.status(201).json({ success: true, data: { user: publicUser(user), accessToken: createAccessToken(user.id) } });
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
    response.json({ success: true, data: { user: publicUser(user), accessToken: createAccessToken(user.id) } });
  } catch (error) {
    next(error);
  }
});

authRouter.get("/me", requireAuth, async (request: AuthenticatedRequest, response, next) => {
  try {
    const user = await prisma.user.findUnique({ where: { id: request.userId } });
    if (!user) throw new AppError(401, "UNAUTHORIZED", "User was not found.");
    response.json({ success: true, data: { user: publicUser(user) } });
  } catch (error) {
    next(error);
  }
});
