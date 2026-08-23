import type { FriendActivitySummary, MeetingInvitationSummary, MeetingSummary } from "@meetfair/shared";
import type { NativeStackScreenProps } from "@react-navigation/native-stack";
import { useEffect, useState } from "react";
import { Pressable, ScrollView, StyleSheet, Text, View } from "react-native";
import { SafeAreaView } from "react-native-safe-area-context";
import type { RootStackParamList } from "../../App";
import { Button, Card, LogoMark, Pill, SectionHeading } from "../components/ui";
import { apiRequest } from "../services/api";
import { useSession } from "../services/session";
import { colors } from "../theme/colors";

type Props = NativeStackScreenProps<RootStackParamList, "Home">;

export function HomeScreen({ navigation }: Props) {
  const { user } = useSession();
  const [meetings, setMeetings] = useState<MeetingSummary[]>([]);
  const [invitations, setInvitations] = useState<MeetingInvitationSummary[]>([]);
  const [activities, setActivities] = useState<FriendActivitySummary[]>([]);

  async function load() {
    const [meetingData, invitationData, activityData] = await Promise.all([
      apiRequest<MeetingSummary[]>("/meetings"),
      apiRequest<{ invitations: MeetingInvitationSummary[] }>("/meeting-invitations"),
      apiRequest<{ activities: FriendActivitySummary[] }>("/meetings/activity/friends"),
    ]);
    setMeetings(meetingData);
    setInvitations(invitationData.invitations.filter((item) => item.status === "PENDING"));
    setActivities(activityData.activities);
  }

  useEffect(() => { void load(); }, []);

  return (
    <SafeAreaView style={styles.safeArea}>
      <View style={styles.header}>
        <View style={styles.brand}><LogoMark compact /><Text style={styles.brandText}>MeetFair</Text></View>
        <Pressable onPress={() => navigation.navigate("Notifications")}><Text style={styles.link}>알림</Text></Pressable>
      </View>
      <ScrollView contentContainerStyle={styles.content}>
        <Text style={styles.hello}>안녕하세요, {user?.nickname}님</Text>
        <Text style={styles.accountId}>친구 ID @{user?.accountId}</Text>
        <View style={styles.actions}>
          <Button label="새 모임" onPress={() => navigation.navigate("CreateMeeting")} />
          <Button label="친구" onPress={() => navigation.navigate("Friends")} variant="secondary" />
          <Button label="설정" onPress={() => navigation.navigate("Settings")} variant="secondary" />
        </View>

        <SectionHeading title="받은 초대" action={`${invitations.length}개`} />
        {invitations.map((item) => (
          <Card key={item.id} style={styles.card}>
            <Text style={styles.cardTitle}>{item.meetingTitle}</Text>
            <Text style={styles.meta}>{item.inviter.nickname}님의 초대 · {new Date(item.scheduledAt).toLocaleString("ko-KR")}</Text>
            <Button label="초대 확인" onPress={() => navigation.navigate("MeetingInvitation", { invitation: item })} variant="soft" />
          </Card>
        ))}
        {!invitations.length ? <Text style={styles.empty}>대기 중인 초대가 없습니다.</Text> : null}

        <SectionHeading title="예정된 모임" action={`${meetings.length}개`} />
        {meetings.map((meeting) => (
          <Pressable key={meeting.id} onPress={() => navigation.navigate("Meeting", { meetingId: meeting.id })}>
            <Card style={styles.card}>
              <View style={styles.row}><Text style={styles.cardTitle}>{meeting.title}</Text><Pill label={meeting.status} tone="green" /></View>
              <Text style={styles.meta}>{new Date(meeting.scheduledAt).toLocaleString("ko-KR")}</Text>
            </Card>
          </Pressable>
        ))}

        <SectionHeading title="친구들의 공개 모임" />
        {activities.map((activity) => (
          <Card key={activity.meetingId} style={styles.card}>
            <Text style={styles.cardTitle}>{activity.friend.nickname}님이 약속을 잡았어요</Text>
            <Text style={styles.meta}>상세 정보는 참가 승인 후 확인할 수 있습니다.</Text>
            <Button
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
  brandText: { color: colors.text, fontSize: 19, fontWeight: "900" },
  link: { color: colors.primary, fontWeight: "900" },
  content: { padding: 20, gap: 14, paddingBottom: 40 },
  hello: { color: colors.text, fontSize: 26, fontWeight: "900" },
  accountId: { color: colors.primary, fontWeight: "800", marginTop: -8 },
  actions: { gap: 9, marginBottom: 8 },
  card: { gap: 9 },
  row: { flexDirection: "row", justifyContent: "space-between", alignItems: "center" },
  cardTitle: { color: colors.text, fontSize: 15, fontWeight: "900" },
  meta: { color: colors.muted, fontSize: 11, lineHeight: 17 },
  empty: { color: colors.muted, fontSize: 12 },
});
