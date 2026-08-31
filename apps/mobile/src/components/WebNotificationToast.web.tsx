import type { NotificationSummary } from "@meetfair/shared";
import { useNavigation } from "@react-navigation/native";
import type { NativeStackNavigationProp } from "@react-navigation/native-stack";
import { useEffect, useRef, useState } from "react";
import { Pressable, StyleSheet, Text, View } from "react-native";
import type { RootStackParamList } from "../../App";
import { useSession } from "../services/session";
import { createMeetingSocket } from "../services/socket";
import { navigateForNotification } from "../services/notification-navigation";
import { colors } from "../theme/colors";

const TOAST_DURATION_MS = 6_000;
const MAX_TOASTS = 3;

export function WebNotificationToast() {
  const { accessToken, user } = useSession();
  const navigation = useNavigation<NativeStackNavigationProp<RootStackParamList, keyof RootStackParamList>>();
  const [notifications, setNotifications] = useState<NotificationSummary[]>([]);
  const seenNotificationIds = useRef(new Set<string>());

  function dismiss(notificationId: string) {
    setNotifications((current) => current.filter((item) => item.id !== notificationId));
  }

  useEffect(() => {
    if (!accessToken) {
      setNotifications([]);
      seenNotificationIds.current.clear();
      return;
    }

    const socket = createMeetingSocket(accessToken);
    socket.on("notification:created", ({ notification }) => {
      if (seenNotificationIds.current.has(notification.id)) return;
      seenNotificationIds.current.add(notification.id);
      setNotifications((current) => [...current.filter((item) => item.id !== notification.id), notification].slice(-MAX_TOASTS));
      setTimeout(() => dismiss(notification.id), TOAST_DURATION_MS);
    });
    socket.connect();

    return () => {
      socket.disconnect();
    };
  }, [accessToken]);

  if (!notifications.length) return null;

  return (
    <View pointerEvents="box-none" style={styles.container}>
      {notifications.map((notification) => (
        <View key={notification.id} style={styles.toast}>
          <Pressable
            accessibilityLabel={`${notification.title} 알림 열기`}
            onPress={() => {
              dismiss(notification.id);
              navigateForNotification(notification, navigation, user?.id);
            }}
            style={styles.copy}
          >
            <Text numberOfLines={1} style={styles.title}>{notification.title}</Text>
            <Text numberOfLines={2} style={styles.body}>{notification.body}</Text>
          </Pressable>
          <Pressable accessibilityLabel="알림 닫기" hitSlop={8} onPress={() => dismiss(notification.id)} style={styles.closeButton}>
            <Text style={styles.closeText}>×</Text>
          </Pressable>
        </View>
      ))}
    </View>
  );
}

const styles = StyleSheet.create({
  container: { position: "absolute", right: 24, bottom: 28, width: 380, gap: 10, zIndex: 1000 },
  toast: { flexDirection: "row", alignItems: "flex-start", gap: 14, borderRadius: 6, borderWidth: 1, borderColor: "rgba(255,255,255,0.16)", backgroundColor: "rgba(32,34,38,0.97)", paddingVertical: 17, paddingLeft: 19, paddingRight: 12, shadowColor: "#000000", shadowOpacity: 0.3, shadowRadius: 18, shadowOffset: { width: 0, height: 8 }, elevation: 8 },
  copy: { flex: 1, gap: 4 },
  title: { color: "#FFFFFF", fontSize: 15, fontWeight: "900" },
  body: { color: "#D4D7DA", fontSize: 13, lineHeight: 20, fontWeight: "600" },
  closeButton: { width: 30, height: 30, borderRadius: 15, alignItems: "center", justifyContent: "center", backgroundColor: "rgba(255,255,255,0.1)" },
  closeText: { color: colors.surface, fontSize: 22, lineHeight: 24, fontWeight: "500" },
});
