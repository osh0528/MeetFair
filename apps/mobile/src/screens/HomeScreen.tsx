import type { NativeStackScreenProps } from "@react-navigation/native-stack";
import { Pressable, ScrollView, StyleSheet, Text, View } from "react-native";
import { SafeAreaView } from "react-native-safe-area-context";
import type { RootStackParamList } from "../../App";
import { Avatar, Card, LogoMark, Pill, SectionHeading } from "../components/ui";
import { colors } from "../theme/colors";

type Props = NativeStackScreenProps<RootStackParamList, "Home">;

export function HomeScreen({ navigation }: Props) {
  return (
    <SafeAreaView style={styles.safeArea} edges={["top", "bottom"]}>
      <View style={styles.topBar}>
        <View style={styles.brandRow}>
          <LogoMark compact />
          <Text style={styles.brand}>MeetFair</Text>
        </View>
        <View style={styles.profileRow}>
          <Pressable accessibilityLabel="알림" style={styles.notification}>
            <Text style={styles.notificationIcon}>●</Text>
            <View style={styles.notificationBadge} />
          </Pressable>
          <Avatar name="수혁" size={40} backgroundColor="#DFF7EF" />
        </View>
      </View>

      <ScrollView contentContainerStyle={styles.content} showsVerticalScrollIndicator={false}>
        <View style={styles.greeting}>
          <Text style={styles.hello}>안녕하세요, 수혁님</Text>
          <Text style={styles.headline}>다음 약속도 공평하게 만나볼까요?</Text>
        </View>

        <Pressable
          accessibilityRole="button"
          accessibilityLabel="다가오는 약속 상세 보기"
          onPress={() => navigation.navigate("Meeting")}
        >
          {({ pressed }) => (
            <View style={[styles.upcomingCard, pressed && styles.cardPressed]}>
              <View style={styles.upcomingTop}>
                <Pill label="D-3" tone="green" />
                <Text style={styles.more}>•••</Text>
              </View>
              <Text style={styles.upcomingLabel}>다가오는 약속</Text>
              <Text style={styles.meetingTitle}>성수에서 여름 모임</Text>
              <View style={styles.metaRow}>
                <Text style={styles.metaIcon}>15</Text>
                <Text style={styles.metaText}>8월 22일 토요일 · 오후 2:00</Text>
              </View>
              <View style={styles.metaRow}>
                <Text style={styles.metaIcon}>M</Text>
                <Text style={styles.metaText}>성수역 2번 출구</Text>
              </View>
              <View style={styles.divider} />
              <View style={styles.membersRow}>
                <View style={styles.avatarStack}>
                  <View style={styles.avatarItem}><Avatar name="나" size={34} backgroundColor="#DCD7FF" /></View>
                  <View style={styles.avatarItem}><Avatar name="민지" size={34} backgroundColor="#FFE7CC" /></View>
                  <View style={styles.avatarItem}><Avatar name="도윤" size={34} backgroundColor="#D9F3EE" /></View>
                </View>
                <Text style={styles.memberCount}>4명 참여 · 장소 확정</Text>
                <Text style={styles.chevron}>›</Text>
              </View>
            </View>
          )}
        </Pressable>

        <View style={styles.section}>
          <SectionHeading title="빠른 시작" />
          <View style={styles.quickGrid}>
            <Pressable
              onPress={() => navigation.navigate("CreateMeeting")}
              style={({ pressed }) => [styles.quickCard, pressed && styles.cardPressed]}
            >
              <View style={[styles.quickIcon, styles.purpleIcon]}>
                <Text style={styles.quickIconText}>＋</Text>
              </View>
              <Text style={styles.quickTitle}>새 약속 만들기</Text>
              <Text style={styles.quickDescription}>친구를 초대하고{`\n`}공평한 장소 찾기</Text>
            </Pressable>
            <Pressable
              onPress={() => navigation.navigate("Recommendations")}
              style={({ pressed }) => [styles.quickCard, pressed && styles.cardPressed]}
            >
              <View style={[styles.quickIcon, styles.greenIcon]}>
                <Text style={[styles.quickIconText, styles.greenIconText]}>⌖</Text>
              </View>
              <Text style={styles.quickTitle}>장소 추천받기</Text>
              <Text style={styles.quickDescription}>출발지를 비교해{`\n`}중간 장소 찾기</Text>
            </Pressable>
          </View>
        </View>

        <View style={styles.section}>
          <SectionHeading title="이번 달 공평 지수" action="자세히" />
          <Card style={styles.fairnessCard}>
            <View style={styles.scoreCircle}>
              <Text style={styles.score}>92</Text>
              <Text style={styles.scoreUnit}>점</Text>
            </View>
            <View style={styles.scoreCopy}>
              <Text style={styles.scoreTitle}>아주 공평하게 만나고 있어요</Text>
              <Text style={styles.scoreDescription}>
                최근 3번의 약속에서 평균 이동시간 차이가 5분 이내였어요.
              </Text>
            </View>
          </Card>
        </View>

        <View style={styles.section}>
          <SectionHeading title="최근 약속" action="전체 보기" />
          <Card style={styles.recentCard}>
            <View style={styles.dateBlock}>
              <Text style={styles.dateMonth}>AUG</Text>
              <Text style={styles.dateDay}>09</Text>
            </View>
            <View style={styles.recentCopy}>
              <Text style={styles.recentTitle}>한강 피크닉</Text>
              <Text style={styles.recentMeta}>여의나루역 · 5명</Text>
            </View>
            <Pill label="완료" tone="gray" />
          </Card>
        </View>
      </ScrollView>

      <View style={styles.bottomNav}>
        <NavItem label="홈" symbol="⌂" active />
        <NavItem label="약속" symbol="□" onPress={() => navigation.navigate("Meeting")} />
        <NavItem label="친구" symbol="○" />
        <NavItem label="내 정보" symbol="◇" />
      </View>
    </SafeAreaView>
  );
}

