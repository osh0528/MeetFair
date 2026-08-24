import type { Server } from "socket.io";
import type {
  ClientToServerEvents,
  FriendRequestAcceptedPayload,
  FriendRequestReceivedPayload,
  MeetingInvitationReceivedPayload,
  MeetingInvitationRespondedPayload,
  PokeReceivedPayload,
  MeetingCallIncomingPayload,
  NotificationCreatedPayload,
  MeetingUpdatedPayload,
  ServerToClientEvents,
} from "@meetfair/shared";

let realtimeServer: Server<ClientToServerEvents, ServerToClientEvents> | undefined;

export function setRealtimeServer(server: Server<ClientToServerEvents, ServerToClientEvents>) {
  realtimeServer = server;
}

export function emitPoke(targetUserId: string, payload: PokeReceivedPayload) {
  realtimeServer?.to(`user:${targetUserId}`).emit("poke:received", payload);
}

export function emitFriendRequestReceived(
  targetUserId: string,
  payload: FriendRequestReceivedPayload,
) {
  realtimeServer?.to(`user:${targetUserId}`).emit("friend:request", payload);
}

export function emitFriendRequestAccepted(
  targetUserId: string,
  payload: FriendRequestAcceptedPayload,
) {
  realtimeServer?.to(`user:${targetUserId}`).emit("friend:accepted", payload);
}

export function emitMeetingInvitationReceived(
  targetUserId: string,
  payload: MeetingInvitationReceivedPayload,
) {
  realtimeServer?.to(`user:${targetUserId}`).emit("meeting:invitation", payload);
}

export function emitMeetingInvitationResponded(
  targetUserId: string,
  payload: MeetingInvitationRespondedPayload,
) {
  realtimeServer?.to(`user:${targetUserId}`).emit("meeting:invitation-responded", payload);
}

export function emitNotificationCreated(
  targetUserId: string,
  payload: NotificationCreatedPayload,
) {
  realtimeServer?.to(`user:${targetUserId}`).emit("notification:created", payload);
}

export function emitMeetingCallIncoming(
  targetUserId: string,
  payload: MeetingCallIncomingPayload,
) {
  realtimeServer?.to(`user:${targetUserId}`).emit("meeting:call-incoming", payload);
}

export function emitMeetingUpdated(meetingId: string, payload: MeetingUpdatedPayload) {
  realtimeServer?.to(`meeting:${meetingId}`).emit("meeting:updated", payload);
}
