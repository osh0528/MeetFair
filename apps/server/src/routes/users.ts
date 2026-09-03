import { Router } from "express";
import { z } from "zod";
import { AppError } from "../lib/app-error.js";
import { prisma } from "../lib/prisma.js";
import { accountIdSchema, nicknameSchema } from "../lib/users.js";
import { requireAuth, type AuthenticatedRequest } from "../middleware/auth.js";
import { toProfileGuestbookEntry, toPublicUser, toUserSummary } from "../lib/serializers.js";
import { hashPassword, verifyPassword } from "../lib/auth.js";
import { createNotification } from "../lib/notifications.js";
import { ROOM_DECORATIONS, type ProfilePhotoSummary, type ProfileTheme, type RoomDecoration, type UserPageSummary } from "@meetfair/shared";
import { isUserOnline } from "../realtime/presence.js";

export const usersRouter = Router();
const avatarMimeTypes = ["image/jpeg", "image/png", "image/webp"] as const;
const maxAvatarBytes = 2 * 1024 * 1024;
const maxPhotoBytes = 2 * 1024 * 1024;
const maxProfilePhotos = 30;
const roomDecorationIds = ROOM_DECORATIONS.map((item) => item.id) as [RoomDecoration, ...RoomDecoration[]];
const musicMimeTypes = ["audio/mpeg", "audio/mp4", "audio/wav", "audio/ogg"] as const;
const maxMusicBytes = 6 * 1024 * 1024;
const profileThemes = ["PURPLE", "PINK", "BLUE", "MINT", "SUNSET"] as const;

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

function matchesMusicMimeType(data: Buffer, mimeType: typeof musicMimeTypes[number]) {
  if (mimeType === "audio/mpeg") {
    return data.length >= 3 && (
      data.subarray(0, 3).toString("ascii") === "ID3"
      || data[0] === 0xff && ((data[1] ?? 0) & 0xe0) === 0xe0
    );
  }
  if (mimeType === "audio/mp4") {
    return data.length >= 12 && data.subarray(4, 8).toString("ascii") === "ftyp";
  }
  if (mimeType === "audio/wav") {
    return data.length >= 12
      && data.subarray(0, 4).toString("ascii") === "RIFF"
      && data.subarray(8, 12).toString("ascii") === "WAVE";
  }
  return data.length >= 4 && data.subarray(0, 4).toString("ascii") === "OggS";
}

