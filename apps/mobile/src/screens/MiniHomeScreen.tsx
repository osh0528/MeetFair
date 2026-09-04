import type { NativeStackScreenProps } from "@react-navigation/native-stack";
import { useCallback, useEffect, useState , useMemo} from "react";
import { ActivityIndicator, FlatList, StyleSheet, Text, View } from "react-native";
import { SafeAreaView } from "react-native-safe-area-context";
import type { RootStackParamList } from "../../App";
import { Avatar, Button, Card, ScreenHeader, SectionHeading } from "../components/ui";
import { apiRequest } from "../services/api";
import { avatarUrl } from "../services/avatar";
import { useAppColors } from "../services/theme";

import type { UserSummary } from "@meetfair/shared";

type Props = NativeStackScreenProps<RootStackParamList, "MiniHome">;

type MiniHomeResponse = {
  owner: UserSummary;
  profileStatus: string | null;
  profileBio: string | null;
  profileEmoji: string | null;
  profileTheme: string | null;
  profileMusicTitle: string | null;
  profileUpdatedAt: string | null;
  visitorCount: number;
  hasVisitorToday: boolean;
  isOwner: boolean;
};

type VisitResponse = {
  alreadyVisited: boolean;
  visitedAt: string;
};

type VisitEntry = {
  id: string;
  visitor: UserSummary;
  visitedAt: string;
};

type VisitsResponse = {
  visits: VisitEntry[];
  nextCursor: string | null;
};

export function MiniHomeScreen({ navigation, route }: Props) {
  const palette = useAppColors();
  const styles = useStyles();
  const { userId, nickname } = route.params;
  const [home, setHome] = useState<MiniHomeResponse | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState("");
  const [visitBusy, setVisitBusy] = useState(false);
  const [visitMessage, setVisitMessage] = useState("");
  const [visits, setVisits] = useState<VisitEntry[]>([]);
  const [nextCursor, setNextCursor] = useState<string | null>(null);
  const [visitsLoading, setVisitsLoading] = useState(false);

  const loadHome = useCallback(async () => {
    setLoading(true);
    setError("");
    try {
      const data = await apiRequest<MiniHomeResponse>(`/users/${userId}/mini-home`);
      setHome(data);
    } catch (caught) {
      setError(caught instanceof Error ? caught.message : "미니홈을 불러오지 못했습니다.");
    } finally {
      setLoading(false);
    }
  }, [userId]);

  const loadVisits = useCallback(async (cursor: string | null) => {
    setVisitsLoading(true);
    try {
      const params = new URLSearchParams();
      params.set("limit", "20");
      if (cursor) params.set("cursor", cursor);
      const data = await apiRequest<VisitsResponse>(`/users/${userId}/mini-home/visits?${params.toString()}`);
      if (cursor) {
        setVisits((prev) => [...prev, ...data.visits]);
      } else {
        setVisits(data.visits);
      }
      setNextCursor(data.nextCursor);
    } catch (caught) {
      setError(caught instanceof Error ? caught.message : "방문자 목록을 불러오지 못했습니다.");
    } finally {
      setVisitsLoading(false);
    }
  }, [userId]);

  useEffect(() => {
    void loadHome();
    void loadVisits(null);
  }, [loadHome, loadVisits]);

  async function handleVisit() {
    if (visitBusy || !home || home.isOwner || home.hasVisitorToday) return;
    setVisitBusy(true);
    setVisitMessage("");
    setError("");
    try {
      const data = await apiRequest<VisitResponse>(`/users/${userId}/mini-home/visit`, {
        method: "POST",
      });
      setHome((prev) => prev ? { ...prev, hasVisitorToday: true, visitorCount: prev.visitorCount + (data.alreadyVisited ? 0 : 1) } : prev);
      setVisitMessage(data.alreadyVisited ? "오늘 이미 방문했습니다." : "방문했습니다.");
      void loadVisits(null);
    } catch (caught) {
      setError(caught instanceof Error ? caught.message : "방문에 실패했습니다.");
    } finally {
      setVisitBusy(false);
    }
  }

  const title = nickname ?? home?.owner.nickname ?? "미니홈";
  const visitDisabled = !home || home.isOwner || home.hasVisitorToday || visitBusy;

  let visitLabel = "방문하기";
  if (!home) visitLabel = "방문하기";
  else if (home.isOwner) visitLabel = "내 미니홈입니다";
  else if (home.hasVisitorToday) visitLabel = "오늘 이미 방문함";
  else if (visitBusy) visitLabel = "방문 중...";

  return (
    <SafeAreaView style={styles.safeArea}>
      <ScreenHeader title={title} onBack={() => navigation.goBack()} />
      {loading && !home ? (
        <View style={styles.center}>
          <ActivityIndicator color={palette.primary} />
        </View>
      ) : error && !home ? (
        <View style={styles.center}>
          <Text style={styles.error}>{error}</Text>
          <Button label="다시 시도" onPress={() => { void loadHome(); void loadVisits(null); }} variant="secondary" />
        </View>
      ) : home ? (
        <FlatList
          data={visits}
          keyExtractor={(item) => item.id}
          contentContainerStyle={styles.content}
          ListHeaderComponent={
            <View style={styles.headerContent}>
              {error ? <Text style={styles.error}>{error}</Text> : null}
              {visitMessage ? <Text style={styles.success}>{visitMessage}</Text> : null}
              <Card style={styles.profileCard}>
                <View style={styles.profileHeader}>
                  <Avatar imageUrl={avatarUrl(home.owner.id, home.owner.avatarUpdatedAt)} name={home.owner.nickname} size={72} />
                  <View style={styles.profileCopy}>
                    <Text style={styles.nickname}>{home.owner.nickname}</Text>
                    <Text style={styles.accountId}>@{home.owner.accountId}</Text>
                    {home.profileEmoji ? <Text style={styles.emoji}>{home.profileEmoji}</Text> : null}
                  </View>
                </View>
                {home.profileTheme ? (
                  <View style={styles.themeRow}>
                    <View style={styles.themeDot} />
                    <Text style={styles.themeText}>테마 {home.profileTheme}</Text>
                  </View>
                ) : null}
                <View style={styles.divider} />
                <View style={styles.infoRow}>
                  <Text style={styles.infoLabel}>상태</Text>
                  <Text style={styles.infoValue}>{home.profileStatus || "상태 메시지가 없습니다."}</Text>
                </View>
                <View style={styles.infoRow}>
                  <Text style={styles.infoLabel}>소개</Text>
                  <Text style={styles.infoValue}>{home.profileBio || "소개글이 없습니다."}</Text>
                </View>
                <View style={styles.infoRow}>
                  <Text style={styles.infoLabel}>BGM</Text>
                  <Text style={styles.infoValue}>{home.profileMusicTitle || "등록된 음악이 없습니다."}</Text>
                </View>
                {home.profileUpdatedAt ? <Text style={styles.updatedAt}>업데이트 {new Date(home.profileUpdatedAt).toLocaleString("ko-KR")}</Text> : null}
              </Card>

              <Button
                disabled={visitDisabled}
                label={visitLabel}
                onPress={() => void handleVisit()}
                variant={home.isOwner || home.hasVisitorToday ? "secondary" : "primary"}
              />

              <Card style={styles.countCard}>
                <SectionHeading title="방문자" action={`총 ${home.visitorCount}명`} />
                <Text style={styles.countNote}>하루에 한 번 방문이 기록됩니다.</Text>
              </Card>

              <View style={styles.visitorHeader}>
                <SectionHeading title="최근 방문자" action={`${visits.length}명`} />
              </View>
            </View>
          }
          ListEmptyComponent={
            visitsLoading ? (
              <View style={styles.centerInline}>
                <ActivityIndicator color={palette.primary} />
              </View>
            ) : (
              <Text style={styles.empty}>아직 방문자가 없습니다.</Text>
            )
          }
          renderItem={({ item }) => (
            <Card style={styles.visitCard}>
              <View style={styles.visitRow}>
                <Avatar imageUrl={avatarUrl(item.visitor.id, item.visitor.avatarUpdatedAt)} name={item.visitor.nickname} size={44} />
                <View style={styles.visitCopy}>
                  <Text style={styles.visitName}>{item.visitor.nickname}</Text>
                  <Text style={styles.visitAccount}>@{item.visitor.accountId}</Text>
                </View>
                <Text style={styles.visitTime}>{new Date(item.visitedAt).toLocaleString("ko-KR")}</Text>
              </View>
            </Card>
          )}
          onEndReached={() => {
            if (nextCursor && !visitsLoading) void loadVisits(nextCursor);
          }}
          onEndReachedThreshold={0.5}
          ListFooterComponent={
            nextCursor ? (
              <View style={styles.footerAction}>
                <Button disabled={visitsLoading} label={visitsLoading ? "불러오는 중..." : "더 보기"} onPress={() => void loadVisits(nextCursor)} variant="secondary" />
              </View>
            ) : null
          }
        />
      ) : null}
    </SafeAreaView>
  );
}

