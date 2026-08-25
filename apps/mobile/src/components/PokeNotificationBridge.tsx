import * as Notifications from "expo-notifications";
import { useEffect } from "react";
import { Platform } from "react-native";
import { isPokeSoundEnabled } from "../services/poke-sound";
import { useSession } from "../services/session";
import { createMeetingSocket } from "../services/socket";

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
    void Notifications.setNotificationChannelAsync("pokes", {
      name: "찌르기",
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

  useEffect(() => {
    if (!accessToken) return;
    const socket = createMeetingSocket(accessToken);
    socket.on("poke:received", async (poke) => {
      if (!await isPokeSoundEnabled()) return;
      if (Platform.OS === "web") {
        playWebPokeAlert();
        return;
      }
      const permission = await Notifications.getPermissionsAsync();
      const granted = permission.granted
        ? permission
        : await Notifications.requestPermissionsAsync();
      if (!granted.granted) return;
      await Notifications.scheduleNotificationAsync({
        content: {
          title: `${poke.senderNickname}님이 찔렀어요`,
          body: poke.type === "MEETING" ? "모임에 늦고 있어요. 확인해 주세요." : "친구가 기다리고 있어요.",
          sound: "default",
          ...(Platform.OS === "android" ? { channelId: "pokes" } : {}),
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
