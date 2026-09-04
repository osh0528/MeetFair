import type { MeetingRecommendation, TravelMetric } from "@meetfair/shared";
import type { NativeStackScreenProps } from "@react-navigation/native-stack";
import { useCallback, useEffect, useMemo, useState } from "react";
import { Pressable, RefreshControl, ScrollView, StyleSheet, Text, View } from "react-native";
import { SafeAreaView } from "react-native-safe-area-context";
import type { RootStackParamList } from "../../App";
import { KakaoAddressMap } from "../components/KakaoAddressMap";
import { Avatar, Button, Card, Pill, ScreenHeader } from "../components/ui";
import { ApiError, apiRequest } from "../services/api";
import { useSession } from "../services/session";
import { colors } from "../theme/colors";
import type { MapDisplayMarker } from "../types/location";

type Props = NativeStackScreenProps<RootStackParamList, "Recommendations">;
type Recommendation = MeetingRecommendation & { fairnessScore?: number };

interface MeetingSummary {
  id: string;
  hostId: string;
  title: string;
  travelMetric: TravelMetric;
  status: string;
  confirmedPlace: { id: string } | null;
  participants: Array<{ userId: string; user: { nickname: string } }>;
  placeCandidates: Array<{ id: string; votes: Array<{ userId: string }> }>;
}

const metricLabels: Record<TravelMetric, string> = {
  TRANSIT: "대중교통 시간",
  CAR: "자동차 시간",
  DISTANCE: "이동 거리",
};

function formatDistance(meters: number) {
  return meters >= 1000 ? `${(meters / 1000).toFixed(1)}km` : `${Math.round(meters)}m`;
}

function values(item: MeetingRecommendation, metric: TravelMetric) {
  if (metric !== "DISTANCE") {
    return {
      average: item.averageDurationMinutes,
      maximum: item.maximumDurationMinutes,
      gap: item.timeGapMinutes,
    };
  }
  const distances = item.participantTravelTimes.map((travel) => travel.distanceMeters);
  if (!distances.length) return { average: 0, maximum: 0, gap: 0 };
  const maximum = Math.max(...distances);
  return {
    average: distances.reduce((sum, distance) => sum + distance, 0) / distances.length,
    maximum,
    gap: maximum - Math.min(...distances),
  };
}

function formatValue(value: number, metric: TravelMetric) {
  return metric === "DISTANCE" ? formatDistance(value) : `${Math.round(value)}분`;
}

function fairnessScore(item: Recommendation, metric: TravelMetric) {
  const stats = values(item, metric);
  if (typeof item.fairnessScore === "number") return item.fairnessScore;
  return stats.maximum <= 0
    ? 100
    : Math.max(0, Math.min(100, Math.round(100 * (1 - stats.gap / stats.maximum))));
}

function recommendationError(error: unknown, meeting?: MeetingSummary | null) {
  if (!(error instanceof ApiError)) return error instanceof Error ? error.message : "추천 장소를 불러오지 못했습니다.";
  if (error.code === "MEETING_ORIGINS_INCOMPLETE") {
    const ids = Array.isArray(error.details?.missingParticipantIds)
      ? error.details.missingParticipantIds.filter((id): id is string => typeof id === "string")
      : [];
    const names = ids.map((id) => meeting?.participants.find((participant) => participant.userId === id)?.user.nickname ?? id);
    return names.length
      ? `${names.join(", ")} 님이 출발 위치를 설정해야 합니다.`
      : "모든 참가자가 출발 위치를 설정한 뒤 다시 계산해 주세요.";
  }
  if (error.code === "VOTES_EXIST") return "투표가 시작된 뒤에는 추천 후보를 다시 계산할 수 없습니다.";
  const messages: Record<string, string> = {
    MEETING_ORIGINS_INCOMPLETE: "모든 참가자가 출발 위치를 설정한 뒤 추천을 받을 수 있습니다.",
    TRANSIT_NOT_CONFIGURED: "대중교통 추천 준비가 완료되지 않았습니다.",
    TRANSIT_TIMEOUT: "대중교통 경로 계산이 지연되고 있습니다. 다시 시도해 주세요.",
    TRANSIT_NO_ROUTE: "모든 참가자가 이동할 수 있는 대중교통 경로를 찾지 못했습니다.",
    RECOMMENDATION_PLACES_NOT_FOUND: "중심 위치 주변에서 조건에 맞는 장소를 찾지 못했습니다.",
  };
  return messages[error.code] ?? error.message;
}

