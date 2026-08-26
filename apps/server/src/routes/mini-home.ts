import { Router } from "express";
import { z } from "zod";
import { AppError } from "../lib/app-error.js";
import { prisma } from "../lib/prisma.js";
import { requireAuth, type AuthenticatedRequest } from "../middleware/auth.js";
import { toUserSummary } from "../lib/serializers.js";

export const miniHomeRouter = Router();

function currentUserId(request: AuthenticatedRequest): string {
  if (!request.userId) throw new AppError(401, "UNAUTHORIZED", "Authentication is required.");
  return request.userId;
}

function toMiniHomeResponse(
  miniHome: {
    userId: string;
    profileStatus: string | null;
    profileBio: string | null;
    profileEmoji: string | null;
    profileTheme: string | null;
    profileMusicTitle: string | null;
    profileUpdatedAt: Date | null;
  },
  owner: { id: string; accountId: string; nickname: string; avatarUpdatedAt?: Date | null },
  visitorCount: number,
  hasVisitorToday: boolean,
  isOwner: boolean,
) {
  return {
    owner: toUserSummary(owner),
    profileStatus: miniHome.profileStatus ?? null,
    profileBio: miniHome.profileBio ?? null,
    profileEmoji: miniHome.profileEmoji ?? null,
    profileTheme: (miniHome.profileTheme ?? "PURPLE") as string,
    profileMusicTitle: miniHome.profileMusicTitle ?? null,
    profileUpdatedAt: miniHome.profileUpdatedAt?.toISOString() ?? null,
    visitorCount,
    hasVisitorToday,
    isOwner,
  };
}

// GET /:userId/mini-home
miniHomeRouter.get("/:userId/mini-home", async (req, res, next) => {
  try {
    const { userId } = req.params;

    const miniHome = await prisma.miniHome.findUnique({ where: { userId } });
    if (!miniHome) throw new AppError(404, "MINI_HOME_NOT_FOUND", "Mini-home page was not found.");

    const owner = await prisma.user.findUnique({ where: { id: userId } });
    if (!owner) throw new AppError(404, "USER_NOT_FOUND", "User was not found.");

    // Count total unique visitors
    const visitorCount = await prisma.miniHomeVisit.count({
      where: { ownerId: userId },
    });

    // Check if current user (if authenticated) has visited today
    let hasVisitorToday = false;
    let isOwner = false;
    try {
      const visitorId = currentUserId(req as AuthenticatedRequest);
      isOwner = visitorId === userId;
      const todayStart = new Date();
      todayStart.setHours(0, 0, 0, 0);
      const todayVisit = await prisma.miniHomeVisit.findFirst({
        where: { ownerId: userId, visitorId, visitedAt: { gte: todayStart } },
      });
      hasVisitorToday = !!todayVisit;
    } catch {
      // Not authenticated — ignore
    }

    res.json({
      success: true,
      data: toMiniHomeResponse(miniHome, owner, visitorCount, hasVisitorToday, isOwner),
    });
  } catch (error) {
    next(error);
  }
});

// POST /:userId/mini-home/visit
miniHomeRouter.post("/:userId/mini-home/visit", async (req, res, next) => {
  try {
    const userId = currentUserId(req as AuthenticatedRequest);
    const { userId: targetUserId } = req.params;

    if (userId === targetUserId) {
      throw new AppError(400, "CANNOT_VISIT_SELF", "You cannot visit your own mini-home.");
    }

    const targetUser = await prisma.user.findUnique({ where: { id: targetUserId } });
    if (!targetUser) throw new AppError(404, "USER_NOT_FOUND", "User was not found.");

    // Check daily dedup: already visited today?
    const todayStart = new Date();
    todayStart.setHours(0, 0, 0, 0);
    const existingVisit = await prisma.miniHomeVisit.findFirst({
      where: { ownerId: targetUserId, visitorId: userId, visitedAt: { gte: todayStart } },
    });
    if (existingVisit) {
      res.json({ success: true, data: { alreadyVisited: true, visitedAt: existingVisit.visitedAt.toISOString() } });
      return;
    }

    const visit = await prisma.miniHomeVisit.create({
      data: { ownerId: targetUserId, visitorId: userId },
    });

    res.status(201).json({ success: true, data: { alreadyVisited: false, visitedAt: visit.visitedAt.toISOString() } });
  } catch (error) {
    next(error);
  }
});

// GET /:userId/mini-home/visits
miniHomeRouter.get("/:userId/mini-home/visits", async (req, res, next) => {
  try {
    const { userId } = req.params;
    const { cursor, limit } = z
      .object({
        cursor: z.string().uuid().optional(),
        limit: z.coerce.number().int().min(1).max(50).optional(),
      })
      .parse(req.query);

    const take = limit ?? 20;
    let visitedAtFilter: Record<string, unknown> | undefined;
    if (cursor) {
      const cursorVisit = await prisma.miniHomeVisit.findUnique({ where: { id: cursor } });
      if (cursorVisit) {
        visitedAtFilter = { visitedAt: { lt: cursorVisit.visitedAt } };
      }
    }

    const visits = await prisma.miniHomeVisit.findMany({
      where: { ownerId: userId, ...visitedAtFilter },
      orderBy: { visitedAt: "desc" },
      take: take + 1,
      include: { visitor: { select: { id: true, accountId: true, nickname: true, avatarUpdatedAt: true } } },
    });

    const hasMore = visits.length > take;
    const sliced = hasMore ? visits.slice(0, take) : visits;
    const nextCursor = hasMore ? sliced[sliced.length - 1]?.id ?? null : null;

    res.json({
      success: true,
      data: {
        visits: sliced.map((v) => ({
          id: v.id,
          visitor: toUserSummary(v.visitor),
          visitedAt: v.visitedAt.toISOString(),
        })),
        nextCursor,
      },
    });
  } catch (error) {
    next(error);
  }
});
