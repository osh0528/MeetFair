import * as Notifications from "expo-notifications";
import { useNavigation } from "@react-navigation/native";
import type { NativeStackNavigationProp } from "@react-navigation/native-stack";
import { useEffect, useRef } from "react";
import { Platform, Vibration } from "react-native";
import { isPokeSoundEnabled } from "../services/poke-sound";
import { useSession } from "../services/session";
import { createMeetingSocket } from "../services/socket";
import type { RootStackParamList } from "../../App";

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
    void Notifications.setNotificationChannelAsync("pokes-v2", {
      name: "찌르기 알림",
      importance: Notifications.AndroidImportance.HIGH,
      sound: "default",
      vibrationPattern: [0, 180, 100, 180],
      lockscreenVisibility: Notifications.AndroidNotificationVisibility.PUBLIC,
    });
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
  const { accessToken } = useSession();
  const navigation = useNavigation<NativeStackNavigationProp<RootStackParamList>>();
  const seenPokeIds = useRef<Set<string>>(new Set());

  useEffect(() => {
    if (Platform.OS === "web") return;
    const sub = Notifications.addNotificationResponseReceivedListener((response) => {
      const data = response.notification.request.content.data as { meetingId?: string | null };
      if (data?.meetingId) {
        navigation.navigate("Tracking", { meetingId: data.meetingId });
      } else {
        navigation.navigate("Notifications");
      }
    });
    return () => sub.remove();
  }, [navigation]);

  useEffect(() => {
    if (!accessToken) return;
    const socket = createMeetingSocket(accessToken);
    socket.on("poke:received", async (poke) => {
      if (seenPokeIds.current.has(poke.pokeId)) return;
      seenPokeIds.current.add(poke.pokeId);
      setTimeout(() => seenPokeIds.current.delete(poke.pokeId), 5 * 60_000);
      const soundEnabled = await isPokeSoundEnabled();
      if (Platform.OS === "web") {
        if (soundEnabled) playWebPokeAlert();
        return;
      }
      // 진동은 효과음 설정과 별개로 동작시켜 무음 설정에서도 수신을 알립니다.
      Vibration.vibrate([0, 180, 100, 180]);
      const permission = await Notifications.getPermissionsAsync();
      const granted = permission.granted ? permission : await Notifications.requestPermissionsAsync();
      if (!granted.granted) return;
      await Notifications.scheduleNotificationAsync({
        content: {
          title: `${poke.senderNickname}님이 찔렀어요`,
          body: poke.type === "MEETING" ? "모임에 늦은 친구가 도착했는지 확인해 주세요." : "친구가 MeetFair에서 찌르기를 보냈습니다.",
          ...(soundEnabled ? { sound: "default" as const } : {}),
          ...(Platform.OS === "android" ? { channelId: "pokes-v2" } : {}),
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
