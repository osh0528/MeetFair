import { StyleSheet, Text, View } from "react-native";
import { colors } from "../theme/colors";

export function LogoMark({ compact = false }: { compact?: boolean }) {
  return (
    <View style={[styles.logo, compact && styles.logoCompact]}>
      <View style={styles.logoDot} />
      <Text style={[styles.logoText, compact && styles.logoTextCompact]}>M</Text>
    </View>
  );
}

const styles = StyleSheet.create({
  logo: { width: 68, height: 68, borderRadius: 22, backgroundColor: colors.primary, alignItems: "center", justifyContent: "center", shadowColor: colors.primary, shadowOpacity: 0.25, shadowRadius: 16, shadowOffset: { width: 0, height: 8 }, elevation: 5 },
  logoCompact: { width: 42, height: 42, borderRadius: 14 },
  logoDot: { position: "absolute", right: 11, top: 10, width: 8, height: 8, borderRadius: 4, backgroundColor: "#BDBDBD" },
  logoText: { color: colors.surface, fontSize: 31, fontWeight: "900" },
  logoTextCompact: { fontSize: 20 },
});
