import type { FriendSummary, LocationShareMode, MeetingSummary, MeetingVisibility, TravelMetric } from "@meetfair/shared";
import type { NativeStackScreenProps } from "@react-navigation/native-stack";
import { useCallback, useEffect, useMemo, useState } from "react";
import { Pressable, ScrollView, StyleSheet, Text, TextInput, View } from "react-native";
import { SafeAreaView } from "react-native-safe-area-context";
import type { RootStackParamList } from "../../App";
import { Button, Card, ScreenHeader, SectionHeading } from "../components/ui";
import { KakaoAddressMap } from "../components/KakaoAddressMap";
import { apiRequest } from "../services/api";
import { useRequestCameraAccess } from "../services/camera-permission";
import { useAppColors } from "../services/theme";

import type { AddressCandidate, AddressSelection } from "../types/location";

type Props = NativeStackScreenProps<RootStackParamList, "CreateMeeting">;
const categoryOptions = ["카페", "음식점", "술집", "문화시설"];

export function CreateMeetingScreen({ navigation }: Props) {
  const palette = useAppColors();
  const styles = useStyles();
  const defaultDate = useMemo(() => new Date(Date.now() + 24 * 60 * 60 * 1000).toISOString().slice(0, 16), []);
  const [title, setTitle] = useState("");
  const [scheduledAt, setScheduledAt] = useState(defaultDate);
  const [visibility, setVisibility] = useState<MeetingVisibility>("PRIVATE");
  const [travelMetric, setTravelMetric] = useState<TravelMetric>("DISTANCE");
  const [shareMode, setShareMode] = useState<LocationShareMode>("BEFORE_START");
  const [minutesBefore, setMinutesBefore] = useState("60");
  const [categories, setCategories] = useState<string[]>(["카페"]);
  const [friends, setFriends] = useState<FriendSummary[]>([]);
  const [invitees, setInvitees] = useState<string[]>([]);
  const [placeInput, setPlaceInput] = useState("");
  const [placeQuery, setPlaceQuery] = useState("");
  const [placeRequestId, setPlaceRequestId] = useState(0);
  const [placeCandidates, setPlaceCandidates] = useState<AddressCandidate[]>([]);
  const [selectedPlace, setSelectedPlace] = useState<AddressCandidate | null>(null);
  const [placeFocusTarget, setPlaceFocusTarget] = useState<AddressSelection | null>(null);
  const [error, setError] = useState("");
  const requestCameraAccess = useRequestCameraAccess();

  useEffect(() => {
    void apiRequest<{ friends: FriendSummary[] }>("/friends").then((data) => setFriends(data.friends));
  }, []);

  function toggle<T>(items: T[], item: T) {
    return items.includes(item) ? items.filter((value) => value !== item) : [...items, item];
  }

  const handlePlaceResults = useCallback((items: AddressCandidate[]) => {
    setPlaceCandidates(items);
    setSelectedPlace(items.length === 1 ? items[0] ?? null : null);
    setPlaceFocusTarget(items[0] ?? null);
  }, []);

  const handlePlaceResolved = useCallback((selection: AddressSelection) => {
    const candidate: AddressCandidate = { ...selection, title: selection.address };
    setPlaceCandidates([candidate]);
    setSelectedPlace(candidate);
    setPlaceFocusTarget(selection);
  }, []);

  function searchPlace() {
    const query = placeInput.trim();
    if (!query) return;
    setSelectedPlace(null);
    setPlaceQuery(query);
    setPlaceRequestId((current) => current + 1);
  }

  async function createMeeting() {
    setError("");
    if (!await requestCameraAccess()) {
      setError("모임 생성에는 카메라 권한이 필요합니다.");
      return;
    }
    try {
      const meeting = await apiRequest<MeetingSummary>("/meetings", {
        method: "POST",
        body: JSON.stringify({
          title: title.trim(),
          scheduledAt: new Date(scheduledAt).toISOString(),
          inviteeUserIds: invitees,
          visibility,
          categories,
          travelMetric,
          locationShareMode: shareMode,
          shareMinutesBefore: shareMode === "BEFORE_START" ? Number(minutesBefore) : null,
        }),
      });
      if (selectedPlace) {
        await apiRequest(`/meetings/${meeting.id}/candidates`, {
          method: "POST",
          body: JSON.stringify({
            providerPlaceId: `manual:${selectedPlace.latitude}:${selectedPlace.longitude}`,
            name: selectedPlace.title || selectedPlace.address,
            address: selectedPlace.address,
            latitude: selectedPlace.latitude,
            longitude: selectedPlace.longitude,
            category: categories[0] || "추천 장소",
          }),
        });
      }
      navigation.replace("Meeting", { meetingId: meeting.id });
    } catch (caught) {
      setError(caught instanceof Error ? caught.message : "모임을 만들지 못했습니다.");
    }
  }

  return (
    <SafeAreaView style={styles.safeArea}>
      <ScreenHeader title="새 모임" onBack={() => navigation.goBack()} />
      <ScrollView contentContainerStyle={styles.content} keyboardShouldPersistTaps="handled">
        <Text style={styles.title}>언제, 누구와 만날까요?</Text>
        <TextInput onChangeText={setTitle} placeholder="모임 이름" placeholderTextColor={palette.subtle} style={styles.input} value={title} />
        <TextInput autoCapitalize="none" onChangeText={setScheduledAt} placeholder="2026-08-22T14:00" placeholderTextColor={palette.subtle} style={styles.input} value={scheduledAt} />

        <SectionHeading title="모임 공개 범위" />
        <View style={styles.visibilityRow}>
          <VisibilityCard
            description="친구 피드에 공개하고 참여 요청을 받아요."
            onPress={() => setVisibility("PUBLIC_FRIENDS")}
            selected={visibility === "PUBLIC_FRIENDS"}
            title="공개 모임"
          />
          <VisibilityCard
            description="초대한 친구만 모임을 확인할 수 있어요."
            onPress={() => setVisibility("PRIVATE")}
            selected={visibility === "PRIVATE"}
            title="비공개 모임"
          />
        </View>

        <SectionHeading title="추천 이동 기준" />
        <ChoiceRow values={["DISTANCE", "CAR", "TRANSIT"]} selected={travelMetric} labels={["직선거리", "자동차", "대중교통"]} onSelect={(value) => setTravelMetric(value as TravelMetric)} />
        {travelMetric === "TRANSIT" ? <Text style={styles.note}>대중교통 경로 API가 서버에 준비되지 않으면 추천 요청이 비활성화됩니다.</Text> : null}

        <SectionHeading title="위치 공유" />
        <ChoiceRow values={["BEFORE_START", "DAY_OF", "OFF"]} selected={shareMode} labels={["시작 전", "당일 0시", "공유 안 함"]} onSelect={(value) => setShareMode(value as LocationShareMode)} />
        {shareMode === "BEFORE_START" ? <TextInput keyboardType="number-pad" onChangeText={setMinutesBefore} placeholder="몇 분 전" style={styles.input} value={minutesBefore} /> : null}

        <SectionHeading title="장소 종류" />
        <View style={styles.wrap}>{categoryOptions.map((category) => <Chip key={category} label={category} selected={categories.includes(category)} onPress={() => setCategories(toggle(categories, category))} />)}</View>

        <SectionHeading title="모임 장소 추천" action={selectedPlace ? "선택됨" : "선택 사항"} />
        <View style={styles.placeSearchRow}>
          <TextInput
            onChangeText={setPlaceInput}
            onSubmitEditing={searchPlace}
            placeholder="장소명이나 주소 검색"
            placeholderTextColor={palette.subtle}
            returnKeyType="search"
            style={[styles.input, styles.placeSearchInput]}
            value={placeInput}
          />
          <Pressable onPress={searchPlace} style={styles.searchButton}>
            <Text style={styles.searchButtonText}>검색</Text>
          </Pressable>
        </View>
        <View style={styles.placeMap}>
          <KakaoAddressMap
            focusTarget={placeFocusTarget}
            interactive
            onResolved={handlePlaceResolved}
            onResults={handlePlaceResults}
            query={placeQuery}
            requestId={placeRequestId}
          />
        </View>
        <Text style={styles.note}>검색 결과를 선택하거나 지도에서 원하는 위치를 직접 눌러주세요.</Text>
        {placeCandidates.length > 1 ? (
          <View style={styles.placeCandidateList}>
            {placeCandidates.map((candidate) => (
              <Pressable
                key={`${candidate.latitude}-${candidate.longitude}-${candidate.title}`}
                onPress={() => {
                  setSelectedPlace(candidate);
                  setPlaceFocusTarget(candidate);
                }}
                style={[styles.placeCandidate, selectedPlace === candidate && styles.placeCandidateSelected]}
              >
                <Text numberOfLines={1} style={styles.placeCandidateTitle}>{candidate.title}</Text>
                <Text numberOfLines={1} style={styles.placeCandidateAddress}>{candidate.address}</Text>
              </Pressable>
            ))}
          </View>
        ) : null}
        {selectedPlace ? <Text style={styles.selectedPlace}>선택한 장소: {selectedPlace.title || selectedPlace.address}</Text> : null}

        <SectionHeading title="초대할 친구" action={`${invitees.length}명`} />
        {friends.map((friend) => (
          <Pressable key={friend.userId} onPress={() => setInvitees(toggle(invitees, friend.userId))}>
            <Card style={[styles.friend, invitees.includes(friend.userId) && styles.selectedCard]}>
              <Text style={styles.friendName}>{friend.nickname} · @{friend.accountId}</Text>
              <Text>{invitees.includes(friend.userId) ? "✓" : "+"}</Text>
            </Card>
          </Pressable>
        ))}
        <Text style={styles.notice}>참여자는 초대를 수락하기 전에 카메라와 위치 공유 조건을 확인합니다.</Text>
        {error ? <Text style={styles.error}>{error}</Text> : null}
        <Button disabled={!title.trim() || categories.length === 0} label="모임 만들기" onPress={createMeeting} />
      </ScrollView>
    </SafeAreaView>
  );
}

