import { Router } from "express";
import { z } from "zod";
import { AppError } from "../lib/app-error.js";
import { createNotification } from "../lib/notifications.js";
import { prisma } from "../lib/prisma.js";
import { requireAuth, type AuthenticatedRequest } from "../middleware/auth.js";
import {
  emitFriendRequestAccepted,
  emitFriendRequestReceived,
} from "../realtime/events.js";
import { Prisma } from "../generated/prisma/client.js";
import {
  toFriendRequestSummary,
  toFriendSummary,
} from "../lib/serializers.js";
import { accountIdSchema } from "../lib/users.js";
import { isUserOnline } from "../realtime/presence.js";

export const friendsRouter = Router();
friendsRouter.use(requireAuth);

const requestBodySchema = z.object({
  recipientAccountId: accountIdSchema,
});

const actionBodySchema = z.object({
  action: z.enum(["accept", "reject"]),
});

function currentUserId(request: AuthenticatedRequest): string {
  if (!request.userId) throw new AppError(401, "UNAUTHORIZED", "Authentication is required.");
  return request.userId;
}

function orderedPair(userAId: string, userBId: string) {
  return userAId < userBId ? { userAId, userBId } : { userAId: userBId, userBId: userAId };
}

friendsRouter.get("/", async (request: AuthenticatedRequest, response, next) => {
  try {
    const userId = currentUserId(request);
    const friendships = await prisma.friendship.findMany({
      where: {
        OR: [{ userAId: userId }, { userBId: userId }],
      },
      include: {
        userA: {
           select: {
             id: true, accountId: true, nickname: true, shareExactLocationWithFriends: true,
             currentLatitude: true, currentLongitude: true,
             currentLocationUpdatedAt: true,
             avatarUpdatedAt: true,
           },
         },
         userB: {
           select: {
             id: true, accountId: true, nickname: true, shareExactLocationWithFriends: true,
             currentLatitude: true, currentLongitude: true,
             currentLocationUpdatedAt: true,
             avatarUpdatedAt: true,
           },
         },
      },
      orderBy: { createdAt: "desc" },
    });
    response.json({
      success: true,
      data: {
        friends: friendships.map((friendship) => toFriendSummary(friendship, userId)),
      },
    });
  } catch (error) {
    next(error);
  }
});

friendsRouter.get("/online", async (request: AuthenticatedRequest, response, next) => {
  try {
    const userId = currentUserId(request);
    const friendships = await prisma.friendship.findMany({
      where: { OR: [{ userAId: userId }, { userBId: userId }] },
      select: { userAId: true, userBId: true },
    });
    const friendIds = friendships.map((friendship) =>
      friendship.userAId === userId ? friendship.userBId : friendship.userAId);
    response.json({
      success: true,
      data: { onlineUserIds: friendIds.filter(isUserOnline) },
    });
  } catch (error) { next(error); }
});

friendsRouter.get("/recommendations", async (request: AuthenticatedRequest, response, next) => {
  try {
    const userId = currentUserId(request);
    const directFriendships = await prisma.friendship.findMany({
      where: { OR: [{ userAId: userId }, { userBId: userId }] },
      select: {
        userAId: true,
        userBId: true,
        userA: { select: { nickname: true } },
        userB: { select: { nickname: true } },
      },
    });
    const directIds = new Set(directFriendships.map((friendship) =>
      friendship.userAId === userId ? friendship.userBId : friendship.userAId));
    if (!directIds.size) {
      response.json({ success: true, data: { recommendations: [] } });
      return;
    }
    const secondDegreeFriendships = await prisma.friendship.findMany({
      where: { OR: [{ userAId: { in: [...directIds] } }, { userBId: { in: [...directIds] } }] },
      select: {
        userAId: true,
        userBId: true,
        userA: { select: { nickname: true } },
        userB: { select: { nickname: true } },
      },
    });
    const mutuals = new Map<string, string[]>();
    for (const friendship of secondDegreeFriendships) {
      const directId = directIds.has(friendship.userAId) ? friendship.userAId : directIds.has(friendship.userBId) ? friendship.userBId : null;
      const candidateId = directId === friendship.userAId ? friendship.userBId : friendship.userAId;
      if (!directId || candidateId === userId || directIds.has(candidateId)) continue;
      const mutual = directFriendships.find((item) => item.userAId === directId || item.userBId === directId);
      const names = mutuals.get(candidateId) ?? [];
      if (mutual) names.push(mutual.userAId === directId ? mutual.userA.nickname : mutual.userB.nickname);
      mutuals.set(candidateId, names);
    }
    const pendingRequests = await prisma.friendRequest.findMany({
      where: {
        status: "PENDING",
        OR: [
          { requesterId: userId, recipientId: { in: [...mutuals.keys()] } },
          { recipientId: userId, requesterId: { in: [...mutuals.keys()] } },
        ],
      },
      select: { requesterId: true, recipientId: true },
    });
    const pendingIds = new Set(pendingRequests.map((item) => item.requesterId === userId ? item.recipientId : item.requesterId));
    const candidateIds = [...mutuals.keys()].filter((id) => !pendingIds.has(id));
    const candidates = candidateIds.length
      ? await prisma.user.findMany({
        where: { id: { in: candidateIds } },
        select: { id: true, accountId: true, nickname: true, avatarUpdatedAt: true },
      })
      : [];
    const byId = new Map(candidates.map((candidate) => [candidate.id, candidate]));
    response.json({
      success: true,
      data: {
        recommendations: candidateIds
          .map((id) => {
            const candidate = byId.get(id);
            const names = mutuals.get(id) ?? [];
            return candidate ? {
              userId: candidate.id,
              accountId: candidate.accountId,
              nickname: candidate.nickname,
              avatarUpdatedAt: candidate.avatarUpdatedAt?.toISOString() ?? null,
              mutualFriendCount: names.length,
              mutualFriendNames: names.slice(0, 3),
            } : null;
          })
          .filter((candidate): candidate is NonNullable<typeof candidate> => Boolean(candidate))
          .sort((a, b) => b.mutualFriendCount - a.mutualFriendCount)
          .slice(0, 20),
      },
    });
  } catch (error) { next(error); }
});

