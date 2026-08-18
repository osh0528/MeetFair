import type { NativeStackScreenProps } from "@react-navigation/native-stack";
import { useState } from "react";
import { Pressable, StyleSheet, Text, View } from "react-native";
import type { RootStackParamList } from "../../App";
import { checkServerHealth } from "../services/api";

type Props = NativeStackScreenProps<RootStackParamList, "Home">;

export function HomeScreen({ navigation }: Props) {
  const [serverStatus, setServerStatus] = useState("연결 확인 전");

  const handleHealthCheck = async () => {
    setServerStatus("확인 중...");
    const result = await checkServerHealth();
    setServerStatus(result.success ? "서버 연결 성공" : result.error.message);
  };

  return (
    <View style={styles.container}>
      <View style={styles.hero}>
        <Text style={styles.eyebrow}>모두에게 공평한 약속</Text>
        <Text style={styles.title}>MeetFair</Text>
        <Text style={styles.description}>
          출발지를 비교해 공평한 장소를 찾고, 약속 전에는 서로의 이동 상태를
          확인해요.
        </Text>
      </View>

      <View style={styles.card}>
        <Text style={styles.cardTitle}>개발 연결 상태</Text>
        <Text style={styles.status}>{serverStatus}</Text>
        <Pressable style={styles.secondaryButton} onPress={handleHealthCheck}>
          <Text style={styles.secondaryButtonText}>백엔드 연결 확인</Text>
        </Pressable>
      </View>

      <Pressable
        style={styles.primaryButton}
        onPress={() => navigation.navigate("Meeting")}
      >
        <Text style={styles.primaryButtonText}>샘플 약속 보기</Text>
      </Pressable>
    </View>
  );
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
    backgroundColor: "#F4F8FC",
    padding: 24,
    justifyContent: "center",
    gap: 20,
  },
  hero: { gap: 8 },
  eyebrow: { color: "#12A594", fontSize: 15, fontWeight: "700" },
  title: { color: "#15314B", fontSize: 42, fontWeight: "800" },
  description: { color: "#5E7184", fontSize: 16, lineHeight: 24 },
  card: {
    backgroundColor: "#FFFFFF",
    borderRadius: 20,
    padding: 20,
    gap: 12,
  },
  cardTitle: { color: "#15314B", fontSize: 18, fontWeight: "700" },
  status: { color: "#5E7184" },
  primaryButton: {
    backgroundColor: "#2474E5",
    borderRadius: 16,
    padding: 17,
    alignItems: "center",
  },
  primaryButtonText: { color: "#FFFFFF", fontSize: 16, fontWeight: "700" },
  secondaryButton: {
    borderColor: "#BDD3EB",
    borderWidth: 1,
    borderRadius: 12,
    padding: 13,
    alignItems: "center",
  },
  secondaryButtonText: { color: "#2474E5", fontWeight: "700" },
});
