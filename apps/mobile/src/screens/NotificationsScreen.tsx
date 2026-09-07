import type { NotificationSummary } from "@meetfair/shared";
import type { NativeStackScreenProps } from "@react-navigation/native-stack";
import { useEffect, useRef, useState } from "react";
import { ActivityIndicator, Pressable, ScrollView, StyleSheet, Text } from "react-native";
import { SafeAreaView } from "react-native-safe-area-context";
import type { RootStackParamList } from "../../App";
import { Button, Card, ScreenHeader } from "../components/ui";
import { apiRequest } from "../services/api";
import { useSession } from "../services/session";
import { navigateForNotification } from "../services/notification-navigation";
import { colors } from "../theme/colors";

type Props = NativeStackScreenProps<RootStackParamList, "Notifications">;

export function NotificationsScreen({ navigation }: Props) {
  const { user } = useSession();
  const [notifications, setNotifications] = useState<NotificationSummary[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState("");
  const loadRequestRef = useRef(0);
  async function load() {
    const requestId = ++loadRequestRef.current;
    setLoading(true);
    setError("");
    try {
      const data = await apiRequest<{ notifications: NotificationSummary[] }>("/notifications");
      if (requestId !== loadRequestRef.current) return;
      setNotifications(data.notifications);
      const unread = data.notifications.filter((item) => !item.readAt);
      const results = await Promise.allSettled(
        unread.map((item) => apiRequest(`/notifications/${item.id}/read`, { method: "PATCH" })),
      );
      if (requestId !== loadRequestRef.current) return;
      const readIds = new Set(unread.filter((_, index) => results[index]?.status === "fulfilled").map((item) => item.id));
      const readAt = new Date().toISOString();
      setNotifications((current) => current.map((item) => readIds.has(item.id) ? { ...item, readAt: item.readAt ?? readAt } : item));
      if (results.some((result) => result.status === "rejected")) setError("일부 알림의 읽음 상태를 저장하지 못했습니다. 다시 시도해 주세요.");
    } catch (caught) {
      if (requestId !== loadRequestRef.current) return;
      setError(caught instanceof Error ? caught.message : "알림을 불러오지 못했습니다.");
    } finally {
      if (requestId === loadRequestRef.current) setLoading(false);
    }
  }
  useEffect(() => {
    void load();
    return () => { loadRequestRef.current += 1; };
  }, []);
  return (
    <SafeAreaView style={styles.safeArea}>
      <ScreenHeader title="알림" onBack={() => navigation.goBack()} />
      <ScrollView contentContainerStyle={styles.content}>
        {loading ? <ActivityIndicator color={colors.primary} /> : null}
        {error ? <><Text style={styles.error}>{error}</Text><Button disabled={loading} label="다시 시도" onPress={load} variant="soft" /></> : null}
        {notifications.map((item) => (
          <Pressable key={item.id} onPress={() => navigateForNotification(item, navigation, user?.id)}>
            <Card style={styles.card}>
              <Text style={styles.title}>{item.title}</Text>
              <Text style={styles.body}>{item.body}</Text>
              <Text style={styles.date}>{new Date(item.createdAt).toLocaleString("ko-KR")}</Text>
            </Card>
          </Pressable>
        ))}
        {!loading && !error && !notifications.length ? <Text style={styles.empty}>알림이 없습니다.</Text> : null}
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
  error: { color: colors.red, fontSize: 12 },
});
