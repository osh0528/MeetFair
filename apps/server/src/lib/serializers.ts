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
  avatarUpdatedAt?: Date | null;
}): UserSummary {
  return {
    id: user.id,
    accountId: user.accountId,
    nickname: user.nickname,
    avatarUpdatedAt: user.avatarUpdatedAt?.toISOString() ?? null,
  };
}

export function toPublicUser(user: {
  id: string;
  email: string;
  accountId: string;
  nickname: string;
  accountIdChanged?: boolean;
  homeAddress?: string | null;
  homeLatitude?: number | null;
  homeLongitude?: number | null;
  shareExactLocationWithFriends?: boolean;
  casualPokesEnabled?: boolean;
  pokeQuietStartMinutes?: number | null;
  pokeQuietEndMinutes?: number | null;
  timezone?: string;
  avatarUpdatedAt?: Date | null;
}): PublicUser {
  return {
    id: user.id,
    email: user.email,
    accountId: user.accountId,
    nickname: user.nickname,
    accountIdChanged: user.accountIdChanged,
    homeAddress: user.homeAddress,
    homeLatitude: user.homeLatitude,
    homeLongitude: user.homeLongitude,
    shareExactLocationWithFriends: user.shareExactLocationWithFriends,
    casualPokesEnabled: user.casualPokesEnabled,
    pokeQuietStartMinutes: user.pokeQuietStartMinutes,
    pokeQuietEndMinutes: user.pokeQuietEndMinutes,
    timezone: user.timezone,
    avatarUpdatedAt: user.avatarUpdatedAt?.toISOString() ?? null,
  };
}

export function toFriendSummary(friendship: {
  id: string;
  createdAt: Date;
  userAAllowsPokesFromB: boolean;
  userBAllowsPokesFromA: boolean;
  userA: {
    id: string; accountId: string; nickname: string;
    shareExactLocationWithFriends?: boolean;
    currentLatitude?: number | null; currentLongitude?: number | null;
    currentLocationUpdatedAt?: Date | null;
    avatarUpdatedAt?: Date | null;
  };
  userB: {
    id: string; accountId: string; nickname: string;
    shareExactLocationWithFriends?: boolean;
    currentLatitude?: number | null; currentLongitude?: number | null;
    currentLocationUpdatedAt?: Date | null;
    avatarUpdatedAt?: Date | null;
  };
}, currentUserId: string): FriendSummary {
  const otherUser = friendship.userA.id === currentUserId ? friendship.userB : friendship.userA;
  return {
    friendshipId: friendship.id,
    userId: otherUser.id,
    accountId: otherUser.accountId,
    nickname: otherUser.nickname,
    status: "FRIEND",
    createdAt: friendship.createdAt.toISOString(),
    sharedLatitude: otherUser.shareExactLocationWithFriends ? otherUser.currentLatitude : null,
    sharedLongitude: otherUser.shareExactLocationWithFriends ? otherUser.currentLongitude : null,
    sharedLocationAt: otherUser.shareExactLocationWithFriends
      ? otherUser.currentLocationUpdatedAt?.toISOString() ?? null
      : null,
    allowsPokesFromFriend: friendship.userA.id === currentUserId
      ? friendship.userAAllowsPokesFromB
      : friendship.userBAllowsPokesFromA,
    avatarUpdatedAt: otherUser.avatarUpdatedAt?.toISOString() ?? null,
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
