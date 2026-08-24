import { AudioSession, isTrackReference, LiveKitRoom, registerGlobals, VideoTrack, useTracks } from "@livekit/react-native";
import type { NativeStackScreenProps } from "@react-navigation/native-stack";
import { Camera } from "expo-camera";
import { Track } from "livekit-client";
import { useEffect, useState } from "react";
import { FlatList, StyleSheet, Text, View } from "react-native";
import { SafeAreaView } from "react-native-safe-area-context";
import type { RootStackParamList } from "../../App";
import { Button, ScreenHeader } from "../components/ui";
import { apiRequest } from "../services/api";
import { colors } from "../theme/colors";

registerGlobals();

type Props = NativeStackScreenProps<RootStackParamList, "VideoCall">;
interface CallToken { url: string; token: string; roomName: string }

function ParticipantGrid() {
  const tracks = useTracks([Track.Source.Camera]);
  return (
    <FlatList
      data={tracks.filter(isTrackReference)}
      keyExtractor={(item) => `${item.participant.identity}:${item.source}`}
      numColumns={2}
      contentContainerStyle={styles.grid}
      renderItem={({ item }) => <VideoTrack trackRef={item} style={styles.video} objectFit="cover" />}
      ListEmptyComponent={<Text style={styles.waiting}>참여자의 카메라를 기다리는 중입니다.</Text>}
    />
  );
}

export function VideoCallScreen({ navigation, route }: Props) {
  const { callId, meetingId } = route.params;
  const [credentials, setCredentials] = useState<CallToken | null>(null);
  const [message, setMessage] = useState("통화 연결 준비 중...");
  const [connecting, setConnecting] = useState(false);

  async function connect() {
    setConnecting(true);
    setMessage("통화 연결 준비 중...");
    try {
      const [camera, microphone] = await Promise.all([
        Camera.requestCameraPermissionsAsync(),
        Camera.requestMicrophonePermissionsAsync(),
      ]);
      if (!camera.granted || !microphone.granted) throw new Error("카메라와 마이크 권한이 모두 필요합니다.");
      await apiRequest(`/meetings/${meetingId}/permissions`, {
        method: "PATCH",
        body: JSON.stringify({
          cameraPermissionGranted: true,
          microphonePermissionGranted: true,
        }),
      });
      await apiRequest(`/meeting-calls/${callId}`, { method: "PATCH", body: JSON.stringify({ action: "accept" }) });
      const token = await apiRequest<CallToken>(`/meeting-calls/${callId}/token`, { method: "POST", body: "{}" });
      await AudioSession.startAudioSession();
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
    return () => { void AudioSession.stopAudioSession(); };
  }, [callId, meetingId]);

  async function leave() {
    await apiRequest(`/meeting-calls/${callId}`, { method: "PATCH", body: JSON.stringify({ action: "leave" }) }).catch(() => undefined);
    await AudioSession.stopAudioSession();
    navigation.goBack();
  }

  if (!credentials) {
    return (
      <SafeAreaView style={styles.safeArea}>
        <ScreenHeader title="지각 확인 통화" onBack={() => void leave()} />
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
      <LiveKitRoom serverUrl={credentials.url} token={credentials.token} connect audio video onError={(error) => setMessage(error.message)}>
        <ParticipantGrid />
        {message ? <Text style={styles.error}>{message}</Text> : null}
        <View style={styles.footer}><Button label="통화 나가기" onPress={leave} variant="secondary" /></View>
      </LiveKitRoom>
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  safeArea: { flex: 1, backgroundColor: colors.charcoal },
  center: { flex: 1, alignItems: "center", justifyContent: "center", padding: 24 },
  grid: { flexGrow: 1, padding: 6 },
  video: { flex: 1, minWidth: "47%", height: 280, margin: 4, borderRadius: 16 },
  waiting: { color: colors.surface, textAlign: "center", padding: 24 },
  error: { color: colors.red, textAlign: "center", padding: 8 },
  footer: { padding: 16 },
});
