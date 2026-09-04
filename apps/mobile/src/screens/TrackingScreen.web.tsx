import type { NativeStackScreenProps } from "@react-navigation/native-stack";
import { useCallback, useEffect, useRef, useState , useMemo} from "react";
import { StyleSheet, Text, View } from "react-native";
import { SafeAreaView } from "react-native-safe-area-context";
import type { RootStackParamList } from "../../App";
import { Button, Card, Pill, ScreenHeader } from "../components/ui";
import { apiRequest } from "../services/api";
import { createMeetingSocket } from "../services/socket";
import { useSession } from "../services/session";
import { useAppColors } from "../services/theme";

import { appConfig } from "../config/env";

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
  homeLatitude: number | null;
  homeLongitude: number | null;
}
interface MeetingLocationDetail {
  id: string;
  title: string;
  scheduledAt: string;
  confirmedPlace: { name: string; latitude: number; longitude: number } | null;
}

declare global {
  interface Window {
    kakao?: any;
    meetfairKakaoMapsLoader?: Promise<void>;
  }
}

function loadKakaoMaps() {
  if (window.kakao?.maps) return Promise.resolve();
  if (window.meetfairKakaoMapsLoader) return window.meetfairKakaoMapsLoader;
  window.meetfairKakaoMapsLoader = new Promise<void>((resolve, reject) => {
    const script = document.createElement("script");
    script.async = true;
    script.src = `https://dapi.kakao.com/v2/maps/sdk.js?appkey=${encodeURIComponent(appConfig.kakaoMapJsKey)}&autoload=false`;
    script.onload = () => {
      if (!window.kakao?.maps?.load) {
        reject(new Error("카카오 지도 SDK를 불러오지 못했습니다."));
        return;
      }
      window.kakao.maps.load(() => resolve());
    };
    script.onerror = () => reject(new Error("카카오 지도 SDK를 불러오지 못했습니다."));
    document.head.appendChild(script);
  });
  return window.meetfairKakaoMapsLoader;
}

function LocationMap({ locations, meeting }: { locations: LocationItem[]; meeting: MeetingLocationDetail | null }) {
  const palette = useAppColors();
  const styles = useStyles();
  const containerRef = useRef<any>(null);
  const mapRef = useRef<any>(null);
  const markersRef = useRef<any[]>([]);
  const hasFitInitialBoundsRef = useRef(false);
  const [error, setError] = useState("");
  const mappedLocations = locations.filter((item) => item.sharingStatus === "SHARING" && item.latitude != null && item.longitude != null);
  const homeLocations = locations.filter((item) => item.homeLatitude != null && item.homeLongitude != null);

  useEffect(() => {
    if (!appConfig.kakaoMapJsKey) {
      setError("카카오 지도 키가 설정되지 않았습니다.");
      return;
    }
    let cancelled = false;
    void loadKakaoMaps().then(() => {
      if (cancelled || !containerRef.current) return;
      const kakao = window.kakao;
      if (!mapRef.current) {
        mapRef.current = new kakao.maps.Map(containerRef.current, {
          center: new kakao.maps.LatLng(
            meeting?.confirmedPlace?.latitude ?? mappedLocations[0]?.latitude ?? 37.5665,
            meeting?.confirmedPlace?.longitude ?? mappedLocations[0]?.longitude ?? 126.978,
          ),
          level: 5,
        });
      }
      for (const marker of markersRef.current) marker.setMap(null);
      markersRef.current = [];
      for (const item of mappedLocations) {
        const position = new kakao.maps.LatLng(item.latitude, item.longitude);
        const content = document.createElement("div");
        content.style.cssText = "display:flex;flex-direction:column;align-items:center;gap:4px;";
        const dot = document.createElement("div");
        dot.style.cssText = "width:20px;height:20px;border-radius:50%;background:#1677ff;border:4px solid white;box-shadow:0 2px 8px rgba(0,0,0,.35);box-sizing:border-box;";
        const label = document.createElement("div");
        label.textContent = item.nickname;
        label.style.cssText = "padding:3px 7px;border-radius:10px;background:rgba(22,119,255,.92);color:white;font:800 11px system-ui,sans-serif;white-space:nowrap;";
        content.append(dot, label);
        markersRef.current.push(new kakao.maps.CustomOverlay({ map: mapRef.current, position, content, yAnchor: 0.45 }));
      }
      for (const item of homeLocations) {
        const position = new kakao.maps.LatLng(item.homeLatitude, item.homeLongitude);
        const content = document.createElement("div");
        content.style.cssText = "display:flex;flex-direction:column;align-items:center;gap:2px;";
        const icon = document.createElement("div");
        icon.textContent = "🏠";
        icon.style.cssText = "font-size:25px;filter:drop-shadow(0 2px 3px rgba(0,0,0,.3));";
        const label = document.createElement("div");
        label.textContent = item.nickname;
        label.style.cssText = "padding:3px 7px;border-radius:10px;background:rgba(30,30,30,.88);color:white;font:800 11px system-ui,sans-serif;white-space:nowrap;";
        content.append(icon, label);
        markersRef.current.push(new kakao.maps.CustomOverlay({ map: mapRef.current, position, content, yAnchor: 0.8 }));
      }
      if (!hasFitInitialBoundsRef.current) {
        const bounds = new kakao.maps.LatLngBounds();
        for (const item of mappedLocations) bounds.extend(new kakao.maps.LatLng(item.latitude, item.longitude));
        for (const item of homeLocations) bounds.extend(new kakao.maps.LatLng(item.homeLatitude, item.homeLongitude));
        if (meeting?.confirmedPlace) bounds.extend(new kakao.maps.LatLng(meeting.confirmedPlace.latitude, meeting.confirmedPlace.longitude));
        if (!bounds.isEmpty()) {
          mapRef.current.setBounds(bounds, 48, 48, 48, 48);
          hasFitInitialBoundsRef.current = true;
        }
      }
    }).catch((caught) => {
      if (!cancelled) setError(caught instanceof Error ? caught.message : "지도를 불러오지 못했습니다.");
    });
    return () => { cancelled = true; };
  }, [locations, meeting]);

  return (
    <View style={styles.locationMap}>
      <View ref={containerRef} style={styles.map} />
      {error ? <Text style={styles.mapError}>{error}</Text> : null}
      {!error && !mappedLocations.length ? <Text style={styles.mapHint}>위치 공유를 시작한 참여자의 위치가 여기에 표시됩니다.</Text> : null}
    </View>
  );
}

