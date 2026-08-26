import { Router } from "express";
import { z } from "zod";
import { AppError } from "../lib/app-error.js";
import { prisma } from "../lib/prisma.js";
import { requireAuth, type AuthenticatedRequest } from "../middleware/auth.js";

export const meetingBoardRouter = Router();
meetingBoardRouter.use(requireAuth);

function currentUserId(request: AuthenticatedRequest): string {
  if (!request.userId) throw new AppError(401, "UNAUTHORIZED", "Authentication is required.");
  return request.userId;
}

async function requireParticipant(meetingId: string, userId: string) {
  const participant = await prisma.meetingParticipant.findUnique({
    where: { meetingId_userId: { meetingId, userId } },
  });
  if (!participant) throw new AppError(403, "NOT_A_PARTICIPANT", "You are not a participant of this meeting.");
  return participant;
}

async function checkNotBlocked(userId: string, meetingId: string) {
  const meeting = await prisma.meeting.findUnique({ where: { id: meetingId } });
  if (!meeting) throw new AppError(404, "MEETING_NOT_FOUND", "Meeting was not found.");
  const blockBetween = await prisma.block.findFirst({
    where: {
      OR: [
        { blockerId: userId, blockedId: meeting.hostId },
        { blockerId: meeting.hostId, blockedId: userId },
      ],
    },
  });
  if (blockBetween) throw new AppError(403, "BLOCKED", "You cannot access this meeting board.");
  return meeting;
}

function toPostSummary(post: {
  id: string;
  meetingId: string;
  authorId: string;
  title: string;
  content: string;
  createdAt: Date;
  deletedAt: Date | null;
  _count?: { comments: number };
}) {
  return {
    id: post.id,
    meetingId: post.meetingId,
    authorId: post.authorId,
    title: post.title,
    content: post.content,
    createdAt: post.createdAt.toISOString(),
    deletedAt: post.deletedAt?.toISOString() ?? null,
    commentCount: post._count?.comments ?? 0,
  };
}

function toCommentSummary(comment: {
  id: string;
  postId: string;
  authorId: string;
  content: string;
  createdAt: Date;
  deletedAt: Date | null;
}) {
  return {
    id: comment.id,
    postId: comment.postId,
    authorId: comment.authorId,
    content: comment.content,
    createdAt: comment.createdAt.toISOString(),
    deletedAt: comment.deletedAt?.toISOString() ?? null,
  };
}

// GET /:meetingId/posts
meetingBoardRouter.get("/:meetingId/posts", async (req, res, next) => {
  try {
    const userId = currentUserId(req as AuthenticatedRequest);
    const { meetingId } = req.params;
    const { cursor, limit } = z
      .object({
        cursor: z.string().uuid().optional(),
        limit: z.coerce.number().int().min(1).max(50).optional(),
      })
      .parse(req.query);

    await requireParticipant(meetingId, userId);
    await checkNotBlocked(userId, meetingId);

    const take = limit ?? 20;
    let createdAtFilter: Record<string, unknown> | undefined;
    if (cursor) {
      const cursorPost = await prisma.meetingPost.findUnique({ where: { id: cursor } });
      if (cursorPost) {
        createdAtFilter = { createdAt: { lt: cursorPost.createdAt } };
      }
    }

    const posts = await prisma.meetingPost.findMany({
      where: { meetingId, deletedAt: null, ...createdAtFilter },
      orderBy: { createdAt: "desc" },
      take: take + 1,
      include: { _count: { select: { comments: { where: { deletedAt: null } } } } },
    });

    const hasMore = posts.length > take;
    const sliced = hasMore ? posts.slice(0, take) : posts;
    const nextCursor = hasMore ? sliced[sliced.length - 1]?.id ?? null : null;

    res.json({ success: true, data: { posts: sliced.map(toPostSummary), nextCursor } });
  } catch (error) {
    next(error);
  }
});

