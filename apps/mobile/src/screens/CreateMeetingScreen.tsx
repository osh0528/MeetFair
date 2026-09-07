import type { FriendSummary, LocationShareMode, MeetingSummary, MeetingVisibility, TravelMetric } from "@meetfair/shared";
import type { NativeStackScreenProps } from "@react-navigation/native-stack";
import { useCallback, useEffect, useMemo, useState } from "react";
import { Pressable, ScrollView, StyleSheet, Text, TextInput, useWindowDimensions, View } from "react-native";
import { SafeAreaView } from "react-native-safe-area-context";
import type { RootStackParamList } from "../../App";
import { Button, Card, ScreenHeader, SectionHeading } from "../components/ui";
import { ExpandableKakaoAddressMap } from "../components/ExpandableKakaoAddressMap";
import { apiRequest } from "../services/api";
import { requestCameraAccess } from "../services/camera-permission";
import { colors } from "../theme/colors";
import type { AddressCandidate, AddressSelection } from "../types/location";

type Props = NativeStackScreenProps<RootStackParamList, "CreateMeeting">;
const categoryOptions = ["카페", "음식점", "술집", "문화시설"];
const timeOptions = ["12:00", "15:00", "18:00", "19:00", "20:00"];
const weekdayLabels = ["일", "월", "화", "수", "목", "금", "토"];

function toLocalDateValue(date: Date): string {
  const year = date.getFullYear();
  const month = String(date.getMonth() + 1).padStart(2, "0");
  const day = String(date.getDate()).padStart(2, "0");
  return `${year}-${month}-${day}`;
}

function dateFromOffset(days: number): string {
  const date = new Date();
  date.setDate(date.getDate() + days);
  return toLocalDateValue(date);
}

function upcomingSaturday(): string {
  const date = new Date();
  const daysUntilSaturday = (6 - date.getDay() + 7) % 7;
  date.setDate(date.getDate() + daysUntilSaturday);
  return toLocalDateValue(date);
}

function dateValueToDate(dateValue: string): Date | null {
  const match = /^(\d{4})-(\d{2})-(\d{2})$/.exec(dateValue);
  if (!match) return null;
  const year = Number(match[1]);
  const month = Number(match[2]);
  const day = Number(match[3]);
  const result = new Date(year, month - 1, day);
  return result.getFullYear() === year && result.getMonth() === month - 1 && result.getDate() === day
    ? result
    : null;
}

function calendarDates(month: Date): Array<Date | null> {
  const year = month.getFullYear();
  const monthIndex = month.getMonth();
  const firstWeekday = new Date(year, monthIndex, 1).getDay();
  const dayCount = new Date(year, monthIndex + 1, 0).getDate();
  return [
    ...Array.from<Date | null>({ length: firstWeekday }).fill(null),
    ...Array.from({ length: dayCount }, (_, index) => new Date(year, monthIndex, index + 1)),
  ];
}

function isPastDate(date: Date): boolean {
  const today = new Date();
  today.setHours(0, 0, 0, 0);
  return date.getTime() < today.getTime();
}

function parseSchedule(dateValue: string, timeValue: string): Date | null {
  const dateMatch = /^(\d{4})-(\d{2})-(\d{2})$/.exec(dateValue.trim());
  const timeMatch = /^(\d{2}):(\d{2})$/.exec(timeValue.trim());
  if (!dateMatch || !timeMatch) return null;
  const [, year, month, day] = dateMatch.map(Number);
  const [, hour, minute] = timeMatch.map(Number);
  const result = new Date(year!, month! - 1, day!, hour!, minute!);
  if (
    result.getFullYear() !== year
    || result.getMonth() !== month! - 1
    || result.getDate() !== day
    || result.getHours() !== hour
    || result.getMinutes() !== minute
  ) return null;
  return result;
}

