import type { MeetingInvitationSummary } from "@meetfair/shared";
import type { NativeStackScreenProps } from "@react-navigation/native-stack";
import { Camera } from "expo-camera";
import { useState } from "react";
import { StyleSheet, Text, View } from "react-native";
import { SafeAreaView } from "react-native-safe-area-context";
import type { RootStackParamList } from "../../App";
import { Button, Card, ScreenHeader } from "../components/ui";
import { apiRequest } from "../services/api";
import { colors } from "../theme/colors";

type Props = NativeStackScreenProps<RootStackParamList, "MeetingInvitation">;

export function MeetingInvitationScreen({ navigation, route }: Props) {
  const invitation = route.params.invitation as MeetingInvitationSummary;
  const [error, setError] = useState("");

  async function respond(action: "accept" | "reject") {
    setError("");
    let permissions = {};
    if (action === "accept") {
      const [camera, microphone] = await Promise.all([
        Camera.requestCameraPermissionsAsync(),
        Camera.requestMicrophonePermissionsAsync(),
      ]);
      if (!camera.granted || !microphone.granted) {
        setError("모임 참여에는 카메라와 마이크 권한이 모두 필요합니다.");
        return;
      }
      permissions = { cameraPermissionGranted: true, microphonePermissionGranted: true };
    }
    await apiRequest(`/meeting-invitations/${invitation.id}`, {
      method: "PATCH",
      body: JSON.stringify({ action, ...permissions }),
    });
    if (action === "accept") {
      navigation.replace("Meeting", { meetingId: invitation.meetingId });
    } else {
      navigation.replace("Home");
    }
  }

  return (
    <SafeAreaView style={styles.safeArea}>
      <ScreenHeader title="모임 초대" onBack={() => navigation.goBack()} />
      <View style={styles.content}>
        <Card style={styles.card}>
          <Text style={styles.title}>{invitation.meetingTitle}</Text>
          <Text style={styles.meta}>{invitation.inviter.nickname}님의 초대</Text>
          <Text style={styles.meta}>{new Date(invitation.scheduledAt).toLocaleString("ko-KR")}</Text>
          <Text style={styles.notice}>지각자가 있으면 방장과 지각자에게 그룹 영상통화가 발신됩니다. 참여하려면 카메라·마이크 권한이 필요합니다.</Text>
        </Card>
        {error ? <Text style={styles.error}>{error}</Text> : null}
        <Button label="권한 확인 후 수락" onPress={() => respond("accept")} />
        <Button label="거절" onPress={() => respond("reject")} variant="secondary" />
      </View>
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  safeArea: { flex: 1, backgroundColor: colors.background },
  content: { padding: 20, gap: 12 },
  card: { gap: 9 },
  title: { color: colors.text, fontSize: 22, fontWeight: "900" },
  meta: { color: colors.muted },
  notice: { color: colors.red, fontSize: 12, lineHeight: 19 },
  error: { color: colors.red },
});
