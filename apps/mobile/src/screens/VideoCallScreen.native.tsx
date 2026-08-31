import {
  isTrackReference,
  LiveKitRoom,
  registerGlobals,
  useConnectionState,
  useLocalParticipant,
  useParticipants,
  useTracks,
  VideoTrack,
} from "@livekit/react-native";
import type { NativeStackScreenProps } from "@react-navigation/native-stack";
import { Camera } from "expo-camera";
import { ConnectionState, Track } from "livekit-client";
import { useEffect, useState } from "react";
import { FlatList, Pressable, StyleSheet, Text, View } from "react-native";
import { SafeAreaView } from "react-native-safe-area-context";
import type { RootStackParamList } from "../../App";
import { Button, ScreenHeader } from "../components/ui";
import { apiRequest } from "../services/api";
import { colors } from "../theme/colors";

registerGlobals();

type Props = NativeStackScreenProps<RootStackParamList, "VideoCall">;
interface CallToken { url: string; token: string; roomName: string; recordingEnabled: boolean; leaveLockedUntil: string | null }
interface SwitchableMediaStreamTrack {
  applyConstraints(constraints: { facingMode: "user" | "environment" }): Promise<void>;
}

function ParticipantGrid() {
  const tracks = useTracks([Track.Source.Camera]);
  return (
    <FlatList
      data={tracks.filter(isTrackReference)}
      keyExtractor={(item) => `${item.participant.identity}:${item.source}`}
      numColumns={2}
      contentContainerStyle={styles.grid}
      renderItem={({ item }) => (
        <View style={styles.videoTile}>
          <VideoTrack trackRef={item} style={styles.video} objectFit="contain" />
          <Text style={styles.participantName}>{item.participant.name || item.participant.identity}</Text>
        </View>
      )}
      ListEmptyComponent={<Text style={styles.waiting}>참여자의 카메라를 기다리는 중입니다.</Text>}
    />
  );
}

function connectionLabel(state: ConnectionState) {
  if (state === ConnectionState.Connected) return "연결됨";
  if (state === ConnectionState.Reconnecting) return "재연결 중...";
  if (state === ConnectionState.Connecting) return "연결 중...";
  return "연결 끊김";
}

function formatRemainingTime(remainingMs: number) {
  const totalSeconds = Math.max(0, Math.ceil(remainingMs / 1000));
  const minutes = Math.floor(totalSeconds / 60);
  const seconds = totalSeconds % 60;
  return `${minutes}:${String(seconds).padStart(2, "0")}`;
}

function CallControls({ leaveLockRemainingMs, onLeave, onError }: {
  leaveLockRemainingMs: number;
  onLeave(): void;
  onError(message: string): void;
}) {
  const {
    cameraTrack,
    isCameraEnabled,
    localParticipant,
  } = useLocalParticipant();
  const [busy, setBusy] = useState(false);
  const [facingMode, setFacingMode] = useState<"user" | "environment">("user");

  async function run(action: () => Promise<void>) {
    if (busy) return;
    setBusy(true);
    try {
      await action();
    } catch (error) {
      onError(error instanceof Error ? error.message : "통화 설정을 변경하지 못했습니다.");
    } finally {
      setBusy(false);
    }
  }

  function toggleCamera() {
    void run(async () => {
      await localParticipant.setCameraEnabled(!isCameraEnabled);
    });
  }

  function switchCamera() {
    void run(async () => {
      const mediaTrack = cameraTrack?.track?.mediaStreamTrack as unknown as SwitchableMediaStreamTrack | undefined;
      if (!mediaTrack) throw new Error("카메라가 켜져 있을 때만 전환할 수 있습니다.");
      const nextMode = facingMode === "user" ? "environment" : "user";
      await mediaTrack.applyConstraints({ facingMode: nextMode });
      setFacingMode(nextMode);
    });
  }

  return (
    <View style={styles.controls}>
      <ControlButton disabled={busy} label={isCameraEnabled ? "카메라 끄기" : "카메라 켜기"} onPress={toggleCamera} />
      <ControlButton disabled={busy || !isCameraEnabled} label="카메라 전환" onPress={switchCamera} />
      <ControlButton
        danger
        disabled={busy || leaveLockRemainingMs > 0}
        label={leaveLockRemainingMs > 0 ? `종료까지 ${formatRemainingTime(leaveLockRemainingMs)}` : "통화 종료"}
        onPress={onLeave}
      />
    </View>
  );
}

