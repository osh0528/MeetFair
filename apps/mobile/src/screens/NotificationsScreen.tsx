import type { NotificationSummary } from "@meetfair/shared";
import type { NativeStackScreenProps } from "@react-navigation/native-stack";
import { useEffect, useState } from "react";
import { ScrollView, StyleSheet, Text } from "react-native";
import { SafeAreaView } from "react-native-safe-area-context";
import type { RootStackParamList } from "../../App";
import { Card, ScreenHeader } from "../components/ui";
import { apiRequest } from "../services/api";
import { colors } from "../theme/colors";

type Props = NativeStackScreenProps<RootStackParamList, "Notifications">;

export function NotificationsScreen({ navigation }: Props) {
  const [notifications, setNotifications] = useState<NotificationSummary[]>([]);
  useEffect(() => {
    void apiRequest<{ notifications: NotificationSummary[] }>("/notifications")
      .then((data) => setNotifications(data.notifications));
  }, []);
  return (
    <SafeAreaView style={styles.safeArea}>
      <ScreenHeader title="알림" onBack={() => navigation.goBack()} />
      <ScrollView contentContainerStyle={styles.content}>
        {notifications.map((item) => (
          <Card key={item.id} style={styles.card}>
            <Text style={styles.title}>{item.title}</Text>
            <Text style={styles.body}>{item.body}</Text>
            <Text style={styles.date}>{new Date(item.createdAt).toLocaleString("ko-KR")}</Text>
          </Card>
        ))}
        {!notifications.length ? <Text style={styles.empty}>알림이 없습니다.</Text> : null}
      </ScrollView>
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  safeArea: { flex: 1, backgroundColor: colors.background },
  content: { padding: 20, gap: 10 },
  card: { gap: 5 },
  title: { color: colors.text, fontWeight: "900" },
  body: { color: colors.muted, fontSize: 12 },
  date: { color: colors.subtle, fontSize: 10 },
  empty: { color: colors.muted },
});
