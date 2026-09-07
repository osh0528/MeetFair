import { useMemo, type ReactNode } from "react";
import { Pressable, StyleSheet, Text, View, type StyleProp, type ViewStyle } from "react-native";
import { useAppColors } from "../services/theme";

export function Card({ children, style }: { children: ReactNode; style?: StyleProp<ViewStyle> }) {
  const styles = useStyles();
  return <View style={[styles.card, style]}>{children}</View>;
}

export function ScreenHeader({ title, subtitle, onBack, right }: { title: string; subtitle?: string; onBack?: () => void; right?: ReactNode }) {
  const styles = useStyles();
  return (
    <View style={styles.header}>
      {onBack ? (
        <Pressable accessibilityRole="button" accessibilityLabel="뒤로 가기" hitSlop={12} onPress={onBack} style={({ pressed }) => [styles.backButton, pressed && styles.backButtonPressed]}>
          <Text style={styles.backText}>‹</Text>
        </Pressable>
      ) : null}
      <View style={styles.headerCopy}>
        <Text numberOfLines={1} style={styles.headerTitle}>{title}</Text>
        {subtitle ? <Text style={styles.headerSubtitle}>{subtitle}</Text> : null}
      </View>
      {right ? <View>{right}</View> : onBack ? <View style={styles.backSpacer} /> : null}
    </View>
  );
}

export function SectionHeading({ title, action, color }: { title: string; action?: string; color?: string }) {
  const styles = useStyles();
  return (
    <View style={styles.sectionHeading}>
      <Text style={[styles.sectionTitle, color ? { color } : null]}>{title}</Text>
      {action ? <Text style={[styles.sectionAction, color ? { color } : null]}>{action}</Text> : null}
    </View>
  );
}

function useStyles() {
  const palette = useAppColors();
  return useMemo(
    () =>
      StyleSheet.create({
        card: { backgroundColor: palette.surface, borderRadius: 16, padding: 18, borderWidth: 1, borderColor: palette.border, shadowColor: palette.charcoal, shadowOpacity: 0.045, shadowRadius: 9, shadowOffset: { width: 0, height: 3 }, elevation: 1 },
        header: { minHeight: 64, paddingHorizontal: 20, flexDirection: "row", alignItems: "center", gap: 12, backgroundColor: palette.header, borderBottomWidth: 1, borderBottomColor: palette.border },
        backButton: { width: 40, height: 40, borderRadius: 12, backgroundColor: palette.primarySoft, borderWidth: 1, borderColor: palette["border-strong"], alignItems: "center", justifyContent: "center" },
        backButtonPressed: { opacity: 0.78, transform: [{ scale: 0.97 }] },
        backText: { color: palette.primary, fontSize: 30, lineHeight: 32, marginTop: -2 },
        backSpacer: { width: 40 },
        headerCopy: { flex: 1, alignItems: "center" },
        headerTitle: { color: palette.text, fontSize: 17, fontWeight: "800" },
        headerSubtitle: { color: palette.muted, fontSize: 11, marginTop: 2 },
        sectionHeading: { flexDirection: "row", alignItems: "center", justifyContent: "space-between" },
        sectionTitle: { color: palette.text, fontSize: 19, fontWeight: "900" },
        sectionAction: { color: palette.primary, fontSize: 13, fontWeight: "800" },
      }),
    [palette],
  );
}
