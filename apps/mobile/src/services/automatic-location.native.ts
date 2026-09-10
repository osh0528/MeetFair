import * as Location from "expo-location";
import * as TaskManager from "expo-task-manager";
import { apiRequest } from "./api";
import { clearAutomaticSchedule, readAutomaticSchedule, registerAutomaticMeeting, removeAutomaticMeeting, transmitAutomaticPosition } from "./automatic-location-core";

const TASK = "meetfair-automatic-location";
let syncing: Promise<void> = Promise.resolve();
TaskManager.defineTask(TASK, async ({ data, error }) => {
  if (error || !data) return;
  const location = (data as { locations: Location.LocationObject[] }).locations.at(-1);
  if (location) await transmitAutomaticPosition({ ...location.coords, accuracy: location.coords.accuracy ?? 0, timestamp: location.timestamp });
  if (!(await readAutomaticSchedule())?.meetingIds.length && await Location.hasStartedLocationUpdatesAsync(TASK)) {
    await Location.stopLocationUpdatesAsync(TASK);
  }
});

export async function automaticLocationEnabled(meetingId: string, userId: string) {
  const schedule = await readAutomaticSchedule();
  return schedule?.userId === userId && schedule.meetingIds.includes(meetingId);
}

export function syncAutomaticLocation(userId: string | null): Promise<void> {
  const job = syncing.catch(() => undefined).then(async () => {
    const schedule = await readAutomaticSchedule();
    if (!userId || (schedule && schedule.userId !== userId)) await clearAutomaticSchedule();
    const enabled = userId && schedule?.userId === userId && schedule.meetingIds.length > 0;
    const active = await Location.hasStartedLocationUpdatesAsync(TASK);
    if (!enabled) {
      if (active) await Location.stopLocationUpdatesAsync(TASK);
      return;
    }
    if (active) return;
    if (!(await Location.getBackgroundPermissionsAsync()).granted) return;
    await Location.startLocationUpdatesAsync(TASK, {
      accuracy: Location.Accuracy.High,
      timeInterval: 10000,
      distanceInterval: 0,
      pausesUpdatesAutomatically: false,
      showsBackgroundLocationIndicator: true,
      foregroundService: {
        notificationTitle: "MeetFair 자동 위치 공유",
        notificationBody: "자동 공유 대기·실행 중 · 모임 공유 시간부터 위치를 전송합니다. 앱에서 중지할 수 있습니다.",
        killServiceOnDestroy: false,
      },
    });
  });
  syncing = job;
  return job;
}

export async function setAutomaticLocation(meetingId: string, userId: string, enabled: boolean) {
  if (enabled) {
    if (!(await Location.requestForegroundPermissionsAsync()).granted) throw new Error("자동 공유를 사용하려면 위치 권한을 허용해 주세요.");
    if (!(await Location.requestBackgroundPermissionsAsync()).granted) throw new Error("자동 공유를 사용하려면 설정에서 위치 권한을 ‘항상 허용’으로 변경해 주세요.");
    await registerAutomaticMeeting(meetingId, userId);
    try { await syncAutomaticLocation(userId); }
    catch (error) {
      await removeAutomaticMeeting(meetingId);
      await apiRequest(`/meetings/${meetingId}/location-consent`, { method: "PATCH", body: JSON.stringify({ consent: false }) }).catch(() => undefined);
      throw error;
    }
  } else {
    await removeAutomaticMeeting(meetingId);
    await syncAutomaticLocation(userId);
    await apiRequest(`/meetings/${meetingId}/location-consent`, { method: "PATCH", body: JSON.stringify({ consent: false }) });
  }
}
