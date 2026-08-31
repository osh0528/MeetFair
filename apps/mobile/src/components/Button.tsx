import { Pressable, StyleProp, StyleSheet, Text, View, ViewStyle } from "react-native";
import { colors } from "../theme/colors";

type ButtonVariant = "primary" | "secondary" | "soft";

interface ButtonProps {
  label: string;
  onPress?: () => void;
  variant?: ButtonVariant;
  leftLabel?: string;
  disabled?: boolean;
  style?: StyleProp<ViewStyle>;
}

export function Button({ label, onPress, variant = "primary", leftLabel, disabled = false, style }: ButtonProps) {
  const backgroundStyle = variant === "primary" ? styles.primaryButton : variant === "soft" ? styles.softButton : styles.secondaryButton;
  const textStyle = variant === "primary" ? styles.primaryButtonText : variant === "soft" ? styles.softButtonText : styles.secondaryButtonText;

  return (
    <Pressable
      accessibilityRole="button"
      accessibilityLabel={label}
      disabled={disabled}
      onPress={onPress}
      style={({ pressed }) => [styles.button, backgroundStyle, style, pressed && !disabled && styles.pressed, disabled && styles.disabled]}
    >
      {leftLabel ? (
        <View style={[styles.buttonIcon, variant !== "primary" && styles.buttonIconLight]}>
          <Text style={[styles.buttonIconText, variant !== "primary" && styles.buttonIconTextDark]}>{leftLabel}</Text>
        </View>
      ) : null}
      <Text style={[styles.buttonText, textStyle]}>{label}</Text>
    </Pressable>
  );
}

const styles = StyleSheet.create({
  button: { minHeight: 54, borderRadius: 6, paddingHorizontal: 18, alignItems: "center", justifyContent: "center", flexDirection: "row", gap: 9 },
  primaryButton: { backgroundColor: colors.primary },
  secondaryButton: { backgroundColor: colors.surface, borderWidth: 1, borderColor: colors.border },
  softButton: { backgroundColor: colors.primarySoft },
  pressed: { opacity: 0.82, transform: [{ scale: 0.99 }] },
  disabled: { opacity: 0.45 },
  buttonText: { fontSize: 16, fontWeight: "800" },
  primaryButtonText: { color: colors.surface },
  secondaryButtonText: { color: colors.text },
  softButtonText: { color: colors.primary },
  buttonIcon: { width: 26, height: 26, borderRadius: 13, backgroundColor: "rgba(255,255,255,0.18)", alignItems: "center", justifyContent: "center" },
  buttonIconLight: { backgroundColor: colors.surface },
  buttonIconText: { color: colors.surface, fontSize: 13, fontWeight: "900" },
  buttonIconTextDark: { color: colors.primary },
});
