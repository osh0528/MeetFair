const GENERAL_CHANNEL_ID = "meeting-reminders";
const DIRECT_MESSAGE_CHANNEL_ID = "direct-messages-v2";
const POKE_TTL_SECONDS = 24 * 60 * 60;

export function expoPushDeliveryOptions(notificationType: string) {
  const isDirectMessage = notificationType === "DIRECT_MESSAGE";
  const isPoke = notificationType === "CASUAL_POKE"
    || notificationType === "MEETING_POKE"
    || notificationType === "AUTOMATIC_MEETING_POKE";

  if (isPoke) {
    // Every released APK has this channel. A newly named channel can make pushes
    // disappear completely on an older APK while the app process is terminated.
    return { channelId: GENERAL_CHANNEL_ID, ttl: POKE_TTL_SECONDS };
  }
  if (isDirectMessage) return { channelId: DIRECT_MESSAGE_CHANNEL_ID };
  return { channelId: GENERAL_CHANNEL_ID };
}
