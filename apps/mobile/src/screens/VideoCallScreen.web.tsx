import type { NativeStackScreenProps } from "@react-navigation/native-stack";
import { Room, RoomEvent, Track, type LocalTrack, type RemoteTrack } from "livekit-client";
import { useEffect, useRef, useState } from "react";
import { Pressable, StyleSheet, Text, View } from "react-native";
import { SafeAreaView } from "react-native-safe-area-context";
import type { RootStackParamList } from "../../App";
import { Button, ScreenHeader } from "../components/ui";
import { apiRequest } from "../services/api";
import { colors } from "../theme/colors";

type Props = NativeStackScreenProps<RootStackParamList, "VideoCall">;
interface CallToken { url: string; token: string; roomName: string }
interface TrackEntry { id: string; name: string; track: LocalTrack | RemoteTrack }

function BrowserTrack({ entry }: { entry: TrackEntry }) {
  const containerRef = useRef<View>(null);

  useEffect(() => {
    const container = containerRef.current as unknown as HTMLElement | null;
    if (!container) return;
    const element = entry.track.attach();
    element.autoplay = true;
    element.style.width = "100%";
    element.style.height = "100%";
    element.style.objectFit = "cover";
    if (entry.track.kind === Track.Kind.Audio) element.style.display = "none";
    container.appendChild(element);
    return () => {
      entry.track.detach(element);
      element.remove();
    };
  }, [entry]);

  return (
    <View style={entry.track.kind === Track.Kind.Audio ? styles.hiddenTrack : styles.videoTile}>
      <View ref={containerRef} style={styles.video} />
      {entry.track.kind === Track.Kind.Video ? <Text style={styles.participantName}>{entry.name}</Text> : null}
    </View>
  );
}

export function VideoCallScreen({ navigation, route }: Props) {
  const { callId, meetingId } = route.params;
  const [room, setRoom] = useState<Room | null>(null);
  const [tracks, setTracks] = useState<TrackEntry[]>([]);
  const [message, setMessage] = useState("통화 연결 준비 중...");
  const [connecting, setConnecting] = useState(false);
  const [cameraEnabled, setCameraEnabled] = useState(true);
  const [microphoneEnabled, setMicrophoneEnabled] = useState(true);

  useEffect(() => {
    let activeRoom: Room | null = null;
    let cancelled = false;

    async function connect() {
      setConnecting(true);
      setMessage("카메라와 마이크 권한 확인 중...");
      try {
        if (!navigator.mediaDevices?.getUserMedia) {
          throw new Error("이 브라우저는 카메라·마이크 영상통화를 지원하지 않습니다.");
        }
        const permissionStream = await navigator.mediaDevices.getUserMedia({ video: true, audio: true });
        permissionStream.getTracks().forEach((track) => track.stop());

        await apiRequest(`/meetings/${meetingId}/permissions`, {
          method: "PATCH",
          body: JSON.stringify({
            cameraPermissionGranted: true,
            microphonePermissionGranted: true,
          }),
        });
        await apiRequest(`/meeting-calls/${callId}`, {
          method: "PATCH",
          body: JSON.stringify({ action: "accept" }),
        });
        const credentials = await apiRequest<CallToken>(`/meeting-calls/${callId}/token`, {
          method: "POST",
          body: "{}",
        });
        if (cancelled) return;

        const nextRoom = new Room({ adaptiveStream: true, dynacast: true });
        activeRoom = nextRoom;

        const refreshTracks = () => {
          const nextTracks: TrackEntry[] = [];
          for (const publication of nextRoom.localParticipant.trackPublications.values()) {
            if (publication.track) {
              nextTracks.push({
                id: `local:${publication.trackSid}`,
                name: nextRoom.localParticipant.name || "나",
                track: publication.track,
              });
            }
          }
          for (const participant of nextRoom.remoteParticipants.values()) {
            for (const publication of participant.trackPublications.values()) {
              if (publication.track) {
                nextTracks.push({
                  id: `${participant.identity}:${publication.trackSid}`,
                  name: participant.name || participant.identity,
                  track: publication.track,
                });
              }
            }
          }
          setTracks(nextTracks);
        };

        nextRoom
          .on(RoomEvent.TrackSubscribed, refreshTracks)
          .on(RoomEvent.TrackUnsubscribed, refreshTracks)
          .on(RoomEvent.LocalTrackPublished, refreshTracks)
          .on(RoomEvent.LocalTrackUnpublished, refreshTracks)
          .on(RoomEvent.ParticipantDisconnected, refreshTracks)
          .on(RoomEvent.Disconnected, () => setMessage("통화 연결이 종료됐습니다."));

        setMessage("통화 연결 중...");
        await nextRoom.connect(credentials.url, credentials.token);
        await nextRoom.localParticipant.enableCameraAndMicrophone();
        await nextRoom.startAudio();
        refreshTracks();
        setRoom(nextRoom);
        setMessage("");
      } catch (error) {
        if (!cancelled) {
          setMessage(error instanceof Error ? error.message : "통화에 연결하지 못했습니다.");
        }
        activeRoom?.disconnect();
      } finally {
        if (!cancelled) setConnecting(false);
      }
    }

    void connect();
    return () => {
      cancelled = true;
      activeRoom?.disconnect();
    };
  }, [callId, meetingId]);

  async function toggleCamera() {
    if (!room) return;
    const next = !cameraEnabled;
    try {
      await room.localParticipant.setCameraEnabled(next);
      setCameraEnabled(next);
    } catch (error) {
      setMessage(error instanceof Error ? error.message : "카메라 설정을 변경하지 못했습니다.");
    }
  }

  async function toggleMicrophone() {
    if (!room) return;
    const next = !microphoneEnabled;
    try {
      await room.localParticipant.setMicrophoneEnabled(next);
      setMicrophoneEnabled(next);
    } catch (error) {
      setMessage(error instanceof Error ? error.message : "마이크 설정을 변경하지 못했습니다.");
    }
  }

  async function leave() {
    room?.disconnect();
    await apiRequest(`/meeting-calls/${callId}`, {
      method: "PATCH",
      body: JSON.stringify({ action: "leave" }),
    }).catch(() => undefined);
    navigation.goBack();
  }

  return (
    <SafeAreaView style={styles.safeArea}>
      <ScreenHeader title="지각 확인 통화" onBack={() => void leave()} />
      {!room ? (
        <View style={styles.center}>
          <Text style={styles.waiting}>{message}</Text>
          {!connecting ? <Button label="다시 시도" onPress={() => navigation.replace("VideoCall", { callId, meetingId })} /> : null}
          <Button label="통화 나가기" onPress={() => void leave()} variant="secondary" />
        </View>
      ) : (
        <>
          <View style={styles.statusBar}>
            <Text style={styles.statusText}>연결됨</Text>
            <Text style={styles.statusText}>{room.remoteParticipants.size + 1}명 참여</Text>
          </View>
          <View style={styles.grid}>
            {tracks.filter((entry) => entry.track.kind === Track.Kind.Video).map((entry) => <BrowserTrack key={entry.id} entry={entry} />)}
            {!tracks.some((entry) => entry.track.kind === Track.Kind.Video) ? <Text style={styles.waiting}>카메라 화면을 준비하는 중입니다.</Text> : null}
            {tracks.filter((entry) => entry.track.kind === Track.Kind.Audio).map((entry) => <BrowserTrack key={entry.id} entry={entry} />)}
          </View>
          {message ? <Text style={styles.error}>{message}</Text> : null}
          <View style={styles.controls}>
            <ControlButton label={microphoneEnabled ? "음소거" : "마이크 켜기"} onPress={() => void toggleMicrophone()} />
            <ControlButton label={cameraEnabled ? "카메라 끄기" : "카메라 켜기"} onPress={() => void toggleCamera()} />
            <ControlButton danger label="통화 종료" onPress={() => void leave()} />
          </View>
        </>
      )}
    </SafeAreaView>
  );
}

