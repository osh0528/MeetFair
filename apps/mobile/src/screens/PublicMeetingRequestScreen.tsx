import type { NativeStackScreenProps } from "@react-navigation/native-stack";
import { useRef, useState } from "react";
import { StyleSheet, Text, View } from "react-native";
import { SafeAreaView } from "react-native-safe-area-context";
import type { RootStackParamList } from "../../App";
import { Button, ScreenHeader } from "../components/ui";
import { apiRequest } from "../services/api";
import { requestCameraAccess } from "../services/camera-permission";
import { colors } from "../theme/colors";

type Props = NativeStackScreenProps<RootStackParamList, "PublicMeetingRequest">;

export function PublicMeetingRequestScreen({ navigation, route }: Props) {
  const [message, setMessage] = useState("");
  const [requesting, setRequesting] = useState(false);
  const [requested, setRequested] = useState(false);
  const requestingRef = useRef(false);
  async function requestJoin() {
    if (requestingRef.current || requested) return;
    requestingRef.current = true;
    setRequesting(true);
    setMessage("");
    try {
      if (!await requestCameraAccess()) {
        setMessage("카메라 권한을 허용해야 참가 신청할 수 있습니다.");
        return;
      }
      await apiRequest(`/meetings/${route.params.meetingId}/join-requests`, {
        method: "POST",
        body: JSON.stringify({ cameraPermissionGranted: true }),
      });
      setRequested(true);
      setMessage("방장에게 참가 신청을 보냈습니다.");
    } catch (caught) {
      setMessage(caught instanceof Error ? caught.message : "참가 신청을 보내지 못했습니다.");
    } finally {
      requestingRef.current = false;
      setRequesting(false);
    }
  }
  return (
    <SafeAreaView style={styles.safeArea}>
      <ScreenHeader title="공개 모임 참가" onBack={() => navigation.goBack()} />
      <View style={styles.content}>
        <Text style={styles.title}>참가 승인을 요청할까요?</Text>
        <Text style={styles.body}>승인 전에는 모임 제목·시간·장소가 공개되지 않습니다. 승인되면 내 친구 피드에도 모임 존재가 표시됩니다.</Text>
        <Text style={styles.body}>지각자 자동 영상통화를 위해 카메라 권한이 필요합니다.</Text>
        {message ? <Text style={styles.message}>{message}</Text> : null}
        <Button disabled={requesting || requested} label={requested ? "참가 신청 완료" : requesting ? "신청 중..." : "카메라 확인 후 참가 신청"} onPress={requestJoin} />
      </View>
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  safeArea: { flex: 1, backgroundColor: colors.background },
  content: { padding: 20, gap: 14 },
  title: { color: colors.text, fontSize: 23, fontWeight: "900" },
  body: { color: colors.muted, lineHeight: 21 },
  message: { color: colors.primary, fontWeight: "800" },
});
