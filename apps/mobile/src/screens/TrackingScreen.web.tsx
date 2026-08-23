import type { NativeStackScreenProps } from "@react-navigation/native-stack";
import { StyleSheet, Text, View } from "react-native";
import { SafeAreaView } from "react-native-safe-area-context";
import type { RootStackParamList } from "../../App";
import { ScreenHeader } from "../components/ui";
import { colors } from "../theme/colors";

type Props = NativeStackScreenProps<RootStackParamList, "Tracking">;

export function TrackingScreen({ navigation }: Props) {
  return (
    <SafeAreaView style={styles.safeArea}>
      <ScreenHeader title="실시간 위치" onBack={() => navigation.goBack()} />
      <View style={styles.content}>
        <Text style={styles.title}>모바일 앱에서만 지원합니다</Text>
        <Text style={styles.body}>실시간 위치 공유와 네이버 지도는 Android·iOS 개발 빌드에서 이용할 수 있습니다.</Text>
      </View>
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  safeArea: { flex: 1, backgroundColor: colors.background },
  content: { flex: 1, alignItems: "center", justifyContent: "center", padding: 28 },
  title: { color: colors.text, fontSize: 22, fontWeight: "900" },
  body: { color: colors.muted, textAlign: "center", lineHeight: 22, marginTop: 10 },
});
