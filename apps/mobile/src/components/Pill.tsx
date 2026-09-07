import { useMemo } from "react";
import { StyleSheet, Text, View } from "react-native";
import { useAppColors } from "../services/theme";

type PillTone = "purple" | "green" | "amber" | "red" | "gray";

export function Pill({ label, tone = "purple" }: { label: string; tone?: PillTone }) {
  const styles = useStyles();
  const backgroundStyle = tone === "green" ? styles.greenPill : tone === "amber" ? styles.amberPill : tone === "red" ? styles.redPill : tone === "gray" ? styles.grayPill : styles.purplePill;
  const textStyle = tone === "green" ? styles.greenText : tone === "amber" ? styles.amberText : tone === "red" ? styles.redText : tone === "gray" ? styles.grayText : styles.purpleText;
  return <View style={[styles.pill, backgroundStyle]}><Text style={[styles.text, textStyle]}>{label}</Text></View>;
}

function useStyles() {
  const palette = useAppColors();
  return useMemo(
    () =>
      StyleSheet.create({
        pill: { borderRadius: 999, paddingHorizontal: 10, paddingVertical: 6, borderWidth: 1 },
        text: { fontSize: 12, fontWeight: "800" },
        purplePill: { backgroundColor: palette.primarySoft, borderColor: palette["border-strong"] },
        purpleText: { color: palette.blue },
        greenPill: { backgroundColor: palette["success-soft"], borderColor: palette["success-border"] },
        greenText: { color: palette.success },
        amberPill: { backgroundColor: palette["warning-soft"], borderColor: palette["warning-border"] },
        amberText: { color: palette.warning },
        redPill: { backgroundColor: palette["danger-soft"], borderColor: palette["danger-border"] },
        redText: { color: palette.danger },
        grayPill: { backgroundColor: palette["surface-subtle"], borderColor: palette.border },
        grayText: { color: palette.muted },
      }),
    [palette],
  );
}
