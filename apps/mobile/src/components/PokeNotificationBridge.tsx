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
}

export function PokeNotificationBridge() {
  const { accessToken } = useSession();

  useEffect(() => {
    if (!accessToken || Platform.OS === "web") return;
    const socket = createMeetingSocket(accessToken);
    socket.on("poke:received", async (poke) => {
      if (!await isPokeSoundEnabled()) return;
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
