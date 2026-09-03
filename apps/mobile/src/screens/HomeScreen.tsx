import type { FriendActivitySummary, MeetingCallSummary, MeetingInvitationSummary, MeetingSummary, NotificationSummary } from "@meetfair/shared";
import { useFocusEffect } from "@react-navigation/native";
import type { NativeStackScreenProps } from "@react-navigation/native-stack";
import { useCallback, useEffect, useRef, useState } from "react";
import { ActivityIndicator, Animated, Pressable, ScrollView, StyleSheet, Text, useWindowDimensions, View } from "react-native";
import { SafeAreaView } from "react-native-safe-area-context";
import type { RootStackParamList } from "../../App";
import { Button, Card, LogoMark, Pill, SectionHeading } from "../components/ui";
import { apiRequest } from "../services/api";
import { createMeetingSocket } from "../services/socket";
import { useSession } from "../services/session";
import { colors } from "../theme/colors";

type Props = NativeStackScreenProps<RootStackParamList, "Home">;
const MEETING_HIGHLIGHT_WINDOW_MS = 60 * 60_000;

function meetingSortGroup(meeting: MeetingSummary, now: number) {
  const timeUntilMeeting = new Date(meeting.scheduledAt).getTime() - now;
  const isUpcomingStatus = meeting.status === "PLANNING" || meeting.status === "CONFIRMED";
  if (isUpcomingStatus && timeUntilMeeting > 0 && timeUntilMeeting <= MEETING_HIGHLIGHT_WINDOW_MS) return 0;
  if (isUpcomingStatus && timeUntilMeeting > 0) return 1;
  return 2;
}

function meetingStatusTone(status: MeetingSummary["status"]): "purple" | "green" | "amber" | "red" {
  if (status === "COMPLETED") return "green";
  if (status === "CANCELLED") return "red";
  if (status === "TRACKING") return "amber";
  return "purple";
}
function ScheduledMeetingCard({
  meeting,
  onPress,
  twoColumn = false,
}: {
  meeting: MeetingSummary;
  onPress: () => void;
  twoColumn?: boolean;
}) {
  const [now, setNow] = useState(Date.now());
  const [hovered, setHovered] = useState(false);
  const [focused, setFocused] = useState(false);
  const pulse = useRef(new Animated.Value(0)).current;
  const timeUntilMeeting = new Date(meeting.scheduledAt).getTime() - now;
  const isUpcomingStatus = meeting.status === "PLANNING" || meeting.status === "CONFIRMED";
  const isStartingSoon = isUpcomingStatus
    && timeUntilMeeting > 0
    && timeUntilMeeting <= MEETING_HIGHLIGHT_WINDOW_MS;
  const minutesUntilMeeting = Math.max(1, Math.ceil(timeUntilMeeting / 60_000));
  const progress = Math.min(100, Math.max(0, ((60 - minutesUntilMeeting) / 60) * 100));

  useEffect(() => {
    const timer = setInterval(() => setNow(Date.now()), 30_000);
    return () => clearInterval(timer);
  }, []);

  useEffect(() => {
    if (!isStartingSoon) {
      pulse.setValue(0);
      return;
    }
    const animation = Animated.loop(Animated.sequence([
      Animated.timing(pulse, { toValue: 1, duration: 900, useNativeDriver: true }),
      Animated.timing(pulse, { toValue: 0, duration: 900, useNativeDriver: true }),
    ]));
    animation.start();
    return () => animation.stop();
  }, [isStartingSoon, pulse]);

  const glowOpacity = pulse.interpolate({ inputRange: [0, 1], outputRange: [0.3, 0.85] });
  const glowScale = pulse.interpolate({ inputRange: [0, 1], outputRange: [1, 1.018] });

  return (
    <Pressable onBlur={() => setFocused(false)} onFocus={() => setFocused(true)} onHoverIn={() => setHovered(true)} onHoverOut={() => setHovered(false)} onPress={onPress} style={[styles.meetingPressable, twoColumn && styles.meetingPressableTwoColumn]}>
      {isStartingSoon ? (
        <Animated.View
          pointerEvents="none"
          style={[styles.soonGlow, { opacity: glowOpacity, transform: [{ scale: glowScale }] }]}
        />
      ) : null}
      <Card style={[styles.card, (hovered || focused) && styles.cardHover, focused && styles.cardFocus, isStartingSoon && styles.startingSoonCard]}>
        {isStartingSoon ? (
          <>
            <View style={styles.soonBanner}>
              <Text style={styles.soonSparkle}>✦</Text>
              <Text style={styles.soonBannerText}>곧 시작 · {minutesUntilMeeting}분 전</Text>
              <Text style={styles.soonSparkle}>✦</Text>
            </View>
            <View style={styles.soonProgressTrack}>
              <View style={[styles.soonProgressFill, { width: `${progress}%` as `${number}%` }]} />
            </View>
          </>
        ) : null}
        <View style={styles.row}>
          <Text numberOfLines={2} style={[styles.cardTitle, styles.meetingCardTitle, isStartingSoon && styles.startingSoonTitle]}>{meeting.title}</Text>
          <Pill label={isStartingSoon ? "SOON" : meeting.status} tone={isStartingSoon ? "amber" : meetingStatusTone(meeting.status)} />
        </View>
        <Text style={[styles.meta, isStartingSoon && styles.startingSoonMeta]}>
          {new Date(meeting.scheduledAt).toLocaleString("ko-KR")}
        </Text>
      </Card>
    </Pressable>
  );
}

