import type { NativeStackScreenProps } from "@react-navigation/native-stack";
import { useCallback, useState , useMemo} from "react";
import { Pressable, ScrollView, StyleSheet, Text, TextInput, View } from "react-native";
import { SafeAreaView } from "react-native-safe-area-context";
import type { RootStackParamList } from "../../App";
import { Button, ScreenHeader } from "../components/ui";
import { apiRequest } from "../services/api";
import { useSession } from "../services/session";
import { KakaoAddressMap } from "../components/KakaoAddressMap";
import { useAppColors } from "../services/theme";

import type { AddressCandidate, AddressSelection } from "../types/location";

type Props = NativeStackScreenProps<RootStackParamList, "AddressSearch">;

export function AddressSearchScreen({ navigation, route }: Props) {
  const palette = useAppColors();
  const styles = useStyles();
  const session = useSession();
  const [input, setInput] = useState("");
  const [query, setQuery] = useState("");
  const [requestId, setRequestId] = useState(0);
  const [candidates, setCandidates] = useState<AddressCandidate[]>([]);
  const [selection, setSelection] = useState<AddressCandidate | null>(null);
  const [focusTarget, setFocusTarget] = useState<AddressSelection | null>(null);
  const [message, setMessage] = useState("");

  const handleResults = useCallback((items: AddressCandidate[]) => {
    const first = items[0];
    setCandidates(items);
    setSelection(null);
    if (items.length === 1 && first) setSelection(first);
    setFocusTarget(first ?? null);
  }, []);

  const handlePick = useCallback((candidate: AddressCandidate) => {
    setSelection(candidate);
    setFocusTarget(candidate);
  }, []);

  const handleSearch = () => {
    if (!input.trim()) return;
    setSelection(null);
    setQuery(input.trim());
    setRequestId((current) => current + 1);
  };

  const handleSelect = () => {
    if (!selection) return;
    if (route.params?.returnTo === "Profile") {
      void saveHomeAddress();
      return;
    }
    navigation.navigate("Register", { selectedAddress: selection });
  };

  const saveHomeAddress = async () => {
    if (!selection) return;
    try {
      await apiRequest("/users/me/home", { method: "PUT", body: JSON.stringify(selection) });
      await session.refreshUser();
      navigation.goBack();
    } catch (caught) {
      setMessage(caught instanceof Error ? caught.message : "집 주소를 저장하지 못했습니다.");
    }
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
            placeholder="주소 또는 장소 이름을 검색하세요"
            placeholderTextColor={palette.subtle}
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
          focusTarget={focusTarget}
          onResults={handleResults}
          query={query}
          requestId={requestId}
        />
      </View>

      <View style={styles.sheet}>
        <View style={styles.handle} />
        {message ? <Text style={styles.message}>{message}</Text> : null}
        {candidates.length === 0 ? (
          <View style={styles.emptyState}>
            <Text style={styles.emptyTitle}>집 근처 주소를 검색해주세요</Text>
            <Text style={styles.emptyText}>
              상세 동·호수는 입력하지 않아도 돼요. 약속 장소 추천에는 좌표만 사용합니다.
              지도를 직접 눌러서 위치를 고를 수도 있어요.
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
        ) : candidates.length === 1 ? (
          <>
            <Text style={styles.sheetEyebrow}>선택한 주소</Text>
            <View style={styles.resultRow}>
              <View style={styles.resultIcon}><Text style={styles.resultIconText}>⌖</Text></View>
              <View style={styles.resultCopy}>
                <Text style={styles.resultAddress}>{selection?.address ?? ""}</Text>
                <Text style={styles.resultCoordinate}>
                  위도 {selection?.latitude.toFixed(5)} · 경도 {selection?.longitude.toFixed(5)}
                </Text>
              </View>
            </View>
            <Button label="이 주소를 집으로 설정" onPress={handleSelect} />
          </>
        ) : (
          <>
            <Text style={styles.sheetEyebrow}>
              검색 결과 {candidates.length}개 · 원하는 장소를 선택하세요
            </Text>
            <ScrollView style={styles.candidateList} contentContainerStyle={styles.candidateListContent}>
              {candidates.map((candidate) => {
                const picked = selection === candidate;
                return (
                  <Pressable
                    key={`${candidate.latitude}-${candidate.longitude}-${candidate.title}`}
                    onPress={() => handlePick(candidate)}
                    style={[styles.candidateRow, picked && styles.candidateRowPicked]}
                  >
                    <Text numberOfLines={1} style={styles.candidateTitle}>{candidate.title}</Text>
                    <Text numberOfLines={1} style={styles.candidateAddress}>{candidate.address}</Text>
                  </Pressable>
                );
              })}
            </ScrollView>
            {selection ? (
              <View style={styles.confirmWrap}>
                <Button label={`"${selection.title ?? selection.address}"로 설정`} onPress={handleSelect} />
              </View>
            ) : null}
          </>
        )}
      </View>
    </SafeAreaView>
  );
}