friendsRouter.post("/friend-requests", async (request: AuthenticatedRequest, response, next) => {
  try {
    const userId = currentUserId(request);
    const { recipientAccountId } = requestBodySchema.parse(request.body);
    const recipient = await prisma.user.findUnique({
      where: { accountId: recipientAccountId },
      select: { id: true, accountId: true, nickname: true },
    });
    if (!recipient) throw new AppError(404, "USER_NOT_FOUND", "Recipient account was not found.");
    if (recipient.id === userId) throw new AppError(400, "CANNOT_FRIEND_SELF", "You cannot send a friend request to yourself.");

    const pair = orderedPair(userId, recipient.id);
    const friendship = await prisma.friendship.findUnique({
      where: { userAId_userBId: pair },
    });
    if (friendship) throw new AppError(409, "ALREADY_FRIENDS", "You are already friends.");

    const existingRequest = await prisma.friendRequest.findFirst({
      where: {
        OR: [
          { requesterId: userId, recipientId: recipient.id },
          { requesterId: recipient.id, recipientId: userId, status: "PENDING" },
        ],
      },
      include: {
        requester: { select: { id: true, accountId: true, nickname: true } },
        recipient: { select: { id: true, accountId: true, nickname: true } },
      },
    });
    if (existingRequest) throw new AppError(409, "FRIEND_REQUEST_ALREADY_EXISTS", "A friend request already exists between these users.");

    const friendRequest = await prisma.friendRequest.create({
      data: { requesterId: userId, recipientId: recipient.id },
      include: {
        requester: { select: { id: true, accountId: true, nickname: true } },
        recipient: { select: { id: true, accountId: true, nickname: true } },
      },
    });

    await createNotification({
      userId: recipient.id,
      type: "FRIEND_REQUEST",
      title: "친구 요청이 도착했어요",
      body: `${friendRequest.requester.nickname}님이 친구 요청을 보냈습니다.`,
      data: { requestId: friendRequest.id, requesterId: userId },
    });
    emitFriendRequestReceived(recipient.id, {
      request: toFriendRequestSummary(friendRequest),
    });

    response.status(201).json({
      success: true,
      data: { request: toFriendRequestSummary(friendRequest) },
    });
  } catch (error) {
    next(error);
  }
});

friendsRouter.get("/friend-requests", async (request: AuthenticatedRequest, response, next) => {
  try {
    const userId = currentUserId(request);
    const [received, sent] = await Promise.all([
      prisma.friendRequest.findMany({
        where: { recipientId: userId },
        include: {
          requester: { select: { id: true, accountId: true, nickname: true } },
          recipient: { select: { id: true, accountId: true, nickname: true } },
        },
        orderBy: { createdAt: "desc" },
      }),
      prisma.friendRequest.findMany({
        where: { requesterId: userId },
        include: {
          requester: { select: { id: true, accountId: true, nickname: true } },
          recipient: { select: { id: true, accountId: true, nickname: true } },
        },
        orderBy: { createdAt: "desc" },
      }),
    ]);

    response.json({
      success: true,
      data: {
        received: received.map(toFriendRequestSummary),
        sent: sent.map(toFriendRequestSummary),
      },
    });
  } catch (error) {
    next(error);
  }
});

