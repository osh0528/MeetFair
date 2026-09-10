import * as Notifications from "expo-notifications";
import Constants from "expo-constants";
import { useNavigation } from "@react-navigation/native";
import type { NativeStackNavigationProp } from "@react-navigation/native-stack";
import { useEffect, useRef } from "react";
import { AppState, Platform, Vibration } from "react-native";
import { isPokeSoundEnabled } from "../services/poke-sound";
import { useSession } from "../services/session";
import { createMeetingSocket } from "../services/socket";
import type { RootStackParamList } from "../../App";
import { navigateForNotificationData, stringValue } from "../services/notification-navigation";
import { apiRequest } from "../services/api";

const POKE_CHANNEL_ID = "pokes-v3";
const DIRECT_MESSAGE_CHANNEL_ID = "direct-messages-v2";
const GENERAL_NOTIFICATION_CHANNEL_ID = "meeting-reminders";
const POKE_VIBRATION_PATTERN = [0, 250, 120, 250, 120, 400];
const PUSH_REGISTRATION_RETRY_MS = [5_000, 15_000, 60_000];

async function configureNotificationChannels() {
  if (Platform.OS !== "android") return;
  await Notifications.setNotificationChannelAsync(GENERAL_NOTIFICATION_CHANNEL_ID, {
    name: "모임 알림",
    description: "초대, 일정, 통화 등 주요 모임 소식을 알려줍니다.",
    importance: Notifications.AndroidImportance.HIGH,
    sound: "default",
    enableVibrate: true,
    vibrationPattern: [0, 250, 120, 250],
    lockscreenVisibility: Notifications.AndroidNotificationVisibility.PUBLIC,
  });
  await Notifications.setNotificationChannelAsync(DIRECT_MESSAGE_CHANNEL_ID, {
    name: "DM 알림",
    description: "새 다이렉트 메시지를 진동으로 알려줍니다.",
    importance: Notifications.AndroidImportance.MAX,
    sound: "default",
    enableVibrate: true,
    vibrationPattern: [0, 250, 120, 250],
    lockscreenVisibility: Notifications.AndroidNotificationVisibility.PUBLIC,
  });

  await Notifications.setNotificationChannelAsync(POKE_CHANNEL_ID, {
    name: "찌르기 알림",
    description: "친구와 모임 참여자가 보낸 찌르기를 진동으로 알려줍니다.",
    importance: Notifications.AndroidImportance.MAX,
    sound: "default",
    enableVibrate: true,
    vibrationPattern: POKE_VIBRATION_PATTERN,
    lockscreenVisibility: Notifications.AndroidNotificationVisibility.PUBLIC,
  });
}

if (Platform.OS !== "web") {
  Notifications.setNotificationHandler({
    handleNotification: async () => ({
      shouldPlaySound: true,
      shouldSetBadge: false,
      shouldShowBanner: true,
      shouldShowList: true,
    }),
  });
  if (Platform.OS === "android") {
    void configureNotificationChannels().catch(() => undefined);
  }
}

function playWebPokeAlert() {
  if (Platform.OS !== "web" || typeof window === "undefined") return;
  try {
    const AudioContextClass = window.AudioContext
      || (window as typeof window & { webkitAudioContext?: typeof AudioContext }).webkitAudioContext;
    if (AudioContextClass) {
      const context = new AudioContextClass();
      const oscillator = context.createOscillator();
      const gain = context.createGain();
      oscillator.type = "sine";
      oscillator.frequency.setValueAtTime(880, context.currentTime);
      oscillator.frequency.exponentialRampToValueAtTime(660, context.currentTime + 0.16);
      gain.gain.setValueAtTime(0.0001, context.currentTime);
      gain.gain.exponentialRampToValueAtTime(0.16, context.currentTime + 0.015);
      gain.gain.exponentialRampToValueAtTime(0.0001, context.currentTime + 0.18);
      oscillator.connect(gain);
      gain.connect(context.destination);
      oscillator.start();
      oscillator.stop(context.currentTime + 0.2);
      oscillator.addEventListener("ended", () => void context.close());
    }
  } catch {
    // Browsers can block audio until the user interacts with the page.
  }
  if ("vibrate" in navigator) navigator.vibrate([120, 80, 120]);
}

