import AsyncStorage from "@react-native-async-storage/async-storage";
import { ApiError, apiRequest } from "./api";
import { getStoredAccessToken } from "./authStorage";
import { automaticLocationStart, automaticLocationState, type AutomaticLocationMeeting } from "./automatic-location-policy";
import { createMeetingSocket, waitForSocketConnection } from "./socket";

const KEY = "meetfair.automatic-location";
interface Schedule { userId: string; meetingIds: string[] }
export interface AutomaticPosition { latitude: number; longitude: number; accuracy: number; timestamp: number }
let mutations: Promise<unknown> = Promise.resolve();
let running = false;
let sessionToken: string | null = null;
export function setAutomaticLocationSessionToken(token: string | null) { sessionToken = token; }

export async function readAutomaticSchedule(): Promise<Schedule | null> {
  const stored = await AsyncStorage.getItem(KEY);
  if (!stored) return null;
  try {
    const value = JSON.parse(stored) as Schedule;
    return typeof value.userId === "string" && Array.isArray(value.meetingIds)
      && value.meetingIds.every((id) => typeof id === "string") ? value : null;
  } catch { return null; }
}

function mutate(change: (current: Schedule | null) => Schedule | null) {
  const job = mutations.catch(() => undefined).then(async () => {
    const next = change(await readAutomaticSchedule());
    if (next?.meetingIds.length) await AsyncStorage.setItem(KEY, JSON.stringify(next));
    else await AsyncStorage.removeItem(KEY);
  });
  mutations = job;
  return job;
}

export function clearAutomaticSchedule() { return mutate(() => null); }
export function removeAutomaticMeeting(meetingId: string) {
  return mutate((current) => current ? { ...current, meetingIds: current.meetingIds.filter((id) => id !== meetingId) } : null);
}

export async function registerAutomaticMeeting(meetingId: string, userId: string) {
  await apiRequest(`/meetings/${meetingId}/location-consent`, { method: "PATCH", body: JSON.stringify({ consent: true }) });
  await mutate((current) => ({ userId, meetingIds: [...new Set([...(current?.userId === userId ? current.meetingIds : []), meetingId])] }));
}

export async function transmitAutomaticPosition(position: AutomaticPosition): Promise<void> {
  if (running) return;
  running = true;
  try {
    const schedule = await readAutomaticSchedule();
    if (!schedule) return;
    const token = sessionToken ?? await getStoredAccessToken();
    if (!token) return;
    const headers = { authorization: `Bearer ${token}` };
    for (const meetingId of schedule.meetingIds) {
      const socket = createMeetingSocket(token);
      try {
        const meeting = await apiRequest<AutomaticLocationMeeting>(`/meetings/${meetingId}`, { headers });
        const state = automaticLocationState(meeting, schedule.userId, Date.now());
        if (state === "STOP") { await removeAutomaticMeeting(meetingId); continue; }
        if (state !== "SHARE" || position.timestamp < automaticLocationStart(meeting)) continue;
        await waitForSocketConnection(socket);
        socket.emit("meeting:join", { meetingId });
        if (meeting.participants.find((p) => p.userId === schedule.userId)?.sharingStatus !== "SHARING") {
          socket.emit("sharing:status", { meetingId, status: "SHARING" });
          let ready = false;
          for (let attempt = 0; attempt < 6; attempt += 1) {
            const detail = await apiRequest<AutomaticLocationMeeting>(`/meetings/${meetingId}`, { headers });
            if (automaticLocationState(detail, schedule.userId, Date.now()) !== "SHARE") break;
            if (detail.participants.find((p) => p.userId === schedule.userId)?.sharingStatus === "SHARING") { ready = true; break; }
            await new Promise((resolve) => setTimeout(resolve, 200));
          }
          if (!ready) continue;
        }
        const current = await readAutomaticSchedule();
        if (current?.userId !== schedule.userId || !current.meetingIds.includes(meetingId)) continue;
        const sentAt = new Date(position.timestamp).toISOString();
        socket.emit("location:update", { meetingId, latitude: position.latitude, longitude: position.longitude, accuracy: position.accuracy, sentAt });
        // Keep the background task alive until the server has received this sample.
        for (let attempt = 0; attempt < 6; attempt += 1) {
          const data = await apiRequest<{ locations: Array<{ userId: string; updatedAt: string | null; arrivedAt: string | null }> }>(`/meetings/${meetingId}/locations`, { headers });
          const mine = data.locations.find((item) => item.userId === schedule.userId);
          if (mine?.arrivedAt) { await removeAutomaticMeeting(meetingId); break; }
          if (mine?.updatedAt && new Date(mine.updatedAt).getTime() >= position.timestamp) break;
          await new Promise((resolve) => setTimeout(resolve, 200));
        }
      } catch (error) {
        if (error instanceof ApiError && [401, 403, 404].includes(error.status)) await removeAutomaticMeeting(meetingId);
      } finally { socket.disconnect(); }
    }
  } finally { running = false; }
}
