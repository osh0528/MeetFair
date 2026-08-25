export type MeetingStatus =
  | "PLANNING"
  | "CONFIRMED"
  | "TRACKING"
  | "COMPLETED"
  | "CANCELLED";

export type SharingStatus =
  | "NOT_STARTED"
  | "SHARING"
  | "PAUSED"
  | "ARRIVED";

export type FriendRequestStatus = "PENDING" | "ACCEPTED" | "REJECTED";

export type MeetingInvitationStatus = "PENDING" | "ACCEPTED" | "DECLINED";

export type FriendshipStatus = "FRIEND";

export type MeetingMemberStatus = "OWNER" | "PENDING" | "ACCEPTED" | "DECLINED";
export type MeetingVisibility = "PRIVATE" | "PUBLIC_FRIENDS";
export type LocationShareMode = "DAY_OF" | "BEFORE_START" | "OFF";
export type TravelMetric = "TRANSIT" | "CAR" | "DISTANCE";
export type OriginType = "HOME" | "CURRENT" | "CUSTOM";
export type JoinRequestStatus = "PENDING" | "ACCEPTED" | "REJECTED";
export type PokeType = "MEETING" | "CASUAL";
export type MeetingCallStatus = "RINGING" | "ACTIVE" | "ENDED";
export type MeetingCallParticipantStatus =
  | "RINGING"
  | "JOINED"
  | "DECLINED"
  | "MISSED"
  | "LEFT";

export interface UserSummary {
  id: string;
  accountId: string;
  nickname: string;
  avatarUpdatedAt?: string | null;
}

export interface PublicUser extends UserSummary {
  email: string;
  accountIdChanged?: boolean;
  homeAddress?: string | null;
  homeLatitude?: number | null;
  homeLongitude?: number | null;
  shareExactLocationWithFriends?: boolean;
  casualPokesEnabled?: boolean;
  pokeQuietStartMinutes?: number | null;
  pokeQuietEndMinutes?: number | null;
  timezone?: string;
}

export interface AccountIdAvailability {
  accountId: string;
  available: boolean;
}

export interface FriendSummary {
  friendshipId: string;
  userId: string;
  accountId: string;
  nickname: string;
  status: FriendshipStatus;
  createdAt: string;
  sharedLatitude?: number | null;
  sharedLongitude?: number | null;
  sharedLocationAt?: string | null;
  allowsPokesFromFriend: boolean;
  avatarUpdatedAt?: string | null;
}

export interface PublicProfileSearchResult extends UserSummary {
  profileBio: string | null;
  online: boolean;
}

export type ProfileTheme = "PURPLE" | "PINK" | "BLUE" | "MINT" | "SUNSET";

export interface ProfileGuestbookEntrySummary {
  id: string;
  ownerId: string;
  author: UserSummary;
  content: string;
  createdAt: string;
}

export interface ProfilePhotoSummary {
  id: string;
  ownerId: string;
  caption: string | null;
  width: number;
  height: number;
  createdAt: string;
}

export interface UserPageSummary {
  user: UserSummary;
  statusMessage: string | null;
  bio: string | null;
  emoji: string;
  theme: ProfileTheme;
  musicTitle: string | null;
  hasMusic: boolean;
  musicUpdatedAt: string | null;
  updatedAt: string | null;
  guestbook: ProfileGuestbookEntrySummary[];
  photos: ProfilePhotoSummary[];
  isOwner: boolean;
}

export interface FriendRequestSummary {
  id: string;
  requester: UserSummary;
  recipient: UserSummary;
  status: FriendRequestStatus;
  createdAt: string;
  respondedAt: string | null;
}

export interface MeetingInvitationSummary {
  id: string;
  meetingId: string;
  meetingTitle: string;
  scheduledAt: string;
  inviter: UserSummary;
  invitee: UserSummary;
  status: MeetingInvitationStatus;
  createdAt: string;
  respondedAt: string | null;
}

export interface MeetingMemberStatusEntry {
  userId: string;
  accountId: string;
  nickname: string;
  status: MeetingMemberStatus;
  invitationId: string | null;
  respondedAt: string | null;
}

export interface MeetingSummary {
  id: string;
  title: string;
  scheduledAt: string;
  status: MeetingStatus;
  inviteCode: string;
  visibility?: MeetingVisibility;
  categories?: string[];
  travelMetric?: TravelMetric;
  locationShareMode?: LocationShareMode;
  shareMinutesBefore?: number | null;
}

