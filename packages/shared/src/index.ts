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

export interface UserSummary {
  id: string;
  nickname: string;
}

export interface MeetingSummary {
  id: string;
  title: string;
  scheduledAt: string;
  status: MeetingStatus;
  inviteCode: string;
}

export interface ParticipantTravelTime {
  userId: string;
  nickname: string;
  durationMinutes: number;
  distanceMeters: number;
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
  meetingId: string;
  senderId: string;
  senderNickname: string;
  sentAt: string;
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
  "meeting:error": (payload: MeetingErrorPayload) => void;
}
