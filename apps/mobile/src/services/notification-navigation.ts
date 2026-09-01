import type { NotificationSummary } from "@meetfair/shared";
import type { NativeStackNavigationProp } from "@react-navigation/native-stack";
import type { RootStackParamList } from "../../App";

type AppNavigation = Pick<NativeStackNavigationProp<RootStackParamList>, "navigate">;

export function stringValue(value: unknown): string | null {
  return typeof value === "string" && value.length > 0 ? value : null;
}

export function navigateForNotificationData(
  type: string,
  data: Record<string, unknown>,
  navigation: AppNavigation,
  currentUserId?: string,
) {
  const meetingId = stringValue(data.meetingId);
  const conversationId = stringValue(data.conversationId);
  const callId = stringValue(data.callId);
  const senderId = stringValue(data.senderId);

  if (type === "DIRECT_MESSAGE" && conversationId) {
    navigation.navigate("DirectMessages", { conversationId });
    return;
  }
  if ((type === "MEETING_CALL_INCOMING" || type === "AUTOMATIC_MEETING_POKE") && callId && meetingId) {
    navigation.navigate("VideoCall", { callId, meetingId });
    return;
  }
  if (type === "FRIEND_REQUEST") {
    navigation.navigate("FriendRequests");
    return;
  }
  if (type === "FRIEND_REQUEST_ACCEPTED") {
    navigation.navigate("Friends");
    return;
  }
  if (type === "MEETING_POKE" && meetingId) {
    navigation.navigate("Tracking", { meetingId });
    return;
  }
  if (type === "CASUAL_POKE" && senderId) {
    navigation.navigate("UserPage", { userId: senderId });
    return;
  }
  if (type === "PROFILE_GUESTBOOK" && currentUserId) {
    navigation.navigate("UserPage", { userId: currentUserId });
    return;
  }
  if (meetingId) {
    navigation.navigate("Meeting", { meetingId });
  }
}

export function navigateForNotification(
  notification: NotificationSummary,
  navigation: AppNavigation,
  currentUserId?: string,
) {
  navigateForNotificationData(notification.type, notification.data ?? {}, navigation, currentUserId);
}