export function CreateMeetingScreen({ navigation }: Props) {
  const { width } = useWindowDimensions();
  const isMobile = width < 768;
  const defaultDate = useMemo(() => dateFromOffset(1), []);
  const [title, setTitle] = useState("");
  const [scheduledDate, setScheduledDate] = useState(defaultDate);
  const [scheduledTime, setScheduledTime] = useState("18:00");
  const [calendarMonth, setCalendarMonth] = useState(() => {
    const initial = dateValueToDate(defaultDate) ?? new Date();
    return new Date(initial.getFullYear(), initial.getMonth(), 1);
  });
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
  const scheduledAt = useMemo(() => parseSchedule(scheduledDate, scheduledTime), [scheduledDate, scheduledTime]);
  const visibleCalendarDates = useMemo(() => calendarDates(calendarMonth), [calendarMonth]);

  function selectDate(dateValue: string) {
    setScheduledDate(dateValue);
    const selected = dateValueToDate(dateValue);
    if (selected) setCalendarMonth(new Date(selected.getFullYear(), selected.getMonth(), 1));
  }

  function moveCalendarMonth(offset: number) {
    setCalendarMonth((current) => new Date(current.getFullYear(), current.getMonth() + offset, 1));
  }

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
    if (!scheduledAt) {
      setError("날짜는 YYYY-MM-DD, 시간은 HH:MM 형식으로 입력해 주세요.");
      return;
    }
    if (scheduledAt.getTime() <= Date.now()) {
      setError("현재보다 이후 날짜와 시간을 선택해 주세요.");
      return;
    }
    if (!await requestCameraAccess()) {
      setError("모임 생성에는 카메라 권한이 필요합니다.");
      return;
    }
    try {
      const meeting = await apiRequest<MeetingSummary>("/meetings", {
        method: "POST",
        body: JSON.stringify({
          title: title.trim(),
          scheduledAt: scheduledAt.toISOString(),
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
        <TextInput onChangeText={setTitle} placeholder="모임 이름" placeholderTextColor={colors.subtle} style={styles.input} value={title} />

        <SectionHeading title="날짜와 시간" action={scheduledAt ? scheduledAt.toLocaleString("ko-KR", { month: "long", day: "numeric", weekday: "short", hour: "2-digit", minute: "2-digit" }) : "확인 필요"} />
        <View style={styles.wrap}>
          <Chip label="오늘" selected={scheduledDate === dateFromOffset(0)} onPress={() => selectDate(dateFromOffset(0))} />
          <Chip label="내일" selected={scheduledDate === dateFromOffset(1)} onPress={() => selectDate(dateFromOffset(1))} />
          <Chip label="이번 토요일" selected={scheduledDate === upcomingSaturday()} onPress={() => selectDate(upcomingSaturday())} />
        </View>
        <Card style={styles.calendarCard}>
          <View style={styles.calendarHeader}>
            <Pressable accessibilityLabel="이전 달" onPress={() => moveCalendarMonth(-1)} style={styles.monthButton}>
              <Text style={styles.monthButtonText}>‹</Text>
            </Pressable>
            <Text style={styles.monthTitle}>{calendarMonth.getFullYear()}년 {calendarMonth.getMonth() + 1}월</Text>
            <Pressable accessibilityLabel="다음 달" onPress={() => moveCalendarMonth(1)} style={styles.monthButton}>
              <Text style={styles.monthButtonText}>›</Text>
            </Pressable>
          </View>
          <View style={styles.calendarGrid}>
            {weekdayLabels.map((weekday, index) => (
              <View key={weekday} style={styles.calendarCell}>
                <Text style={[styles.weekdayText, index === 0 && styles.sundayText, index === 6 && styles.saturdayText]}>{weekday}</Text>
              </View>
            ))}
            {visibleCalendarDates.map((date, index) => {
              if (!date) return <View key={`empty-${index}`} style={styles.calendarCell} />;
              const value = toLocalDateValue(date);
              const selected = value === scheduledDate;
              const today = value === dateFromOffset(0);
              const disabled = isPastDate(date);
              return (
                <View key={value} style={styles.calendarCell}>
                  <Pressable
                    accessibilityRole="button"
                    accessibilityState={{ disabled, selected }}
                    disabled={disabled}
                    onPress={() => selectDate(value)}
                    style={[styles.dayButton, today && styles.todayButton, selected && styles.selectedDayButton]}
                  >
                    <Text style={[styles.dayText, date.getDay() === 0 && styles.sundayText, date.getDay() === 6 && styles.saturdayText, disabled && styles.disabledDayText, selected && styles.selectedDayText]}>{date.getDate()}</Text>
                  </Pressable>
                </View>
              );
            })}
          </View>
        </Card>
        <View style={styles.timeInputGroup}>
          <Text style={styles.fieldLabel}>시간</Text>
          <TextInput autoCapitalize="none" keyboardType="numbers-and-punctuation" maxLength={5} onChangeText={setScheduledTime} placeholder="18:00" placeholderTextColor={colors.subtle} style={styles.input} value={scheduledTime} />
        </View>
        <View style={styles.wrap}>{timeOptions.map((time) => <Chip key={time} label={time} selected={scheduledTime === time} onPress={() => setScheduledTime(time)} />)}</View>
        {!scheduledAt ? <Text style={styles.error}>날짜 또는 시간 형식을 확인해 주세요.</Text> : scheduledAt.getTime() <= Date.now() ? <Text style={styles.error}>현재보다 이후 시간을 선택해 주세요.</Text> : null}

        <SectionHeading title="모임 공개 범위" />
        <View style={[styles.visibilityRow, isMobile && styles.visibilityRowMobile]}>
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
        <Text style={styles.note}>
          {travelMetric === "TRANSIT"
            ? "참가자별 대중교통 예상시간의 차이가 적은 장소를 우선 추천합니다."
            : travelMetric === "CAR"
              ? "참가자별 자동차 예상시간의 차이가 적은 장소를 우선 추천합니다."
              : "참가자 출발지의 직선거리 차이가 적은 장소를 우선 추천합니다."}
        </Text>

        <SectionHeading title="위치 공유" />
        <ChoiceRow values={["BEFORE_START", "DAY_OF", "OFF"]} selected={shareMode} labels={["시작 전", "당일 0시", "공유 안 함"]} onSelect={(value) => setShareMode(value as LocationShareMode)} />
        {shareMode === "BEFORE_START" ? <TextInput keyboardType="number-pad" onChangeText={setMinutesBefore} placeholder="몇 분 전" style={styles.input} value={minutesBefore} /> : null}

        <SectionHeading title="장소 종류" />
        <View style={styles.wrap}>{categoryOptions.map((category) => <Chip key={category} label={category} selected={categories.includes(category)} onPress={() => setCategories(toggle(categories, category))} />)}</View>

        <SectionHeading title="모임 장소 추천" action={selectedPlace ? "선택됨" : "선택 사항"} />
        <View style={[styles.placeSearchRow, isMobile && styles.placeSearchRowMobile]}>
          <TextInput
            onChangeText={setPlaceInput}
            onSubmitEditing={searchPlace}
            placeholder="장소명이나 주소 검색"
            placeholderTextColor={colors.subtle}
            returnKeyType="search"
            style={[styles.input, styles.placeSearchInput]}
            value={placeInput}
          />
          <Pressable onPress={searchPlace} style={styles.searchButton}>
            <Text style={styles.searchButtonText}>검색</Text>
          </Pressable>
        </View>
        <View style={styles.placeMap}>
          <ExpandableKakaoAddressMap
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
        <Button disabled={!title.trim() || categories.length === 0 || !scheduledAt || scheduledAt.getTime() <= Date.now()} label="모임 만들기" onPress={createMeeting} />
      </ScrollView>
    </SafeAreaView>
  );
}

function ChoiceRow({ values, labels, selected, onSelect }: { values: string[]; labels: string[]; selected: string; onSelect(value: string): void }) {
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
  return <Pressable onPress={onPress} style={[styles.chip, selected && styles.chipSelected]}><Text style={[styles.chipText, selected && styles.chipTextSelected]}>{label}</Text></Pressable>;
}

const styles = StyleSheet.create({
  safeArea: { flex: 1, backgroundColor: colors.background },
  content: { padding: 20, gap: 13, paddingBottom: 40 },
  title: { color: colors.text, fontSize: 25, fontWeight: "900" },
  input: { minHeight: 50, borderRadius: 6, borderWidth: 1, borderColor: colors.border, backgroundColor: colors.surface, paddingHorizontal: 14, color: colors.text },
  calendarCard: { padding: 12, gap: 10 },
  calendarHeader: { flexDirection: "row", alignItems: "center", justifyContent: "space-between" },
  monthButton: { width: 38, height: 38, borderRadius: 19, backgroundColor: colors.primarySoft, alignItems: "center", justifyContent: "center" },
  monthButtonText: { color: colors.text, fontSize: 27, lineHeight: 30, fontWeight: "800" },
  monthTitle: { color: colors.text, fontSize: 16, fontWeight: "900" },
  calendarGrid: { flexDirection: "row", flexWrap: "wrap" },
  calendarCell: { width: "14.2857%", minHeight: 42, alignItems: "center", justifyContent: "center" },
  weekdayText: { color: colors.muted, fontSize: 11, fontWeight: "900" },
  sundayText: { color: colors.red },
  saturdayText: { color: "#2563EB" },
  dayButton: { width: 36, height: 36, borderRadius: 18, alignItems: "center", justifyContent: "center" },
  todayButton: { borderWidth: 1, borderColor: colors.primary },
  selectedDayButton: { backgroundColor: colors.primary },
  dayText: { color: colors.text, fontSize: 13, fontWeight: "800" },
  disabledDayText: { color: colors.subtle, opacity: 0.45 },
  selectedDayText: { color: colors.surface },
  timeInputGroup: { gap: 6 },
  fieldLabel: { color: colors.muted, fontSize: 11, fontWeight: "800", marginLeft: 3 },
  placeSearchRow: { flexDirection: "row", alignItems: "center", gap: 8 },
  placeSearchRowMobile: { flexDirection: "column", alignItems: "stretch" },
  placeSearchInput: { flex: 1 },
  searchButton: { minHeight: 50, borderRadius: 6, paddingHorizontal: 16, backgroundColor: colors.charcoal, alignItems: "center", justifyContent: "center" },
  searchButtonText: { color: colors.surface, fontWeight: "900" },
  placeMap: { height: 280, borderRadius: 6, overflow: "hidden" },
  placeCandidateList: { gap: 8 },
  placeCandidate: { borderRadius: 6, borderWidth: 1, borderColor: colors.border, backgroundColor: colors.surface, paddingHorizontal: 14, paddingVertical: 10 },
  placeCandidateSelected: { borderColor: colors.primary, backgroundColor: colors.primarySoft },
  placeCandidateTitle: { color: colors.text, fontWeight: "900", fontSize: 13 },
  placeCandidateAddress: { color: colors.muted, fontSize: 11, marginTop: 3 },
  selectedPlace: { color: colors.primary, fontSize: 12, fontWeight: "800" },
  visibilityRow: { flexDirection: "row", gap: 10 },
  visibilityRowMobile: { flexDirection: "column", gap: 10 },
  visibilityOption: { flex: 1 },
  visibilityCard: { minHeight: 142, gap: 8, padding: 14 },
  visibilityCardSelected: { borderColor: colors.primary, backgroundColor: colors.primarySoft },
  radio: { width: 20, height: 20, borderRadius: 10, borderWidth: 2, borderColor: colors.border, alignItems: "center", justifyContent: "center" },
  radioSelected: { borderColor: colors.primary },
  radioDot: { width: 10, height: 10, borderRadius: 5, backgroundColor: colors.primary },
  visibilityTitle: { color: colors.text, fontSize: 15, fontWeight: "900" },
  visibilityTitleSelected: { color: colors.primary },
  visibilityDescription: { color: colors.muted, fontSize: 11, lineHeight: 17 },
  wrap: { flexDirection: "row", flexWrap: "wrap", gap: 8 },
  chip: { borderWidth: 1, borderColor: colors.border, backgroundColor: colors.surface, borderRadius: 6, paddingHorizontal: 14, paddingVertical: 10 },
  chipSelected: { backgroundColor: colors.primary, borderColor: colors.primary },
  chipText: { color: colors.muted, fontWeight: "800" },
  chipTextSelected: { color: colors.surface },
  friend: { flexDirection: "row", justifyContent: "space-between" },
  selectedCard: { borderColor: colors.primary },
  friendName: { color: colors.text, fontWeight: "800" },
  notice: { color: colors.muted, fontSize: 11, lineHeight: 17 },
  note: { color: colors.amber, fontSize: 11 },
  error: { color: colors.red, fontSize: 12 },
});
