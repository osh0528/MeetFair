import type { NativeStackScreenProps } from "@react-navigation/native-stack";
import { Room, RoomEvent, Track, type LocalTrack, type RemoteTrack } from "livekit-client";
import { useEffect, useRef, useState , useMemo} from "react";
import { Pressable, StyleSheet, Text, View } from "react-native";
import { SafeAreaView } from "react-native-safe-area-context";
import type { RootStackParamList } from "../../App";
import { Button, ScreenHeader } from "../components/ui";
import { apiRequest, ApiError } from "../services/api";
import { useAppColors } from "../services/theme";


type Props = NativeStackScreenProps<RootStackParamList, "VideoCall">;
interface CallToken { url: string; token: string; roomName: string; recordingEnabled: boolean; leaveLockedUntil: string }
interface TrackEntry { id: string; name: string; track: LocalTrack | RemoteTrack }

function formatRemainingTime(remainingMs: number) {
  const totalSeconds = Math.max(0, Math.ceil(remainingMs / 1000));
  const minutes = Math.floor(totalSeconds / 60);
  const seconds = totalSeconds % 60;
  return `${minutes}:${String(seconds).padStart(2, "0")}`;
}

function BrowserTrack({ entry }: { entry: TrackEntry }) {
  const palette = useAppColors();
  const styles = useStyles();
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
  const palette = useAppColors();
  const styles = useStyles();
  const { callId, meetingId } = route.params;
  const [room, setRoom] = useState<Room | null>(null);
  const [tracks, setTracks] = useState<TrackEntry[]>([]);
  const [message, setMessage] = useState("통화 연결 준비 중...");
  const [connecting, setConnecting] = useState(false);
  const [cameraEnabled, setCameraEnabled] = useState(true);
  const [microphoneEnabled, setMicrophoneEnabled] = useState(false);
  const [recordingEnabled, setRecordingEnabled] = useState<boolean | null>(null);
  const [leaveLockedUntil, setLeaveLockedUntil] = useState<number | null>(null);
  const [leaveLockRemainingMs, setLeaveLockRemainingMs] = useState(0);

  useEffect(() => {
    let activeRoom: Room | null = null;
    let cancelled = false;

    async function connect() {
      setConnecting(true);
      setMessage("카메라 권한 확인 중...");
      let microphonePermissionGranted = false;
      let micDeniedNotice: string | null = null;
      try {
        if (!navigator.mediaDevices?.getUserMedia) {
          throw new Error("이 브라우저는 카메라 영상통화를 지원하지 않습니다.");
        }
        const permissionStream = await navigator.mediaDevices.getUserMedia({ video: true, audio: false });
        permissionStream.getTracks().forEach((track) => track.stop());

        setMessage("마이크 권한 확인 중...");
        try {
          const micStream = await navigator.mediaDevices.getUserMedia({ audio: true });
          micStream.getTracks().forEach((track) => track.stop());
          microphonePermissionGranted = true;
        } catch (micError) {
          const isNotAllowed =
            micError instanceof DOMException &&
            (micError.name === "NotAllowedError" || micError.name === "PermissionDeniedError");
          if (isNotAllowed) {
            micDeniedNotice = "마이크 권한이 거부되었습니다. 음성 없이 연결됩니다. 브라우저 설정에서 허용해 주세요.";
          } else if (micError instanceof DOMException && micError.name === "NotFoundError") {
            micDeniedNotice = "마이크 장치를 찾을 수 없어 음성 없이 연결됩니다.";
          } else {
            micDeniedNotice = "마이크 권한을 확인하지 못했습니다. 음성 없이 연결됩니다.";
          }
          microphonePermissionGranted = false;
        }

        try {
          await apiRequest(`/meetings/${meetingId}/permissions`, {
            method: "PATCH",
            body: JSON.stringify({
              cameraPermissionGranted: true,
              microphonePermissionGranted,
            }),
          });
        } catch (error) {
          if (error instanceof ApiError) throw error;
          throw new Error(error instanceof Error ? error.message : "권한 정보를 저장하지 못했습니다.");
        }
        await apiRequest(`/meeting-calls/${callId}`, {
          method: "PATCH",
          body: JSON.stringify({ action: "accept" }),
        });
        const credentials = await apiRequest<CallToken>(`/meeting-calls/${callId}/token`, {
          method: "POST",
          body: "{}",
        });
        if (cancelled) return;
        setRecordingEnabled(credentials.recordingEnabled);
        setLeaveLockedUntil(new Date(credentials.leaveLockedUntil).getTime());

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
        await nextRoom.localParticipant.setCameraEnabled(true);
        if (microphonePermissionGranted) {
          try {
            await nextRoom.localParticipant.setMicrophoneEnabled(true);
            setMicrophoneEnabled(true);
          } catch {
            micDeniedNotice = "마이크를 켜지 못했습니다. 브라우저 설정을 확인해 주세요.";
          }
        }
        refreshTracks();
        setRoom(nextRoom);
        setMessage(micDeniedNotice ?? "");
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

  useEffect(() => {
    if (leaveLockedUntil === null) {
      setLeaveLockRemainingMs(0);
      return;
    }
    const updateRemaining = () => setLeaveLockRemainingMs(Math.max(0, leaveLockedUntil - Date.now()));
    updateRemaining();
    const timer = setInterval(updateRemaining, 1000);
    return () => clearInterval(timer);
  }, [leaveLockedUntil]);

  useEffect(() => navigation.addListener("beforeRemove", (event) => {
    if (leaveLockRemainingMs <= 0) return;
    event.preventDefault();
    setMessage(`통화 연결 후 5분 동안 종료할 수 없습니다. ${formatRemainingTime(leaveLockRemainingMs)} 남았습니다.`);
  }), [leaveLockRemainingMs, navigation]);

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
    if (leaveLockRemainingMs > 0) {
      setMessage(`통화 연결 후 5분 동안 종료할 수 없습니다. ${formatRemainingTime(leaveLockRemainingMs)} 남았습니다.`);
      return;
    }
    try {
      await apiRequest(`/meeting-calls/${callId}`, {
        method: "PATCH",
        body: JSON.stringify({ action: "leave" }),
      });
    } catch (error) {
      setMessage(error instanceof Error ? error.message : "통화를 종료하지 못했습니다.");
      return;
    }
    room?.disconnect();
    navigation.goBack();
  }

  return (
    <SafeAreaView style={styles.safeArea}>
      <ScreenHeader title="지각 확인 통화" onBack={() => void leave()} />
      <Text style={recordingEnabled === null
        ? styles.recordingPendingNotice
        : recordingEnabled
          ? styles.recordingNotice
          : styles.recordingDisabledNotice}
      >
        {recordingEnabled === null
          ? "녹화 가능 여부를 확인하고 있습니다."
          : recordingEnabled
            ? "이 통화는 녹화되며 모임 시작 24시간 후 자동 삭제됩니다."
            : "녹화 저장소를 사용할 수 없어 녹화 없이 통화가 연결되었습니다."}
      </Text>
      {leaveLockRemainingMs > 0 ? (
        <Text style={styles.leaveLockNotice}>최소 통화 시간 · 종료까지 {formatRemainingTime(leaveLockRemainingMs)}</Text>
      ) : null}
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
          </View>
          {message ? <Text style={styles.error}>{message}</Text> : null}
          <View style={styles.controls}>
            <ControlButton label={cameraEnabled ? "카메라 끄기" : "카메라 켜기"} onPress={() => void toggleCamera()} />
            <ControlButton label={microphoneEnabled ? "마이크 끄기" : "마이크 켜기"} onPress={() => void toggleMicrophone()} />
            <ControlButton
              danger
              disabled={leaveLockRemainingMs > 0}
              label={leaveLockRemainingMs > 0 ? `종료까지 ${formatRemainingTime(leaveLockRemainingMs)}` : "통화 종료"}
              onPress={() => void leave()}
            />
          </View>
        </>
      )}
    </SafeAreaView>
  );
}

function ControlButton({ danger = false, disabled = false, label, onPress }: {
  danger?: boolean;
  disabled?: boolean;
  label: string;
  onPress(): void;
}) {
  const palette = useAppColors();
  const styles = useStyles();
  return (
    <Pressable
      disabled={disabled}
      onPress={onPress}
      style={({ pressed }) => [
        styles.controlButton,
        danger && styles.dangerButton,
        pressed && !disabled && styles.controlPressed,
        disabled && styles.controlDisabled,
      ]}
    >
      <Text style={[styles.controlText, danger && styles.dangerText]}>{label}</Text>
    </Pressable>
  );
}

function useStyles() {
  const palette = useAppColors();
  return useMemo(
    () =>
      StyleSheet.create({
  safeArea: { flex: 1, backgroundColor: palette.charcoal },
  center: { flex: 1, alignItems: "center", justifyContent: "center", gap: 12, padding: 24 },
  statusBar: { flexDirection: "row", justifyContent: "space-between", paddingHorizontal: 16, paddingVertical: 9, backgroundColor: palette.text },
  statusText: { color: palette.surface, fontSize: 12, fontWeight: "800" },
  grid: { flex: 1, flexDirection: "row", flexWrap: "wrap", alignContent: "flex-start", padding: 6 },
  videoTile: { width: "48%", height: 280, margin: "1%", borderRadius: 16, overflow: "hidden", backgroundColor: palette.text },
  video: { flex: 1 },
  hiddenTrack: { width: 0, height: 0, overflow: "hidden" },
  participantName: { position: "absolute", left: 10, bottom: 9, color: palette.surface, fontSize: 12, fontWeight: "800", backgroundColor: "rgba(0,0,0,0.45)", paddingHorizontal: 8, paddingVertical: 4, borderRadius: 8 },
  waiting: { color: palette.surface, textAlign: "center", padding: 24 },
  error: { color: palette.red, textAlign: "center", padding: 8 },
  recordingNotice: { color: palette.surface, backgroundColor: palette.red, textAlign: "center", paddingHorizontal: 12, paddingVertical: 8, fontSize: 12, fontWeight: "800" },
  recordingPendingNotice: { color: palette.surface, backgroundColor: palette.primary, textAlign: "center", paddingHorizontal: 12, paddingVertical: 8, fontSize: 12, fontWeight: "800" },
  recordingDisabledNotice: { color: palette.surface, backgroundColor: palette.amber, textAlign: "center", paddingHorizontal: 12, paddingVertical: 8, fontSize: 12, fontWeight: "800" },
  leaveLockNotice: { color: "#FFFFFF", backgroundColor: "#8A4B00", textAlign: "center", paddingHorizontal: 12, paddingVertical: 8, fontSize: 12, fontWeight: "900" },
  controls: { flexDirection: "row", justifyContent: "center", gap: 8, padding: 12, backgroundColor: palette.text },
  controlButton: { minHeight: 44, minWidth: "28%", borderRadius: 14, paddingHorizontal: 12, alignItems: "center", justifyContent: "center", backgroundColor: palette.surface },
  dangerButton: { backgroundColor: palette.red },
  controlPressed: { opacity: 0.75 },
  controlDisabled: { opacity: 0.4 },
  controlText: { color: palette.text, fontSize: 12, fontWeight: "900" },
  dangerText: { color: palette.surface },

      }),
    [palette],
  );
}
