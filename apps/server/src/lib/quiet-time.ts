// Contract §8 quiet hours: pokes are always recorded, only the immediate push is
// deferred; a summary notification is sent after the quiet window ends.
// Field naming follows the existing schema (pokeQuietStartMinutes/pokeQuietEndMinutes).

function tzOffsetMinutes(date: Date, timeZone: string): number {
  const dtf = new Intl.DateTimeFormat("en-US", {
    timeZone,
    hour12: false,
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
    hour: "2-digit",
    minute: "2-digit",
    second: "2-digit",
  });
  const parts = dtf.formatToParts(date);
  const get = (type: string) =>
    Number(parts.find((part) => part.type === type)?.value ?? 0);
  const asUtc = Date.UTC(
    get("year"),
    get("month") - 1,
    get("day"),
    get("hour") % 24,
    get("minute"),
    get("second"),
  );
  return Math.round((asUtc - date.getTime()) / 60_000);
}

function zonedDayStartNaive(reference: Date, timeZone: string, dayShift: number): number {
  const offset = tzOffsetMinutes(reference, timeZone);
  const localAsUtc = reference.getTime() + offset * 60_000;
  return Math.floor(localAsUtc / 86_400_000) * 86_400_000 + dayShift * 86_400_000;
}

export function zonedMinuteToUtc(
  reference: Date,
  timeZone: string,
  dayShift: number,
  minuteOfDay: number,
): Date {
  const naiveLocalMidnight = zonedDayStartNaive(reference, timeZone, dayShift);
  const naiveLocal = naiveLocalMidnight + minuteOfDay * 60_000;
  const offset = tzOffsetMinutes(new Date(naiveLocal), timeZone);
  return new Date(naiveLocal - offset * 60_000);
}

export interface QuietWindow {
  start: Date;
  end: Date;
}

/**
 * The most recent quiet window that has fully ENDED as of `now`, or null when the
 * user has no quiet hours configured or is currently inside an open window.
 */
export function lastEndedQuietWindow(
  now: Date,
  startMinutes: number | null,
  endMinutes: number | null,
  timeZone: string,
): QuietWindow | null {
  if (startMinutes === null || endMinutes === null) return null;
  const dtf = new Intl.DateTimeFormat("en-US", {
    timeZone,
    hour12: false,
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
    hour: "2-digit",
    minute: "2-digit",
  });
  const parts = dtf.formatToParts(now);
  const get = (type: string) => Number(parts.find((part) => part.type === type)?.value ?? 0);
  const nowLocalMinutes = ((get("hour") % 24) * 60) + get("minute");

  if (startMinutes <= endMinutes) {
    // Same-day window [start, end).
    if (nowLocalMinutes >= endMinutes && nowLocalMinutes >= startMinutes) {
      return {
        start: zonedMinuteToUtc(now, timeZone, 0, startMinutes),
        end: zonedMinuteToUtc(now, timeZone, 0, endMinutes),
      };
    }
    // Before today's window opens or still inside it -> previous window ended yesterday.
    return {
      start: zonedMinuteToUtc(now, timeZone, -1, startMinutes),
      end: zonedMinuteToUtc(now, timeZone, -1, endMinutes),
    };
  }

  // Wrapping window (e.g. 22:00 -> 08:00). It ends on the day after it starts.
  if (nowLocalMinutes >= endMinutes) {
    // The window that ended most recently started yesterday evening.
    return {
      start: zonedMinuteToUtc(now, timeZone, -1, startMinutes),
      end: zonedMinuteToUtc(now, timeZone, 0, endMinutes),
    };
  }
  // Still inside tonight's open window.
  return null;
}

export function isQuietTime(
  startMinutes: number | null,
  endMinutes: number | null,
  timezone: string,
  now: Date = new Date(),
): boolean {
  if (startMinutes === null || endMinutes === null) return false;
  const dtf = new Intl.DateTimeFormat("en-US", {
    timeZone: timezone,
    hour12: false,
    hour: "2-digit",
    minute: "2-digit",
  });
  const parts = dtf.formatToParts(now);
  const hour = Number(parts.find((part) => part.type === "hour")?.value ?? 0);
  const minute = Number(parts.find((part) => part.type === "minute")?.value ?? 0);
  const nowMinutes = hour * 60 + minute;
  return startMinutes <= endMinutes
    ? nowMinutes >= startMinutes && nowMinutes < endMinutes
    : nowMinutes >= startMinutes || nowMinutes < endMinutes;
}