function ControlButton({ danger = false, disabled = false, label, onPress }: {
  danger?: boolean;
  disabled?: boolean;
  label: string;
  onPress(): void;
}) {
  return (
    <Pressable
      accessibilityRole="button"
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

function CallContent({ leaveLockRemainingMs, onError, onLeave }: {
  leaveLockRemainingMs: number;
  onError(message: string): void;
  onLeave(): void;
}) {
  const connectionState = useConnectionState();
  const participants = useParticipants();
  return (
    <>
      <View style={styles.statusBar}>
        <Text style={styles.statusText}>{connectionLabel(connectionState)}</Text>
        <Text style={styles.statusText}>{participants.length}명 참여</Text>
      </View>
      <ParticipantGrid />
      <CallControls leaveLockRemainingMs={leaveLockRemainingMs} onError={onError} onLeave={onLeave} />
    </>
  );
}

export function VideoCallScreen({ navigation, route }: Props) {
  const { callId, meetingId } = route.params;
  const [credentials, setCredentials] = useState<CallToken | null>(null);
  const [message, setMessage] = useState("통화 연결 준비 중...");
  const [connecting, setConnecting] = useState(false);
  const [recordingEnabled, setRecordingEnabled] = useState<boolean | null>(null);
  const [leaveLockedUntil, setLeaveLockedUntil] = useState<number | null>(null);
  const [leaveLockRemainingMs, setLeaveLockRemainingMs] = useState(0);

  async function connect() {
    setConnecting(true);
    setMessage("통화 연결 준비 중...");
    try {
      const camera = await Camera.requestCameraPermissionsAsync();
      if (!camera.granted) throw new Error("카메라 권한이 필요합니다.");
      await apiRequest(`/meetings/${meetingId}/permissions`, {
        method: "PATCH",
        body: JSON.stringify({
          cameraPermissionGranted: true,
        }),
      });
      await apiRequest(`/meeting-calls/${callId}`, { method: "PATCH", body: JSON.stringify({ action: "accept" }) });
      const token = await apiRequest<CallToken>(`/meeting-calls/${callId}/token`, { method: "POST", body: "{}" });
      setRecordingEnabled(token.recordingEnabled);
      setLeaveLockedUntil(token.leaveLockedUntil ? new Date(token.leaveLockedUntil).getTime() : null);
      setCredentials(token);
      setMessage("");
    } catch (error) {
      setMessage(error instanceof Error ? error.message : "통화에 연결하지 못했습니다.");
    } finally {
      setConnecting(false);
    }
  }

  useEffect(() => {
    void connect();
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

  async function leave() {
    if (leaveLockRemainingMs > 0) {
      setMessage(`통화 연결 후 5분 동안 종료할 수 없습니다. ${formatRemainingTime(leaveLockRemainingMs)} 남았습니다.`);
      return;
    }
    try {
      await apiRequest(`/meeting-calls/${callId}`, { method: "PATCH", body: JSON.stringify({ action: "leave" }) });
    } catch (error) {
      setMessage(error instanceof Error ? error.message : "통화를 종료하지 못했습니다.");
      return;
    }
    navigation.goBack();
  }

  if (!credentials) {
    return (
      <SafeAreaView style={styles.safeArea}>
        <ScreenHeader title="지각 확인 통화" onBack={() => void leave()} />
        <Text style={styles.recordingPendingNotice}>녹화 가능 여부를 확인하고 있습니다.</Text>
        <View style={styles.center}>
          <Text style={styles.waiting}>{message}</Text>
          {!connecting ? <Button label="다시 연결" onPress={() => void connect()} /> : null}
          <Button label="통화 나가기" onPress={() => void leave()} variant="secondary" />
        </View>
      </SafeAreaView>
    );
  }

  return (
    <SafeAreaView style={styles.safeArea}>
      <ScreenHeader title="지각 확인 통화" />
      <Text style={recordingEnabled ? styles.recordingNotice : styles.recordingDisabledNotice}>
        {recordingEnabled
          ? "이 통화는 녹화되며 모임 시작 24시간 후 자동 삭제됩니다."
          : "녹화 저장소를 사용할 수 없어 녹화 없이 통화가 연결되었습니다."}
      </Text>
      {leaveLockRemainingMs > 0 ? (
        <Text style={styles.leaveLockNotice}>최소 통화 시간 · 종료까지 {formatRemainingTime(leaveLockRemainingMs)}</Text>
      ) : null}
      <LiveKitRoom serverUrl={credentials.url} token={credentials.token} connect audio={false} video onError={(error) => setMessage(error.message)}>
        <CallContent leaveLockRemainingMs={leaveLockRemainingMs} onError={setMessage} onLeave={() => void leave()} />
        {message ? <Text style={styles.error}>{message}</Text> : null}
      </LiveKitRoom>
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  safeArea: { flex: 1, backgroundColor: colors.charcoal },
  center: { flex: 1, alignItems: "center", justifyContent: "center", padding: 24 },
  grid: { flexGrow: 1, padding: 6 },
  videoTile: { width: "47%", flexGrow: 0, aspectRatio: 16 / 9, margin: 4, borderRadius: 16, overflow: "hidden", backgroundColor: colors.text },
  video: { flex: 1 },
  participantName: { position: "absolute", left: 10, bottom: 9, color: colors.surface, fontSize: 12, fontWeight: "800", backgroundColor: "rgba(0,0,0,0.45)", paddingHorizontal: 8, paddingVertical: 4, borderRadius: 8 },
  waiting: { color: colors.surface, textAlign: "center", padding: 24 },
  error: { color: colors.red, textAlign: "center", padding: 8 },
  recordingNotice: { color: colors.surface, backgroundColor: colors.red, textAlign: "center", paddingHorizontal: 12, paddingVertical: 8, fontSize: 12, fontWeight: "800" },
  recordingPendingNotice: { color: colors.surface, backgroundColor: colors.primary, textAlign: "center", paddingHorizontal: 12, paddingVertical: 8, fontSize: 12, fontWeight: "800" },
  recordingDisabledNotice: { color: colors.surface, backgroundColor: colors.amber, textAlign: "center", paddingHorizontal: 12, paddingVertical: 8, fontSize: 12, fontWeight: "800" },
  leaveLockNotice: { color: "#FFFFFF", backgroundColor: "#8A4B00", textAlign: "center", paddingHorizontal: 12, paddingVertical: 8, fontSize: 12, fontWeight: "900" },
  statusBar: { flexDirection: "row", justifyContent: "space-between", paddingHorizontal: 16, paddingVertical: 9, backgroundColor: colors.text },
  statusText: { color: colors.surface, fontSize: 12, fontWeight: "800" },
  controls: { flexDirection: "row", flexWrap: "wrap", justifyContent: "center", gap: 8, padding: 12, backgroundColor: colors.text },
  controlButton: { minHeight: 44, minWidth: "30%", borderRadius: 14, paddingHorizontal: 12, alignItems: "center", justifyContent: "center", backgroundColor: colors.surface },
  dangerButton: { backgroundColor: colors.red },
  controlPressed: { opacity: 0.75 },
  controlDisabled: { opacity: 0.4 },
  controlText: { color: colors.text, fontSize: 12, fontWeight: "900" },
  dangerText: { color: colors.surface },
});