function NavItem({ label, symbol, active = false, onPress }: {
  label: string;
  symbol: string;
  active?: boolean;
  onPress?: () => void;
}) {
  return (
    <Pressable accessibilityRole="button" onPress={onPress} style={styles.navItem}>
      <Text style={[styles.navSymbol, active && styles.navActive]}>{symbol}</Text>
      <Text style={[styles.navLabel, active && styles.navActive]}>{label}</Text>
    </Pressable>
  );
}

const styles = StyleSheet.create({
  safeArea: { flex: 1, backgroundColor: colors.background },
  topBar: { height: 68, paddingHorizontal: 20, flexDirection: "row", alignItems: "center", justifyContent: "space-between" },
  brandRow: { flexDirection: "row", alignItems: "center", gap: 10 },
  brand: { color: colors.text, fontSize: 20, fontWeight: "900" },
  profileRow: { flexDirection: "row", alignItems: "center", gap: 12 },
  notification: { width: 40, height: 40, borderRadius: 14, backgroundColor: colors.surface, borderWidth: 1, borderColor: colors.border, alignItems: "center", justifyContent: "center" },
  notificationIcon: { color: colors.muted, fontSize: 11 },
  notificationBadge: { position: "absolute", right: 9, top: 8, width: 7, height: 7, borderRadius: 4, backgroundColor: colors.red, borderWidth: 1, borderColor: colors.surface },
  content: { paddingHorizontal: 20, paddingBottom: 28 },
  greeting: { marginTop: 16, marginBottom: 22, gap: 5 },
  hello: { color: colors.muted, fontSize: 15, fontWeight: "700" },
  headline: { color: colors.text, fontSize: 25, lineHeight: 33, fontWeight: "900" },
  upcomingCard: { backgroundColor: colors.charcoal, borderRadius: 26, padding: 20, shadowColor: "#17181D", shadowOpacity: 0.16, shadowRadius: 16, shadowOffset: { width: 0, height: 9 }, elevation: 5 },
  cardPressed: { opacity: 0.86, transform: [{ scale: 0.99 }] },
  upcomingTop: { flexDirection: "row", justifyContent: "space-between", alignItems: "center" },
  more: { color: "#8F929A", fontSize: 16, letterSpacing: 2 },
  upcomingLabel: { color: "#AAAEB8", fontSize: 13, marginTop: 20, fontWeight: "700" },
  meetingTitle: { color: colors.surface, fontSize: 24, fontWeight: "900", marginTop: 5, marginBottom: 18 },
  metaRow: { flexDirection: "row", alignItems: "center", gap: 10, marginTop: 9 },
  metaIcon: { color: "#BDB7FA", width: 24, fontSize: 11, fontWeight: "900", textAlign: "center" },
  metaText: { color: "#D6D8DE", fontSize: 14, fontWeight: "600" },
  divider: { height: 1, backgroundColor: "#3B3D47", marginVertical: 18 },
  membersRow: { flexDirection: "row", alignItems: "center" },
  avatarStack: { flexDirection: "row", marginRight: 9 },
  avatarItem: { marginRight: -8, borderWidth: 2, borderColor: colors.charcoal, borderRadius: 20 },
  memberCount: { color: "#B8BBC4", fontSize: 12, flex: 1, marginLeft: 8 },
  chevron: { color: colors.surface, fontSize: 26 },
  section: { marginTop: 31, gap: 14 },
  quickGrid: { flexDirection: "row", gap: 12 },
  quickCard: { flex: 1, backgroundColor: colors.surface, borderRadius: 22, padding: 16, borderWidth: 1, borderColor: colors.border },
  quickIcon: { width: 40, height: 40, borderRadius: 14, alignItems: "center", justifyContent: "center" },
  purpleIcon: { backgroundColor: colors.primarySoft },
  greenIcon: { backgroundColor: colors.mint },
  quickIconText: { color: colors.primary, fontSize: 22, fontWeight: "700" },
  greenIconText: { color: colors.green },
  quickTitle: { color: colors.text, fontSize: 15, fontWeight: "900", marginTop: 14 },
  quickDescription: { color: colors.muted, fontSize: 12, lineHeight: 18, marginTop: 5 },
  fairnessCard: { flexDirection: "row", alignItems: "center", gap: 16 },
  scoreCircle: { width: 72, height: 72, borderRadius: 36, backgroundColor: colors.primarySoft, alignItems: "baseline", justifyContent: "center", flexDirection: "row", paddingTop: 21 },
  score: { color: colors.primary, fontSize: 25, fontWeight: "900" },
  scoreUnit: { color: colors.primary, fontSize: 11, fontWeight: "800", marginLeft: 2 },
  scoreCopy: { flex: 1, gap: 5 },
  scoreTitle: { color: colors.text, fontSize: 15, fontWeight: "900" },
  scoreDescription: { color: colors.muted, fontSize: 12, lineHeight: 18 },
  recentCard: { flexDirection: "row", alignItems: "center", padding: 14 },
  dateBlock: { width: 48, height: 52, borderRadius: 14, backgroundColor: colors.background, alignItems: "center", justifyContent: "center" },
  dateMonth: { color: colors.primary, fontSize: 9, fontWeight: "900" },
  dateDay: { color: colors.text, fontSize: 18, fontWeight: "900" },
  recentCopy: { flex: 1, marginLeft: 13 },
  recentTitle: { color: colors.text, fontSize: 15, fontWeight: "800" },
  recentMeta: { color: colors.muted, fontSize: 12, marginTop: 4 },
  bottomNav: { height: 68, backgroundColor: colors.surface, borderTopWidth: 1, borderTopColor: colors.border, flexDirection: "row", paddingHorizontal: 10 },
  navItem: { flex: 1, alignItems: "center", justifyContent: "center", gap: 3 },
  navSymbol: { color: colors.subtle, fontSize: 20, fontWeight: "700" },
  navLabel: { color: colors.subtle, fontSize: 10, fontWeight: "700" },
  navActive: { color: colors.primary },
});
