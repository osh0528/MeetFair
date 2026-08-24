import type { FriendSummary, LocationShareMode, MeetingSummary, MeetingVisibility, TravelMetric } from "@meetfair/shared";
import type { NativeStackScreenProps } from "@react-navigation/native-stack";
import { Camera } from "expo-camera";
import { useEffect, useMemo, useState } from "react";
import { Pressable, ScrollView, StyleSheet, Text, TextInput, View } from "react-native";
import { SafeAreaView } from "react-native-safe-area-context";
import type { RootStackParamList } from "../../App";
import { Button, Card, ScreenHeader, SectionHeading } from "../components/ui";
import { apiRequest } from "../services/api";
import { colors } from "../theme/colors";

type Props = NativeStackScreenProps<RootStackParamList, "CreateMeeting">;
const categoryOptions = ["카페", "음식점", "술집", "문화시설"];

export function CreateMeetingScreen({ navigation }: Props) {
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
  const [error, setError] = useState("");

  useEffect(() => {
    void apiRequest<{ friends: FriendSummary[] }>("/friends").then((data) => setFriends(data.friends));
  }, []);

  function toggle<T>(items: T[], item: T) {
    return items.includes(item) ? items.filter((value) => value !== item) : [...items, item];
  }

  async function createMeeting() {
    setError("");
    const [camera, microphone] = await Promise.all([
      Camera.requestCameraPermissionsAsync(),
      Camera.requestMicrophonePermissionsAsync(),
    ]);
    if (!camera.granted || !microphone.granted) {
      setError("모임 생성과 참여에는 카메라·마이크 권한이 필요합니다.");
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
        <TextInput autoCapitalize="none" onChangeText={setScheduledAt} placeholder="2026-08-22T14:00" placeholderTextColor={colors.subtle} style={styles.input} value={scheduledAt} />

        <SectionHeading title="공개 여부" />
        <ChoiceRow values={["PRIVATE", "PUBLIC_FRIENDS"]} selected={visibility} labels={["비공개", "친구 피드 공개"]} onSelect={(value) => setVisibility(value as MeetingVisibility)} />

        <SectionHeading title="추천 이동 기준" />
        <ChoiceRow values={["DISTANCE", "CAR", "TRANSIT"]} selected={travelMetric} labels={["직선거리", "자동차", "대중교통"]} onSelect={(value) => setTravelMetric(value as TravelMetric)} />
        {travelMetric === "TRANSIT" ? <Text style={styles.note}>대중교통 경로 API가 서버에 준비되지 않으면 추천 요청이 비활성화됩니다.</Text> : null}

        <SectionHeading title="위치 공유" />
        <ChoiceRow values={["BEFORE_START", "DAY_OF", "OFF"]} selected={shareMode} labels={["시작 전", "당일 0시", "공유 안 함"]} onSelect={(value) => setShareMode(value as LocationShareMode)} />
        {shareMode === "BEFORE_START" ? <TextInput keyboardType="number-pad" onChangeText={setMinutesBefore} placeholder="몇 분 전" style={styles.input} value={minutesBefore} /> : null}

        <SectionHeading title="장소 종류" />
        <View style={styles.wrap}>{categoryOptions.map((category) => <Chip key={category} label={category} selected={categories.includes(category)} onPress={() => setCategories(toggle(categories, category))} />)}</View>

        <SectionHeading title="초대할 친구" action={`${invitees.length}명`} />
        {friends.map((friend) => (
          <Pressable key={friend.userId} onPress={() => setInvitees(toggle(invitees, friend.userId))}>
            <Card style={[styles.friend, invitees.includes(friend.userId) && styles.selectedCard]}>
              <Text style={styles.friendName}>{friend.nickname} · @{friend.accountId}</Text>
              <Text>{invitees.includes(friend.userId) ? "✓" : "+"}</Text>
            </Card>
          </Pressable>
        ))}
        <Text style={styles.notice}>참여자는 초대를 수락하기 전에 카메라·마이크와 위치 공유 조건을 확인합니다.</Text>
        {error ? <Text style={styles.error}>{error}</Text> : null}
        <Button disabled={!title.trim() || categories.length === 0} label="모임 만들기" onPress={createMeeting} />
      </ScrollView>
    </SafeAreaView>
  );
}

function ChoiceRow({ values, labels, selected, onSelect }: { values: string[]; labels: string[]; selected: string; onSelect(value: string): void }) {
  return <View style={styles.wrap}>{values.map((value, index) => <Chip key={value} label={labels[index] ?? value} selected={selected === value} onPress={() => onSelect(value)} />)}</View>;
}

function Chip({ label, selected, onPress }: { label: string; selected: boolean; onPress(): void }) {
  return <Pressable onPress={onPress} style={[styles.chip, selected && styles.chipSelected]}><Text style={[styles.chipText, selected && styles.chipTextSelected]}>{label}</Text></Pressable>;
}

const styles = StyleSheet.create({
  safeArea: { flex: 1, backgroundColor: colors.background },
  content: { padding: 20, gap: 13, paddingBottom: 40 },
  title: { color: colors.text, fontSize: 25, fontWeight: "900" },
  input: { minHeight: 50, borderRadius: 15, borderWidth: 1, borderColor: colors.border, backgroundColor: colors.surface, paddingHorizontal: 14, color: colors.text },
  wrap: { flexDirection: "row", flexWrap: "wrap", gap: 8 },
  chip: { borderWidth: 1, borderColor: colors.border, backgroundColor: colors.surface, borderRadius: 999, paddingHorizontal: 14, paddingVertical: 10 },
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