// POST /:meetingId/posts
meetingBoardRouter.post("/:meetingId/posts", async (req, res, next) => {
  try {
    const userId = currentUserId(req as AuthenticatedRequest);
    const { meetingId } = req.params;
    const { title, content } = z
      .object({ title: z.string(), content: z.string() })
      .parse(req.body);

    const trimmedTitle = title.trim();
    const trimmedContent = content.trim();
    if (trimmedTitle.length === 0 || trimmedTitle.length > 200) {
      throw new AppError(400, "VALIDATION_ERROR", "Title must be between 1 and 200 characters.");
    }
    if (trimmedContent.length === 0 || trimmedContent.length > 5000) {
      throw new AppError(400, "VALIDATION_ERROR", "Content must be between 1 and 5000 characters.");
    }

    await requireParticipant(meetingId, userId);
    await checkNotBlocked(userId, meetingId);

    const post = await prisma.meetingPost.create({
      data: { meetingId, authorId: userId, title: trimmedTitle, content: trimmedContent },
      include: { _count: { select: { comments: { where: { deletedAt: null } } } } },
    });

    res.status(201).json({ success: true, data: { post: toPostSummary(post) } });
  } catch (error) {
    next(error);
  }
});

// DELETE /:meetingId/posts/:postId
meetingBoardRouter.delete("/:meetingId/posts/:postId", async (req, res, next) => {
  try {
    const userId = currentUserId(req as AuthenticatedRequest);
    const { meetingId, postId } = req.params;

    await requireParticipant(meetingId, userId);

    const post = await prisma.meetingPost.findFirst({
      where: { id: postId, meetingId, deletedAt: null },
    });
    if (!post) throw new AppError(404, "POST_NOT_FOUND", "Post was not found.");
    if (post.authorId !== userId) throw new AppError(403, "NOT_AUTHOR", "You can only delete your own posts.");

    await prisma.meetingPost.update({ where: { id: postId }, data: { deletedAt: new Date() } });

    res.json({ success: true });
  } catch (error) {
    next(error);
  }
});

// GET /:meetingId/posts/:postId
meetingBoardRouter.get("/:meetingId/posts/:postId", async (req, res, next) => {
  try {
    const userId = currentUserId(req as AuthenticatedRequest);
    const { meetingId, postId } = req.params;

    await requireParticipant(meetingId, userId);
    await checkNotBlocked(userId, meetingId);

    const post = await prisma.meetingPost.findFirst({
      where: { id: postId, meetingId, deletedAt: null },
      include: {
        comments: {
          where: { deletedAt: null },
          orderBy: { createdAt: "asc" },
        },
      },
    });
    if (!post) throw new AppError(404, "POST_NOT_FOUND", "Post was not found.");

    res.json({
      success: true,
      data: {
        post: {
          ...toPostSummary(post),
          comments: post.comments.map(toCommentSummary),
        },
      },
    });
  } catch (error) {
    next(error);
  }
});

// POST /:meetingId/posts/:postId/comments
meetingBoardRouter.post("/:meetingId/posts/:postId/comments", async (req, res, next) => {
  try {
    const userId = currentUserId(req as AuthenticatedRequest);
    const { meetingId, postId } = req.params;
    const { content } = z.object({ content: z.string() }).parse(req.body);

    const trimmed = content.trim();
    if (trimmed.length === 0 || trimmed.length > 2000) {
      throw new AppError(400, "VALIDATION_ERROR", "Comment content must be between 1 and 2000 characters.");
    }

    await requireParticipant(meetingId, userId);
    await checkNotBlocked(userId, meetingId);

    const post = await prisma.meetingPost.findFirst({
      where: { id: postId, meetingId, deletedAt: null },
    });
    if (!post) throw new AppError(404, "POST_NOT_FOUND", "Post was not found.");

    const comment = await prisma.meetingPostComment.create({
      data: { postId, authorId: userId, content: trimmed },
    });

    res.status(201).json({ success: true, data: { comment: toCommentSummary(comment) } });
  } catch (error) {
    next(error);
  }
});

// DELETE /:meetingId/posts/:postId/comments/:commentId
meetingBoardRouter.delete(
  "/:meetingId/posts/:postId/comments/:commentId",
  async (req, res, next) => {
    try {
      const userId = currentUserId(req as AuthenticatedRequest);
      const { meetingId, postId, commentId } = req.params;

      await requireParticipant(meetingId, userId);

      const comment = await prisma.meetingPostComment.findFirst({
        where: { id: commentId, postId, deletedAt: null },
      });
      if (!comment) throw new AppError(404, "COMMENT_NOT_FOUND", "Comment was not found.");
      if (comment.authorId !== userId) {
        throw new AppError(403, "NOT_AUTHOR", "You can only delete your own comments.");
      }

      await prisma.meetingPostComment.update({
        where: { id: commentId },
        data: { deletedAt: new Date() },
      });

      res.json({ success: true });
    } catch (error) {
      next(error);
    }
  },
);