friendsRouter.patch("/friend-requests/:id", async (request: AuthenticatedRequest, response, next) => {
  try {
    const userId = currentUserId(request);
    const requestId = z.string().uuid().parse(request.params.id);
    const { action } = actionBodySchema.parse(request.body);

    const friendRequest = await prisma.friendRequest.findUnique({
      where: { id: requestId },
      include: {
        requester: { select: { id: true, accountId: true, nickname: true } },
        recipient: { select: { id: true, accountId: true, nickname: true } },
      },
    });
    if (!friendRequest || friendRequest.recipientId !== userId) {
      throw new AppError(404, "FRIEND_REQUEST_NOT_FOUND", "Friend request was not found.");
    }
    if (friendRequest.status !== "PENDING") {
      throw new AppError(409, "FRIEND_REQUEST_ALREADY_RESPONDED", "This friend request has already been processed.");
    }

    if (action === "reject") {
      const updated = await prisma.friendRequest.update({
        where: { id: friendRequest.id },
        data: { status: "REJECTED", respondedAt: new Date() },
        include: {
          requester: { select: { id: true, accountId: true, nickname: true } },
          recipient: { select: { id: true, accountId: true, nickname: true } },
        },
      });
      response.json({ success: true, data: { request: toFriendRequestSummary(updated) } });
      return;
    }

    const updated = await prisma.$transaction(async (tx) => {
      const requestRecord = await tx.friendRequest.update({
        where: { id: friendRequest.id },
        data: { status: "ACCEPTED", respondedAt: new Date() },
        include: {
          requester: { select: { id: true, accountId: true, nickname: true } },
          recipient: { select: { id: true, accountId: true, nickname: true } },
        },
      });
      const pair = orderedPair(friendRequest.requesterId, friendRequest.recipientId);
      await tx.friendship.create({
        data: { userAId: pair.userAId, userBId: pair.userBId },
      });
      return requestRecord;
    }).catch((error) => {
      if (error instanceof Prisma.PrismaClientKnownRequestError && error.code === "P2002") {
        throw new AppError(409, "ALREADY_FRIENDS", "You are already friends.");
      }
      throw error;
    });

    await createNotification({
      userId: friendRequest.requesterId,
      type: "FRIEND_REQUEST_ACCEPTED",
      title: "친구 요청이 수락되었어요",
      body: `${updated.recipient.nickname}님이 친구 요청을 수락했습니다.`,
      data: { requestId: updated.id },
    });
    emitFriendRequestAccepted(friendRequest.requesterId, {
      request: toFriendRequestSummary(updated),
    });

    response.json({ success: true, data: { request: toFriendRequestSummary(updated) } });
  } catch (error) {
    next(error);
  }
});

friendsRouter.patch("/:friendshipId/poke-permission", async (request: AuthenticatedRequest, response, next) => {
  try {
    const callerId = currentUserId(request);
    const friendshipId = z.string().uuid().parse(request.params.friendshipId);
    const { allowed } = z.object({ allowed: z.boolean() }).parse(request.body);
    const friendship = await prisma.friendship.findUnique({ where: { id: friendshipId } });
    if (!friendship) throw new AppError(404, "FRIEND_NOT_FOUND", "Friend relationship was not found.");
    if (friendship.userAId !== callerId && friendship.userBId !== callerId) {
      throw new AppError(403, "FORBIDDEN", "You are not a member of this friendship.");
    }
    await prisma.friendship.update({
      where: { id: friendshipId },
      data: callerId === friendship.userAId
        ? { userAAllowsPokesFromB: allowed }
        : { userBAllowsPokesFromA: allowed },
    });
    response.status(204).send();
  } catch (error) { next(error); }
});

friendsRouter.delete("/friends/:friendUserId", async (request: AuthenticatedRequest, response, next) => {
  try {
    const userId = currentUserId(request);
    const friendUserId = z.string().uuid().parse(request.params.friendUserId);
    const pair = orderedPair(userId, friendUserId);
    const friendship = await prisma.friendship.findUnique({
      where: { userAId_userBId: pair },
    });
    if (!friendship) throw new AppError(404, "FRIEND_NOT_FOUND", "Friend relationship was not found.");
    await prisma.friendship.delete({
      where: { userAId_userBId: pair },
    });
    response.status(204).send();
  } catch (error) {
    next(error);
  }
});
