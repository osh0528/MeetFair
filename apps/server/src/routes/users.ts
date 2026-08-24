import { Router } from "express";
import { z } from "zod";
import { AppError } from "../lib/app-error.js";
import { prisma } from "../lib/prisma.js";
import { accountIdSchema, nicknameSchema } from "../lib/users.js";
import { requireAuth, type AuthenticatedRequest } from "../middleware/auth.js";
import { toPublicUser } from "../lib/serializers.js";
import { hashPassword, verifyPassword } from "../lib/auth.js";

export const usersRouter = Router();
const avatarMimeTypes = ["image/jpeg", "image/png", "image/webp"] as const;
const maxAvatarBytes = 2 * 1024 * 1024;

function matchesAvatarMimeType(data: Buffer, mimeType: typeof avatarMimeTypes[number]) {
  if (mimeType === "image/jpeg") {
    return data.length >= 3 && data[0] === 0xff && data[1] === 0xd8 && data[2] === 0xff;
  }
  if (mimeType === "image/png") {
    return data.length >= 8 && data.subarray(0, 8).equals(Buffer.from([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a]));
  }
  return data.length >= 12
    && data.subarray(0, 4).toString("ascii") === "RIFF"
    && data.subarray(8, 12).toString("ascii") === "WEBP";
}

usersRouter.get("/account-id/availability", async (request, response, next) => {
  try {
    const accountId = accountIdSchema.parse(request.query.accountId);
    const user = await prisma.user.findUnique({ where: { accountId }, select: { id: true } });
    response.json({ success: true, data: { accountId, available: !user } });
  } catch (error) { next(error); }
});

usersRouter.get("/:userId/avatar", async (request, response, next) => {
  try {
    const targetUserId = z.string().uuid().parse(request.params.userId);
    const user = await prisma.user.findUnique({
      where: { id: targetUserId },
      select: { avatarData: true, avatarMimeType: true, avatarUpdatedAt: true },
    });
    if (!user?.avatarData || !user.avatarMimeType) {
      throw new AppError(404, "AVATAR_NOT_FOUND", "Profile image was not found.");
    }
    response.setHeader("content-type", user.avatarMimeType);
    response.setHeader("cross-origin-resource-policy", "cross-origin");
    response.setHeader("cache-control", "public, max-age=31536000, immutable");
    response.setHeader("content-length", String(user.avatarData.byteLength));
    response.send(Buffer.from(user.avatarData));
  } catch (error) { next(error); }
});

usersRouter.use(requireAuth);

function userId(request: AuthenticatedRequest) {
  if (!request.userId) throw new AppError(401, "UNAUTHORIZED", "Authentication is required.");
  return request.userId;
}

usersRouter.patch("/me/account-id", async (request: AuthenticatedRequest, response, next) => {
  try {
    const { accountId } = z.object({ accountId: accountIdSchema }).parse(request.body);
    const current = await prisma.user.findUniqueOrThrow({ where: { id: userId(request) } });
    if (current.accountIdChanged) {
      throw new AppError(403, "ACCOUNT_ID_ALREADY_CHANGED", "The account ID can only be changed once.");
    }
    if (accountId === current.accountId) {
      response.json({ success: true, data: { user: toPublicUser(current) } });
      return;
    }
    const duplicate = await prisma.user.findFirst({ where: { accountId, NOT: { id: current.id } } });
    if (duplicate) throw new AppError(409, "ACCOUNT_ID_TAKEN", "This account ID is already in use.");
    try {
      const user = await prisma.user.update({
        where: { id: current.id },
        data: { accountId, accountIdChanged: true },
      });
      response.json({ success: true, data: { user: toPublicUser(user) } });
    } catch (error) {
      if (error instanceof Error && (error as unknown as { code?: string }).code === "P2002") {
        throw new AppError(409, "ACCOUNT_ID_TAKEN", "This account ID is already in use.");
      }
      throw error;
    }
  } catch (error) { next(error); }
});

