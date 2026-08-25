import { Router } from "express";
import { z } from "zod";
import { AppError } from "../lib/app-error.js";
import { prisma } from "../lib/prisma.js";
import { requireAuth, type AuthenticatedRequest } from "../middleware/auth.js";
import {
  emitDirectMessageRead,
  emitDirectMessageReceived,
} from "../realtime/events.js";
import { createNotification } from "../lib/notifications.js";

export const directMessagesRouter = Router();
directMessagesRouter.use(requireAuth);

function currentUserId(request: AuthenticatedRequest): string {
  if (!request.userId) throw new AppError(401, "UNAUTHORIZED", "Authentication is required.");
  return request.userId;
}

function orderedPair(a: string, b: string) {
  return a < b ? { userAId: a, userBId: b } : { userAId: b, userBId: a };
}

function toDirectMessageSummary(message: {
  id: string;
  conversationId: string;
  senderId: string;
  content: string;
  createdAt: Date;
  readAt: Date | null;
}) {
  return {
    id: message.id,
    conversationId: message.conversationId,
    senderId: message.senderId,
    content: message.content,
    createdAt: message.createdAt.toISOString(),
    readAt: message.readAt?.toISOString() ?? null,
  };
}

async function toConversationSummary(
  conversation: { id: string; userAId: string; userBId: string; updatedAt: Date },
  viewerId: string,
) {
  const friendId = conversation.userAId === viewerId ? conversation.userBId : conversation.userAId;
  const friend = await prisma.user.findUnique({
    where: { id: friendId },
    select: { id: true, accountId: true, nickname: true, avatarUpdatedAt: true },
  });
  if (!friend) throw new AppError(404, "USER_NOT_FOUND", "Friend was not found.");
  const friendSummary = {
    id: friend.id,
    accountId: friend.accountId,
    nickname: friend.nickname,
    avatarUpdatedAt: friend.avatarUpdatedAt?.toISOString() ?? null,
  };
  const lastMessage = await prisma.directMessage.findFirst({
    where: { conversationId: conversation.id, deletedAt: null },
    orderBy: { createdAt: "desc" },
  });
  const unreadCount = await prisma.directMessage.count({
    where: {
      conversationId: conversation.id,
      senderId: { not: viewerId },
      readAt: null,
      deletedAt: null,
    },
  });
  return {
    id: conversation.id,
    friend: friendSummary,
    lastMessage: lastMessage ? toDirectMessageSummary(lastMessage) : null,
    unreadCount,
    updatedAt: conversation.updatedAt.toISOString(),
  };
}

directMessagesRouter.get("/conversations", async (request, response, next) => {
  try {
    const userId = currentUserId(request as AuthenticatedRequest);
    const conversations = await prisma.conversation.findMany({
      where: { OR: [{ userAId: userId }, { userBId: userId }] },
      orderBy: { updatedAt: "desc" },
    });
    const data = await Promise.all(
      conversations.map((conversation) => toConversationSummary(conversation, userId)),
    );
    response.json({ success: true, data: { conversations: data } });
  } catch (error) {
    next(error);
  }
});

directMessagesRouter.post("/conversations", async (request, response, next) => {
  try {
    const userId = currentUserId(request as AuthenticatedRequest);
    const { friendId } = z.object({ friendId: z.string().uuid() }).parse(request.body);
    if (friendId === userId) throw new AppError(400, "SELF_CONVERSATION", "You cannot create a conversation with yourself.");
    const pair = orderedPair(userId, friendId);
    const friendship = await prisma.friendship.findUnique({ where: { userAId_userBId: pair } });
    if (!friendship) throw new AppError(403, "NOT_FRIENDS", "Only friends can start a conversation.");
    const existing = await prisma.conversation.findUnique({ where: { userAId_userBId: pair } });
    if (existing) {
      const summary = await toConversationSummary(existing, userId);
      response.status(200).json({ success: true, data: { conversation: summary } });
      return;
    }
    const conversation = await prisma.conversation.create({ data: { userAId: pair.userAId, userBId: pair.userBId } });
    const summary = await toConversationSummary(conversation, userId);
    response.status(201).json({ success: true, data: { conversation: summary } });
  } catch (error) {
    next(error);
  }
});