export function HomeScreen({ navigation }: Props) {
  const { accessToken, user } = useSession();
  const { width } = useWindowDimensions();
  const isMobile = width < 768;
  const isDesktop = width >= 1024;
  const isCompactTablet = width >= 768 && width < 900;
  const useTwoColumnMeetingGrid = width >= 900;
  const [meetings, setMeetings] = useState<MeetingSummary[]>([]);
  const [invitations, setInvitations] = useState<MeetingInvitationSummary[]>([]);
  const [activities, setActivities] = useState<FriendActivitySummary[]>([]);
  const [calls, setCalls] = useState<MeetingCallSummary[]>([]);
  const [unreadNotificationCount, setUnreadNotificationCount] = useState(0);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState("");
  const openedCallIds = useRef(new Set<string>());

  const openCall = useCallback((call: MeetingCallSummary) => {
    if (openedCallIds.current.has(call.id)) return;
    openedCallIds.current.add(call.id);
    navigation.navigate("VideoCall", {
      callId: call.id,
      meetingId: call.meetingId,
    });
  }, [navigation]);

  const load = useCallback(async (silent = false) => {
    if (!silent) setLoading(true);
    setError("");
    try {
      const [meetingResult, invitationResult, activityResult, callResult, notificationResult] = await Promise.allSettled([
        apiRequest<MeetingSummary[]>("/meetings"),
        apiRequest<{ invitations: MeetingInvitationSummary[] }>("/meeting-invitations"),
        apiRequest<{ activities: FriendActivitySummary[] }>("/meetings/activity/friends"),
        apiRequest<{ calls: MeetingCallSummary[] }>("/meeting-calls/pending"),
        apiRequest<{ notifications: NotificationSummary[] }>("/notifications"),
      ] as const);
      if (meetingResult.status === "fulfilled") setMeetings(meetingResult.value);
      if (invitationResult.status === "fulfilled") {
        setInvitations(invitationResult.value.invitations.filter((item) => item.status === "PENDING"));
      }
      if (activityResult.status === "fulfilled") setActivities(activityResult.value.activities);
      if (callResult.status === "fulfilled") setCalls(callResult.value.calls);
      if (notificationResult.status === "fulfilled") {
        setUnreadNotificationCount(notificationResult.value.notifications.filter((item) => !item.readAt).length);
      }
      const failed = [meetingResult, invitationResult, activityResult, callResult, notificationResult]
        .find((result) => result.status === "rejected");
      if (failed?.status === "rejected") {
        setError(failed.reason instanceof Error ? failed.reason.message : "일부 홈 정보를 불러오지 못했습니다.");
      }
    } catch (caught) {
      setError(caught instanceof Error ? caught.message : "홈 정보를 불러오지 못했습니다.");
    } finally {
      if (!silent) setLoading(false);
    }
  }, []);

  useFocusEffect(useCallback(() => {
    void load();
  }, [load]));

  useEffect(() => {
    const incomingCall = calls.find((call) => call.participantStatus === "RINGING");
    if (incomingCall) openCall(incomingCall);
  }, [calls, openCall]);

  useEffect(() => {
    if (!accessToken) return;
    const socket = createMeetingSocket(accessToken);
    socket.on("meeting:call-incoming", ({ call }) => {
      setCalls((current) => [call, ...current.filter((item) => item.id !== call.id)]);
      openCall(call);
    });
    socket.on("meeting:invitation", ({ invitation }) => {
      setInvitations((current) => [
        invitation,
        ...current.filter((item) => item.id !== invitation.id),
      ]);
    });
    socket.on("meeting:invitation-responded", () => {
      void load(true);
    });
    socket.on("meeting:updated", () => {
      void load(true);
    });
    socket.on("notification:created", () => {
      void load(true);
    });
    socket.connect();
    const timer = setInterval(() => {
      void load(true);
    }, 15_000);
    return () => {
      clearInterval(timer);
      socket.disconnect();
    };
  }, [accessToken, load, openCall]);

  async function declineCall(callId: string) {
    await apiRequest(`/meeting-calls/${callId}`, {
      method: "PATCH",
      body: JSON.stringify({ action: "decline" }),
    });
    setCalls((current) => current.filter((call) => call.id !== callId));
  }

  const meetingSortTime = Date.now();
  const orderedMeetings = [...meetings].sort((left, right) => {
    const leftGroup = meetingSortGroup(left, meetingSortTime);
    const rightGroup = meetingSortGroup(right, meetingSortTime);
    if (leftGroup !== rightGroup) return leftGroup - rightGroup;
    const leftTime = new Date(left.scheduledAt).getTime();
    const rightTime = new Date(right.scheduledAt).getTime();
    return leftGroup === 2 ? rightTime - leftTime : leftTime - rightTime;
  });

  return (
    <SafeAreaView style={styles.safeArea}>
      <View style={styles.header}>
        <View style={[styles.headerInner, isMobile && styles.headerInnerMobile]}>
          <View style={styles.brand}><LogoMark compact /><Text style={styles.brandText}>MeetFair</Text></View>
        <View style={styles.headerActions}>
          <Button compact label="＋ 모임" onPress={() => navigation.navigate("CreateMeeting")} />
          <Pressable accessibilityLabel="알림" onPress={() => navigation.navigate("Notifications")} style={styles.notificationButton}>
            <Text style={styles.bell}>🔔</Text>
            {unreadNotificationCount > 0 ? (
              <View style={styles.notificationBadge}>
                <Text style={styles.notificationBadgeText}>{unreadNotificationCount > 99 ? "99+" : unreadNotificationCount}</Text>
              </View>
            ) : null}
          </Pressable>
        </View>
        </View>
      </View>
      <ScrollView contentContainerStyle={[styles.content, isMobile && styles.contentMobile, isCompactTablet && styles.contentCompactTablet]}>
        <Text style={styles.hello}>안녕하세요, {user?.nickname}님</Text>
        <Text style={styles.accountId}>친구 ID @{user?.accountId}</Text>
        {loading ? <ActivityIndicator color={colors.primary} /> : null}
        {error ? <><Text style={styles.error}>{error}</Text><Button label="다시 시도" onPress={load} variant="soft" /></> : null}

        <View style={[styles.meetingDashboard, (isMobile || isCompactTablet) && styles.meetingDashboardStacked]}>
          <View style={[styles.meetingColumn, (isMobile || isCompactTablet) && styles.meetingColumnStacked, isDesktop && styles.invitationColumn]}>
            <View style={styles.columnSection}>
              <SectionHeading title="받은 초대" action={`${invitations.length}개`} />
              {invitations.map((item) => (
                <Card key={item.id} style={styles.columnCard}>
                  <Text style={styles.cardTitle}>{item.meetingTitle}</Text>
                  <Text style={styles.meta}>{item.inviter.nickname}님의 초대 · {new Date(item.scheduledAt).toLocaleString("ko-KR")}</Text>
                  <Button compact label="초대 확인" onPress={() => navigation.navigate("MeetingInvitation", { invitation: item })} variant="soft" />
                </Card>
              ))}
              {!invitations.length ? <Text style={styles.empty}>대기 중인 초대가 없습니다.</Text> : null}
            </View>
          </View>

          <View style={[styles.meetingColumn, (isMobile || isCompactTablet) && styles.meetingColumnStacked, isDesktop && styles.upcomingColumn]}>
            <View style={styles.columnSection}>
              <SectionHeading title="예정된 모임" action={`${meetings.length}개`} />
              <View style={styles.meetingGrid}>
              {orderedMeetings.map((meeting) => (
                <ScheduledMeetingCard
                  key={meeting.id}
                  meeting={meeting}
                  twoColumn={useTwoColumnMeetingGrid}
                  onPress={() => navigation.navigate("Meeting", { meetingId: meeting.id })}
                />
              ))}
              </View>
              {!meetings.length ? <Text style={styles.empty}>예정된 모임이 없습니다.</Text> : null}
            </View>
          </View>
        </View>

        {calls.length ? <SectionHeading title="영상통화 요청" action={`${calls.length}개`} /> : null}
        {calls.map((call) => (
          <Card key={call.id} style={styles.callCard}>
            <View style={styles.row}>
              <View style={styles.callCopy}>
                <Text style={styles.cardTitle}>{call.meetingTitle}</Text>
                <Text style={styles.meta}>{call.participantStatus === "JOINED" ? "진행 중인 통화" : "모임원이 영상통화를 요청했습니다."}</Text>
              </View>
              <Pill label={call.participantStatus === "JOINED" ? "진행 중" : "수신 중"} tone="red" />
            </View>
            <View style={styles.cardActions}>
              <Button
                compact
                label={call.participantStatus === "JOINED" ? "다시 참여" : "통화 참여"}
                onPress={() => navigation.navigate("VideoCall", { callId: call.id, meetingId: call.meetingId })}
              />
              {call.participantStatus === "RINGING" ? <Button compact label="거절" onPress={() => void declineCall(call.id)} variant="secondary" /> : null}
            </View>
          </Card>
        ))}

        <SectionHeading title="친구들의 공개 모임" />
        {activities.map((activity) => (
          <Card key={activity.meetingId} style={styles.card}>
            <Text style={styles.cardTitle}>{activity.friend.nickname}님이 약속을 잡았어요</Text>
            <Text style={styles.meta}>상세 정보는 참가 승인 후 확인할 수 있습니다.</Text>
            <Button
              compact
              disabled={activity.joinRequestStatus === "PENDING"}
              label={activity.joinRequestStatus === "PENDING" ? "승인 대기 중" : "참가 신청"}
              onPress={() => navigation.navigate("PublicMeetingRequest", { meetingId: activity.meetingId })}
              variant="soft"
            />
          </Card>
        ))}
      </ScrollView>
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  safeArea: { flex: 1, backgroundColor: colors.background },
  header: { minHeight: 64, backgroundColor: colors.header, borderBottomWidth: 1, borderBottomColor: colors.border },
  headerInner: { width: "100%", maxWidth: 1320, minHeight: 64, paddingHorizontal: 40, alignSelf: "center", flexDirection: "row", alignItems: "center", justifyContent: "space-between", gap: 12 },
  headerInnerMobile: { minHeight: 60, paddingHorizontal: 16 },
  brand: { flexDirection: "row", gap: 9, alignItems: "center" },
  headerActions: { flexDirection: "row", alignItems: "center", gap: 6 },
  brandText: { color: colors.text, fontSize: 19, fontWeight: "900" },
  notificationButton: { width: 44, height: 44, alignItems: "center", justifyContent: "center", position: "relative" },
  bell: { fontSize: 25 },
  notificationBadge: { position: "absolute", top: -2, right: -2, minWidth: 18, height: 18, paddingHorizontal: 4, borderRadius: 999, backgroundColor: colors.red, alignItems: "center", justifyContent: "center", borderWidth: 2, borderColor: colors.background },
  notificationBadgeText: { color: colors.surface, fontSize: 9, fontWeight: "900", lineHeight: 12 },
  content: { width: "100%", maxWidth: 1320, alignSelf: "center", paddingHorizontal: 40, paddingTop: 28, gap: 16, paddingBottom: 40 },
  contentMobile: { paddingHorizontal: 16, paddingTop: 18, gap: 14, paddingBottom: 104 },
  contentCompactTablet: { paddingHorizontal: 24, paddingTop: 24, paddingBottom: 104 },
  hello: { color: colors.text, fontSize: 26, fontWeight: "900" },
  accountId: { color: colors.muted, fontWeight: "700", marginTop: -8 },
  card: { gap: 9 },
  cardHover: { backgroundColor: colors.surfaceHover, borderColor: colors.borderStrong, shadowOpacity: 0.08, transform: [{ translateY: -1 }] },
  cardFocus: { borderColor: colors.primary, shadowColor: colors.primary, shadowOpacity: 0.2, shadowRadius: 6 },
  meetingDashboard: { flexDirection: "row", alignItems: "flex-start", gap: 32 },
  meetingDashboardStacked: { flexDirection: "column", gap: 28 },
  meetingColumn: { flex: 1, minWidth: 0, gap: 12 },
  meetingColumnStacked: { flexGrow: 0, flexShrink: 0, flexBasis: "auto", width: "100%" },
  invitationColumn: { flex: 0.8 },
  upcomingColumn: { flex: 2 },
  columnSection: { gap: 10 },
  columnCard: { gap: 9, padding: 14, borderRadius: 6 },
  meetingGrid: { flexDirection: "row", flexWrap: "wrap", gap: 14 },
  meetingPressable: { position: "relative", width: "100%", minWidth: 0 },
  meetingPressableTwoColumn: { width: "auto", flexGrow: 1, flexBasis: 280, maxWidth: "100%" },
  soonGlow: {
    position: "absolute",
    top: -4,
    right: -4,
    bottom: -4,
    left: -4,
    borderRadius: 10,
    backgroundColor: colors.warning,
  },
  startingSoonCard: {
    overflow: "hidden",
    borderWidth: 2,
    borderColor: colors.warningBorder,
    backgroundColor: colors.surface,
    shadowColor: colors.warning,
    shadowOffset: { width: 0, height: 8 },
    shadowOpacity: 0.3,
    shadowRadius: 18,
    elevation: 8,
  },
  soonBanner: {
    marginHorizontal: -18,
    marginTop: -18,
    marginBottom: 12,
    minHeight: 40,
    paddingHorizontal: 16,
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "center",
    gap: 8,
    backgroundColor: colors.warning,
  },
  soonBannerText: { color: colors.primaryContrast, fontSize: 14, fontWeight: "900", letterSpacing: 0.3 },
  soonSparkle: { color: colors.warningSoft, fontSize: 17, fontWeight: "900" },
  soonProgressTrack: { height: 5, borderRadius: 999, overflow: "hidden", backgroundColor: colors.warningSoft },
  soonProgressFill: { height: "100%", borderRadius: 999, backgroundColor: colors.warning },
  startingSoonTitle: { color: colors.text, fontSize: 17 },
  startingSoonMeta: { color: colors.red, fontWeight: "800" },
  callCard: { gap: 9, borderColor: colors.red },
  cardActions: { flexDirection: "row", flexWrap: "wrap", justifyContent: "flex-end", gap: 8 },
  callCopy: { flex: 1, gap: 4 },
  row: { flexDirection: "row", justifyContent: "space-between", alignItems: "flex-start", gap: 10, minWidth: 0 },
  cardTitle: { color: colors.text, fontSize: 15, fontWeight: "900" },
  meetingCardTitle: { flex: 1, minWidth: 0, lineHeight: 21 },
  meta: { color: colors.muted, fontSize: 11, lineHeight: 17 },
  empty: { color: colors.muted, fontSize: 12, lineHeight: 18, backgroundColor: colors.surfaceSubtle, borderRadius: 12, borderWidth: 1, borderColor: colors.border, padding: 16, textAlign: "center" },
  error: { color: colors.red, fontSize: 12 },
});