function ControlButton({ danger = false, label, onPress }: { danger?: boolean; label: string; onPress(): void }) {
  return (
    <Pressable onPress={onPress} style={({ pressed }) => [styles.controlButton, danger && styles.dangerButton, pressed && styles.controlPressed]}>
      <Text style={[styles.controlText, danger && styles.dangerText]}>{label}</Text>
    </Pressable>
  );
}

const styles = StyleSheet.create({
  safeArea: { flex: 1, backgroundColor: colors.charcoal },
  center: { flex: 1, alignItems: "center", justifyContent: "center", gap: 12, padding: 24 },
  statusBar: { flexDirection: "row", justifyContent: "space-between", paddingHorizontal: 16, paddingVertical: 9, backgroundColor: colors.text },
  statusText: { color: colors.surface, fontSize: 12, fontWeight: "800" },
  grid: { flex: 1, flexDirection: "row", flexWrap: "wrap", alignContent: "flex-start", padding: 6 },
  videoTile: { width: "48%", height: 280, margin: "1%", borderRadius: 16, overflow: "hidden", backgroundColor: colors.text },
  video: { flex: 1 },
  hiddenTrack: { width: 0, height: 0, overflow: "hidden" },
  participantName: { position: "absolute", left: 10, bottom: 9, color: colors.surface, fontSize: 12, fontWeight: "800", backgroundColor: "rgba(0,0,0,0.45)", paddingHorizontal: 8, paddingVertical: 4, borderRadius: 8 },
  waiting: { color: colors.surface, textAlign: "center", padding: 24 },
  error: { color: colors.red, textAlign: "center", padding: 8 },
  controls: { flexDirection: "row", justifyContent: "center", gap: 8, padding: 12, backgroundColor: colors.text },
  controlButton: { minHeight: 44, minWidth: "28%", borderRadius: 14, paddingHorizontal: 12, alignItems: "center", justifyContent: "center", backgroundColor: colors.surface },
  dangerButton: { backgroundColor: colors.red },
  controlPressed: { opacity: 0.75 },
  controlText: { color: colors.text, fontSize: 12, fontWeight: "900" },
  dangerText: { color: colors.surface },
});
