import type { NotificationSummary } from "@meetfair/shared";
import type { NativeStackScreenProps } from "@react-navigation/native-stack";
import { useEffect, useMemo, useRef, useState } from "react";
import { ActivityIndicator, Pressable, ScrollView, StyleSheet, Text, View } from "react-native";
import { SafeAreaView } from "react-native-safe-area-context";
import type { RootStackParamList } from "../../App";
import { Button, Card, ScreenHeader } from "../components/ui";
import { apiRequest } from "../services/api";
import {
  getNotificationCategory,
  getNotificationCategoryLabel,
  NOTIFICATION_CATEGORIES,
  notificationMatchesCategory,
  type NotificationCategory,
} from "../services/notification-category";
import { useSession } from "../services/session";
import { navigateForNotification } from "../services/notification-navigation";
import { useAppColors } from "../services/theme";


type Props = NativeStackScreenProps<RootStackParamList, "Notifications">;

export function NotificationsScreen({ navigation }: Props) {
  const palette = useAppColors();
  const styles = useStyles();
  const { user } = useSession();
  const [notifications, setNotifications] = useState<NotificationSummary[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState("");
  const [selectedCategory, setSelectedCategory] = useState<NotificationCategory>("ALL");
  const loadRequestRef = useRef(0);
  const filteredNotifications = useMemo(
    () => notifications.filter((item) => notificationMatchesCategory(item, selectedCategory)),
    [notifications, selectedCategory],
  );
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
      <View accessibilityRole="tablist" style={styles.filters}>
        {NOTIFICATION_CATEGORIES.map((category) => {
          const selected = selectedCategory === category.key;
          const count = category.key === "ALL"
            ? notifications.length
            : notifications.filter((item) => notificationMatchesCategory(item, category.key)).length;
          return (
            <Pressable
              accessibilityRole="tab"
              accessibilityState={{ selected }}
              key={category.key}
              onPress={() => setSelectedCategory(category.key)}
              style={[styles.filter, selected && styles.filterSelected]}
            >
              <Text numberOfLines={1} style={[styles.filterText, selected && styles.filterTextSelected]}>
                {category.label} {count}
              </Text>
            </Pressable>
          );
        })}
      </View>
      <ScrollView contentContainerStyle={styles.content}>
        {loading ? <ActivityIndicator color={palette.primary} /> : null}
        {error ? <><Text style={styles.error}>{error}</Text><Button disabled={loading} label="다시 시도" onPress={load} variant="soft" /></> : null}
        {filteredNotifications.map((item) => {
          const itemCategory = getNotificationCategory(item.type);
          return (
            <Pressable key={item.id} onPress={() => navigateForNotification(item, navigation, user?.id)}>
              <Card style={styles.card}>
                <View style={[
                  styles.categoryBadge,
                  itemCategory === "POKE" && styles.pokeBadge,
                  itemCategory === "MEETING" && styles.meetingBadge,
                  itemCategory === "OTHER" && styles.otherBadge,
                ]}>
                  <Text style={[
                    styles.categoryText,
                    itemCategory === "POKE" && styles.pokeBadgeText,
                    itemCategory === "MEETING" && styles.meetingBadgeText,
                    itemCategory === "OTHER" && styles.otherBadgeText,
                  ]}>
                    {getNotificationCategoryLabel(item.type)}
                  </Text>
                </View>
                <Text style={styles.title}>{item.title}</Text>
                <Text style={styles.body}>{item.body}</Text>
                <Text style={styles.date}>{new Date(item.createdAt).toLocaleString("ko-KR")}</Text>
              </Card>
            </Pressable>
          );
        })}
        {!loading && !error && !filteredNotifications.length ? (
          <Text style={styles.empty}>
            {selectedCategory === "ALL" ? "알림이 없습니다." : "이 종류의 알림이 없습니다."}
          </Text>
        ) : null}
      </ScrollView>
    </SafeAreaView>
  );
}

function useStyles() {
  const palette = useAppColors();
  return useMemo(
    () =>
      StyleSheet.create({
  safeArea: { flex: 1, backgroundColor: palette.background },
  filters: { flexDirection: "row", gap: 6, paddingHorizontal: 16, paddingVertical: 10, borderBottomWidth: 1, borderBottomColor: palette.border, backgroundColor: palette.surface },
  filter: { flex: 1, minWidth: 0, alignItems: "center", justifyContent: "center", borderRadius: 8, paddingHorizontal: 4, paddingVertical: 9, backgroundColor: palette["surface-subtle"] },
  filterSelected: { backgroundColor: palette.primary },
  filterText: { color: palette.muted, fontSize: 12, fontWeight: "800" },
  filterTextSelected: { color: palette["primary-contrast"] },
  content: { padding: 20, gap: 10 },
  card: { gap: 5 },
  categoryBadge: { alignSelf: "flex-start", borderRadius: 999, paddingHorizontal: 8, paddingVertical: 4, backgroundColor: palette.primarySoft },
  categoryText: { color: palette.blue, fontSize: 10, fontWeight: "900" },
  pokeBadge: { backgroundColor: palette["amber-soft"] },
  pokeBadgeText: { color: palette.amber },
  meetingBadge: { backgroundColor: palette["success-soft"] },
  meetingBadgeText: { color: palette.success },
  otherBadge: { backgroundColor: palette["surface-subtle"] },
  otherBadgeText: { color: palette.muted },
  title: { color: palette.text, fontWeight: "900" },
  body: { color: palette.muted, fontSize: 12 },
  date: { color: palette.subtle, fontSize: 10 },
  empty: { color: palette.muted },
  error: { color: palette.red, fontSize: 12 },

      }),
    [palette],
  );
}
