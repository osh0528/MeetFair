import { apiRequest } from "./api";
import { clearAutomaticSchedule, readAutomaticSchedule, registerAutomaticMeeting, removeAutomaticMeeting, transmitAutomaticPosition } from "./automatic-location-core";

let watcher: number | null = null;
export async function automaticLocationEnabled(meetingId: string, userId: string) {
  const schedule = await readAutomaticSchedule();
  return schedule?.userId === userId && schedule.meetingIds.includes(meetingId);
}
export async function syncAutomaticLocation(userId: string | null) {
  const schedule = await readAutomaticSchedule();
  if (!userId || (schedule && schedule.userId !== userId)) await clearAutomaticSchedule();
  const enabled = userId && schedule?.userId === userId && schedule.meetingIds.length > 0;
  if (!enabled && watcher !== null) { navigator.geolocation.clearWatch(watcher); watcher = null; }
  if (enabled && watcher === null && typeof navigator !== "undefined" && navigator.geolocation) {
    watcher = navigator.geolocation.watchPosition((position) => {
      void transmitAutomaticPosition({ latitude: position.coords.latitude, longitude: position.coords.longitude, accuracy: position.coords.accuracy, timestamp: position.timestamp });
    }, () => undefined, { enableHighAccuracy: true, maximumAge: 0 });
  }
  if (enabled && typeof navigator !== "undefined" && navigator.geolocation) {
    navigator.geolocation.getCurrentPosition((position) => {
      void transmitAutomaticPosition({ latitude: position.coords.latitude, longitude: position.coords.longitude, accuracy: position.coords.accuracy, timestamp: position.timestamp });
    }, () => undefined, { enableHighAccuracy: true, maximumAge: 0, timeout: 10000 });
  }
}
export async function setAutomaticLocation(meetingId: string, userId: string, enabled: boolean) {
  if (enabled) {
    await new Promise<void>((resolve, reject) => navigator.geolocation.getCurrentPosition(() => resolve(), () => reject(new Error("위치 권한을 허용해 주세요."))));
    await registerAutomaticMeeting(meetingId, userId);
  } else {
    await removeAutomaticMeeting(meetingId);
    await apiRequest(`/meetings/${meetingId}/location-consent`, { method: "PATCH", body: JSON.stringify({ consent: false }) });
  }
  await syncAutomaticLocation(userId);
}