export function RecommendationsLiveScreen({ navigation, route }: Props) {
  const { meetingId } = route.params;
  const { user } = useSession();
  const [meeting, setMeeting] = useState<MeetingSummary | null>(null);
  const [items, setItems] = useState<Recommendation[]>([]);
  const [selectedId, setSelectedId] = useState<string | null>(null);
  const [loading, setLoading] = useState(true);
  const [refreshing, setRefreshing] = useState(false);
  const [voting, setVoting] = useState(false);
  const [regenerating, setRegenerating] = useState(false);
  const [message, setMessage] = useState("");

  const load = useCallback(async (refresh = false) => {
    if (refresh) setRefreshing(true);
    else setLoading(true);
    setMessage("");
    try {
      const result = await apiRequest<{ recommendations: Recommendation[] }>(
        `/meetings/${meetingId}/recommendations`,
      );
      const meetingData = await apiRequest<MeetingSummary>(`/meetings/${meetingId}`);
      const sorted = [...result.recommendations].sort((a, b) =>
        a.recommendationRank - b.recommendationRank
        || a.timeGapMinutes - b.timeGapMinutes
        || a.maximumDurationMinutes - b.maximumDurationMinutes,
      ).slice(0, 2);
      setMeeting(meetingData);
      setItems(sorted);
      setSelectedId((current) => current && sorted.some((item) => item.id === current)
        ? current
        : sorted[0]?.id ?? null);
    } catch (error) {
      setMessage(recommendationError(error, meeting));
    } finally {
      setLoading(false);
      setRefreshing(false);
    }
  }, [meetingId]);

  useEffect(() => {
    void load();
  }, [load]);

  const selected = items.find((item) => item.id === selectedId) ?? items[0];
  const metric = meeting?.travelMetric ?? "TRANSIT";
  const votesByCandidate = useMemo(() => new Map(
    (meeting?.placeCandidates ?? []).map((candidate) => [candidate.id, candidate.votes]),
  ), [meeting?.placeCandidates]);
  const voteCounts = useMemo(() => new Map(
    [...votesByCandidate].map(([id, votes]) => [id, votes.length]),
  ), [votesByCandidate]);
  const voteStarted = [...votesByCandidate.values()].some((votes) => votes.length > 0);
  const myVoteId = [...votesByCandidate].find(([, votes]) => votes.some((vote) => vote.userId === user?.id))?.[0];
  const canRegenerate = Boolean(meeting && meeting.hostId === user?.id
    && meeting.status === "PLANNING"
    && !meeting.confirmedPlace
    && !voteStarted);
  const mapMarkers: MapDisplayMarker[] = items.flatMap((item, index) => item.id ? [{
    id: item.id,
    label: `${index + 1}. ${item.name}`,
    kind: "RECOMMENDED" as const,
    address: item.address,
    latitude: item.latitude,
    longitude: item.longitude,
  }] : []);

  async function regenerate() {
    if (!canRegenerate || regenerating) return;
    setRegenerating(true);
    setMessage("");
    try {
      const result = await apiRequest<{ recommendations: Recommendation[] }>(
        `/meetings/${meetingId}/recommendations/regenerate`,
        { method: "POST", body: "{}" },
        60_000,
      );
      const sorted = [...result.recommendations].sort((a, b) => a.recommendationRank - b.recommendationRank).slice(0, 2);
      setItems(sorted);
      setSelectedId(sorted[0]?.id ?? null);
      setMeeting(await apiRequest<MeetingSummary>(`/meetings/${meetingId}`));
    } catch (error) {
      setMessage(recommendationError(error, meeting));
    } finally {
      setRegenerating(false);
    }
  }
  async function vote() {
    if (!selected?.id || voting) return;
    setVoting(true);
    setMessage("");
    try {
      await apiRequest(`/meetings/${meetingId}/votes`, {
        method: "POST",
        body: JSON.stringify({ placeCandidateId: selected.id }),
      });
      setMessage(`${selected.name}에 투표했습니다.`);
      setMeeting(await apiRequest<MeetingSummary>(`/meetings/${meetingId}`));
    } catch (error) {
      setMessage(recommendationError(error, meeting));
    } finally {
      setVoting(false);
    }
  }

  return (
    <SafeAreaView style={styles.safeArea} edges={["top", "bottom"]}>
      <ScreenHeader title="공평한 장소 추천" subtitle={meeting?.title} onBack={() => navigation.goBack()} />
      <ScrollView
        contentContainerStyle={styles.content}
        refreshControl={<RefreshControl refreshing={refreshing} onRefresh={() => void load(true)} />}
      >
        {loading ? <State title="이동 경로를 계산하고 있어요" body="참가자 수와 경로 상황에 따라 잠시 걸릴 수 있습니다." /> : null}
        {!loading && !items.length ? (
          <State
            title="추천 결과를 준비하지 못했어요"
            body={message || "참가자 출발 위치와 원하는 장소 종류를 확인해 주세요."}
            retry={canRegenerate ? () => void regenerate() : () => void load()}
            retryLabel={canRegenerate ? (regenerating ? "계산 중..." : "추천 장소 계산하기") : "새로고침"}
          />
        ) : null}

        {items.length ? (
          <>
            <View style={styles.intro}>
              <View style={styles.introCopy}>
                <Text style={styles.eyebrow}>MeetFair 분석 완료</Text>
                <Text style={styles.title}>이동 격차가 작은{`\n`}장소를 찾았어요</Text>
                <Text style={styles.caption}>{metricLabels[metric]} 기준 · 낮은 격차부터 추천</Text>
              </View>
              {selected ? (
                <View style={styles.score}>
                  <Text style={styles.scoreValue}>{fairnessScore(selected, metric)}</Text>
                  <Text style={styles.scoreLabel}>균형 점수</Text>
                </View>
              ) : null}
            </View>
            {canRegenerate ? (
              <View style={styles.regenerateRow}>
                <Button compact variant="soft" label={regenerating ? "계산 중..." : "추천 다시 계산"} disabled={regenerating} onPress={() => void regenerate()} />
              </View>
            ) : null}
            {voteStarted ? <Text style={styles.lockNotice}>투표가 시작되어 추천 후보가 고정됐습니다.</Text> : null}
            <Text style={styles.sectionTitle}>추천 장소 {items.length}곳</Text>
            <View style={styles.list}>
              {items.map((item, index) => {
                const active = selected?.id === item.id;
                const stats = values(item, metric);
                return (
                  <Pressable key={item.id ?? `${item.latitude}:${item.longitude}`} onPress={() => setSelectedId(item.id ?? null)}>
                    <Card style={[styles.card, active && styles.activeCard]}>
                      <View style={styles.cardTop}>
                        <View style={[styles.rank, index === 0 && styles.bestRank]}>
                          <Text style={styles.rankText}>{index + 1}</Text>
                        </View>
                        <View style={styles.placeCopy}>
                          <View style={styles.nameRow}>
                            <Text style={styles.placeName}>{item.name}</Text>
                            {index === 0 ? <Pill label="BEST" tone="purple" /> : null}
                            {item.id === myVoteId ? <Pill label="내 선택" tone="green" /> : null}
                          </View>
                          <Text style={styles.address}>{item.category} · {item.address}</Text>
                        </View>
                        <View style={[styles.radio, active && styles.activeRadio]}>{active ? <View style={styles.dot} /> : null}</View>
                      </View>
                      <View style={styles.metrics}>
                        <Metric label="평균" value={formatValue(stats.average, metric)} />
                        <Metric label="가장 오래" value={formatValue(stats.maximum, metric)} />
                        <Metric label="최대 격차" value={formatValue(stats.gap, metric)} fair />
                        <Metric label="공평도" value={`${fairnessScore(item, metric)}점`} fair />
                      </View>
                      {active ? (
                        <View style={styles.travels}>
                          {item.participantTravelTimes.map((travel) => (
                            <View key={travel.userId} style={styles.travel}>
                              <Avatar name={travel.nickname} size={30} />
                              <Text style={styles.travelName}>{travel.nickname}</Text>
                              <Text style={styles.travelValue}>
                                {metric === "DISTANCE" ? formatDistance(travel.distanceMeters) : `${travel.durationMinutes}분`}
                              </Text>
                            </View>
                          ))}
                          <Text style={styles.explanation}>균형 점수는 가장 긴 이동값 대비 참가자 간 격차가 작을수록 높아집니다.</Text>
                        </View>
                      ) : null}
                      {item.id && voteCounts.has(item.id) ? <Text style={styles.voteCount}>현재 {voteCounts.get(item.id)}표</Text> : null}
                    </Card>
                  </Pressable>
                );
              })}
            </View>
            {selected ? (
              <View style={styles.mapSection}>
                <Text style={styles.mapTitle}>추천 장소 위치</Text>
                <Text style={styles.mapSubtitle}>추천 장소 2곳을 지도에서 간략하게 확인해 보세요.</Text>
                <Card style={styles.mapCard}>
                  <KakaoAddressMap
                    query=""
                    requestId={0}
                    mapMarkers={mapMarkers}
                  />
                </Card>
              </View>
            ) : null}
          </>
        ) : null}
        {message && items.length ? <Text style={styles.message}>{message}</Text> : null}
      </ScrollView>
      {selected ? (
        <View style={styles.footer}>
          <Button
            label={voting ? "투표 중..." : `${selected.name}에 투표하기`}
            disabled={!selected.id || voting || selected.id === myVoteId || meeting?.status !== "PLANNING" || Boolean(meeting?.confirmedPlace)}
            onPress={() => void vote()}
          />
        </View>
      ) : null}
    </SafeAreaView>
  );
}

