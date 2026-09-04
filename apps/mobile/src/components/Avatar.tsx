import { Image, StyleSheet, Text, View } from "react-native";
import { useAppColors } from "../services/theme";
import { useMemo } from "react";


interface AvatarProps {
  name: string;
  size?: number;
  backgroundColor?: string;
  status?: "moving" | "waiting" | "arrived" | "online";
  imageUrl?: string;
}

export function Avatar({ name, size = 42, backgroundColor, status, imageUrl }: AvatarProps) {
  const palette = useAppColors();
  const resolvedBackgroundColor = backgroundColor ?? palette.primarySoft;
  const styles = useStyles();
  const statusStyle = status === "online"
    ? styles.onlineDot
    : status === "moving"
      ? styles.movingDot
      : status === "waiting"
        ? styles.waitingDot
        : styles.arrivedDot;
  return (
    <View style={{ width: size, height: size }}>
        <View style={[styles.avatar, { width: size, height: size, borderRadius: size / 2, backgroundColor: resolvedBackgroundColor }]}>
        {imageUrl ? <Image source={{ uri: imageUrl }} style={{ width: size, height: size }} /> : (
          <Text style={[styles.avatarText, { fontSize: Math.max(12, size * 0.34) }]}>{name.slice(0, 1)}</Text>
        )}
      </View>
      {status ? <View style={[styles.statusDot, statusStyle]} /> : null}
    </View>
  );
}

function useStyles() {
  const palette = useAppColors();
  return useMemo(
    () =>
      StyleSheet.create({
  avatar: { alignItems: "center", justifyContent: "center", overflow: "hidden" },
  avatarText: { color: palette.charcoal, fontWeight: "800" },
  statusDot: { position: "absolute", right: -1, bottom: -1, width: 13, height: 13, borderRadius: 7, borderWidth: 2, borderColor: palette.surface },
  onlineDot: { backgroundColor: palette.online },
  movingDot: { backgroundColor: palette.green },
  waitingDot: { backgroundColor: palette.amber },
  arrivedDot: { backgroundColor: palette.blue },

      }),
    [palette],
  );
}
