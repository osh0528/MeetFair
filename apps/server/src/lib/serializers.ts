import type {
  FriendRequestSummary,
  FriendSummary,
  MeetingInvitationSummary,
  MeetingMemberStatusEntry,
  PublicUser,
  UserSummary,
} from "@meetfair/shared";

export function toUserSummary(user: {
  id: string;
  accountId: string;
  nickname: string;
}): UserSummary {
  return {
    id: user.id,
    accountId: user.accountId,
    nickname: user.nickname,
  };
}

export function toPublicUser(user: {
  id: string;
  email: string;
  accountId: string;
  nickname: string;
}): PublicUser {
  return {
    id: user.id,
    email: user.email,
    accountId: user.accountId,
    nickname: user.nickname,
  };
}

export function toFriendSummary(friendship: {
  id: string;
  createdAt: Date;
  userA: { id: string; accountId: string; nickname: string };
  userB: { id: string; accountId: string; nickname: string };
}, currentUserId: string): FriendSummary {
  const otherUser = friendship.userA.id === currentUserId ? friendship.userB : friendship.userA;
  return {
    friendshipId: friendship.id,
    userId: otherUser.id,
    accountId: otherUser.accountId,
    nickname: otherUser.nickname,
    status: "FRIEND",
    createdAt: friendship.createdAt.toISOString(),
  };
}

export function toFriendRequestSummary(request: {
  id: string;
  status: "PENDING" | "ACCEPTED" | "REJECTED";
  createdAt: Date;
  respondedAt: Date | null;
  requester: { id: string; accountId: string; nickname: string };
  recipient: { id: string; accountId: string; nickname: string };
}): FriendRequestSummary {
  return {
    id: request.id,
    requester: toUserSummary(request.requester),
    recipient: toUserSummary(request.recipient),
    status: request.status,
    createdAt: request.createdAt.toISOString(),
    respondedAt: request.respondedAt ? request.respondedAt.toISOString() : null,
  };
}

export function toMeetingInvitationSummary(invitation: {
  id: string;
  meetingId: string;
  status: "PENDING" | "ACCEPTED" | "DECLINED";
  createdAt: Date;
  respondedAt: Date | null;
  meeting: { title: string; scheduledAt: Date };
  invitedBy: { id: string; accountId: string; nickname: string };
  invitedUser: { id: string; accountId: string; nickname: string };
}): MeetingInvitationSummary {
  return {
    id: invitation.id,
    meetingId: invitation.meetingId,
    meetingTitle: invitation.meeting.title,
    scheduledAt: invitation.meeting.scheduledAt.toISOString(),
    inviter: toUserSummary(invitation.invitedBy),
    invitee: toUserSummary(invitation.invitedUser),
    status: invitation.status,
    createdAt: invitation.createdAt.toISOString(),
    respondedAt: invitation.respondedAt ? invitation.respondedAt.toISOString() : null,
  };
}

export function toMeetingMemberStatusEntry(input: {
  user: { id: string; accountId: string; nickname: string };
  status: "OWNER" | "PENDING" | "ACCEPTED" | "DECLINED";
  invitationId: string | null;
  respondedAt: Date | null;
}): MeetingMemberStatusEntry {
  return {
    userId: input.user.id,
    accountId: input.user.accountId,
    nickname: input.user.nickname,
    status: input.status,
    invitationId: input.invitationId,
    respondedAt: input.respondedAt ? input.respondedAt.toISOString() : null,
  };
}