function ChoiceRow({ values, labels, selected, onSelect }: { values: string[]; labels: string[]; selected: string; onSelect(value: string): void }) {
  const palette = useAppColors();
  const styles = useStyles();
  return <View style={styles.wrap}>{values.map((value, index) => <Chip key={value} label={labels[index] ?? value} selected={selected === value} onPress={() => onSelect(value)} />)}</View>;
}

function VisibilityCard({
  title,
  description,
  selected,
  onPress,
}: {
  title: string;
  description: string;
  selected: boolean;
  onPress(): void;
}) {
  const palette = useAppColors();
  const styles = useStyles();
  return (
    <Pressable
      accessibilityRole="radio"
      accessibilityState={{ checked: selected }}
      onPress={onPress}
      style={styles.visibilityOption}
    >
      <Card style={[styles.visibilityCard, selected && styles.visibilityCardSelected]}>
        <View style={[styles.radio, selected && styles.radioSelected]}>
          {selected ? <View style={styles.radioDot} /> : null}
        </View>
        <Text style={[styles.visibilityTitle, selected && styles.visibilityTitleSelected]}>{title}</Text>
        <Text style={styles.visibilityDescription}>{description}</Text>
      </Card>
    </Pressable>
  );
}

function Chip({ label, selected, onPress }: { label: string; selected: boolean; onPress(): void }) {
  const palette = useAppColors();
  const styles = useStyles();
  return <Pressable onPress={onPress} style={[styles.chip, selected && styles.chipSelected]}><Text style={[styles.chipText, selected && styles.chipTextSelected]}>{label}</Text></Pressable>;
}

