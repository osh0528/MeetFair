export const MINIMUM_CALL_DURATION_MS = 5 * 60_000;

export function callLeaveLockedUntil(joinedAt: Date) {
  return new Date(joinedAt.getTime() + MINIMUM_CALL_DURATION_MS);
}

export function callLeaveLockRemainingMs(joinedAt: Date, now = new Date()) {
  return Math.max(0, callLeaveLockedUntil(joinedAt).getTime() - now.getTime());
}