export interface MeetingJoinRequestSummary {
  id: string;
  meetingId: string;
  meetingTitle: string;
  requester: UserSummary;
  status: JoinRequestStatus;
  createdAt: string;
  respondedAt: string | null;
}

export interface FriendActivitySummary {
  meetingId: string;
  friend: UserSummary;
  createdAt: string;
  joinRequestStatus: JoinRequestStatus | null;
}

export interface NotificationSummary {
  id: string;
  type: string;
  title: string;
  body: string;
  data: Record<string, unknown> | null;
  readAt: string | null;
  createdAt: string;
}

export interface MeetingCallSummary {
  id: string;
  meetingId: string;
  meetingTitle: string;
  roomName: string;
  status: MeetingCallStatus;
  participantStatus: MeetingCallParticipantStatus;
  createdAt: string;
}

export interface ParticipantTravelTime {
  userId: string;
  nickname: string;
  durationMinutes: number;
  distanceMeters: number;
}

export interface MeetingRecommendation {
  id?: string;
  providerPlaceId: string | null;
  name: string;
  address: string;
  latitude: number;
  longitude: number;
  category: string;
  recommendationRank: number;
  averageDurationMinutes: number;
  maximumDurationMinutes: number;
  timeGapMinutes: number;
  participantTravelTimes: ParticipantTravelTime[];
}

export interface PlaceRecommendation {
  id: string;
  name: string;
  address: string;
  latitude: number;
  longitude: number;
  category: string;
  averageDurationMinutes: number;
  maximumDurationMinutes: number;
  timeGapMinutes: number;
  participantTravelTimes: ParticipantTravelTime[];
}

export interface ApiSuccess<T> {
  success: true;
  data: T;
}

export interface ApiFailure {
  success: false;
  error: {
    code: string;
    message: string;
  };
}

export type ApiResponse<T> = ApiSuccess<T> | ApiFailure;

export interface MeetingJoinPayload {
  meetingId: string;
}

export interface LocationUpdatePayload {
  meetingId: string;
  latitude: number;
  longitude: number;
  accuracy: number;
  sentAt: string;
}

export interface SharingStatusPayload {
  meetingId: string;
  status: SharingStatus;
}

export interface ParticipantLocationPayload extends LocationUpdatePayload {
  userId: string;
  nickname: string;
}

export interface ParticipantStatusPayload extends SharingStatusPayload {
  userId: string;
}

export interface PokeReceivedPayload {
  pokeId: string;
  meetingId: string | null;
  type: PokeType;
  senderId: string;
  senderNickname: string;
  sentAt: string;
}

export interface MeetingCallIncomingPayload {
  call: MeetingCallSummary;
}

export interface NotificationCreatedPayload {
  notification: NotificationSummary;
}

export interface MeetingUpdatedPayload {
  meetingId: string;
  reason: "MEMBERS" | "VOTES" | "PLACE" | "ARRIVAL" | "LOCATION_SHARING" | "DETAILS" | "STATUS";
}

export interface FriendRequestReceivedPayload {
  request: FriendRequestSummary;
}

export interface FriendRequestAcceptedPayload {
  request: FriendRequestSummary;
}

export interface FriendPresencePayload {
  userId: string;
  online: boolean;
}

export interface MeetingInvitationReceivedPayload {
  invitation: MeetingInvitationSummary;
}

export interface MeetingInvitationRespondedPayload {
  invitation: MeetingInvitationSummary;
}

export interface MeetingErrorPayload {
  code: string;
  message: string;
}

export interface ClientToServerEvents {
  "meeting:join": (payload: MeetingJoinPayload) => void;
  "location:update": (payload: LocationUpdatePayload) => void;
  "sharing:status": (payload: SharingStatusPayload) => void;
}

export interface ServerToClientEvents {
  "participant:location": (payload: ParticipantLocationPayload) => void;
  "participant:status": (payload: ParticipantStatusPayload) => void;
  "poke:received": (payload: PokeReceivedPayload) => void;
  "friend:request": (payload: FriendRequestReceivedPayload) => void;
  "friend:accepted": (payload: FriendRequestAcceptedPayload) => void;
  "friend:presence": (payload: FriendPresencePayload) => void;
  "meeting:invitation": (payload: MeetingInvitationReceivedPayload) => void;
  "meeting:invitation-responded": (payload: MeetingInvitationRespondedPayload) => void;
  "meeting:call-incoming": (payload: MeetingCallIncomingPayload) => void;
  "notification:created": (payload: NotificationCreatedPayload) => void;
  "meeting:updated": (payload: MeetingUpdatedPayload) => void;
  "meeting:error": (payload: MeetingErrorPayload) => void;
}
