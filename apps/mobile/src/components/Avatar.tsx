import { Image, StyleSheet, Text, View } from "react-native";
import { colors } from "../theme/colors";

interface AvatarProps {
  name: string;
  size?: number;
  backgroundColor?: string;
  status?: "moving" | "waiting" | "arrived" | "online";
  imageUrl?: string;
}

export function Avatar({ name, size = 42, backgroundColor = colors.primarySoft, status, imageUrl }: AvatarProps) {
  const statusStyle = status === "online"
    ? styles.onlineDot
    : status === "moving"
      ? styles.movingDot
      : status === "waiting"
        ? styles.waitingDot
        : styles.arrivedDot;
  return (
    <View style={{ width: size, height: size }}>
      <View style={[styles.avatar, { width: size, height: size, borderRadius: size / 2, backgroundColor }]}>
        {imageUrl ? <Image source={{ uri: imageUrl }} style={{ width: size, height: size }} /> : (
          <Text style={[styles.avatarText, { fontSize: Math.max(12, size * 0.34) }]}>{name.slice(0, 1)}</Text>
        )}
      </View>
      {status ? <View style={[styles.statusDot, statusStyle]} /> : null}
    </View>
  );
}

const styles = StyleSheet.create({
  avatar: { alignItems: "center", justifyContent: "center", overflow: "hidden" },
  avatarText: { color: colors.charcoal, fontWeight: "800" },
  statusDot: { position: "absolute", right: -1, bottom: -1, width: 13, height: 13, borderRadius: 7, borderWidth: 2, borderColor: colors.surface },
  onlineDot: { backgroundColor: colors.online },
  movingDot: { backgroundColor: colors.green },
  waitingDot: { backgroundColor: colors.amber },
  arrivedDot: { backgroundColor: colors.blue },
});
