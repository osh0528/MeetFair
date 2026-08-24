import { Router } from "express";
import { z } from "zod";
import { AppError } from "../lib/app-error.js";
import { prisma } from "../lib/prisma.js";
import { accountIdSchema, nicknameSchema } from "../lib/users.js";
import { requireAuth, type AuthenticatedRequest } from "../middleware/auth.js";
import { toPublicUser } from "../lib/serializers.js";

export const usersRouter = Router();

usersRouter.get("/account-id/:accountId/availability", async (request, response, next) => {
  try {
    const accountId = accountIdSchema.parse(request.params.accountId);
    const user = await prisma.user.findUnique({ where: { accountId }, select: { id: true } });
    response.json({ success: true, data: { accountId, available: !user } });
  } catch (error) { next(error); }
});

usersRouter.use(requireAuth);

function userId(request: AuthenticatedRequest) {
  if (!request.userId) throw new AppError(401, "UNAUTHORIZED", "Authentication is required.");
  return request.userId;
}

usersRouter.patch("/me", async (request: AuthenticatedRequest, response, next) => {
  try {
    const input = z.object({
      accountId: accountIdSchema.optional(),
      nickname: nicknameSchema.optional(),
    }).refine((value) => value.accountId !== undefined || value.nickname !== undefined).parse(request.body);
    const current = await prisma.user.findUniqueOrThrow({ where: { id: userId(request) } });
    if (input.accountId && input.accountId !== current.accountId && current.accountIdChanged) {
      throw new AppError(409, "ACCOUNT_ID_CHANGE_ALREADY_USED", "The account ID can only be changed once.");
    }
    const duplicate = input.accountId
      ? await prisma.user.findFirst({ where: { accountId: input.accountId, NOT: { id: current.id } } })
      : null;
    if (duplicate) throw new AppError(409, "ACCOUNT_ID_ALREADY_USED", "This account ID is already in use.");
    const user = await prisma.user.update({
      where: { id: current.id },
      data: {
        accountId: input.accountId,
        accountIdChanged: input.accountId && input.accountId !== current.accountId ? true : undefined,
        nickname: input.nickname,
      },
    });
    response.json({ success: true, data: { user: toPublicUser(user) } });
  } catch (error) { next(error); }
});

usersRouter.put("/me/home", async (request: AuthenticatedRequest, response, next) => {
  try {
    const input = z.object({
      address: z.string().trim().min(1).max(255),
      latitude: z.number().min(-90).max(90),
      longitude: z.number().min(-180).max(180),
    }).parse(request.body);
    const user = await prisma.user.update({
      where: { id: userId(request) },
      data: { homeAddress: input.address, homeLatitude: input.latitude, homeLongitude: input.longitude },
    });
    response.json({ success: true, data: { user: toPublicUser(user) } });
  } catch (error) { next(error); }
});

usersRouter.delete("/me/home", async (request: AuthenticatedRequest, response, next) => {
  try {
    await prisma.user.update({
      where: { id: userId(request) },
      data: { homeAddress: null, homeLatitude: null, homeLongitude: null },
    });
    response.status(204).send();
  } catch (error) { next(error); }
});

usersRouter.patch("/me/settings", async (request: AuthenticatedRequest, response, next) => {
  try {
    const input = z.object({
      shareLocationWithFriends: z.boolean().optional(),
      casualPokesEnabled: z.boolean().optional(),
      pokeQuietStartMinutes: z.number().int().min(0).max(1439).nullable().optional(),
      pokeQuietEndMinutes: z.number().int().min(0).max(1439).nullable().optional(),
      timezone: z.string().min(1).max(80).optional(),
    }).parse(request.body);
    const user = await prisma.user.update({ where: { id: userId(request) }, data: input });
    response.json({ success: true, data: { user: toPublicUser(user) } });
  } catch (error) { next(error); }
});

usersRouter.put("/me/location", async (request: AuthenticatedRequest, response, next) => {
  try {
    const input = z.object({
      latitude: z.number().min(-90).max(90),
      longitude: z.number().min(-180).max(180),
      accuracy: z.number().nonnegative().max(10000),
    }).parse(request.body);
    const current = await prisma.user.findUniqueOrThrow({ where: { id: userId(request) } });
    if (!current.shareLocationWithFriends) {
      throw new AppError(403, "FRIEND_LOCATION_SHARING_DISABLED", "Friend location sharing is disabled.");
    }
    await prisma.user.update({
      where: { id: current.id },
      data: {
        currentLatitude: input.latitude,
        currentLongitude: input.longitude,
        currentAccuracy: input.accuracy,
        currentLocationUpdatedAt: new Date(),
      },
    });
    response.status(204).send();
  } catch (error) { next(error); }
});

usersRouter.put("/me/push-token", async (request: AuthenticatedRequest, response, next) => {
  try {
    const { expoPushToken } = z.object({ expoPushToken: z.string().min(10).max(255) }).parse(request.body);
    await prisma.deviceToken.upsert({
      where: { expoPushToken },
      update: { userId: userId(request) },
      create: { userId: userId(request), expoPushToken },
    });
    response.status(204).send();
  } catch (error) { next(error); }
});
