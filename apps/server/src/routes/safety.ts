import { Router } from "express";
import { z } from "zod";
import { AppError } from "../lib/app-error.js";
import { prisma } from "../lib/prisma.js";
import { toUserSummary } from "../lib/serializers.js";
import { accountIdSchema } from "../lib/users.js";
import { requireAuth, type AuthenticatedRequest } from "../middleware/auth.js";

export const blocksRouter = Router();
blocksRouter.use(requireAuth);

export const reportsRouter = Router();
reportsRouter.use(requireAuth);

function userId(request: AuthenticatedRequest) {
  if (!request.userId) throw new AppError(401, "UNAUTHORIZED", "Authentication is required.");
  return request.userId;
}

async function resolveBlockedUser(rawAccountId: unknown) {
  const accountId = accountIdSchema.parse(rawAccountId);
  const target = await prisma.user.findUnique({ where: { accountId } });
  if (!target) throw new AppError(404, "ACCOUNT_NOT_FOUND", "Account was not found.");
  return target;
}

blocksRouter.put("/:accountId", async (request: AuthenticatedRequest, response, next) => {
  try {
    const blockerId = userId(request);
    const target = await resolveBlockedUser(request.params.accountId);
    if (target.id === blockerId) throw new AppError(400, "CANNOT_BLOCK_SELF", "You cannot block yourself.");
    const block = await prisma.block.upsert({
      where: { blockerId_blockedId: { blockerId, blockedId: target.id } },
      update: {},
      create: { blockerId, blockedId: target.id },
    });
    response.status(201).json({ success: true, data: { block } });
  } catch (error) { next(error); }
});

blocksRouter.delete("/:accountId", async (request: AuthenticatedRequest, response, next) => {
  try {
    const blockerId = userId(request);
    const target = await resolveBlockedUser(request.params.accountId);
    await prisma.block.deleteMany({ where: { blockerId, blockedId: target.id } });
    response.status(204).send();
  } catch (error) { next(error); }
});

blocksRouter.get("/", async (request: AuthenticatedRequest, response, next) => {
  try {
    const blockerId = userId(request);
    const blocks = await prisma.block.findMany({
      where: { blockerId },
      include: { blocked: { select: { id: true, accountId: true, nickname: true, avatarUpdatedAt: true } } },
      orderBy: { createdAt: "desc" },
    });
    response.json({
      success: true,
      data: {
        blocks: blocks.map((block) => ({
          id: block.id,
          user: toUserSummary(block.blocked),
          createdAt: block.createdAt.toISOString(),
        })),
      },
    });
  } catch (error) { next(error); }
});

reportsRouter.post("/", async (request: AuthenticatedRequest, response, next) => {
  try {
    const input = z.object({
      targetType: z.enum(["USER", "PROFILE_GUESTBOOK", "DIRECT_MESSAGE"]),
      targetId: z.string().min(1).max(64),
      reason: z.string().trim().min(1).max(500),
    }).parse(request.body);
    if (input.targetType === "USER") {
      const targetUserId = z.string().uuid().parse(input.targetId);
      const target = await prisma.user.findUnique({ where: { id: targetUserId } });
      if (!target) throw new AppError(404, "ACCOUNT_NOT_FOUND", "Account was not found.");
    }
    const report = await prisma.userReport.create({
      data: {
        reporterId: userId(request),
        targetType: input.targetType,
        targetId: input.targetId,
        reason: input.reason,
      },
    });
    response.status(201).json({ success: true, data: { report } });
  } catch (error) { next(error); }
});