usersRouter.patch("/me", async (request: AuthenticatedRequest, response, next) => {
  try {
    const input = z.object({
      nickname: nicknameSchema.optional(),
      email: z.string().trim().email().max(254).transform((email) => email.toLowerCase()).optional(),
      currentPassword: z.string().max(128).optional(),
      newPassword: z.string().min(8).max(128).optional(),
    }).refine(
      (value) => value.nickname !== undefined || value.email !== undefined || value.newPassword !== undefined,
      "At least one profile field is required.",
    ).parse(request.body);
    const current = await prisma.user.findUniqueOrThrow({ where: { id: userId(request) } });
    const changesSensitiveData = input.email !== undefined && input.email !== current.email
      || input.newPassword !== undefined;
    if (changesSensitiveData && current.passwordHash) {
      if (!input.currentPassword || !(await verifyPassword(input.currentPassword, current.passwordHash))) {
        throw new AppError(401, "CURRENT_PASSWORD_INVALID", "Current password is incorrect.");
      }
    }
    if (input.email && input.email !== current.email) {
      const duplicate = await prisma.user.findUnique({ where: { email: input.email } });
      if (duplicate) throw new AppError(409, "EMAIL_ALREADY_USED", "This email is already registered.");
    }
    const user = await prisma.user.update({
      where: { id: current.id },
      data: {
        nickname: input.nickname,
        email: input.email,
        passwordHash: input.newPassword ? await hashPassword(input.newPassword) : undefined,
      },
    });
    response.json({ success: true, data: { user: toPublicUser(user) } });
  } catch (error) { next(error); }
});

usersRouter.put("/me/avatar", async (request: AuthenticatedRequest, response, next) => {
  try {
    const input = z.object({
      imageBase64: z.string().min(1).max(3_000_000),
      mimeType: z.enum(avatarMimeTypes),
    }).parse(request.body);
    if (!/^[A-Za-z0-9+/]+={0,2}$/.test(input.imageBase64)) {
      throw new AppError(400, "INVALID_AVATAR_DATA", "Profile image data is invalid.");
    }
    const avatarData = Buffer.from(input.imageBase64, "base64");
    if (!avatarData.length || avatarData.length > maxAvatarBytes) {
      throw new AppError(413, "AVATAR_TOO_LARGE", "Profile image must be 2 MB or smaller.");
    }
    if (!matchesAvatarMimeType(avatarData, input.mimeType)) {
      throw new AppError(400, "AVATAR_TYPE_MISMATCH", "Profile image content does not match its file type.");
    }
    const user = await prisma.user.update({
      where: { id: userId(request) },
      data: {
        avatarData,
        avatarMimeType: input.mimeType,
        avatarUpdatedAt: new Date(),
      },
    });
    response.json({ success: true, data: { user: toPublicUser(user) } });
  } catch (error) { next(error); }
});

usersRouter.delete("/me/avatar", async (request: AuthenticatedRequest, response, next) => {
  try {
    await prisma.user.update({
      where: { id: userId(request) },
      data: { avatarData: null, avatarMimeType: null, avatarUpdatedAt: null },
    });
    response.status(204).send();
  } catch (error) { next(error); }
});

usersRouter.delete("/me", async (request: AuthenticatedRequest, response, next) => {
  try {
    const input = z.object({
      accountId: accountIdSchema,
      currentPassword: z.string().max(128).optional(),
    }).parse(request.body);
    const current = await prisma.user.findUniqueOrThrow({ where: { id: userId(request) } });
    if (input.accountId !== current.accountId) {
      throw new AppError(400, "ACCOUNT_ID_CONFIRMATION_MISMATCH", "Account ID confirmation does not match.");
    }
    if (current.passwordHash && (!input.currentPassword || !(await verifyPassword(input.currentPassword, current.passwordHash)))) {
      throw new AppError(401, "CURRENT_PASSWORD_INVALID", "Current password is incorrect.");
    }
    await prisma.$transaction(async (tx) => {
      await tx.meeting.deleteMany({ where: { hostId: current.id } });
      await tx.user.delete({ where: { id: current.id } });
    });
    response.status(204).send();
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
      shareExactLocationWithFriends: z.boolean().optional(),
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
    if (!current.shareExactLocationWithFriends) {
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
