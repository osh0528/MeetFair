import AsyncStorage from "@react-native-async-storage/async-storage";
import { NaverMapMarkerOverlay, NaverMapView } from "@mj-studio/react-native-naver-map";
import type { NativeStackScreenProps } from "@react-navigation/native-stack";
import * as Location from "expo-location";
import * as TaskManager from "expo-task-manager";
import { useEffect, useMemo, useRef, useState } from "react";
import { Alert, Pressable, StyleSheet, Text, View } from "react-native";
import { SafeAreaView } from "react-native-safe-area-context";
import type { RootStackParamList } from "../../App";
import { Button, Card, Pill, ScreenHeader } from "../components/ui";
import { apiRequest } from "../services/api";
import { createMeetingSocket } from "../services/socket";
import { useSession } from "../services/session";
import { colors } from "../theme/colors";

const TASK_NAME = "meetfair-meeting-location";
const TASK_STATE_KEY = "meetfair.location-task";

interface StoredTaskState { meetingId: string; accessToken: string }
interface LocationItem {
  userId: string;
  nickname: string;
  latitude: number | null;
  longitude: number | null;
  accuracy: number | null;
  updatedAt: string | null;
  arrivedAt: string | null;
  sharingStatus: string;
  homeLatitude: number | null;
  homeLongitude: number | null;
}
interface MeetingLocationDetail {
  id: string;
  title: string;
  scheduledAt: string;
  confirmedPlace: { name: string; latitude: number; longitude: number } | null;
}

TaskManager.defineTask(TASK_NAME, async ({ data, error }) => {
  if (error || !data) return;
  const stored = await AsyncStorage.getItem(TASK_STATE_KEY);
  if (!stored) return;
  const state = JSON.parse(stored) as StoredTaskState;
  const locations = (data as { locations: Location.LocationObject[] }).locations;
  const latest = locations.at(-1);
  if (!latest) return;
  const socket = createMeetingSocket(state.accessToken);
  socket.connect();
  socket.once("connect", () => {
    socket.emit("meeting:join", { meetingId: state.meetingId });
    socket.emit("location:update", {
      meetingId: state.meetingId,
      latitude: latest.coords.latitude,
      longitude: latest.coords.longitude,
      accuracy: latest.coords.accuracy ?? 0,
      sentAt: new Date(latest.timestamp).toISOString(),
    });
    setTimeout(() => socket.disconnect(), 1000);
  });
});

type Props = NativeStackScreenProps<RootStackParamList, "Tracking">;

function LiveLocationMarker({ item, mine }: { item: LocationItem; mine: boolean }) {
  return (
    <NaverMapMarkerOverlay width={110} height={52} anchor={{ x: 0.5, y: 0.35 }} latitude={item.latitude!} longitude={item.longitude!}>
      <View collapsable={false} style={styles.liveMarker}>
        <View style={styles.liveDot} />
        <Text numberOfLines={1} style={styles.liveLabel}>{mine ? `${item.nickname} (나)` : item.nickname}</Text>
      </View>
    </NaverMapMarkerOverlay>
  );
}

function HomeLocationMarker({ item }: { item: LocationItem }) {
  return (
    <NaverMapMarkerOverlay width={110} height={58} anchor={{ x: 0.5, y: 0.4 }} latitude={item.homeLatitude!} longitude={item.homeLongitude!}>
      <View collapsable={false} style={styles.homeMarker}>
        <Text style={styles.homeIcon}>🏠</Text>
        <Text numberOfLines={1} style={styles.homeLabel}>{item.nickname}</Text>
      </View>
    </NaverMapMarkerOverlay>
  );
}