function toProfilePhoto(photo: {
  id: string;
  ownerId: string;
  groupId: string | null;
  caption: string | null;
  width: number;
  height: number;
  createdAt: Date;
  likesCount?: number;
  likedByMe?: boolean;
}): ProfilePhotoSummary {
  return {
    id: photo.id,
    ownerId: photo.ownerId,
    groupId: photo.groupId,
    caption: photo.caption,
    width: photo.width,
    height: photo.height,
    createdAt: photo.createdAt.toISOString(),
    likesCount: photo.likesCount ?? 0,
    likedByMe: photo.likedByMe ?? false,
  };
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

usersRouter.get("/:userId/page-music", async (request, response, next) => {
  try {
    const targetUserId = z.string().uuid().parse(request.params.userId);
    const user = await prisma.user.findUnique({
      where: { id: targetUserId },
      select: { profileMusicData: true, profileMusicMimeType: true },
    });
    if (!user?.profileMusicData || !user.profileMusicMimeType) {
      throw new AppError(404, "PROFILE_MUSIC_NOT_FOUND", "Profile music was not found.");
    }
    const music = Buffer.from(user.profileMusicData);
    response.setHeader("content-type", user.profileMusicMimeType);
    response.setHeader("cross-origin-resource-policy", "cross-origin");
    response.setHeader("cache-control", "public, max-age=31536000, immutable");
    response.setHeader("accept-ranges", "bytes");
    const range = request.headers.range;
    if (range) {
      const match = /^bytes=(\d+)-(\d*)$/.exec(range);
      if (!match) {
        response.status(416).setHeader("content-range", "bytes */" + music.length).send();
        return;
      }
      const start = Number(match[1]);
      const end = match[2] ? Math.min(Number(match[2]), music.length - 1) : music.length - 1;
      if (start >= music.length || end < start) {
        response.status(416).setHeader("content-range", "bytes */" + music.length).send();
        return;
      }
      response.status(206);
      response.setHeader("content-range", "bytes " + start + "-" + end + "/" + music.length);
      response.setHeader("content-length", String(end - start + 1));
      response.send(music.subarray(start, end + 1));
      return;
    }
    response.setHeader("content-length", String(music.length));
    response.send(music);
  } catch (error) { next(error); }
});

usersRouter.get("/:userId/page-photos/:photoId/image", async (request, response, next) => {
  try {
    const ownerId = z.string().uuid().parse(request.params.userId);
    const photoId = z.string().uuid().parse(request.params.photoId);
    const photo = await prisma.profilePhoto.findFirst({
      where: { id: photoId, ownerId },
      select: { imageData: true, mimeType: true },
    });
    if (!photo) throw new AppError(404, "PROFILE_PHOTO_NOT_FOUND", "Profile photo was not found.");
    response.setHeader("content-type", photo.mimeType);
    response.setHeader("cross-origin-resource-policy", "cross-origin");
    response.setHeader("cache-control", "public, max-age=31536000, immutable");
    response.setHeader("content-length", String(photo.imageData.byteLength));
    response.send(Buffer.from(photo.imageData));
  } catch (error) { next(error); }
});

usersRouter.use(requireAuth);

function userId(request: AuthenticatedRequest) {
  if (!request.userId) throw new AppError(401, "UNAUTHORIZED", "Authentication is required.");
  return request.userId;
}

usersRouter.get("/search", async (request: AuthenticatedRequest, response, next) => {
  try {
    const currentUserId = userId(request);
    const query = z.string().trim().min(1).max(30).parse(request.query.q);
    const blockRows = await prisma.block.findMany({
      where: { OR: [{ blockerId: currentUserId }, { blockedId: currentUserId }] },
      select: { blockerId: true, blockedId: true },
    });
    const hiddenUserIds = [...new Set(blockRows.flatMap((row) => (row.blockerId === currentUserId ? [row.blockedId] : [row.blockerId])))];
    const users = await prisma.user.findMany({
      where: {
        id: { notIn: [currentUserId, ...hiddenUserIds] },
        OR: [
          { accountId: { contains: query.toLowerCase(), mode: "insensitive" } },
          { nickname: { contains: query, mode: "insensitive" } },
        ],
      },
      orderBy: [{ nickname: "asc" }, { accountId: "asc" }],
      take: 20,
      select: {
        id: true,
        accountId: true,
        nickname: true,
        avatarUpdatedAt: true,
        profileBio: true,
      },
    });
    const userIds = users.map((user) => user.id);
    const friendships = userIds.length
      ? await prisma.friendship.findMany({
        where: {
          OR: [
            { userAId: currentUserId, userBId: { in: userIds } },
            { userAId: { in: userIds }, userBId: currentUserId },
          ],
        },
        select: { userAId: true, userBId: true },
      })
      : [];
    const friendIds = new Set(friendships.map((friendship) => (
      friendship.userAId === currentUserId ? friendship.userBId : friendship.userAId
    )));
    response.json({
      success: true,
      data: {
        users: users.map((user) => ({
          ...toUserSummary(user),
          profileBio: user.profileBio,
          online: friendIds.has(user.id) && isUserOnline(user.id),
        })),
      },
    });
  } catch (error) { next(error); }
});

async function loadUserPage(ownerId: string, viewerId: string): Promise<UserPageSummary> {
  const owner = await prisma.user.findUnique({
    where: { id: ownerId },
    select: {
      id: true,
      accountId: true,
      nickname: true,
      avatarUpdatedAt: true,
      profileStatus: true,
      profileBio: true,
      profileEmoji: true,
      profileTheme: true,
      profileRoomDecor: true,
      profileMusicTitle: true,
      profileMusicUpdatedAt: true,
      profileUpdatedAt: true,
      profileGuestbookEntries: {
        orderBy: { createdAt: "desc" },
        take: 30,
        include: {
          author: {
            select: { id: true, accountId: true, nickname: true, avatarUpdatedAt: true },
          },
        },
      },
      profilePhotos: {
        orderBy: { createdAt: "desc" },
        take: maxProfilePhotos,
        select: {
          id: true,
          ownerId: true,
          groupId: true,
          caption: true,
          width: true,
          height: true,
          createdAt: true,
          _count: { select: { likes: true } },
          likes: { where: { userId: viewerId }, select: { userId: true } },
        },
      },
    },
  });
  if (!owner) throw new AppError(404, "USER_NOT_FOUND", "User was not found.");
  if (ownerId !== viewerId) {
    const block = await prisma.block.findFirst({
      where: { OR: [{ blockerId: ownerId, blockedId: viewerId }, { blockerId: viewerId, blockedId: ownerId }] },
      select: { id: true },
    });
    if (block) throw new AppError(404, "USER_NOT_FOUND", "User was not found.");
  }
  const theme = profileThemes.includes(owner.profileTheme as typeof profileThemes[number])
    ? owner.profileTheme as ProfileTheme
    : "PURPLE";
  const roomDecorations = owner.profileRoomDecor.filter(
    (item): item is RoomDecoration => roomDecorationIds.includes(item as RoomDecoration),
  );
  return {
    user: toUserSummary(owner),
    statusMessage: owner.profileStatus,
    bio: owner.profileBio,
    emoji: owner.profileEmoji,
    theme,
    roomDecorations,
    musicTitle: owner.profileMusicTitle,
    hasMusic: Boolean(owner.profileMusicUpdatedAt),
    musicUpdatedAt: owner.profileMusicUpdatedAt?.toISOString() ?? null,
    updatedAt: owner.profileUpdatedAt?.toISOString() ?? null,
    guestbook: owner.profileGuestbookEntries.map(toProfileGuestbookEntry),
    photos: owner.profilePhotos.map((photo) => toProfilePhoto({
      ...photo,
      likesCount: photo._count.likes,
      likedByMe: photo.likes.length > 0,
    })),
    isOwner: ownerId === viewerId,
  };
}

usersRouter.get("/:userId/page", async (request: AuthenticatedRequest, response, next) => {
  try {
    const ownerId = z.string().uuid().parse(request.params.userId);
    response.json({ success: true, data: { page: await loadUserPage(ownerId, userId(request)) } });
  } catch (error) { next(error); }
});

usersRouter.patch("/me/page", async (request: AuthenticatedRequest, response, next) => {
  try {
    const input = z.object({
      statusMessage: z.string().trim().max(60).nullable().optional(),
      bio: z.string().trim().max(500).nullable().optional(),
      emoji: z.string().trim().min(1).max(16).optional(),
      theme: z.enum(profileThemes).optional(),
      roomDecorations: z.array(z.enum(roomDecorationIds)).max(roomDecorationIds.length).optional(),
      musicTitle: z.string().trim().max(100).nullable().optional(),
    }).refine(
      (value) => Object.values(value).some((item) => item !== undefined),
      "At least one page field is required.",
    ).parse(request.body);
    const ownerId = userId(request);
    await prisma.user.update({
      where: { id: ownerId },
      data: {
        profileStatus: input.statusMessage === "" ? null : input.statusMessage,
        profileBio: input.bio === "" ? null : input.bio,
        profileEmoji: input.emoji,
        profileTheme: input.theme,
        profileRoomDecor: input.roomDecorations,
        profileMusicTitle: input.musicTitle === "" ? null : input.musicTitle,
        profileUpdatedAt: new Date(),
      },
    });
    response.json({ success: true, data: { page: await loadUserPage(ownerId, ownerId) } });
  } catch (error) { next(error); }
});

usersRouter.put("/me/page-music", async (request: AuthenticatedRequest, response, next) => {
  try {
    const input = z.object({
      fileBase64: z.string().min(1).max(8_500_000),
      mimeType: z.enum(musicMimeTypes),
      title: z.string().trim().min(1).max(100),
    }).parse(request.body);
    if (!/^[A-Za-z0-9+/]+={0,2}$/.test(input.fileBase64)) {
      throw new AppError(400, "INVALID_PROFILE_MUSIC_DATA", "Music file data is invalid.");
    }
    const profileMusicData = Buffer.from(input.fileBase64, "base64");
    if (!profileMusicData.length || profileMusicData.length > maxMusicBytes) {
      throw new AppError(413, "PROFILE_MUSIC_TOO_LARGE", "Profile music must be 6 MB or smaller.");
    }
    if (!matchesMusicMimeType(profileMusicData, input.mimeType)) {
      throw new AppError(400, "PROFILE_MUSIC_TYPE_MISMATCH", "Music content does not match its file type.");
    }
    const ownerId = userId(request);
    await prisma.user.update({
      where: { id: ownerId },
      data: {
        profileMusicData,
        profileMusicMimeType: input.mimeType,
        profileMusicTitle: input.title,
        profileMusicUpdatedAt: new Date(),
        profileUpdatedAt: new Date(),
      },
    });
    response.json({ success: true, data: { page: await loadUserPage(ownerId, ownerId) } });
  } catch (error) { next(error); }
});

usersRouter.delete("/me/page-music", async (request: AuthenticatedRequest, response, next) => {
  try {
    const ownerId = userId(request);
    await prisma.user.update({
      where: { id: ownerId },
      data: {
        profileMusicData: null,
        profileMusicMimeType: null,
        profileMusicTitle: null,
        profileMusicUpdatedAt: null,
        profileUpdatedAt: new Date(),
      },
    });
    response.status(204).send();
  } catch (error) { next(error); }
});

usersRouter.post("/me/page-photos", async (request: AuthenticatedRequest, response, next) => {
  try {
    const input = z.object({
      imageBase64: z.string().min(1).max(3_000_000),
      mimeType: z.enum(avatarMimeTypes),
      groupId: z.string().uuid().nullable().optional(),
      caption: z.string().trim().max(150).nullable().optional(),
      width: z.number().int().min(1).max(10_000),
      height: z.number().int().min(1).max(10_000),
    }).parse(request.body);
    if (!/^[A-Za-z0-9+/]+={0,2}$/.test(input.imageBase64)) {
      throw new AppError(400, "INVALID_PROFILE_PHOTO_DATA", "Photo data is invalid.");
    }
    const imageData = Buffer.from(input.imageBase64, "base64");
    if (!imageData.length || imageData.length > maxPhotoBytes) {
      throw new AppError(413, "PROFILE_PHOTO_TOO_LARGE", "Each profile photo must be 2 MB or smaller.");
    }
    if (!matchesAvatarMimeType(imageData, input.mimeType)) {
      throw new AppError(400, "PROFILE_PHOTO_TYPE_MISMATCH", "Photo content does not match its file type.");
    }
    const ownerId = userId(request);
    const photoCount = await prisma.profilePhoto.count({ where: { ownerId } });
    if (photoCount >= maxProfilePhotos) {
      throw new AppError(409, "PROFILE_PHOTO_LIMIT_REACHED", "A profile can contain up to 30 photos.");
    }
    const photo = await prisma.$transaction(async (tx) => {
      const created = await tx.profilePhoto.create({
        data: {
          ownerId,
          groupId: input.groupId ?? null,
          imageData,
          mimeType: input.mimeType,
          caption: input.caption === "" ? null : input.caption,
          width: input.width,
          height: input.height,
        },
        select: {
          id: true,
          ownerId: true,
          groupId: true,
          caption: true,
          width: true,
          height: true,
          createdAt: true,
        },
      });
      await tx.user.update({
        where: { id: ownerId },
        data: { profileUpdatedAt: new Date() },
      });
      return created;
    });
    response.status(201).json({ success: true, data: { photo: toProfilePhoto(photo) } });
  } catch (error) { next(error); }
});

usersRouter.delete("/me/page-photos/:photoId", async (request: AuthenticatedRequest, response, next) => {
  try {
    const ownerId = userId(request);
    const photoId = z.string().uuid().parse(request.params.photoId);
    const result = await prisma.profilePhoto.deleteMany({ where: { id: photoId, ownerId } });
    if (!result.count) throw new AppError(404, "PROFILE_PHOTO_NOT_FOUND", "Profile photo was not found.");
    await prisma.user.update({
      where: { id: ownerId },
      data: { profileUpdatedAt: new Date() },
    });
    response.status(204).send();
  } catch (error) { next(error); }
});

usersRouter.post("/page-photos/:photoId/like", async (request: AuthenticatedRequest, response, next) => {
  try {
    const photoId = z.string().uuid().parse(request.params.photoId);
    const viewerId = userId(request);
    await prisma.profilePhotoLike.upsert({
      where: { photoId_userId: { photoId, userId: viewerId } },
      create: { photoId, userId: viewerId },
      update: {},
    });
    const likesCount = await prisma.profilePhotoLike.count({ where: { photoId } });
    response.json({ success: true, data: { likedByMe: true, likesCount } });
  } catch (error) { next(error); }
});

usersRouter.delete("/page-photos/:photoId/like", async (request: AuthenticatedRequest, response, next) => {
  try {
    const photoId = z.string().uuid().parse(request.params.photoId);
    const viewerId = userId(request);
    await prisma.profilePhotoLike.deleteMany({ where: { photoId, userId: viewerId } });
    const likesCount = await prisma.profilePhotoLike.count({ where: { photoId } });
    response.json({ success: true, data: { likedByMe: false, likesCount } });
  } catch (error) { next(error); }
});

usersRouter.post("/:userId/guestbook", async (request: AuthenticatedRequest, response, next) => {
  try {
    const ownerId = z.string().uuid().parse(request.params.userId);
    const authorId = userId(request);
    const { content } = z.object({ content: z.string().trim().min(1).max(200) }).parse(request.body);
    if (authorId !== ownerId) {
      const block = await prisma.block.findFirst({
        where: { OR: [{ blockerId: authorId, blockedId: ownerId }, { blockerId: ownerId, blockedId: authorId }] },
        select: { id: true },
      });
      if (block) throw new AppError(403, "BLOCKED", "You cannot write on this page.");
    }
    const page = await loadUserPage(ownerId, authorId);
    const entry = await prisma.profileGuestbookEntry.create({
      data: { ownerId, authorId, content },
      include: {
        author: {
          select: { id: true, accountId: true, nickname: true, avatarUpdatedAt: true },
        },
      },
    });
    if (ownerId !== authorId) {
      await createNotification({
        userId: ownerId,
        type: "PROFILE_GUESTBOOK",
        title: "새 방명록",
        body: page.isOwner ? "새 방명록이 등록되었습니다." : entry.author.nickname + "님이 방명록을 남겼습니다.",
        data: { authorId, entryId: entry.id },
      });
    }
    response.status(201).json({ success: true, data: { entry: toProfileGuestbookEntry(entry) } });
  } catch (error) { next(error); }
});

usersRouter.delete("/:userId/guestbook/:entryId", async (request: AuthenticatedRequest, response, next) => {
  try {
    const ownerId = z.string().uuid().parse(request.params.userId);
    const entryId = z.string().uuid().parse(request.params.entryId);
    const viewerId = userId(request);
    const entry = await prisma.profileGuestbookEntry.findUnique({
      where: { id: entryId },
      select: { ownerId: true, authorId: true },
    });
    if (!entry || entry.ownerId !== ownerId) {
      throw new AppError(404, "GUESTBOOK_ENTRY_NOT_FOUND", "Guestbook entry was not found.");
    }
    if (entry.ownerId !== viewerId && entry.authorId !== viewerId) {
      throw new AppError(403, "GUESTBOOK_DELETE_FORBIDDEN", "You cannot delete this guestbook entry.");
    }
    await prisma.profileGuestbookEntry.delete({ where: { id: entryId } });
    response.status(204).send();
  } catch (error) { next(error); }
});

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
