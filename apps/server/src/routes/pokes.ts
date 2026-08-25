import { randomUUID } from "node:crypto";
import { Router } from "express";
import { z } from "zod";
import { AppError } from "../lib/app-error.js";
import { createNotification, isQuietTime } from "../lib/notifications.js";
import { prisma } from "../lib/prisma.js";
import { requireAuth, type AuthenticatedRequest } from "../middleware/auth.js";
import { emitPoke } from "../realtime/events.js";
import { CASUAL_COOLDOWN_MS, checkCooldown, cooldownKey, setCooldown } from "../lib/poke-cooldown.js";

export const pokesRouter = Router();
pokesRouter.use(requireAuth);

function userId(request: AuthenticatedRequest) {
  if (!request.userId) throw new AppError(401, "UNAUTHORIZED", "Authentication is required.");
  return request.userId;
}

async function handleCasualPoke(senderId: string, targetId: string, clientRequestId: string) {
  if (senderId === targetId) throw new AppError(400, "CANNOT_POKE_SELF", "You cannot poke yourself.");
  const pair = senderId < targetId
    ? { userAId: senderId, userBId: targetId }
    : { userAId: targetId, userBId: senderId };
  const friendship = await prisma.friendship.findUnique({ where: { userAId_userBId: pair } });
  if (!friendship) throw new AppError(403, "NOT_FRIENDS", "Only friends can send casual pokes.");
  const target = await prisma.user.findUnique({ where: { id: targetId } });
  if (!target) throw new AppError(404, "USER_NOT_FOUND", "Target user was not found.");
  const allowedByFriend = senderId === friendship.userAId
    ? friendship.userBAllowsPokesFromA
    : friendship.userAAllowsPokesFromB;
  if (!target.casualPokesEnabled) {
    throw new AppError(403, "CASUAL_POKE_DISABLED", "This user has disabled casual pokes.");
  }
  if (!allowedByFriend) {
    throw new AppError(403, "POKE_BLOCKED", "This friend has blocked pokes from you.");
  }
  const cooldownRemaining = checkCooldown(cooldownKey({ senderId, targetId, type: "CASUAL" }), CASUAL_COOLDOWN_MS);
  if (cooldownRemaining != null) {
    throw new AppError(429, "POKE_COOLDOWN", `Please wait ${Math.ceil(cooldownRemaining / 1000)}s before poking again.`);
  }
  const sender = await prisma.user.findUniqueOrThrow({ where: { id: senderId }, select: { nickname: true } });
  const poke = await prisma.poke.upsert({
    where: { senderId_clientRequestId: { senderId, clientRequestId } },
    update: {},
    create: { senderId, targetId, type: "CASUAL", clientRequestId },
  });
  setCooldown(cooldownKey({ senderId, targetId, type: "CASUAL" }));
  emitPoke(targetId, {
    pokeId: poke.id,
    meetingId: null,
    type: "CASUAL",
    senderId,
    senderNickname: sender.nickname,
    sentAt: poke.createdAt.toISOString(),
  });
  const quiet = isQuietTime(target.pokeQuietStartMinutes, target.pokeQuietEndMinutes, target.timezone);
  await createNotification({
    userId: targetId,
    type: "CASUAL_POKE",
    title: `${sender.nickname}님이 찔렀어요`,
    body: "친구가 MeetFair에서 찌르기를 보냈습니다.",
    data: { pokeId: poke.id, senderId },
    push: !quiet,
  });
  return poke;
}

pokesRouter.post("/", async (request: AuthenticatedRequest, response, next) => {
  try {
    const senderId = userId(request);
    const { targetUserId, clientRequestId } = z.object({
      targetUserId: z.string().uuid(),
      clientRequestId: z.string().uuid().optional(),
    }).parse(request.body);
    const poke = await handleCasualPoke(senderId, targetUserId, clientRequestId ?? randomUUID());
    response.status(201).json({ success: true, data: { poke } });
  } catch (error) { next(error); }
});

pokesRouter.post("/friends/:friendUserId", async (request: AuthenticatedRequest, response, next) => {
  try {
    const senderId = userId(request);
    const targetId = z.string().uuid().parse(request.params.friendUserId);
    const { clientRequestId } = z.object({ clientRequestId: z.string().uuid() }).parse(request.body);
    const poke = await handleCasualPoke(senderId, targetId, clientRequestId);
    response.status(201).json({ success: true, data: { poke } });
  } catch (error) { next(error); }
});

pokesRouter.patch("/friends/:friendUserId/permission", async (request: AuthenticatedRequest, response, next) => {
  try {
    const currentUserId = userId(request);
    const friendUserId = z.string().uuid().parse(request.params.friendUserId);
    const { allowed } = z.object({ allowed: z.boolean() }).parse(request.body);
    const pair = currentUserId < friendUserId
      ? { userAId: currentUserId, userBId: friendUserId }
      : { userAId: friendUserId, userBId: currentUserId };
    const friendship = await prisma.friendship.findUnique({ where: { userAId_userBId: pair } });
    if (!friendship) throw new AppError(404, "FRIEND_NOT_FOUND", "Friend relationship was not found.");
    await prisma.friendship.update({
      where: { userAId_userBId: pair },
      data: currentUserId === friendship.userAId
        ? { userAAllowsPokesFromB: allowed }
        : { userBAllowsPokesFromA: allowed },
    });
    response.status(204).send();
  } catch (error) { next(error); }
});
