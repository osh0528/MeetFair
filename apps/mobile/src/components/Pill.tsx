import { StyleSheet, Text, View } from "react-native";
import { colors } from "../theme/colors";

type PillTone = "purple" | "green" | "amber" | "red" | "gray";

export function Pill({ label, tone = "purple" }: { label: string; tone?: PillTone }) {
  const backgroundStyle = tone === "green" ? styles.greenPill : tone === "amber" ? styles.amberPill : tone === "red" ? styles.redPill : tone === "gray" ? styles.grayPill : styles.purplePill;
  const textStyle = tone === "green" ? styles.greenText : tone === "amber" ? styles.amberText : tone === "red" ? styles.redText : tone === "gray" ? styles.grayText : styles.purpleText;
  return <View style={[styles.pill, backgroundStyle]}><Text style={[styles.text, textStyle]}>{label}</Text></View>;
}

const styles = StyleSheet.create({
  pill: { borderRadius: 999, paddingHorizontal: 10, paddingVertical: 6, borderWidth: 1 },
  text: { fontSize: 12, fontWeight: "800" },
  purplePill: { backgroundColor: colors.primarySoft, borderColor: colors.borderStrong },
  purpleText: { color: colors.blue },
  greenPill: { backgroundColor: colors.successSoft, borderColor: colors.successBorder },
  greenText: { color: colors.success },
  amberPill: { backgroundColor: colors.warningSoft, borderColor: colors.warningBorder },
  amberText: { color: colors.warning },
  redPill: { backgroundColor: colors.dangerSoft, borderColor: colors.dangerBorder },
  redText: { color: colors.danger },
  grayPill: { backgroundColor: colors.surfaceSubtle, borderColor: colors.border },
  grayText: { color: colors.muted },
});
