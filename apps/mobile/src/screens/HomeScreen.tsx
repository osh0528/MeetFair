import type { FriendActivitySummary, MeetingCallSummary, MeetingInvitationSummary, MeetingSummary, NotificationSummary } from "@meetfair/shared";
import { useFocusEffect } from "@react-navigation/native";
import type { NativeStackScreenProps } from "@react-navigation/native-stack";
import { useCallback, useEffect, useRef, useState } from "react";
import { ActivityIndicator, Animated, Pressable, ScrollView, StyleSheet, Text, View } from "react-native";
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

function ScheduledMeetingCard({
  meeting,
  onPress,
}: {
  meeting: MeetingSummary;
  onPress: () => void;
}) {
  const [now, setNow] = useState(Date.now());
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
    <Pressable onPress={onPress} style={styles.meetingPressable}>
      {isStartingSoon ? (
        <Animated.View
          pointerEvents="none"
          style={[styles.soonGlow, { opacity: glowOpacity, transform: [{ scale: glowScale }] }]}
        />
      ) : null}
      <Card style={[styles.card, isStartingSoon && styles.startingSoonCard]}>
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
          <Text style={[styles.cardTitle, isStartingSoon && styles.startingSoonTitle]}>{meeting.title}</Text>
          <Pill label={isStartingSoon ? "SOON" : meeting.status} tone={isStartingSoon ? "red" : "green"} />
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
      const [meetingData, invitationData, activityData, callData, notificationData] = await Promise.all([
        apiRequest<MeetingSummary[]>("/meetings"),
        apiRequest<{ invitations: MeetingInvitationSummary[] }>("/meeting-invitations"),
        apiRequest<{ activities: FriendActivitySummary[] }>("/meetings/activity/friends"),
        apiRequest<{ calls: MeetingCallSummary[] }>("/meeting-calls/pending"),
        apiRequest<{ notifications: NotificationSummary[] }>("/notifications"),
      ]);
      setMeetings(meetingData);
      setInvitations(invitationData.invitations.filter((item) => item.status === "PENDING"));
      setActivities(activityData.activities);
      setCalls(callData.calls);
      setUnreadNotificationCount(notificationData.notifications.filter((item) => !item.readAt).length);
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
      <ScrollView contentContainerStyle={styles.content}>
        <Text style={styles.hello}>안녕하세요, {user?.nickname}님</Text>
        <Text style={styles.accountId}>친구 ID @{user?.accountId}</Text>
        {loading ? <ActivityIndicator color={colors.primary} /> : null}
        {error ? <><Text style={styles.error}>{error}</Text><Button label="다시 시도" onPress={load} variant="soft" /></> : null}

        <View style={styles.meetingDashboard}>
          <View style={styles.meetingColumn}>
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

          <View style={styles.meetingColumn}>
            <View style={styles.columnSection}>
              <SectionHeading title="예정된 모임" action={`${meetings.length}개`} />
              {orderedMeetings.map((meeting) => (
                <ScheduledMeetingCard
                  key={meeting.id}
                  meeting={meeting}
                  onPress={() => navigation.navigate("Meeting", { meetingId: meeting.id })}
                />
              ))}
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
  header: { height: 64, paddingHorizontal: 20, flexDirection: "row", alignItems: "center", justifyContent: "space-between" },
  brand: { flexDirection: "row", gap: 9, alignItems: "center" },
  headerActions: { flexDirection: "row", alignItems: "center", gap: 6 },
  brandText: { color: colors.text, fontSize: 19, fontWeight: "900" },
  notificationButton: { width: 42, height: 42, alignItems: "center", justifyContent: "center", position: "relative" },
  bell: { fontSize: 25 },
  notificationBadge: { position: "absolute", top: -2, right: -2, minWidth: 18, height: 18, paddingHorizontal: 4, borderRadius: 999, backgroundColor: colors.red, alignItems: "center", justifyContent: "center", borderWidth: 2, borderColor: colors.background },
  notificationBadgeText: { color: colors.surface, fontSize: 9, fontWeight: "900", lineHeight: 12 },
  content: { padding: 20, gap: 14, paddingBottom: 28 },
  hello: { color: colors.text, fontSize: 26, fontWeight: "900" },
  accountId: { color: colors.primary, fontWeight: "800", marginTop: -8 },
  card: { gap: 9 },
  meetingDashboard: { flexDirection: "row", alignItems: "flex-start", gap: 14 },
  meetingColumn: { flex: 1, minWidth: 0, gap: 12 },
  columnSection: { gap: 10 },
  columnCard: { gap: 9, padding: 14, borderRadius: 6 },
  meetingPressable: { position: "relative" },
  soonGlow: {
    position: "absolute",
    top: -4,
    right: -4,
    bottom: -4,
    left: -4,
    borderRadius: 10,
    backgroundColor: "#FF3B6B",
  },
  startingSoonCard: {
    overflow: "hidden",
    borderWidth: 2,
    borderColor: "#FF3B6B",
    backgroundColor: colors.surface,
    shadowColor: "#FF3B6B",
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
    backgroundColor: "#FF3B6B",
  },
  soonBannerText: { color: "#FFFFFF", fontSize: 14, fontWeight: "900", letterSpacing: 0.3 },
  soonSparkle: { color: "#FFE36E", fontSize: 17, fontWeight: "900" },
  soonProgressTrack: { height: 5, borderRadius: 999, overflow: "hidden", backgroundColor: "#FFD7E1" },
  soonProgressFill: { height: "100%", borderRadius: 999, backgroundColor: "#FF3B6B" },
  startingSoonTitle: { color: colors.text, fontSize: 17 },
  startingSoonMeta: { color: colors.red, fontWeight: "800" },
  callCard: { gap: 9, borderColor: colors.red },
  cardActions: { flexDirection: "row", flexWrap: "wrap", justifyContent: "flex-end", gap: 8 },
  callCopy: { flex: 1, gap: 4 },
  row: { flexDirection: "row", justifyContent: "space-between", alignItems: "center" },
  cardTitle: { color: colors.text, fontSize: 15, fontWeight: "900" },
  meta: { color: colors.muted, fontSize: 11, lineHeight: 17 },
  empty: { color: colors.muted, fontSize: 12 },
  error: { color: colors.red, fontSize: 12 },
});
