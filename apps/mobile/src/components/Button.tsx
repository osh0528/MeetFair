import { useState } from "react";
import { Pressable, StyleProp, StyleSheet, Text, View, ViewStyle } from "react-native";
import { colors } from "../theme/colors";

type ButtonVariant = "primary" | "secondary" | "soft";

interface ButtonProps {
  label: string;
  onPress?: () => void;
  variant?: ButtonVariant;
  leftLabel?: string;
  disabled?: boolean;
  compact?: boolean;
  style?: StyleProp<ViewStyle>;
}

export function Button({ label, onPress, variant = "primary", leftLabel, disabled = false, compact = false, style }: ButtonProps) {
  const [hovered, setHovered] = useState(false);
  const [focused, setFocused] = useState(false);
  const backgroundStyle = variant === "primary" ? styles.primaryButton : variant === "soft" ? styles.softButton : styles.secondaryButton;
  const textStyle = variant === "primary" ? styles.primaryButtonText : variant === "soft" ? styles.softButtonText : styles.secondaryButtonText;

  return (
    <Pressable
      accessibilityRole="button"
      accessibilityLabel={label}
      disabled={disabled}
      onBlur={() => setFocused(false)}
      onFocus={() => setFocused(true)}
      onHoverIn={() => setHovered(true)}
      onHoverOut={() => setHovered(false)}
      onPress={onPress}
      style={({ pressed }) => [styles.button, compact && styles.compactButton, backgroundStyle, style, hovered && !disabled && styles.hovered, focused && styles.focused, pressed && !disabled && styles.pressed, disabled && styles.disabled]}
    >
      {leftLabel ? (
        <View style={[styles.buttonIcon, variant !== "primary" && styles.buttonIconLight]}>
          <Text style={[styles.buttonIconText, variant !== "primary" && styles.buttonIconTextDark]}>{leftLabel}</Text>
        </View>
      ) : null}
      <Text style={[styles.buttonText, compact && styles.compactButtonText, textStyle]}>{label}</Text>
    </Pressable>
  );
}

const styles = StyleSheet.create({
  button: { minHeight: 46, borderRadius: 12, paddingHorizontal: 16, alignItems: "center", justifyContent: "center", flexDirection: "row", gap: 8, borderWidth: 1, borderColor: "transparent", shadowColor: colors.charcoal, shadowOpacity: 0.045, shadowRadius: 7, shadowOffset: { width: 0, height: 2 } },
  compactButton: { minHeight: 38, alignSelf: "flex-start", paddingHorizontal: 12 },
  primaryButton: { backgroundColor: colors.primary },
  secondaryButton: { backgroundColor: colors.surface, borderColor: colors.border },
  softButton: { backgroundColor: colors.primarySoft },
  hovered: { shadowOpacity: 0.1, transform: [{ translateY: -1 }] },
  focused: { borderColor: colors.borderStrong, shadowColor: colors.primary, shadowOpacity: 0.28, shadowRadius: 5 },
  pressed: { opacity: 0.88, transform: [{ scale: 0.98 }] },
  disabled: { opacity: 0.58 },
  buttonText: { fontSize: 16, fontWeight: "800" },
  compactButtonText: { fontSize: 13 },
  primaryButtonText: { color: colors.primaryContrast },
  secondaryButtonText: { color: colors.text },
  softButtonText: { color: colors.primary },
  buttonIcon: { width: 26, height: 26, borderRadius: 13, backgroundColor: colors.focusRing, alignItems: "center", justifyContent: "center" },
  buttonIconLight: { backgroundColor: colors.surface },
  buttonIconText: { color: colors.primaryContrast, fontSize: 13, fontWeight: "900" },
  buttonIconTextDark: { color: colors.primary },
});
