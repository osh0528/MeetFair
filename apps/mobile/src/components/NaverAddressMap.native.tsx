import { StyleSheet, Text, View } from "react-native";
import { useAppColors } from "../services/theme";

import type { AddressSelection } from "../types/location";
import { useMemo } from "react";

export interface NaverAddressMapProps {
  query: string;
  requestId: number;
  onResolved: (selection: AddressSelection) => void;
}

export function NaverAddressMap({ query }: NaverAddressMapProps) {
  const palette = useAppColors();
  const styles = useStyles();
  return (
    <View style={styles.map}>
      <View style={[styles.block, styles.blockOne]} />
      <View style={[styles.block, styles.blockTwo]} />
      <View style={styles.roadHorizontal} />
      <View style={styles.roadVertical} />
      <View style={styles.pinHalo}>
        <View style={styles.pin}><Text style={styles.pinText}>N</Text></View>
      </View>
      <View style={styles.message}>
        <Text style={styles.messageTitle}>네이버 지도 모바일 연동 준비</Text>
        <Text style={styles.messageText}>
          {query || "주소를 검색하면 선택한 위치가 표시됩니다."}
        </Text>
      </View>
    </View>
  );
}

function useStyles() {
  const palette = useAppColors();
  return useMemo(
    () =>
      StyleSheet.create({
  map: { flex: 1, minHeight: 260, backgroundColor: "#E8EEE9", overflow: "hidden" },
  block: { position: "absolute", borderRadius: 8, backgroundColor: "#D4DED6" },
  blockOne: { left: 20, top: 25, width: 100, height: 52 },
  blockTwo: { right: 22, bottom: 35, width: 120, height: 55 },
  roadHorizontal: { position: "absolute", left: -20, right: -20, top: "45%", height: 42, backgroundColor: palette.surface, transform: [{ rotate: "-7deg" }] },
  roadVertical: { position: "absolute", top: -20, bottom: -20, left: "47%", width: 32, backgroundColor: palette.surface, transform: [{ rotate: "12deg" }] },
  pinHalo: { position: "absolute", alignSelf: "center", top: "30%", width: 72, height: 72, borderRadius: 36, backgroundColor: "rgba(3,169,77,0.16)", alignItems: "center", justifyContent: "center" },
  pin: { width: 46, height: 46, borderRadius: 17, backgroundColor: "#03A94D", alignItems: "center", justifyContent: "center" },
  pinText: { color: palette.surface, fontSize: 18, fontWeight: "900" },
  message: { position: "absolute", left: 16, right: 16, bottom: 15, borderRadius: 14, backgroundColor: palette.surface, padding: 12 },
  messageTitle: { color: palette.text, fontSize: 12, fontWeight: "900" },
  messageText: { color: palette.muted, fontSize: 10, marginTop: 4 },

      }),
    [palette],
  );
}
