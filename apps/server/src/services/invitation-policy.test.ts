import { describe, expect, it } from "vitest";
import { canInviteToMeeting } from "./invitation-policy.js";

describe("meeting invitation policy", () => {
  const scheduledAt = new Date("2026-08-24T12:00:00.000Z");

  it("allows invitations until exactly 30 minutes before the meeting", () => {
    expect(canInviteToMeeting(scheduledAt, new Date("2026-08-24T11:30:00.000Z"))).toBe(true);
  });

  it("rejects invitations after the 30-minute cutoff", () => {
    expect(canInviteToMeeting(scheduledAt, new Date("2026-08-24T11:30:00.001Z"))).toBe(false);
  });
});