function State({ title, body, retry, retryLabel = "다시 시도" }: { title: string; body: string; retry?: () => void; retryLabel?: string }) {
  return <Card style={styles.state}><Text style={styles.stateTitle}>{title}</Text><Text style={styles.stateBody}>{body}</Text>{retry ? <Button compact label={retryLabel} onPress={retry} /> : null}</Card>;
}

function Metric({ label, value, fair = false }: { label: string; value: string; fair?: boolean }) {
  return <View style={styles.metric}><Text style={styles.metricLabel}>{label}</Text><Text style={[styles.metricValue, fair && styles.fair]}>{value}</Text></View>;
}

const styles = StyleSheet.create({
  safeArea: { flex: 1, backgroundColor: colors.background },
  content: { padding: 20, paddingBottom: 28 },
  state: { alignItems: "center", gap: 12, paddingVertical: 32 },
  stateTitle: { color: colors.text, fontSize: 18, fontWeight: "900", textAlign: "center" },
  stateBody: { color: colors.muted, fontSize: 13, lineHeight: 20, textAlign: "center" },
  intro: { flexDirection: "row", alignItems: "center", marginBottom: 24 },
  introCopy: { flex: 1, gap: 6 },
  eyebrow: { color: colors.green, fontSize: 13, fontWeight: "900" },
  title: { color: colors.text, fontSize: 25, lineHeight: 33, fontWeight: "900" },
  caption: { color: colors.muted, fontSize: 11 },
  score: { width: 74, height: 74, borderRadius: 8, backgroundColor: colors.mint, alignItems: "center", justifyContent: "center" },
  scoreValue: { color: colors.green, fontSize: 25, fontWeight: "900" },
  scoreLabel: { color: colors.green, fontSize: 9, fontWeight: "800" },
  sectionTitle: { color: colors.text, fontSize: 18, fontWeight: "900", marginBottom: 12 },
  mapCard: { height: 250, padding: 0, overflow: "hidden", marginBottom: 20 },
  mapSection: { marginTop: 24 },
  mapTitle: { color: colors.text, fontSize: 18, fontWeight: "900", marginBottom: 5 },
  mapSubtitle: { color: colors.muted, fontSize: 11, lineHeight: 16, marginBottom: 10 },
  regenerateRow: { alignItems: "flex-end", marginBottom: 10 },
  lockNotice: { color: colors.amber, fontSize: 11, fontWeight: "800", marginBottom: 12 },
  list: { gap: 12 },
  card: { padding: 16, backgroundColor: colors.surface },
  activeCard: { borderColor: colors.primary, borderWidth: 2, padding: 15 },
  cardTop: { flexDirection: "row", alignItems: "center" },
  rank: { width: 34, height: 34, borderRadius: 6, backgroundColor: colors.background, alignItems: "center", justifyContent: "center" },
  bestRank: { backgroundColor: colors.primarySoft },
  rankText: { color: colors.primary, fontSize: 14, fontWeight: "900" },
  placeCopy: { flex: 1, marginLeft: 11 },
  nameRow: { flexDirection: "row", alignItems: "center", gap: 7, flexWrap: "wrap" },
  placeName: { color: colors.charcoal, fontSize: 17, lineHeight: 22, fontWeight: "900" },
  address: { color: colors.text, fontSize: 12, lineHeight: 18, marginTop: 5 },
  radio: { width: 21, height: 21, borderRadius: 11, borderWidth: 2, borderColor: colors.border, alignItems: "center", justifyContent: "center" },
  activeRadio: { borderColor: colors.primary },
  dot: { width: 11, height: 11, borderRadius: 6, backgroundColor: colors.primary },
  metrics: { flexDirection: "row", marginTop: 16, backgroundColor: colors.background, borderRadius: 6, paddingVertical: 11 },
  metric: { flex: 1, alignItems: "center", gap: 4, borderLeftWidth: 1, borderLeftColor: colors.border },
  metricLabel: { color: colors.muted, fontSize: 10, fontWeight: "800" },
  metricValue: { color: colors.text, fontSize: 11, fontWeight: "900" },
  fair: { color: colors.green },
  travels: { gap: 9, marginTop: 14, paddingTop: 12, borderTopWidth: 1, borderTopColor: colors.border },
  travel: { flexDirection: "row", alignItems: "center", gap: 8 },
  travelName: { flex: 1, color: colors.text, fontSize: 12, fontWeight: "800" },
  travelValue: { color: colors.muted, fontSize: 12, fontWeight: "900" },
  explanation: { color: colors.subtle, fontSize: 10, lineHeight: 15, marginTop: 4 },
  voteCount: { color: colors.primary, fontSize: 11, fontWeight: "800", marginTop: 10, textAlign: "right" },
  message: { color: colors.muted, fontSize: 12, lineHeight: 18, textAlign: "center", marginTop: 18 },
  footer: { paddingHorizontal: 20, paddingTop: 12, paddingBottom: 8, backgroundColor: colors.background, borderTopWidth: 1, borderTopColor: colors.border },
});
