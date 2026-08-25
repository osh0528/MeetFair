import type { NativeStackScreenProps } from "@react-navigation/native-stack";
import { useCallback, useState } from "react";
import { Pressable, StyleSheet, Text, TextInput, View } from "react-native";
import { SafeAreaView } from "react-native-safe-area-context";
import type { RootStackParamList } from "../../App";
import { Button, ScreenHeader } from "../components/ui";
import { KakaoAddressMap } from "../components/KakaoAddressMap";
import { colors } from "../theme/colors";
import type { AddressSelection } from "../types/location";

type Props = NativeStackScreenProps<RootStackParamList, "AddressSearch">;

export function AddressSearchScreen({ navigation }: Props) {
  const [input, setInput] = useState("");
  const [query, setQuery] = useState("");
  const [requestId, setRequestId] = useState(0);
  const [selection, setSelection] = useState<AddressSelection | null>(null);

  const handleResolved = useCallback((nextSelection: AddressSelection) => {
    setSelection(nextSelection);
  }, []);

  const handleSearch = () => {
    if (!input.trim()) return;
    setSelection(null);
    setQuery(input.trim());
    setRequestId((current) => current + 1);
  };

  const handleSelect = () => {
    if (!selection) return;
    navigation.navigate("Register", { selectedAddress: selection });
  };

  return (
    <SafeAreaView style={styles.safeArea} edges={["top", "bottom"]}>
      <ScreenHeader
        title="집 주소 설정"
        subtitle="카카오 지도"
        onBack={() => navigation.goBack()}
      />

      <View style={styles.searchArea}>
        <View style={styles.searchBox}>
          <View style={styles.providerBadge}><Text style={styles.providerBadgeText}>K</Text></View>
          <TextInput
            autoFocus
            onChangeText={setInput}
            onSubmitEditing={handleSearch}
            placeholder="도로명 또는 지번 주소를 검색하세요"
            placeholderTextColor={colors.subtle}
            returnKeyType="search"
            style={styles.searchInput}
            value={input}
          />
          {input ? (
            <Pressable accessibilityLabel="검색어 지우기" onPress={() => setInput("")}>
              <Text style={styles.clear}>×</Text>
            </Pressable>
          ) : null}
        </View>
        <Pressable onPress={handleSearch} style={styles.searchButton}>
          <Text style={styles.searchButtonText}>검색</Text>
        </Pressable>
      </View>

      <View style={styles.mapArea}>
        <KakaoAddressMap
          onResolved={handleResolved}
          query={query}
          requestId={requestId}
        />
      </View>

      <View style={styles.sheet}>
        <View style={styles.handle} />
        {selection ? (
          <>
            <Text style={styles.sheetEyebrow}>선택한 주소</Text>
            <View style={styles.resultRow}>
              <View style={styles.resultIcon}><Text style={styles.resultIconText}>⌖</Text></View>
              <View style={styles.resultCopy}>
                <Text style={styles.resultAddress}>{selection.address}</Text>
                <Text style={styles.resultCoordinate}>
                  위도 {selection.latitude.toFixed(5)} · 경도 {selection.longitude.toFixed(5)}
                </Text>
              </View>
            </View>
            <Button label="이 주소를 집으로 설정" onPress={handleSelect} />
          </>
        ) : (
          <View style={styles.emptyState}>
            <Text style={styles.emptyTitle}>집 근처 주소를 검색해주세요</Text>
            <Text style={styles.emptyText}>
              상세 동·호수는 입력하지 않아도 돼요. 약속 장소 추천에는 좌표만 사용합니다.
            </Text>
            <View style={styles.exampleRow}>
              {["서울시청", "성수역", "서울대입구역"].map((example) => (
                <Pressable
                  key={example}
                  onPress={() => setInput(example)}
                  style={styles.exampleChip}
                >
                  <Text style={styles.exampleText}>{example}</Text>
                </Pressable>
              ))}
            </View>
          </View>
        )}
      </View>
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  safeArea: { flex: 1, backgroundColor: colors.background },
  searchArea: { flexDirection: "row", gap: 9, paddingHorizontal: 16, paddingVertical: 11, backgroundColor: colors.background },
  searchBox: { flex: 1, height: 52, borderRadius: 16, backgroundColor: colors.surface, borderWidth: 1, borderColor: colors.border, flexDirection: "row", alignItems: "center", paddingHorizontal: 11 },
  providerBadge: { width: 30, height: 30, borderRadius: 10, backgroundColor: "#FEE500", alignItems: "center", justifyContent: "center" },
  providerBadgeText: { color: "#191600", fontSize: 14, fontWeight: "900" },
  searchInput: { flex: 1, color: colors.text, fontSize: 13, paddingHorizontal: 10 },
  clear: { color: colors.subtle, fontSize: 22, paddingHorizontal: 3 },
  searchButton: { width: 58, height: 52, borderRadius: 16, backgroundColor: colors.charcoal, alignItems: "center", justifyContent: "center" },
  searchButtonText: { color: colors.surface, fontSize: 13, fontWeight: "900" },
  mapArea: { flex: 1, minHeight: 250 },
  sheet: { backgroundColor: colors.surface, borderTopLeftRadius: 26, borderTopRightRadius: 26, marginTop: -18, paddingHorizontal: 20, paddingTop: 9, paddingBottom: 12, minHeight: 190, borderWidth: 1, borderColor: colors.border },
  handle: { width: 40, height: 4, borderRadius: 2, backgroundColor: colors.border, alignSelf: "center", marginBottom: 15 },
  sheetEyebrow: { color: colors.green, fontSize: 11, fontWeight: "900", marginBottom: 9 },
  resultRow: { flexDirection: "row", alignItems: "center", marginBottom: 16 },
  resultIcon: { width: 42, height: 42, borderRadius: 14, backgroundColor: "#E3F7EA", alignItems: "center", justifyContent: "center" },
  resultIconText: { color: "#03A94D", fontSize: 18, fontWeight: "900" },
  resultCopy: { flex: 1, marginLeft: 11 },
  resultAddress: { color: colors.text, fontSize: 14, fontWeight: "900" },
  resultCoordinate: { color: colors.muted, fontSize: 10, marginTop: 4 },
  emptyState: { gap: 7 },
  emptyTitle: { color: colors.text, fontSize: 16, fontWeight: "900" },
  emptyText: { color: colors.muted, fontSize: 11, lineHeight: 17 },
  exampleRow: { flexDirection: "row", flexWrap: "wrap", gap: 7, marginTop: 7 },
  exampleChip: { borderRadius: 999, backgroundColor: colors.background, borderWidth: 1, borderColor: colors.border, paddingHorizontal: 11, paddingVertical: 8 },
  exampleText: { color: colors.muted, fontSize: 10, fontWeight: "700" },
});
