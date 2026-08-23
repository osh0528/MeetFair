import type { NativeStackScreenProps } from "@react-navigation/native-stack";
import { StyleSheet, Text, View } from "react-native";
import { SafeAreaView } from "react-native-safe-area-context";
import type { RootStackParamList } from "../../App";
import { ScreenHeader } from "../components/ui";
import { colors } from "../theme/colors";

type Props = NativeStackScreenProps<RootStackParamList, "VideoCall">;

export function VideoCallScreen({ navigation }: Props) {
  return <SafeAreaView style={styles.safeArea}><ScreenHeader title="지각 확인 통화" onBack={() => navigation.goBack()} /><View style={styles.content}><Text style={styles.text}>영상 통화는 모바일 앱에서만 지원합니다.</Text></View></SafeAreaView>;
}

const styles = StyleSheet.create({ safeArea: { flex: 1, backgroundColor: colors.background }, content: { flex: 1, alignItems: "center", justifyContent: "center" }, text: { color: colors.text, fontWeight: "800" } });