function useStyles() {
  const palette = useAppColors();
  return useMemo(
    () =>
      StyleSheet.create({
  safeArea: { flex: 1, backgroundColor: palette.background },
  center: { flex: 1, alignItems: "center", justifyContent: "center", padding: 24, gap: 12 },
  centerInline: { alignItems: "center", justifyContent: "center", padding: 24 },
  content: { padding: 20, gap: 12, paddingBottom: 32 },
  headerContent: { gap: 12 },
  profileCard: { gap: 12 },
  profileHeader: { flexDirection: "row", alignItems: "center", gap: 14 },
  profileCopy: { flex: 1, gap: 2 },
  nickname: { color: palette.text, fontSize: 20, fontWeight: "900" },
  accountId: { color: palette.muted, fontSize: 13, fontWeight: "700" },
  emoji: { fontSize: 28, marginTop: 4 },
  themeRow: { flexDirection: "row", alignItems: "center", gap: 6 },
  themeDot: { width: 10, height: 10, borderRadius: 5, backgroundColor: palette.primary },
  themeText: { color: palette.muted, fontSize: 12, fontWeight: "700" },
  divider: { height: 1, backgroundColor: palette.border },
  infoRow: { gap: 4 },
  infoLabel: { color: palette.muted, fontSize: 11, fontWeight: "800" },
  infoValue: { color: palette.text, fontSize: 14, lineHeight: 20, fontWeight: "700" },
  updatedAt: { color: palette.subtle, fontSize: 11, textAlign: "right" },
  countCard: { gap: 6 },
  countNote: { color: palette.subtle, fontSize: 11 },
  visitorHeader: { marginTop: 4 },
  visitCard: { padding: 14 },
  visitRow: { flexDirection: "row", alignItems: "center", gap: 12 },
  visitCopy: { flex: 1, gap: 2 },
  visitName: { color: palette.text, fontSize: 14, fontWeight: "900" },
  visitAccount: { color: palette.subtle, fontSize: 11, fontWeight: "700" },
  visitTime: { color: palette.muted, fontSize: 11 },
  empty: { color: palette.muted, fontSize: 12, textAlign: "center", padding: 16 },
  error: { color: palette.red, fontSize: 13, textAlign: "center" },
  success: { color: palette.green, fontSize: 13, fontWeight: "700", textAlign: "center" },
  footerAction: { marginTop: 8 },

      }),
    [palette],
  );
}