directMessagesRouter.get(
  "/:conversationId/messages",
  async (request, response, next) => {
    try {
      const userId = currentUserId(request as AuthenticatedRequest);
      const conversationId = z.string().uuid().parse(request.params.conversationId);
      const query = z
        .object({
          cursor: z.string().uuid().optional(),
          limit: z.coerce.number().int().min(1).max(50).optional(),
        })
        .parse(request.query);
      const limit = query.limit ?? 20;
      const conversation = await prisma.conversation.findUnique({ where: { id: conversationId } });
      if (!conversation) throw new AppError(404, "CONVERSATION_NOT_FOUND", "Conversation was not found.");
      if (conversation.userAId !== userId && conversation.userBId !== userId)
        throw new AppError(403, "NOT_A_PARTICIPANT", "You are not a participant of this conversation.");
      let cursorCreatedAt: Date | undefined;
      if (query.cursor) {
        const cursorMessage = await prisma.directMessage.findUnique({ where: { id: query.cursor } });
        if (!cursorMessage || cursorMessage.conversationId !== conversationId)
          throw new AppError(400, "INVALID_CURSOR", "Cursor is invalid.");
        cursorCreatedAt = cursorMessage.createdAt;
      }
      const messages = await prisma.directMessage.findMany({
        where: {
          conversationId,
          deletedAt: null,
          ...(cursorCreatedAt ? { createdAt: { lt: cursorCreatedAt } } : {}),
        },
        orderBy: { createdAt: "desc" },
        take: limit,
      });
      const summaries = messages.map(toDirectMessageSummary);
      const nextCursor = messages.length === limit ? messages[messages.length - 1]?.id ?? null : null;
      response.json({ success: true, data: { messages: summaries, nextCursor } });
    } catch (error) {
      next(error);
    }
  },
);

directMessagesRouter.post("/:conversationId/messages", async (request, response, next) => {
  try {
    const userId = currentUserId(request as AuthenticatedRequest);
    const conversationId = z.string().uuid().parse(request.params.conversationId);
    const { content: rawContent, clientMessageId } = z
      .object({
        content: z.string(),
        clientMessageId: z.string().uuid().optional().nullable(),
      })
      .parse(request.body);
    const content = rawContent.trim();
    if (!content) throw new AppError(400, "VALIDATION_ERROR", "Message content is required.");
    if (content.length > 2000) throw new AppError(400, "VALIDATION_ERROR", "Message content is too long.");
    const conversation = await prisma.conversation.findUnique({ where: { id: conversationId } });
    if (!conversation) throw new AppError(404, "CONVERSATION_NOT_FOUND", "Conversation was not found.");
    if (conversation.userAId !== userId && conversation.userBId !== userId)
      throw new AppError(403, "NOT_A_PARTICIPANT", "You are not a participant of this conversation.");
    const recipientId = conversation.userAId === userId ? conversation.userBId : conversation.userAId;
    if (clientMessageId) {
      const existing = await prisma.directMessage.findFirst({
        where: { conversationId, clientMessageId },
      });
      if (existing) {
        response.status(201).json({ success: true, data: { message: toDirectMessageSummary(existing) } });
        return;
      }
    }
    const result = await prisma.$transaction(async (tx) => {
      const message = await tx.directMessage.create({
        data: {
          conversationId,
          senderId: userId,
          content,
          clientMessageId: clientMessageId ?? undefined,
        },
      });
      await tx.conversation.update({
        where: { id: conversationId },
        data: { updatedAt: new Date() },
      });
      return message;
    });
    const summary = toDirectMessageSummary(result);
    emitDirectMessageReceived(recipientId, { message: summary });
    const sender = await prisma.user.findUnique({ where: { id: userId }, select: { nickname: true } });
    const preview = content.slice(0, 80);
    try {
      await createNotification({
        userId: recipientId,
        type: "DIRECT_MESSAGE",
        title: `${sender?.nickname ?? "알 수 없음"}님의 새 메시지`,
        body: preview,
        data: { conversationId, messageId: result.id, senderId: userId },
        push: true,
      });
    } catch (notificationError) {
      // 알림/푸시 실패가 이미 저장된 디엠 전송까지 실패시키지 않도록 합니다.
      console.error("Direct message notification failed", notificationError);
    }
    response.status(201).json({ success: true, data: { message: summary } });
  } catch (error) {
    next(error);
  }
});

directMessagesRouter.patch("/:conversationId/read", async (request, response, next) => {
  try {
    const userId = currentUserId(request as AuthenticatedRequest);
    const conversationId = z.string().uuid().parse(request.params.conversationId);
    const { messageId } = z.object({ messageId: z.string().uuid() }).parse(request.body);
    const conversation = await prisma.conversation.findUnique({ where: { id: conversationId } });
    if (!conversation) throw new AppError(404, "CONVERSATION_NOT_FOUND", "Conversation was not found.");
    if (conversation.userAId !== userId && conversation.userBId !== userId)
      throw new AppError(403, "NOT_A_PARTICIPANT", "You are not a participant of this conversation.");
    const message = await prisma.directMessage.findUnique({ where: { id: messageId } });
    if (!message || message.conversationId !== conversationId)
      throw new AppError(404, "MESSAGE_NOT_FOUND", "Message was not found.");
    if (message.senderId === userId) throw new AppError(400, "CANNOT_READ_OWN_MESSAGE", "You cannot mark your own message as read.");
    if (message.readAt) {
      response.json({ success: true, data: { message: toDirectMessageSummary(message) } });
      return;
    }
    const updated = await prisma.directMessage.update({
      where: { id: messageId },
      data: { readAt: new Date() },
    });
    const readAt = updated.readAt!.toISOString();
    emitDirectMessageRead(message.senderId, { conversationId, messageId, readAt });
    response.json({ success: true, data: { message: toDirectMessageSummary(updated) } });
  } catch (error) {
    next(error);
  }
});
