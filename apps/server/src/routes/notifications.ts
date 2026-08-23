import { Router } from "express";
import { z } from "zod";
import { AppError } from "../lib/app-error.js";
import { prisma } from "../lib/prisma.js";
import { requireAuth, type AuthenticatedRequest } from "../middleware/auth.js";

export const notificationsRouter = Router();
notificationsRouter.use(requireAuth);

function userId(request: AuthenticatedRequest) {
  if (!request.userId) throw new AppError(401, "UNAUTHORIZED", "Authentication is required.");
  return request.userId;
}

notificationsRouter.get("/", async (request: AuthenticatedRequest, response, next) => {
  try {
    const notifications = await prisma.notification.findMany({
      where: { userId: userId(request) },
      orderBy: { createdAt: "desc" },
      take: 100,
    });
    response.json({ success: true, data: { notifications } });
  } catch (error) { next(error); }
});

notificationsRouter.patch("/:id/read", async (request: AuthenticatedRequest, response, next) => {
  try {
    const id = z.string().uuid().parse(request.params.id);
    const notification = await prisma.notification.findFirst({ where: { id, userId: userId(request) } });
    if (!notification) throw new AppError(404, "NOTIFICATION_NOT_FOUND", "Notification was not found.");
    await prisma.notification.update({ where: { id }, data: { readAt: new Date() } });
    response.status(204).send();
  } catch (error) { next(error); }
});
