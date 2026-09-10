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
import { colors } from "../theme/colors";

type Props = NativeStackScreenProps<RootStackParamList, "Notifications">;

export function NotificationsScreen({ navigation }: Props) {
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
  const unreadNotifications = filteredNotifications.filter((item) => !item.readAt);
  const readNotifications = filteredNotifications.filter((item) => Boolean(item.readAt));
  async function load() {
    const requestId = ++loadRequestRef.current;
    setLoading(true);
    setError("");
    try {
      const data = await apiRequest<{ notifications: NotificationSummary[] }>("/notifications");
      if (requestId !== loadRequestRef.current) return;
      setNotifications(data.notifications);
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

  function openNotification(item: NotificationSummary) {
    if (!item.readAt) {
      const readAt = new Date().toISOString();
      setNotifications((current) => current.map((notification) => (
        notification.id === item.id ? { ...notification, readAt } : notification
      )));
      void apiRequest(`/notifications/${item.id}/read`, { method: "PATCH" }).catch(() => {
        setNotifications((current) => current.map((notification) => (
          notification.id === item.id && notification.readAt === readAt
            ? { ...notification, readAt: null }
            : notification
        )));
        setError("알림의 읽음 상태를 저장하지 못했습니다. 다시 시도해 주세요.");
      });
    }
    navigateForNotification(item, navigation, user?.id);
  }

  function renderNotification(item: NotificationSummary) {
    const itemCategory = getNotificationCategory(item.type);
    const unread = !item.readAt;
    return (
      <Pressable key={item.id} onPress={() => openNotification(item)}>
        <Card style={[styles.card, unread && styles.unreadCard]}>
          <View style={styles.cardHeader}>
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
            <View style={[styles.readBadge, unread && styles.unreadBadge]}>
              {unread ? <View style={styles.unreadDot} /> : null}
              <Text style={[styles.readBadgeText, unread && styles.unreadBadgeText]}>
                {unread ? "읽지 않음" : "읽음"}
              </Text>
            </View>
          </View>
          <Text style={[styles.title, !unread && styles.readTitle]}>{item.title}</Text>
          <Text style={[styles.body, !unread && styles.readBody]}>{item.body}</Text>
          <Text style={styles.date}>{new Date(item.createdAt).toLocaleString("ko-KR")}</Text>
        </Card>
      </Pressable>
    );
  }

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
        {loading ? <ActivityIndicator color={colors.primary} /> : null}
        {error ? <><Text style={styles.error}>{error}</Text><Button disabled={loading} label="다시 시도" onPress={load} variant="soft" /></> : null}
        {unreadNotifications.length ? (
          <View style={styles.section}>
            <Text style={styles.sectionTitle}>읽지 않은 알림 {unreadNotifications.length}</Text>
            {unreadNotifications.map(renderNotification)}
          </View>
        ) : null}
        {readNotifications.length ? (
          <View style={styles.section}>
            <Text style={styles.sectionTitle}>읽은 알림 {readNotifications.length}</Text>
            {readNotifications.map(renderNotification)}
          </View>
        ) : null}
        {!loading && !error && !filteredNotifications.length ? (
          <Text style={styles.empty}>
            {selectedCategory === "ALL" ? "알림이 없습니다." : "이 종류의 알림이 없습니다."}
          </Text>
        ) : null}
      </ScrollView>
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  safeArea: { flex: 1, backgroundColor: colors.background },
  filters: { flexDirection: "row", gap: 6, paddingHorizontal: 16, paddingVertical: 10, borderBottomWidth: 1, borderBottomColor: colors.border, backgroundColor: colors.surface },
  filter: { flex: 1, minWidth: 0, alignItems: "center", justifyContent: "center", borderRadius: 8, paddingHorizontal: 4, paddingVertical: 9, backgroundColor: colors.surfaceSubtle },
  filterSelected: { backgroundColor: colors.primary },
  filterText: { color: colors.muted, fontSize: 12, fontWeight: "800" },
  filterTextSelected: { color: colors.primaryContrast },
  content: { padding: 20, gap: 18 },
  section: { gap: 10 },
  sectionTitle: { color: colors.textSecondary, fontSize: 13, fontWeight: "900" },
  card: { gap: 5 },
  unreadCard: { borderWidth: 1.5, borderColor: colors.borderStrong, backgroundColor: colors.surface },
  cardHeader: { flexDirection: "row", alignItems: "center", justifyContent: "space-between", gap: 8 },
  readBadge: { flexDirection: "row", alignItems: "center", gap: 5, borderRadius: 999, paddingHorizontal: 8, paddingVertical: 4, backgroundColor: colors.surfaceSubtle },
  unreadBadge: { backgroundColor: colors.primarySoft },
  unreadDot: { width: 7, height: 7, borderRadius: 4, backgroundColor: colors.primary },
  readBadgeText: { color: colors.subtle, fontSize: 10, fontWeight: "800" },
  unreadBadgeText: { color: colors.primary, fontWeight: "900" },
  categoryBadge: { alignSelf: "flex-start", borderRadius: 999, paddingHorizontal: 8, paddingVertical: 4, backgroundColor: colors.primarySoft },
  categoryText: { color: colors.blue, fontSize: 10, fontWeight: "900" },
  pokeBadge: { backgroundColor: colors.amberSoft },
  pokeBadgeText: { color: colors.amber },
  meetingBadge: { backgroundColor: colors.successSoft },
  meetingBadgeText: { color: colors.success },
  otherBadge: { backgroundColor: colors.surfaceSubtle },
  otherBadgeText: { color: colors.muted },
  title: { color: colors.text, fontWeight: "900" },
  readTitle: { color: colors.textSecondary, fontWeight: "800" },
  body: { color: colors.muted, fontSize: 12 },
  readBody: { color: colors.subtle },
  date: { color: colors.subtle, fontSize: 10 },
  empty: { color: colors.muted },
  error: { color: colors.red, fontSize: 12 },
});
