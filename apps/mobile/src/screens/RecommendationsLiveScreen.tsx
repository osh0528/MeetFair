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
  TRANSIT: "?以묎탳???쒓컙",
  CAR: "?먮룞李??쒓컙",
  DISTANCE: "?대룞 嫄곕━",
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
  return metric === "DISTANCE" ? formatDistance(value) : `${Math.round(value)}遺?;
}

function fairnessScore(item: Recommendation, metric: TravelMetric) {
  const stats = values(item, metric);
  if (typeof item.fairnessScore === "number") return item.fairnessScore;
  return stats.maximum <= 0
    ? 100
    : Math.max(0, Math.min(100, Math.round(100 * (1 - stats.gap / stats.maximum))));
}

function recommendationError(error: unknown, meeting?: MeetingSummary | null) {
  if (!(error instanceof ApiError)) return error instanceof Error ? error.message : "異붿쿇 ?μ냼瑜?遺덈윭?ㅼ? 紐삵뻽?듬땲??";
  if (error.code === "MEETING_ORIGINS_INCOMPLETE") {
    const ids = Array.isArray(error.details?.missingParticipantIds)
      ? error.details.missingParticipantIds.filter((id): id is string => typeof id === "string")
      : [];
    const names = ids.map((id) => meeting?.participants.find((participant) => participant.userId === id)?.user.nickname ?? id);
    return names.length
      ? `${names.join(", ")} ?섏씠 異쒕컻 ?꾩튂瑜??ㅼ젙?댁빞 ?⑸땲??`
      : "紐⑤뱺 李멸??먭? 異쒕컻 ?꾩튂瑜??ㅼ젙?????ㅼ떆 怨꾩궛??二쇱꽭??";
  }
  if (error.code === "VOTES_EXIST") return "?ы몴媛 ?쒖옉???ㅼ뿉??異붿쿇 ?꾨낫瑜??ㅼ떆 怨꾩궛?????놁뒿?덈떎.";
  const messages: Record<string, string> = {
    MEETING_ORIGINS_INCOMPLETE: "紐⑤뱺 李멸??먭? 異쒕컻 ?꾩튂瑜??ㅼ젙????異붿쿇??諛쏆쓣 ???덉뒿?덈떎.",
    TRANSIT_NOT_CONFIGURED: "?以묎탳??異붿쿇 以鍮꾧? ?꾨즺?섏? ?딆븯?듬땲??",
    TRANSIT_TIMEOUT: "?以묎탳??寃쎈줈 怨꾩궛??吏?곕릺怨??덉뒿?덈떎. ?ㅼ떆 ?쒕룄??二쇱꽭??",
    TRANSIT_NO_ROUTE: "紐⑤뱺 李멸??먭? ?대룞?????덈뒗 ?以묎탳??寃쎈줈瑜?李얠? 紐삵뻽?듬땲??",
    RECOMMENDATION_PLACES_NOT_FOUND: "以묒떖 ?꾩튂 二쇰??먯꽌 議곌굔??留욌뒗 ?μ냼瑜?李얠? 紐삵뻽?듬땲??",
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
      setMessage(`${selected.name}???ы몴?덉뒿?덈떎.`);
      setMeeting(await apiRequest<MeetingSummary>(`/meetings/${meetingId}`));
    } catch (error) {
      setMessage(recommendationError(error, meeting));
    } finally {
      setVoting(false);
    }
  }

  return (
    <SafeAreaView style={styles.safeArea} edges={["top", "bottom"]}>
      <ScreenHeader title="怨듯룊???μ냼 異붿쿇" subtitle={meeting?.title} onBack={() => navigation.goBack()} />
      <ScrollView
        contentContainerStyle={styles.content}
        refreshControl={<RefreshControl refreshing={refreshing} onRefresh={() => void load(true)} />}
      >
        {loading ? <State title="?대룞 寃쎈줈瑜?怨꾩궛?섍퀬 ?덉뼱?? body="李멸????섏? 寃쎈줈 ?곹솴???곕씪 ?좎떆 嫄몃┫ ???덉뒿?덈떎." /> : null}
        {!loading && !items.length ? (
          <State
            title="異붿쿇 寃곌낵瑜?以鍮꾪븯吏 紐삵뻽?댁슂"
            body={message || "李멸???異쒕컻 ?꾩튂? ?먰븯???μ냼 醫낅쪟瑜??뺤씤??二쇱꽭??"}
            retry={canRegenerate ? () => void regenerate() : () => void load()}
            retryLabel={canRegenerate ? (regenerating ? "怨꾩궛 以?.." : "異붿쿇 ?μ냼 怨꾩궛?섍린") : "?덈줈怨좎묠"}
          />
        ) : null}

        {items.length ? (
          <>
            <View style={styles.intro}>
              <View style={styles.introCopy}>
                <Text style={styles.eyebrow}>MeetFair 遺꾩꽍 ?꾨즺</Text>
                <Text style={styles.title}>?대룞 寃⑹감媛 ?묒?{`\n`}?μ냼瑜?李얠븯?댁슂</Text>
                <Text style={styles.caption}>{metricLabels[metric]} 湲곗? 쨌 ??? 寃⑹감遺??異붿쿇</Text>
              </View>
              {selected ? (
                <View style={styles.score}>
                  <Text style={styles.scoreValue}>{fairnessScore(selected, metric)}</Text>
                  <Text style={styles.scoreLabel}>洹좏삎 ?먯닔</Text>
                </View>
              ) : null}
            </View>
            {canRegenerate ? (
              <View style={styles.regenerateRow}>
                <Button compact variant="soft" label={regenerating ? "怨꾩궛 以?.." : "異붿쿇 ?ㅼ떆 怨꾩궛"} disabled={regenerating} onPress={() => void regenerate()} />
              </View>
            ) : null}
            {voteStarted ? <Text style={styles.lockNotice}>?ы몴媛 ?쒖옉?섏뼱 異붿쿇 ?꾨낫媛 怨좎젙?먯뒿?덈떎.</Text> : null}
            <Text style={styles.sectionTitle}>異붿쿇 ?μ냼 {items.length}怨?/Text>
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
                            {item.id === myVoteId ? <Pill label="???좏깮" tone="green" /> : null}
                          </View>
                          <Text style={styles.address}>{item.category} 쨌 {item.address}</Text>
                        </View>
                        <View style={[styles.radio, active && styles.activeRadio]}>{active ? <View style={styles.dot} /> : null}</View>
                      </View>
                      <View style={styles.metrics}>
                        <Metric label="?됯퇏" value={formatValue(stats.average, metric)} />
                        <Metric label="媛???ㅻ옒" value={formatValue(stats.maximum, metric)} />
                        <Metric label="理쒕? 寃⑹감" value={formatValue(stats.gap, metric)} fair />
                        <Metric label="怨듯룊?? value={`${fairnessScore(item, metric)}??} fair />
                      </View>
                      {active ? (
                        <View style={styles.travels}>
                          {item.participantTravelTimes.map((travel) => (
                            <View key={travel.userId} style={styles.travel}>
                              <Avatar name={travel.nickname} size={30} />
                              <Text style={styles.travelName}>{travel.nickname}</Text>
                              <Text style={styles.travelValue}>
                                {metric === "DISTANCE" ? formatDistance(travel.distanceMeters) : `${travel.durationMinutes}遺?}
                              </Text>
                            </View>
                          ))}
                          <Text style={styles.explanation}>洹좏삎 ?먯닔??媛??湲??대룞媛??鍮?李멸???媛?寃⑹감媛 ?묒쓣?섎줉 ?믪븘吏묐땲??</Text>
                        </View>
                      ) : null}
                      {item.id && voteCounts.has(item.id) ? <Text style={styles.voteCount}>?꾩옱 {voteCounts.get(item.id)}??/Text> : null}
                    </Card>
                  </Pressable>
                );
              })}
            </View>
            {selected ? (
              <View style={styles.mapSection}>
                <Text style={styles.mapTitle}>?좏깮???μ냼 二쇰? 吏??/Text>
                <Text style={styles.mapSubtitle}>{selected.name} 遺洹쇨낵 異붿쿇 ?μ냼 2怨녹쓣 ?뺤씤??蹂댁꽭??</Text>
                <Card style={styles.mapCard}>
                  <KakaoAddressMap
                    query=""
                    requestId={0}
                    focusTarget={{ address: selected.address, latitude: selected.latitude, longitude: selected.longitude }}
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
            label={voting ? "?ы몴 以?.." : `${selected.name}???ы몴?섍린`}
            disabled={!selected.id || voting || selected.id === myVoteId || meeting?.status !== "PLANNING" || Boolean(meeting?.confirmedPlace)}
            onPress={() => void vote()}
          />
        </View>
      ) : null}
    </SafeAreaView>
  );
}

function State({ title, body, retry, retryLabel = "?ㅼ떆 ?쒕룄" }: { title: string; body: string; retry?: () => void; retryLabel?: string }) {
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