function useStyles() {
  const palette = useAppColors();
  return useMemo(
    () =>
      StyleSheet.create({
  safeArea: { flex: 1, backgroundColor: palette.background },
  searchArea: { flexDirection: "row", gap: 9, paddingHorizontal: 16, paddingVertical: 11, backgroundColor: palette.background },
  searchBox: { flex: 1, height: 52, borderRadius: 16, backgroundColor: palette.surface, borderWidth: 1, borderColor: palette.border, flexDirection: "row", alignItems: "center", paddingHorizontal: 11 },
  providerBadge: { width: 30, height: 30, borderRadius: 10, backgroundColor: "#FEE500", alignItems: "center", justifyContent: "center" },
  providerBadgeText: { color: "#191600", fontSize: 14, fontWeight: "900" },
  searchInput: { flex: 1, color: palette.text, fontSize: 13, paddingHorizontal: 10 },
  clear: { color: palette.subtle, fontSize: 22, paddingHorizontal: 3 },
  searchButton: { width: 58, height: 52, borderRadius: 16, backgroundColor: palette.charcoal, alignItems: "center", justifyContent: "center" },
  searchButtonText: { color: palette.surface, fontSize: 13, fontWeight: "900" },
  mapArea: { flex: 1, minHeight: 250 },
  sheet: { backgroundColor: palette.surface, borderTopLeftRadius: 26, borderTopRightRadius: 26, marginTop: -18, paddingHorizontal: 20, paddingTop: 9, paddingBottom: 12, minHeight: 190, borderWidth: 1, borderColor: palette.border },
  handle: { width: 40, height: 4, borderRadius: 2, backgroundColor: palette.border, alignSelf: "center", marginBottom: 15 },
  sheetEyebrow: { color: palette.green, fontSize: 11, fontWeight: "900", marginBottom: 9 },
  resultRow: { flexDirection: "row", alignItems: "center", marginBottom: 16 },
  resultIcon: { width: 42, height: 42, borderRadius: 14, backgroundColor: "#E3F7EA", alignItems: "center", justifyContent: "center" },
  resultIconText: { color: "#03A94D", fontSize: 18, fontWeight: "900" },
  resultCopy: { flex: 1, marginLeft: 11 },
  resultAddress: { color: palette.text, fontSize: 14, fontWeight: "900" },
  resultCoordinate: { color: palette.muted, fontSize: 10, marginTop: 4 },
  candidateList: { maxHeight: 172 },
  candidateListContent: { gap: 8, paddingBottom: 4 },
  candidateRow: { borderRadius: 14, borderWidth: 1, borderColor: palette.border, backgroundColor: palette.background, paddingHorizontal: 14, paddingVertical: 10 },
  candidateRowPicked: { borderColor: palette.charcoal, backgroundColor: palette.primarySoft },
  candidateTitle: { color: palette.text, fontSize: 13, fontWeight: "900" },
  candidateAddress: { color: palette.muted, fontSize: 10, marginTop: 3 },
  confirmWrap: { marginTop: 12 },
  emptyState: { gap: 7 },
  emptyTitle: { color: palette.text, fontSize: 16, fontWeight: "900" },
  emptyText: { color: palette.muted, fontSize: 11, lineHeight: 17 },
  exampleRow: { flexDirection: "row", flexWrap: "wrap", gap: 7, marginTop: 7 },
  exampleChip: { borderRadius: 999, backgroundColor: palette.background, borderWidth: 1, borderColor: palette.border, paddingHorizontal: 11, paddingVertical: 8 },
  exampleText: { color: palette.muted, fontSize: 10, fontWeight: "700" },
  message: { color: palette.red, fontSize: 12, fontWeight: "700", marginBottom: 8 },

      }),
    [palette],
  );
}
