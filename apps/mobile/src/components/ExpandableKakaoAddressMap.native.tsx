import { useState } from "react";
import { Modal, Pressable, StyleSheet, Text, View } from "react-native";
import { SafeAreaView } from "react-native-safe-area-context";
import { colors } from "../theme/colors";
import { KakaoAddressMap, type KakaoAddressMapProps } from "./KakaoAddressMap";

export function ExpandableKakaoAddressMap(props: KakaoAddressMapProps) {
  const [expanded, setExpanded] = useState(false);

  return (
    <>
      <View style={styles.preview}>
        <KakaoAddressMap {...props} interactive={false} />
        <Pressable
          accessibilityHint="전체 화면에서 지도를 조작합니다."
          accessibilityLabel="지도 크게 보기"
          accessibilityRole="button"
          onPress={() => setExpanded(true)}
          style={styles.expandOverlay}
        >
          <Text style={styles.expandLabel}>지도 크게 보기</Text>
        </Pressable>
      </View>

      <Modal
        animationType="fade"
        onRequestClose={() => setExpanded(false)}
        statusBarTranslucent
        visible={expanded}
      >
        <SafeAreaView edges={["top", "bottom"]} style={styles.fullscreen}>
          <KakaoAddressMap {...props} />
          <Pressable
            accessibilityLabel="지도 닫기"
            accessibilityRole="button"
            onPress={() => setExpanded(false)}
            style={styles.closeButton}
          >
            <Text style={styles.closeButtonText}>지도 닫기</Text>
          </Pressable>
        </SafeAreaView>
      </Modal>
    </>
  );
}

const styles = StyleSheet.create({
  preview: { flex: 1, position: "relative" },
  expandOverlay: {
    position: "absolute",
    top: 0,
    right: 0,
    bottom: 0,
    left: 0,
    alignItems: "flex-end",
    justifyContent: "flex-end",
    padding: 12,
  },
  expandLabel: {
    borderRadius: 6,
    backgroundColor: "rgba(20,20,20,0.82)",
    color: "#FFFFFF",
    fontSize: 12,
    fontWeight: "900",
    paddingHorizontal: 12,
    paddingVertical: 8,
  },
  fullscreen: { flex: 1, backgroundColor: colors.background },
  closeButton: {
    position: "absolute",
    top: 14,
    right: 14,
    zIndex: 10,
    borderRadius: 6,
    backgroundColor: "rgba(20,20,20,0.82)",
    paddingHorizontal: 14,
    paddingVertical: 9,
  },
  closeButtonText: { color: "#FFFFFF", fontSize: 12, fontWeight: "900" },
});
