import { describe, expect, it } from "vitest";
import { automaticLocationState, type AutomaticLocationMeeting } from "./automatic-location-policy";

const meeting: AutomaticLocationMeeting = {
  id: "test-meeting", scheduledAt: "2026-09-10T09:00:00Z", status: "CONFIRMED", locationShareMode: "BEFORE_START", shareMinutesBefore: 30,
  participants: [{ userId: "test-user", locationConsent: true, arrivedAt: null, sharingStatus: "NOT_STARTED" }],
};
describe("automatic location sharing", () => {
  it("starts at the 30 minute boundary and keeps sharing for late participants", () => {
    expect(automaticLocationState(meeting, "test-user", Date.parse("2026-09-10T08:29:59Z"))).toBe("WAIT");
    expect(automaticLocationState(meeting, "test-user", Date.parse("2026-09-10T08:30:00Z"))).toBe("SHARE");
    expect(automaticLocationState(meeting, "test-user", Date.parse("2026-09-10T09:05:00Z"))).toBe("SHARE");
  });
  it("never enables sharing without consent or after arrival", () => {
    for (const participant of [{ ...meeting.participants[0]!, locationConsent: false }, { ...meeting.participants[0]!, arrivedAt: "2026-09-10T08:30:00Z" }]) {
      expect(automaticLocationState({ ...meeting, participants: [participant] }, "test-user", Date.parse("2026-09-10T09:00:00Z"))).toBe("STOP");
    }
    expect(automaticLocationState(meeting, "someone-else", Date.now())).toBe("STOP");
  });
  it("stops for cancelled, completed and disabled meetings", () => {
    for (const patch of [{ status: "CANCELLED" }, { status: "COMPLETED" }, { locationShareMode: "OFF" }]) {
      expect(automaticLocationState({ ...meeting, ...patch }, "test-user", Date.now())).toBe("STOP");
    }
  });
  it("honors a later server sharing window and never starts more than 30 minutes early", () => {
    expect(automaticLocationState({ ...meeting, shareMinutesBefore: 10 }, "test-user", Date.parse("2026-09-10T08:40:00Z"))).toBe("WAIT");
    expect(automaticLocationState({ ...meeting, shareMinutesBefore: 60 }, "test-user", Date.parse("2026-09-10T08:20:00Z"))).toBe("WAIT");
  });
});
