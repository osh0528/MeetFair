import type { NativeStackScreenProps } from "@react-navigation/native-stack";
import { Pressable, StyleSheet, Text, View } from "react-native";
import type { RootStackParamList } from "../../App";

type Props = NativeStackScreenProps<RootStackParamList, "Meeting">;

export function MeetingScreen({ navigation }: Props) {
  return (
    <View style={styles.container}>
      <Text style={styles.label}>이번 약속</Text>
      <Text style={styles.title}>토요일 성수 카페</Text>
      <Text style={styles.time}>8월 22일 오후 2:00</Text>

      <View style={styles.card}>
        <Text style={styles.cardTitle}>참가자 이동시간</Text>
        <Text style={styles.row}>수혁 · 28분</Text>
        <Text style={styles.row}>친구 · 31분</Text>
        <Text style={styles.fairness}>이동시간 차이 3분</Text>
      </View>

      <Pressable
        style={styles.button}
        onPress={() => navigation.navigate("Tracking")}
      >
        <Text style={styles.buttonText}>실시간 위치 화면 보기</Text>
      </Pressable>
    </View>
  );
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
    backgroundColor: "#F4F8FC",
    padding: 24,
    gap: 12,
  },
  label: { marginTop: 20, color: "#12A594", fontWeight: "700" },
  title: { color: "#15314B", fontSize: 30, fontWeight: "800" },
  time: { color: "#5E7184", fontSize: 16 },
  card: {
    marginTop: 20,
    backgroundColor: "#FFFFFF",
    borderRadius: 20,
    padding: 20,
    gap: 12,
  },
  cardTitle: { color: "#15314B", fontSize: 18, fontWeight: "700" },
  row: { color: "#5E7184", fontSize: 16 },
  fairness: { color: "#12A594", fontWeight: "700" },
  button: {
    marginTop: "auto",
    backgroundColor: "#2474E5",
    borderRadius: 16,
    padding: 17,
    alignItems: "center",
  },
  buttonText: { color: "#FFFFFF", fontSize: 16, fontWeight: "700" },
});
