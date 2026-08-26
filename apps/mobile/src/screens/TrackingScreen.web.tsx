import type { NativeStackScreenProps } from "@react-navigation/native-stack";
import { useCallback, useEffect, useRef, useState } from "react";
import { StyleSheet, Text, View } from "react-native";
import { SafeAreaView } from "react-native-safe-area-context";
import type { RootStackParamList } from "../../App";
import { Button, Card, Pill, ScreenHeader } from "../components/ui";
import { apiRequest } from "../services/api";
import { createMeetingSocket } from "../services/socket";
import { useSession } from "../services/session";
import { colors } from "../theme/colors";

type Props = NativeStackScreenProps<RootStackParamList, "Tracking">;
interface LocationItem {
  userId: string;
  nickname: string;
  latitude: number | null;
  longitude: number | null;
  accuracy: number | null;
  updatedAt: string | null;
  arrivedAt: string | null;
  sharingStatus: string;
}
interface MeetingLocationDetail {
  id: string;
  title: string;
  scheduledAt: string;
  confirmedPlace: { name: string; latitude: number; longitude: number } | null;
}

export function TrackingScreen({ navigation, route }: Props) {
  const meetingId = route.params.meetingId;
  const { accessToken, user } = useSession();
  const [meeting, setMeeting] = useState<MeetingLocationDetail | null>(null);
  const [locations, setLocations] = useState<LocationItem[]>([]);
  const [sharing, setSharing] = useState(false);
  const [message, setMessage] = useState("");
  const socketRef = useRef<ReturnType<typeof createMeetingSocket> | null>(null);
  const watchIdRef = useRef<number | null>(null);

  const load = useCallback(async () => {
    const [meetingData, locationData] = await Promise.all([
      apiRequest<MeetingLocationDetail>(`/meetings/${meetingId}`),
      apiRequest<{ locations: LocationItem[] }>(`/meetings/${meetingId}/locations`),
    ]);
    setMeeting(meetingData);
    setLocations(locationData.locations);
  }, [meetingId]);

  useEffect(() => {
    void load().catch((error) => setMessage(error instanceof Error ? error.message : "위치를 불러오지 못했습니다."));
    const timer = setInterval(() => void load().catch(() => undefined), 5000);
    const socket = accessToken ? createMeetingSocket(accessToken) : null;
    if (socket) {
      socketRef.current = socket;
      socket.on("participant:location", (payload) => {
        setLocations((current) => current.map((item) => item.userId === payload.userId ? { ...item, latitude: payload.latitude, longitude: payload.longitude, accuracy: payload.accuracy, updatedAt: payload.sentAt, sharingStatus: "SHARING" } : item));
      });
      socket.on("participant:status", (payload) => {
        if (payload.meetingId !== meetingId) return;
        setLocations((current) => current.map((item) => item.userId === payload.userId ? { ...item, sharingStatus: payload.status, arrivedAt: payload.status === "ARRIVED" ? new Date().toISOString() : item.arrivedAt } : item));
      });
      socket.connect();
      socket.once("connect", () => socket.emit("meeting:join", { meetingId }));
    }
    return () => {
      clearInterval(timer);
      if (watchIdRef.current !== null) navigator.geolocation.clearWatch(watchIdRef.current);
      socket?.disconnect();
      socketRef.current = null;
    };
  }, [accessToken, load, meetingId]);

  async function startSharing() {
    if (!accessToken || !navigator.geolocation) {
      setMessage("이 브라우저에서는 위치 정보를 사용할 수 없습니다.");
      return;
    }
    try {
      await new Promise<void>((resolve, reject) => {
        navigator.geolocation.getCurrentPosition(() => resolve(), (error) => reject(new Error(error.message)), { enableHighAccuracy: true });
      });
      await apiRequest(`/meetings/${meetingId}/location-consent`, { method: "PATCH", body: JSON.stringify({ consent: true }) });
      const socket = socketRef.current;
      if (!socket) throw new Error("실시간 위치 연결을 준비하지 못했습니다.");
      socket.emit("meeting:join", { meetingId });
      socket.emit("sharing:status", { meetingId, status: "SHARING" });
      watchIdRef.current = navigator.geolocation.watchPosition((position) => {
        socket.emit("location:update", { meetingId, latitude: position.coords.latitude, longitude: position.coords.longitude, accuracy: position.coords.accuracy, sentAt: new Date(position.timestamp).toISOString() });
      }, (error) => setMessage(`위치 갱신에 실패했습니다: ${error.message}`), { enableHighAccuracy: true, maximumAge: 5000, timeout: 10000 });
      setSharing(true);
      setMessage("실시간 위치 공유를 시작했습니다.");
    } catch (error) {
      setMessage(error instanceof Error ? `위치 권한이 필요합니다: ${error.message}` : "위치 권한이 필요합니다.");
    }
  }

  async function stopSharing() {
    if (watchIdRef.current !== null) navigator.geolocation.clearWatch(watchIdRef.current);
    watchIdRef.current = null;
    socketRef.current?.emit("sharing:status", { meetingId, status: "PAUSED" });
    await apiRequest(`/meetings/${meetingId}/location-consent`, { method: "PATCH", body: JSON.stringify({ consent: false }) });
    setSharing(false);
    setMessage("실시간 위치 공유를 중지했습니다.");
  }

  async function arrive() {
    await apiRequest(`/meetings/${meetingId}/arrive`, { method: "POST", body: "{}" });
    await stopSharing();
    await load();
  }

  return (
    <SafeAreaView style={styles.safeArea}>
      <ScreenHeader title="실시간 위치" subtitle={meeting?.title} onBack={() => navigation.goBack()} />
      <View style={styles.mapPlaceholder}>
        <Text style={styles.mapIcon}>⌖</Text>
        <Text style={styles.mapTitle}>브라우저 위치 공유</Text>
        <Text style={styles.mapBody}>현재 위치는 참여자에게 실시간으로 전송됩니다.</Text>
        {meeting?.confirmedPlace ? <Text style={styles.place}>모임 장소: {meeting.confirmedPlace.name}</Text> : null}
      </View>
      <View style={styles.panel}>
        <View style={styles.row}>
          <Text style={styles.title}>{locations.filter((item) => item.latitude != null).length}명 위치 공유</Text>
          <Pill label={sharing ? "공유 중" : "공유 안 함"} tone={sharing ? "green" : "gray"} />
        </View>
        {locations.map((item) => (
          <Card key={item.userId} style={styles.person}>
            <Text style={styles.personName}>{item.nickname}{item.userId === user?.id ? " (나)" : ""}</Text>
            <Text style={styles.meta}>{item.arrivedAt ? "도착" : item.updatedAt ? `${new Date(item.updatedAt).toLocaleTimeString("ko-KR")} 갱신` : "위치 대기 중"}</Text>
          </Card>
        ))}
        {message ? <Text style={styles.message}>{message}</Text> : null}
        <View style={styles.actions}>
          <Button label={sharing ? "위치 공유 중지" : "위치 공유 시작"} onPress={() => void (sharing ? stopSharing() : startSharing())} variant={sharing ? "secondary" : "primary"} />
          <Button label="도착 처리" onPress={() => void arrive()} variant="soft" />
        </View>
      </View>
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  safeArea: { flex: 1, backgroundColor: colors.background },
  mapPlaceholder: { flex: 1, minHeight: 300, alignItems: "center", justifyContent: "center", padding: 28, backgroundColor: colors.primarySoft },
  mapIcon: { color: colors.primary, fontSize: 52, fontWeight: "900" },
  mapTitle: { color: colors.text, fontSize: 20, fontWeight: "900", marginTop: 8 },
  mapBody: { color: colors.muted, textAlign: "center", marginTop: 8 },
  place: { color: colors.primary, fontSize: 12, fontWeight: "800", marginTop: 14 },
  panel: { maxHeight: "48%", backgroundColor: colors.surface, padding: 18, gap: 9 },
  row: { flexDirection: "row", alignItems: "center", justifyContent: "space-between" },
  title: { color: colors.text, fontSize: 18, fontWeight: "900" },
  person: { padding: 10 },
  personName: { color: colors.text, fontWeight: "800" },
  meta: { color: colors.muted, fontSize: 11, marginTop: 3 },
  message: { color: colors.primary, fontSize: 12, fontWeight: "700" },
  actions: { gap: 8 },
});
