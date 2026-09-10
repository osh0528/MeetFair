export interface AutomaticLocationMeeting {
  id: string;
  scheduledAt: string;
  status: string;
  locationShareMode: string;
  shareMinutesBefore: number | null;
  participants: Array<{ userId: string; locationConsent: boolean; arrivedAt: string | null; sharingStatus: string }>;
}

export function automaticLocationStart(meeting: AutomaticLocationMeeting): number {
  const scheduled = new Date(meeting.scheduledAt).getTime();
  if (meeting.locationShareMode === "OFF" || !Number.isFinite(scheduled)) return Infinity;
  const thirtyMinutesBefore = scheduled - 30 * 60_000;
  if (meeting.locationShareMode === "BEFORE_START") {
    return Math.max(thirtyMinutesBefore, scheduled - (meeting.shareMinutesBefore ?? 30) * 60_000);
  }
  if (meeting.locationShareMode === "DAY_OF") {
    const kst = new Date(scheduled + 9 * 3600_000);
    const midnight = Date.UTC(kst.getUTCFullYear(), kst.getUTCMonth(), kst.getUTCDate()) - 9 * 3600_000;
    return Math.max(thirtyMinutesBefore, midnight);
  }
  return Infinity;
}

export function automaticLocationState(meeting: AutomaticLocationMeeting, userId: string, now: number): "STOP" | "WAIT" | "SHARE" {
  const mine = meeting.participants.find((participant) => participant.userId === userId);
  if (!mine?.locationConsent || mine.arrivedAt || meeting.locationShareMode === "OFF"
    || ["COMPLETED", "CANCELLED"].includes(meeting.status)) return "STOP";
  return now >= automaticLocationStart(meeting) ? "SHARE" : "WAIT";
}
