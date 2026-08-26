import type { NotificationSummary } from "@meetfair/shared";
import type { NativeStackNavigationProp } from "@react-navigation/native-stack";
import type { RootStackParamList } from "../../App";

type AppNavigation = NativeStackNavigationProp<RootStackParamList, keyof RootStackParamList>;

function stringValue(value: unknown): string | null {
  return typeof value === "string" && value.length > 0 ? value : null;
}

export function navigateForNotification(
  notification: NotificationSummary,
  navigation: AppNavigation,
  currentUserId?: string,
) {
  const data = notification.data ?? {};
  const meetingId = stringValue(data.meetingId);
  const conversationId = stringValue(data.conversationId);
  const callId = stringValue(data.callId);
  const senderId = stringValue(data.senderId);

  if (notification.type === "DIRECT_MESSAGE" && conversationId) {
    navigation.navigate("DirectMessages", { conversationId });
    return;
  }
  if ((notification.type === "MEETING_CALL_INCOMING" || notification.type === "AUTOMATIC_MEETING_POKE") && callId && meetingId) {
    navigation.navigate("VideoCall", { callId, meetingId });
    return;
  }
  if (notification.type === "FRIEND_REQUEST") {
    navigation.navigate("FriendRequests");
    return;
  }
  if (notification.type === "FRIEND_REQUEST_ACCEPTED") {
    navigation.navigate("Friends");
    return;
  }
  if (notification.type === "MEETING_POKE" && meetingId) {
    navigation.navigate("Tracking", { meetingId });
    return;
  }
  if ((notification.type === "CASUAL_POKE") && senderId) {
    navigation.navigate("UserPage", { userId: senderId });
    return;
  }
  if (notification.type === "PROFILE_GUESTBOOK" && currentUserId) {
    navigation.navigate("UserPage", { userId: currentUserId });
    return;
  }
  if (meetingId) {
    navigation.navigate("Meeting", { meetingId });
  }
}
