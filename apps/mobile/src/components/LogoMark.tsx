import { StyleSheet, Text, View } from "react-native";
import { colors } from "../theme/colors";

export function LogoMark({ compact = false }: { compact?: boolean }) {
  return (
    <View style={[styles.logo, compact && styles.logoCompact]}>
      <View style={styles.logoLink} />
      <View style={styles.logoDot} />
      <View style={styles.logoDotSecondary} />
      <Text style={[styles.logoText, compact && styles.logoTextCompact]}>M</Text>
    </View>
  );
}

const styles = StyleSheet.create({
  logo: { width: 68, height: 68, borderRadius: 22, backgroundColor: colors.primary, alignItems: "center", justifyContent: "center", shadowColor: colors.primary, shadowOpacity: 0.25, shadowRadius: 16, shadowOffset: { width: 0, height: 8 }, elevation: 5 },
  logoCompact: { width: 42, height: 42, borderRadius: 14 },
  logoLink: { position: "absolute", right: 12, top: 13, width: 13, height: 2, borderRadius: 1, backgroundColor: "#BDBDBD", transform: [{ rotate: "-35deg" }] },
  logoDot: { position: "absolute", right: 15, top: 9, width: 8, height: 8, borderRadius: 4, backgroundColor: "#FFFFFF" },
  logoDotSecondary: { position: "absolute", right: 7, top: 17, width: 6, height: 6, borderRadius: 3, backgroundColor: "#BDBDBD" },
  logoText: { color: colors.surface, fontSize: 31, fontWeight: "900" },
  logoTextCompact: { fontSize: 20 },
});