function useStyles() {
  const palette = useAppColors();
  return useMemo(
    () =>
      StyleSheet.create({
  safeArea: { flex: 1, backgroundColor: palette.background },
  content: { padding: 20, gap: 13, paddingBottom: 40 },
  title: { color: palette.text, fontSize: 25, fontWeight: "900" },
  input: { minHeight: 50, borderRadius: 15, borderWidth: 1, borderColor: palette.border, backgroundColor: palette.surface, paddingHorizontal: 14, color: palette.text },
  placeSearchRow: { flexDirection: "row", alignItems: "center", gap: 8 },
  placeSearchInput: { flex: 1 },
  searchButton: { height: 50, borderRadius: 15, paddingHorizontal: 16, backgroundColor: palette.charcoal, alignItems: "center", justifyContent: "center" },
  searchButtonText: { color: palette.surface, fontWeight: "900" },
  placeMap: { height: 280, borderRadius: 16, overflow: "hidden" },
  placeCandidateList: { gap: 8 },
  placeCandidate: { borderRadius: 14, borderWidth: 1, borderColor: palette.border, backgroundColor: palette.surface, paddingHorizontal: 14, paddingVertical: 10 },
  placeCandidateSelected: { borderColor: palette.primary, backgroundColor: palette.primarySoft },
  placeCandidateTitle: { color: palette.text, fontWeight: "900", fontSize: 13 },
  placeCandidateAddress: { color: palette.muted, fontSize: 11, marginTop: 3 },
  selectedPlace: { color: palette.primary, fontSize: 12, fontWeight: "800" },
  visibilityRow: { flexDirection: "row", gap: 10 },
  visibilityOption: { flex: 1 },
  visibilityCard: { minHeight: 142, gap: 8, padding: 14 },
  visibilityCardSelected: { borderColor: palette.primary, backgroundColor: palette.primarySoft },
  radio: { width: 20, height: 20, borderRadius: 10, borderWidth: 2, borderColor: palette.border, alignItems: "center", justifyContent: "center" },
  radioSelected: { borderColor: palette.primary },
  radioDot: { width: 10, height: 10, borderRadius: 5, backgroundColor: palette.primary },
  visibilityTitle: { color: palette.text, fontSize: 15, fontWeight: "900" },
  visibilityTitleSelected: { color: palette.primary },
  visibilityDescription: { color: palette.muted, fontSize: 11, lineHeight: 17 },
  wrap: { flexDirection: "row", flexWrap: "wrap", gap: 8 },
  chip: { borderWidth: 1, borderColor: palette.border, backgroundColor: palette.surface, borderRadius: 999, paddingHorizontal: 14, paddingVertical: 10 },
  chipSelected: { backgroundColor: palette.primary, borderColor: palette.primary },
  chipText: { color: palette.muted, fontWeight: "800" },
  chipTextSelected: { color: palette.surface },
  friend: { flexDirection: "row", justifyContent: "space-between" },
  selectedCard: { borderColor: palette.primary },
  friendName: { color: palette.text, fontWeight: "800" },
  notice: { color: palette.muted, fontSize: 11, lineHeight: 17 },
  note: { color: palette.amber, fontSize: 11 },
  error: { color: palette.red, fontSize: 12 },

      }),
    [palette],
  );
}
