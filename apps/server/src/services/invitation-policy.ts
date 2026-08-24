export const MEETING_INVITATION_CUTOFF_MINUTES = 30;

export function canInviteToMeeting(scheduledAt: Date, now = new Date()) {
  const cutoff = scheduledAt.getTime() - MEETING_INVITATION_CUTOFF_MINUTES * 60_000;
  return now.getTime() <= cutoff;
}
