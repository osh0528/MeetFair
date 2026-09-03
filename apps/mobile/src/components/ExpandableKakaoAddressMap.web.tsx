import { useState } from "react";
import { Modal, Pressable, StyleSheet, Text, View } from "react-native";
import { SafeAreaView } from "react-native-safe-area-context";
import { colors } from "../theme/colors";
import type { AddressSelection } from "../types/location";
import { KakaoAddressMap, type KakaoAddressMapProps } from "./KakaoAddressMap";

export function ExpandableKakaoAddressMap(props: KakaoAddressMapProps) {
  const [expanded, setExpanded] = useState(false);
  const [pendingSelection, setPendingSelection] = useState<AddressSelection | null>(null);
  const handleResolved = (selection: AddressSelection) => {
    setPendingSelection(selection);
    props.onResolved?.(selection);
  };
  const confirmSelection = () => {
    if (!pendingSelection) return;
    props.onLocationConfirmed?.(pendingSelection);
    setPendingSelection(null);
  };

  return (
    <>
      <View style={styles.preview}>
        <KakaoAddressMap {...props} onResolved={handleResolved} interactive={props.interactive ?? true} />
        <Pressable accessibilityLabel="지도 확대" accessibilityRole="button" onPress={() => setExpanded(true)} style={styles.expandButton}>
          <Text style={styles.expandButtonText}>↗</Text>
        </Pressable>
        {pendingSelection ? (
          <Pressable accessibilityLabel="선택한 위치 확인" accessibilityRole="button" onPress={confirmSelection} style={styles.confirmButton}>
            <Text numberOfLines={1} style={styles.confirmButtonText}>이 위치 확인</Text>
          </Pressable>
        ) : null}
      </View>
      <Modal animationType="fade" onRequestClose={() => setExpanded(false)} visible={expanded}>
        <SafeAreaView style={styles.fullscreen}>
          <KakaoAddressMap {...props} onResolved={handleResolved} interactive={props.interactive ?? true} />
          <Pressable accessibilityLabel="지도 닫기" accessibilityRole="button" onPress={() => setExpanded(false)} style={styles.closeButton}>
            <Text style={styles.closeButtonText}>닫기</Text>
          </Pressable>
          {pendingSelection ? (
            <Pressable accessibilityLabel="선택한 위치 확인" accessibilityRole="button" onPress={confirmSelection} style={styles.fullscreenConfirmButton}>
              <Text style={styles.confirmButtonText}>선택한 위치 확인</Text>
            </Pressable>
          ) : null}
        </SafeAreaView>
      </Modal>
    </>
  );
}

const styles = StyleSheet.create({
  preview: { flex: 1, minHeight: 0, position: "relative" },
  expandButton: { position: "absolute", right: 12, bottom: 12, width: 44, height: 44, borderRadius: 12, backgroundColor: "rgba(17,19,26,0.86)", alignItems: "center", justifyContent: "center", zIndex: 10 },
  expandButtonText: { color: "#FFFFFF", fontSize: 23, fontWeight: "900" },
  confirmButton: { position: "absolute", left: 12, right: 66, bottom: 12, minHeight: 44, borderRadius: 12, paddingHorizontal: 16, backgroundColor: colors.primary, alignItems: "center", justifyContent: "center", zIndex: 11 },
  fullscreen: { flex: 1, backgroundColor: colors.background },
  closeButton: { position: "absolute", top: 14, right: 14, minWidth: 64, minHeight: 44, zIndex: 10, borderRadius: 12, backgroundColor: "rgba(17,19,26,0.86)", paddingHorizontal: 14, alignItems: "center", justifyContent: "center" },
  closeButtonText: { color: "#FFFFFF", fontSize: 13, fontWeight: "900" },
  fullscreenConfirmButton: { position: "absolute", left: 18, right: 18, bottom: 20, minHeight: 48, borderRadius: 14, backgroundColor: colors.primary, alignItems: "center", justifyContent: "center", zIndex: 10 },
  confirmButtonText: { color: colors.primaryContrast, fontSize: 14, fontWeight: "900" },
});