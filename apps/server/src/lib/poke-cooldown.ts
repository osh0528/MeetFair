export const CASUAL_COOLDOWN_MS = 2_000;
export const MEETING_COOLDOWN_MS = 2_000;

const cooldowns = new Map<string, number>();

function prune() {
  const now = Date.now();
  for (const [key, timestamp] of cooldowns) {
    if (now - timestamp > 10 * 60_000) {
      cooldowns.delete(key);
    }
  }
}

export function checkCooldown(key: string, cooldownMs: number): number | null {
  prune();
  const last = cooldowns.get(key);
  if (last == null) return null;
  const elapsed = Date.now() - last;
  if (elapsed >= cooldownMs) return null;
  return cooldownMs - elapsed;
}

export function setCooldown(key: string): void {
  cooldowns.set(key, Date.now());
}

export function cooldownKey(params: { senderId: string; targetId: string; type: string; meetingId?: string | null }): string {
  return `${params.senderId}:${params.targetId}:${params.type}:${params.meetingId ?? ""}`;
}
