import type { LocationShareMode } from "@meetfair/shared";

// Contract §7: sharing windows are evaluated in Asia/Seoul (KST, UTC+9, no DST).
const KST_OFFSET_MINUTES = 9 * 60;

export interface ShareWindowMeeting {
  locationShareMode: LocationShareMode;
  scheduledAt: Date;
  shareMinutesBefore: number | null;
}

export type ShareWindowDecision =
  | { allowed: true; earliestAt: Date }
  | { allowed: false; reason: "SHARE_MODE_OFF" | "SHARING_TOO_EARLY"; earliestAt: Date | null };

/** UTC instant of KST midnight (00:00) for the KST calendar date containing `date`. */
export function kstMidnightUtc(date: Date): Date {
  const shifted = new Date(date.getTime() + KST_OFFSET_MINUTES * 60_000);
  return new Date(
    Date.UTC(shifted.getUTCFullYear(), shifted.getUTCMonth(), shifted.getUTCDate()) -
      KST_OFFSET_MINUTES * 60_000,
  );
}

/** Earliest instant at which participants may share location for this meeting. null = never (OFF). */
export function earliestShareTime(meeting: ShareWindowMeeting): Date | null {
  switch (meeting.locationShareMode) {
    case "OFF":
      return null;
    case "DAY_OF":
      return kstMidnightUtc(meeting.scheduledAt);
    case "BEFORE_START": {
      const minutes = meeting.shareMinutesBefore ?? 60;
      return new Date(meeting.scheduledAt.getTime() - minutes * 60_000);
    }
  }
}

export function canStartSharing(meeting: ShareWindowMeeting, now: Date): ShareWindowDecision {
  const earliest = earliestShareTime(meeting);
  if (earliest === null) return { allowed: false, reason: "SHARE_MODE_OFF", earliestAt: null };
  if (now < earliest) return { allowed: false, reason: "SHARING_TOO_EARLY", earliestAt: earliest };
  return { allowed: true, earliestAt: earliest };
}