export function TrackingScreen({ navigation, route }: Props) {
  const palette = useAppColors();
  const styles = useStyles();
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
        setLocations((current) => current.map((item) => item.userId === user?.id ? {
          ...item,
          latitude: position.coords.latitude,
          longitude: position.coords.longitude,
          accuracy: position.coords.accuracy,
          updatedAt: new Date(position.timestamp).toISOString(),
          sharingStatus: "SHARING",
        } : item));
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
      <LocationMap locations={locations} meeting={meeting} />
      <View style={styles.legacyMapPlaceholder}>
        <Text style={styles.mapIcon}>⌖</Text>
        <Text style={styles.mapTitle}>브라우저 위치 공유</Text>
        <Text style={styles.mapBody}>현재 위치는 참여자에게 실시간으로 전송됩니다.</Text>
        {meeting?.confirmedPlace ? <Text style={styles.place}>모임 장소: {meeting.confirmedPlace.name}</Text> : null}
      </View>
      <View style={styles.panel}>
        <View style={styles.row}>
          <Text style={styles.title}>{locations.filter((item) => item.sharingStatus === "SHARING" && item.latitude != null && item.longitude != null).length}명 위치 공유</Text>
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

function useStyles() {
  const palette = useAppColors();
  return useMemo(
    () =>
      StyleSheet.create({
  safeArea: { flex: 1, backgroundColor: palette.background },
  locationMap: { flex: 1, minHeight: 300, backgroundColor: palette.primarySoft },
  map: { flex: 1, minHeight: 300 },
  mapError: { color: palette.red, textAlign: "center", padding: 14 },
  mapHint: { color: palette.muted, textAlign: "center", padding: 14 },
  legacyMapPlaceholder: { display: "none" },
  mapIcon: { color: palette.primary, fontSize: 52, fontWeight: "900" },
  mapTitle: { color: palette.text, fontSize: 20, fontWeight: "900", marginTop: 8 },
  mapBody: { color: palette.muted, textAlign: "center", marginTop: 8 },
  place: { color: palette.primary, fontSize: 12, fontWeight: "800", marginTop: 14 },
  panel: { maxHeight: "48%", backgroundColor: palette.surface, padding: 18, gap: 9 },
  row: { flexDirection: "row", alignItems: "center", justifyContent: "space-between" },
  title: { color: palette.text, fontSize: 18, fontWeight: "900" },
  person: { padding: 10 },
  personName: { color: palette.text, fontWeight: "800" },
  meta: { color: palette.muted, fontSize: 11, marginTop: 3 },
  message: { color: palette.primary, fontSize: 12, fontWeight: "700" },
  actions: { gap: 8 },

      }),
    [palette],
  );
}
