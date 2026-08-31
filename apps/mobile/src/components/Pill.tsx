import { StyleSheet, Text, View } from "react-native";
import { colors } from "../theme/colors";

type PillTone = "purple" | "green" | "amber" | "red" | "gray";

export function Pill({ label, tone = "purple" }: { label: string; tone?: PillTone }) {
  const backgroundStyle = tone === "green" ? styles.greenPill : tone === "amber" ? styles.amberPill : tone === "red" ? styles.redPill : tone === "gray" ? styles.grayPill : styles.purplePill;
  const textStyle = tone === "green" ? styles.greenText : tone === "amber" ? styles.amberText : tone === "red" ? styles.redText : tone === "gray" ? styles.grayText : styles.purpleText;
  return <View style={[styles.pill, backgroundStyle]}><Text style={[styles.text, textStyle]}>{label}</Text></View>;
}

const styles = StyleSheet.create({
  pill: { borderRadius: 6, paddingHorizontal: 10, paddingVertical: 6 },
  text: { fontSize: 12, fontWeight: "800" },
  purplePill: { backgroundColor: colors.primarySoft },
  purpleText: { color: colors.primary },
  greenPill: { backgroundColor: colors.mint },
  greenText: { color: colors.green },
  amberPill: { backgroundColor: colors.amberSoft },
  amberText: { color: "#626262" },
  redPill: { backgroundColor: colors.redSoft },
  redText: { color: colors.red },
  grayPill: { backgroundColor: colors.background },
  grayText: { color: colors.muted },
});
