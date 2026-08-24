import { Router } from "express";
import { z } from "zod";
import { AppError } from "../lib/app-error.js";
import { prisma } from "../lib/prisma.js";
import { requireAuth, type AuthenticatedRequest } from "../middleware/auth.js";
import { Prisma } from "../generated/prisma/client.js";
import {
  emitMeetingInvitationResponded,
} from "../realtime/events.js";
import { toMeetingInvitationSummary } from "../lib/serializers.js";

export const meetingInvitationsRouter = Router();
meetingInvitationsRouter.use(requireAuth);

const actionBodySchema = z.object({
  action: z.enum(["accept", "reject"]),
  cameraPermissionGranted: z.boolean().optional(),
  microphonePermissionGranted: z.boolean().optional(),
});

function currentUserId(request: AuthenticatedRequest): string {
  if (!request.userId) throw new AppError(401, "UNAUTHORIZED", "Authentication is required.");
  return request.userId;
}

meetingInvitationsRouter.get("/", async (request: AuthenticatedRequest, response, next) => {
  try {
    const userId = currentUserId(request);
    const invitations = await prisma.meetingInvitation.findMany({
      where: { invitedUserId: userId },
      include: {
        meeting: { select: { title: true, scheduledAt: true } },
        invitedBy: { select: { id: true, accountId: true, nickname: true } },
        invitedUser: { select: { id: true, accountId: true, nickname: true } },
      },
      orderBy: { createdAt: "desc" },
    });

    response.json({
      success: true,
      data: {
        invitations: invitations.map(toMeetingInvitationSummary),
      },
    });
  } catch (error) {
    next(error);
  }
});

meetingInvitationsRouter.patch("/:id", async (request: AuthenticatedRequest, response, next) => {
  try {
    const userId = currentUserId(request);
    const invitationId = z.string().uuid().parse(request.params.id);
    const { action, cameraPermissionGranted, microphonePermissionGranted } = actionBodySchema.parse(request.body);

    const invitation = await prisma.meetingInvitation.findUnique({
      where: { id: invitationId },
      include: {
        meeting: { select: { title: true, scheduledAt: true, status: true, hostId: true } },
        invitedBy: { select: { id: true, accountId: true, nickname: true } },
        invitedUser: { select: { id: true, accountId: true, nickname: true } },
      },
    });
    if (!invitation || invitation.invitedUserId !== userId) {
      throw new AppError(404, "MEETING_INVITATION_NOT_FOUND", "Meeting invitation was not found.");
    }
    if (invitation.status !== "PENDING") {
      throw new AppError(409, "MEETING_INVITATION_ALREADY_RESPONDED", "This invitation has already been processed.");
    }
    if (invitation.meeting.status === "COMPLETED" || invitation.meeting.status === "CANCELLED") {
      throw new AppError(409, "MEETING_CLOSED", "This meeting is no longer available.");
    }

    if (action === "reject") {
      const updated = await prisma.meetingInvitation.update({
        where: { id: invitation.id },
        data: { status: "DECLINED", respondedAt: new Date() },
        include: {
          meeting: { select: { title: true, scheduledAt: true } },
          invitedBy: { select: { id: true, accountId: true, nickname: true } },
          invitedUser: { select: { id: true, accountId: true, nickname: true } },
        },
      });
      emitMeetingInvitationResponded(invitation.invitedById, {
        invitation: toMeetingInvitationSummary(updated),
      });
      response.json({ success: true, data: { invitation: toMeetingInvitationSummary(updated) } });
      return;
    }
    if (cameraPermissionGranted !== true || microphonePermissionGranted !== true) {
      throw new AppError(403, "MEDIA_PERMISSIONS_REQUIRED", "Camera and microphone permissions are required to join a meeting.");
    }

    const updated = await prisma.$transaction(async (tx) => {
      const invitationRecord = await tx.meetingInvitation.update({
        where: { id: invitation.id },
        data: { status: "ACCEPTED", respondedAt: new Date() },
        include: {
          meeting: { select: { title: true, scheduledAt: true } },
          invitedBy: { select: { id: true, accountId: true, nickname: true } },
          invitedUser: { select: { id: true, accountId: true, nickname: true } },
        },
      });
      await tx.meetingParticipant.upsert({
        where: { meetingId_userId: { meetingId: invitation.meetingId, userId } },
        update: {},
        create: {
          meetingId: invitation.meetingId,
          userId,
          cameraPermissionGranted: true,
          microphonePermissionGranted: true,
        },
      });
      return invitationRecord;
    }).catch((error) => {
      if (error instanceof Prisma.PrismaClientKnownRequestError && error.code === "P2002") {
        throw new AppError(409, "MEETING_PARTICIPANT_ALREADY_EXISTS", "You are already a participant of this meeting.");
      }
      throw error;
    });

    emitMeetingInvitationResponded(invitation.invitedById, {
      invitation: toMeetingInvitationSummary(updated),
    });
    response.json({ success: true, data: { invitation: toMeetingInvitationSummary(updated) } });
  } catch (error) {
    next(error);
  }
});