export function PokeNotificationBridge() {
  const { accessToken, user } = useSession();
  const navigation = useNavigation<NativeStackNavigationProp<RootStackParamList>>();
  const seenPokeIds = useRef<Set<string>>(new Set());
  const seenResponseIds = useRef<Set<string>>(new Set());

  useEffect(() => {
    if (Platform.OS === "web" || !accessToken) return;
    let active = true;
    let retryTimer: ReturnType<typeof setTimeout> | null = null;
    let registering = false;
    let retryAttempt = 0;
    let devicePushToken: Notifications.DevicePushToken | undefined;

    const saveToken = async (expoPushToken: string) => {
      await apiRequest("/users/me/push-token", {
        method: "PUT",
        headers: { authorization: `Bearer ${accessToken}` },
        body: JSON.stringify({ expoPushToken }),
      });
    };
    const register = async () => {
      if (!active || registering) return;
      registering = true;
      const usedDeviceToken = devicePushToken;
      try {
        await configureNotificationChannels();
        const existingPermission = await Notifications.getPermissionsAsync();
        const permission = existingPermission.granted
          ? existingPermission
          : await Notifications.requestPermissionsAsync();
        if (!permission.granted || !active) return;
        const projectId = Constants.expoConfig?.extra?.eas?.projectId ?? Constants.easConfig?.projectId;
        const token = await Notifications.getExpoPushTokenAsync({
          ...(projectId ? { projectId } : {}),
          ...(usedDeviceToken ? { devicePushToken: usedDeviceToken } : {}),
        });
        if (!active) return;
        await saveToken(token.data);
        retryAttempt = 0;
        if (retryTimer) clearTimeout(retryTimer);
        retryTimer = null;
      } catch (error) {
        console.warn("푸시 알림 등록에 실패했어요.", error);
        if (active) {
          const delay = PUSH_REGISTRATION_RETRY_MS[Math.min(retryAttempt++, PUSH_REGISTRATION_RETRY_MS.length - 1)]!;
          if (retryTimer) clearTimeout(retryTimer);
          retryTimer = setTimeout(() => { retryTimer = null; void register(); }, delay);
        }
      } finally {
        registering = false;
        if (active && devicePushToken !== usedDeviceToken) void register();
      }
    };

    void register();
    const appStateSubscription = AppState.addEventListener("change", (state) => {
      if (state !== "active") return;
      retryAttempt = 0;
      if (retryTimer) clearTimeout(retryTimer);
      retryTimer = null;
      void register();
    });
    const tokenSubscription = Notifications.addPushTokenListener((token) => {
      devicePushToken = token;
      void register();
    });
    return () => {
      active = false;
      if (retryTimer) clearTimeout(retryTimer);
      appStateSubscription.remove();
      tokenSubscription.remove();
    };
  }, [accessToken]);

  useEffect(() => {
    if (Platform.OS === "web") return;
    const handleResponse = (response: Notifications.NotificationResponse) => {
      const identifier = response.notification.request.identifier;
      if (seenResponseIds.current.has(identifier)) return;
      seenResponseIds.current.add(identifier);
      void Notifications.clearLastNotificationResponseAsync();
      const data = response.notification.request.content.data as Record<string, unknown>;
      const notificationType = stringValue(data.notificationType);
      if (notificationType) {
        navigateForNotificationData(notificationType, data, navigation, user?.id);
        return;
      }
      const meetingId = stringValue(data.meetingId);
      if (meetingId) navigation.navigate("Tracking", { meetingId });
      else navigation.navigate("Notifications");
    };
    void Notifications.getLastNotificationResponseAsync().then((response) => {
      if (response) handleResponse(response);
    });
    const sub = Notifications.addNotificationResponseReceivedListener(handleResponse);
    return () => sub.remove();
  }, [navigation, user?.id]);

  useEffect(() => {
    if (!accessToken) return;
    const socket = createMeetingSocket(accessToken);
    socket.on("poke:received", async (poke) => {
      // Background alerts are displayed by the OS from the server push, not suspended JS.
      if (Platform.OS !== "web" && AppState.currentState !== "active") return;
      if (seenPokeIds.current.has(poke.pokeId)) return;
      seenPokeIds.current.add(poke.pokeId);
      setTimeout(() => seenPokeIds.current.delete(poke.pokeId), 5 * 60_000);
      const soundEnabled = await isPokeSoundEnabled();
      if (Platform.OS === "web") {
        if (soundEnabled) playWebPokeAlert();
        return;
      }
      // 진동은 효과음 설정과 별개로 동작시켜 무음 설정에서도 수신을 알립니다.
      Vibration.vibrate(POKE_VIBRATION_PATTERN);
      const permission = await Notifications.getPermissionsAsync();
      const granted = permission.granted ? permission : await Notifications.requestPermissionsAsync();
      if (!granted.granted) return;
      await Notifications.scheduleNotificationAsync({
        content: {
          title: `${poke.senderNickname}님이 찔렀어요`,
          body: poke.type === "MEETING" ? "모임에 늦은 친구가 도착했는지 확인해 주세요." : "친구가 MeetFair에서 찌르기를 보냈습니다.",
          ...(soundEnabled ? { sound: "default" as const } : {}),
          ...(Platform.OS === "android" ? { channelId: POKE_CHANNEL_ID } : {}),
          data: { meetingId: poke.meetingId, pokeId: poke.pokeId },
        },
        trigger: null,
      });
    });
    socket.connect();
    return () => {
      socket.disconnect();
    };
  }, [accessToken]);

  return null;
}