export function TrackingScreen({ navigation, route }: Props) {
  const meetingId = route.params.meetingId;
  const { accessToken, user } = useSession();
  const [meeting, setMeeting] = useState<MeetingLocationDetail | null>(null);
  const [locations, setLocations] = useState<LocationItem[]>([]);
  const [sharing, setSharing] = useState(false);
  const [mapExpanded, setMapExpanded] = useState(false);
  const [message, setMessage] = useState("");
  const watcher = useRef<Location.LocationSubscription | null>(null);
  const socketRef = useRef<ReturnType<typeof createMeetingSocket> | null>(null);

  async function load() {
    const [meetingData, locationData] = await Promise.all([
      apiRequest<MeetingLocationDetail>(`/meetings/${meetingId}`),
      apiRequest<{ locations: LocationItem[] }>(`/meetings/${meetingId}/locations`),
    ]);
    setMeeting(meetingData);
    setLocations(locationData.locations);
  }

  useEffect(() => {
    void load().catch((error) => setMessage(error instanceof Error ? error.message : "위치를 불러오지 못했습니다."));
    const timer = setInterval(() => void load().catch(() => undefined), 5000);
    if (accessToken) {
      const socket = createMeetingSocket(accessToken);
      socketRef.current = socket;
      socket.on("participant:location", (payload) => {
        setLocations((current) => current.map((item) => item.userId === payload.userId ? {
          ...item,
          latitude: payload.latitude,
          longitude: payload.longitude,
          accuracy: payload.accuracy,
          updatedAt: payload.sentAt,
          sharingStatus: "SHARING",
        } : item));
      });
      socket.on("participant:status", (payload) => {
        if (payload.meetingId !== meetingId) return;
        setLocations((current) => current.map((item) => item.userId === payload.userId ? {
          ...item,
          sharingStatus: payload.status,
          arrivedAt: payload.status === "ARRIVED" ? new Date().toISOString() : item.arrivedAt,
        } : item));
      });
      socket.connect();
      socket.once("connect", () => socket.emit("meeting:join", { meetingId }));
    }
    return () => {
      clearInterval(timer);
      watcher.current?.remove();
      socketRef.current?.disconnect();
      socketRef.current = null;
    };
  }, [accessToken, meetingId]);

  const mapCenter = useMemo(() => {
    const mine = locations.find((item) => item.userId === user?.id && item.latitude != null && item.longitude != null);
    return meeting?.confirmedPlace ?? (mine ? { latitude: mine.latitude!, longitude: mine.longitude! } : { latitude: 37.5665, longitude: 126.978 });
  }, [locations, meeting, user?.id]);

  async function startSharing() {
    if (!accessToken) return;
    const foreground = await Location.requestForegroundPermissionsAsync();
    if (!foreground.granted) {
      Alert.alert("위치 권한 필요", "실시간 위치 공유를 위해 위치 권한을 허용해 주세요.");
      return;
    }
    await apiRequest(`/meetings/${meetingId}/location-consent`, {
      method: "PATCH",
      body: JSON.stringify({ consent: true }),
    });
    const socket = socketRef.current;
    if (!socket) {
      setMessage("실시간 위치 연결을 준비하지 못했습니다.");
      return;
    }
    socket.emit("meeting:join", { meetingId });
    socket.emit("sharing:status", { meetingId, status: "SHARING" });
    watcher.current = await Location.watchPositionAsync({
      accuracy: Location.Accuracy.High,
      timeInterval: 5000,
      distanceInterval: 10,
    }, (position) => {
      socket.emit("location:update", {
        meetingId,
        latitude: position.coords.latitude,
        longitude: position.coords.longitude,
        accuracy: position.coords.accuracy ?? 0,
        sentAt: new Date(position.timestamp).toISOString(),
      });
      setLocations((current) => current.map((item) => item.userId === user?.id ? {
        ...item,
        latitude: position.coords.latitude,
        longitude: position.coords.longitude,
        accuracy: position.coords.accuracy ?? 0,
        updatedAt: new Date(position.timestamp).toISOString(),
        sharingStatus: "SHARING",
      } : item));
    });
    await AsyncStorage.setItem(TASK_STATE_KEY, JSON.stringify({ meetingId, accessToken } satisfies StoredTaskState));
    const background = await Location.requestBackgroundPermissionsAsync();
    if (background.granted && !await Location.hasStartedLocationUpdatesAsync(TASK_NAME)) {
      await Location.startLocationUpdatesAsync(TASK_NAME, {
        accuracy: Location.Accuracy.High,
        timeInterval: 10000,
        distanceInterval: 20,
        foregroundService: {
          notificationTitle: "MeetFair 위치 공유 중",
          notificationBody: "모임 도착 확인을 위해 위치를 공유하고 있습니다.",
        },
      });
    }
    setSharing(true);
    setMessage("실시간 위치 공유를 시작했습니다.");
  }

  async function stopSharing() {
    watcher.current?.remove();
    watcher.current = null;
    socketRef.current?.emit("sharing:status", { meetingId, status: "PAUSED" });
    if (await Location.hasStartedLocationUpdatesAsync(TASK_NAME)) await Location.stopLocationUpdatesAsync(TASK_NAME);
    await AsyncStorage.removeItem(TASK_STATE_KEY);
    await apiRequest(`/meetings/${meetingId}/location-consent`, {
      method: "PATCH",
      body: JSON.stringify({ consent: false }),
    });
    setSharing(false);
  }

  async function arrive() {
    await apiRequest(`/meetings/${meetingId}/arrive`, { method: "POST", body: "{}" });
    await stopSharing();
    await load();
  }

  return (
    <SafeAreaView style={styles.safeArea} edges={["top", "bottom"]}>
      <ScreenHeader title="실시간 위치" subtitle={meeting?.title} onBack={() => navigation.goBack()} />
      {meeting ? (
        <NaverMapView
          style={[styles.map, mapExpanded && styles.mapExpanded]}
          initialRegion={{ ...mapCenter, latitudeDelta: 0.025, longitudeDelta: 0.025 }}
          isShowLocationButton
          onTapMap={() => setMapExpanded(true)}
        >
          {meeting.confirmedPlace ? (
            <NaverMapMarkerOverlay
              latitude={meeting.confirmedPlace.latitude}
              longitude={meeting.confirmedPlace.longitude}
              caption={{ text: `약속 장소 · ${meeting.confirmedPlace.name}` }}
            />
          ) : null}
          {locations.filter((item) => item.homeLatitude != null && item.homeLongitude != null).map((item) => (
            <HomeLocationMarker item={item} key={`home:${item.userId}`} />
          ))}
          {locations.filter((item) => item.sharingStatus === "SHARING" && item.latitude != null && item.longitude != null).map((item) => (
            <LiveLocationMarker item={item} key={`live:${item.userId}`} mine={item.userId === user?.id} />
          ))}
        </NaverMapView>
      ) : (
        <View style={[styles.map, styles.mapLoading]}>
          <Text style={styles.meta}>지도를 준비하고 있습니다.</Text>
        </View>
      )}
      {mapExpanded ? (
        <Pressable
          accessibilityLabel="지도 축소"
          accessibilityRole="button"
          onPress={() => setMapExpanded(false)}
          style={styles.collapseMapButton}
        >
          <Text style={styles.collapseMapButtonText}>지도 닫기</Text>
        </Pressable>
      ) : null}
      {!mapExpanded ? <View style={styles.panel}>
        <View style={styles.row}>
          <Text style={styles.title}>{locations.filter((item) => item.sharingStatus === "SHARING" && item.latitude != null && item.longitude != null).length}명 위치 공유</Text>
          <Pill label={sharing ? "공유 중" : "공유 안 함"} tone={sharing ? "green" : "gray"} />
        </View>
        {locations.map((item) => (
          <Card key={item.userId} style={styles.person}>
            <Text style={styles.personName}>{item.nickname}</Text>
            <Text style={styles.meta}>{item.arrivedAt ? "도착" : item.updatedAt ? `${new Date(item.updatedAt).toLocaleTimeString("ko-KR")} 갱신` : "위치 대기 중"}</Text>
          </Card>
        ))}
        {message ? <Text style={styles.message}>{message}</Text> : null}
        <View style={styles.actions}>
          <Button label={sharing ? "위치 공유 중지" : "위치 공유 시작"} onPress={sharing ? stopSharing : startSharing} variant={sharing ? "secondary" : "primary"} />
          <Button label="도착 처리" onPress={arrive} variant="soft" />
        </View>
      </View> : null}
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  safeArea: { flex: 1, backgroundColor: colors.background },
  map: { flex: 1, minHeight: 300 },
  mapExpanded: { minHeight: 0 },
  mapLoading: { alignItems: "center", justifyContent: "center", backgroundColor: colors.primarySoft },
  collapseMapButton: { position: "absolute", top: 78, right: 14, zIndex: 10, borderRadius: 18, backgroundColor: "rgba(20,20,20,0.82)", paddingHorizontal: 14, paddingVertical: 9 },
  collapseMapButtonText: { color: "#FFFFFF", fontSize: 12, fontWeight: "900" },
  panel: { maxHeight: "48%", backgroundColor: colors.surface, padding: 18, gap: 9 },
  row: { flexDirection: "row", alignItems: "center", justifyContent: "space-between" },
  title: { color: colors.text, fontSize: 18, fontWeight: "900" },
  person: { padding: 10 },
  personName: { color: colors.text, fontWeight: "800" },
  meta: { color: colors.muted, fontSize: 11, marginTop: 3 },
  message: { color: colors.primary, fontSize: 12, fontWeight: "700" },
  actions: { gap: 8 },
  liveMarker: { width: 110, alignItems: "center", gap: 3 },
  liveDot: { width: 20, height: 20, borderRadius: 10, backgroundColor: "#1677FF", borderWidth: 4, borderColor: "#FFFFFF", shadowColor: "#000000", shadowOpacity: 0.3, shadowRadius: 4, shadowOffset: { width: 0, height: 2 }, elevation: 5 },
  liveLabel: { maxWidth: 105, borderRadius: 10, overflow: "hidden", backgroundColor: "#1677FF", color: "#FFFFFF", paddingHorizontal: 7, paddingVertical: 3, fontSize: 11, fontWeight: "900" },
  homeMarker: { width: 110, alignItems: "center", gap: 1 },
  homeIcon: { fontSize: 25 },
  homeLabel: { maxWidth: 105, borderRadius: 10, overflow: "hidden", backgroundColor: "#303030", color: "#FFFFFF", paddingHorizontal: 7, paddingVertical: 3, fontSize: 11, fontWeight: "900" },
});
