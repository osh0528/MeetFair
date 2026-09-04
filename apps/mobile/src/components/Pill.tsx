import { StyleSheet, Text, View } from "react-native";
import { useAppColors } from "../services/theme";
import { useMemo } from "react";


type PillTone = "purple" | "green" | "amber" | "red" | "gray";

export function Pill({ label, tone = "purple" }: { label: string; tone?: PillTone }) {
  const palette = useAppColors();
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
  pill: { borderRadius: 999, paddingHorizontal: 10, paddingVertical: 6 },
  text: { fontSize: 12, fontWeight: "800" },
  purplePill: { backgroundColor: palette.primarySoft },
  purpleText: { color: palette.primary },
  greenPill: { backgroundColor: palette.mint },
  greenText: { color: palette.green },
  amberPill: { backgroundColor: palette.amberSoft },
  amberText: { color: "#626262" },
  redPill: { backgroundColor: palette.redSoft },
  redText: { color: palette.red },
  grayPill: { backgroundColor: palette.background },
  grayText: { color: palette.muted },

      }),
    [palette],
  );
}
