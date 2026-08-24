import type { FriendSummary, MeetingMemberStatusEntry } from "@meetfair/shared";
import type { NativeStackScreenProps } from "@react-navigation/native-stack";
import { Camera } from "expo-camera";
import { useEffect, useState } from "react";
import { Linking, Pressable, ScrollView, StyleSheet, Text, View } from "react-native";
import { SafeAreaView } from "react-native-safe-area-context";
import type { RootStackParamList } from "../../App";
import { Button, Card, Pill, ScreenHeader, SectionHeading } from "../components/ui";
import { apiRequest, createClientRequestId } from "../services/api";
import { useSession } from "../services/session";
import { colors } from "../theme/colors";

type Props = NativeStackScreenProps<RootStackParamList, "Meeting">;
interface MeetingDetail {
  id: string;
  title: string;
  scheduledAt: string;
  status: string;
  hostId: string;
  locationShareMode: string;
  shareMinutesBefore: number | null;
  voteCountdownEndsAt: string | null;
  confirmedPlace: { id: string; name: string; address: string; latitude: number; longitude: number } | null;
  participants: Array<{
    userId: string;
    arrivedAt: string | null;
    sharingStatus: string;
    cameraPermissionGranted: boolean;
    microphonePermissionGranted: boolean;
    user: { id: string; nickname: string; accountId: string };
  }>;
  memberStatuses: MeetingMemberStatusEntry[];
  placeCandidates: Array<{
    id: string;
    name: string;
    address: string;
    category: string;
    votes: Array<{ userId: string }>;
  }>;
}

interface JoinRequest {
  id: string;
  status: string;
  requester: { id: string; nickname: string; accountId: string };
}

export function MeetingScreen({ navigation, route }: Props) {
  const { user } = useSession();
  const meetingId = route.params.meetingId;
  const [meeting, setMeeting] = useState<MeetingDetail | null>(null);
  const [requests, setRequests] = useState<JoinRequest[]>([]);
  const [friends, setFriends] = useState<FriendSummary[]>([]);
  const [selectedInvitees, setSelectedInvitees] = useState<string[]>([]);
  const [showInvitePicker, setShowInvitePicker] = useState(false);
  const [locked, setLocked] = useState(false);
  const [message, setMessage] = useState("");

  async function load() {
    const data = await apiRequest<MeetingDetail>(`/meetings/${meetingId}`);
    setMeeting(data);
    if (data.hostId === user?.id) {
      const [requestData, friendData] = await Promise.all([
        apiRequest<{ joinRequests: JoinRequest[] }>(`/meetings/${meetingId}/join-requests`),
        apiRequest<{ friends: FriendSummary[] }>("/friends"),
      ]);
      setRequests(requestData.joinRequests.filter((item) => item.status === "PENDING"));
      setFriends(friendData.friends);
    }
  }

  useEffect(() => {
    void Promise.all([Camera.getCameraPermissionsAsync(), Camera.getMicrophonePermissionsAsync()])
      .then(async ([camera, microphone]) => {
        const allowed = camera.granted && microphone.granted;
        setLocked(!allowed);
        await apiRequest(`/meetings/${meetingId}/permissions`, {
          method: "PATCH",
          body: JSON.stringify({ cameraPermissionGranted: camera.granted, microphonePermissionGranted: microphone.granted }),
        });
        if (allowed) await load();
      }).catch((error) => setMessage(error instanceof Error ? error.message : "모임을 불러오지 못했습니다."));
  }, [meetingId]);

  if (locked) {
    return (
      <SafeAreaView style={styles.safeArea}>
        <ScreenHeader title="모임 접근 잠김" onBack={() => navigation.goBack()} />
        <View style={styles.locked}>
          <Text style={styles.title}>카메라·마이크 권한이 필요합니다</Text>
          <Text style={styles.meta}>권한을 다시 허용할 때까지 모임 상세와 참여 기능을 이용할 수 없습니다.</Text>
          <Button label="시스템 설정 열기" onPress={() => Linking.openSettings()} />
        </View>
      </SafeAreaView>
    );
  }
  if (!meeting) {
    return <SafeAreaView style={styles.safeArea}><ScreenHeader title="모임" onBack={() => navigation.goBack()} /><Text style={styles.loading}>{message || "불러오는 중..."}</Text></SafeAreaView>;
  }

  const me = meeting.participants.find((participant) => participant.userId === user?.id);
  const started = new Date(meeting.scheduledAt) <= new Date();
  const inviteCutoff = new Date(meeting.scheduledAt).getTime() - 30 * 60_000;
  const isHost = meeting.hostId === user?.id;
  const canInvite = isHost
    && Date.now() <= inviteCutoff
    && meeting.status !== "COMPLETED"
    && meeting.status !== "CANCELLED";
  const unavailableUserIds = new Set([
    ...meeting.participants.map((participant) => participant.userId),
    ...meeting.memberStatuses.map((member) => member.userId),
  ]);
  const availableFriends = friends.filter((friend) => !unavailableUserIds.has(friend.userId));

  async function vote(placeCandidateId: string) {
    await apiRequest(`/meetings/${meetingId}/votes`, { method: "POST", body: JSON.stringify({ placeCandidateId }) });
    await load();
  }
  async function arrive() {
    await apiRequest(`/meetings/${meetingId}/arrive`, { method: "POST", body: "{}" });
    await load();
  }
  async function poke(targetId: string) {
    await apiRequest(`/meetings/${meetingId}/pokes`, {
      method: "POST",
      body: JSON.stringify({ targetId, clientRequestId: createClientRequestId() }),
    });
    setMessage("찌르기 알림을 보냈습니다.");
  }
  async function respondJoin(requestId: string, action: "accept" | "reject") {
    await apiRequest(`/meetings/${meetingId}/join-requests/${requestId}`, {
      method: "PATCH",
      body: JSON.stringify({ action }),
    });
    await load();
  }
  function toggleInvitee(friendId: string) {
    setSelectedInvitees((current) => current.includes(friendId)
      ? current.filter((id) => id !== friendId)
      : [...current, friendId]);
  }
  async function inviteFriends() {
    setMessage("");
    try {
      await apiRequest(`/meetings/${meetingId}/invitations`, {
        method: "POST",
        body: JSON.stringify({ inviteeUserIds: selectedInvitees }),
      });
      setSelectedInvitees([]);
      setShowInvitePicker(false);
      setMessage("친구에게 모임 초대를 보냈습니다.");
      await load();
    } catch (caught) {
      setMessage(caught instanceof Error ? caught.message : "친구를 초대하지 못했습니다.");
    }
  }

  return (
    <SafeAreaView style={styles.safeArea}>
      <ScreenHeader title="모임 상세" onBack={() => navigation.goBack()} />
      <ScrollView contentContainerStyle={styles.content}>
        <View style={styles.row}><Pill label={meeting.status} tone="green" /><Text style={styles.meta}>{new Date(meeting.scheduledAt).toLocaleString("ko-KR")}</Text></View>
        <Text style={styles.title}>{meeting.title}</Text>
        <Text style={styles.meta}>위치 공유: {meeting.locationShareMode}{meeting.shareMinutesBefore ? ` · ${meeting.shareMinutesBefore}분 전` : ""}</Text>

        {meeting.confirmedPlace ? (
          <Card style={styles.card}>
            <Text style={styles.cardTitle}>확정 장소 · {meeting.confirmedPlace.name}</Text>
            <Text style={styles.meta}>{meeting.confirmedPlace.address}</Text>
          </Card>
        ) : (
          <>
            <SectionHeading title="장소 투표" action={meeting.voteCountdownEndsAt ? "1분 마감 진행 중" : undefined} />
            {meeting.placeCandidates.map((candidate) => (
              <Pressable key={candidate.id} onPress={() => vote(candidate.id)}>
                <Card style={styles.card}>
                  <View style={styles.row}><Text style={styles.cardTitle}>{candidate.name}</Text><Pill label={`${candidate.votes.length}표`} /></View>
                  <Text style={styles.meta}>{candidate.address}</Text>
                </Card>
              </Pressable>
            ))}
            {!meeting.placeCandidates.length ? <Button label="추천 후보 보기" onPress={() => navigation.navigate("Recommendations")} variant="soft" /> : null}
          </>
        )}

        <SectionHeading title="참여자" action={`${meeting.participants.length}명`} />
        {meeting.participants.map((participant) => {
          const late = started && !participant.arrivedAt;
          return (
            <Card key={participant.userId} style={styles.card}>
              <View style={styles.row}>
                <View><Text style={styles.cardTitle}>{participant.user.nickname}</Text><Text style={styles.meta}>@{participant.user.accountId} · {participant.arrivedAt ? "도착" : late ? "지각" : "도착 전"}</Text></View>
                {late && me?.arrivedAt && participant.userId !== user?.id ? <Button label="찌르기" onPress={() => poke(participant.userId)} variant="soft" /> : null}
              </View>
            </Card>
          );
        })}

        {isHost ? <SectionHeading title="친구 추가 초대" action="시작 30분 전까지" /> : null}
        {isHost && canInvite ? (
          <>
            <Button
              label={showInvitePicker ? "초대 목록 닫기" : "친구 선택하기"}
              onPress={() => setShowInvitePicker((current) => !current)}
              variant="soft"
            />
            {showInvitePicker ? availableFriends.map((friend) => {
              const selected = selectedInvitees.includes(friend.userId);
              return (
                <Pressable key={friend.userId} onPress={() => toggleInvitee(friend.userId)}>
                  <Card style={[styles.card, selected && styles.selectedCard]}>
                    <View style={styles.row}>
                      <Text style={styles.cardTitle}>{friend.nickname} · @{friend.accountId}</Text>
                      <Text style={styles.selection}>{selected ? "선택됨" : "선택"}</Text>
                    </View>
                  </Card>
                </Pressable>
              );
            }) : null}
            {showInvitePicker && !availableFriends.length ? <Text style={styles.meta}>추가로 초대할 수 있는 친구가 없습니다.</Text> : null}
            {showInvitePicker && selectedInvitees.length ? (
              <Button label={`${selectedInvitees.length}명 초대하기`} onPress={inviteFriends} />
            ) : null}
          </>
        ) : null}
        {isHost && !canInvite ? <Text style={styles.meta}>모임 시작 30분 전부터는 친구를 추가로 초대할 수 없습니다.</Text> : null}

        {requests.length ? <SectionHeading title="참가 신청" /> : null}
        {requests.map((request) => (
          <Card key={request.id} style={styles.card}>
            <Text style={styles.cardTitle}>{request.requester.nickname} · @{request.requester.accountId}</Text>
            <Button label="승인" onPress={() => respondJoin(request.id, "accept")} />
            <Button label="거절" onPress={() => respondJoin(request.id, "reject")} variant="secondary" />
          </Card>
        ))}

        {message ? <Text style={styles.message}>{message}</Text> : null}
        {!me?.arrivedAt ? <Button label="도착 처리" onPress={arrive} /> : null}
        <Button label="실시간 위치 지도" onPress={() => navigation.navigate("Tracking", { meetingId })} variant="secondary" />
      </ScrollView>
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  safeArea: { flex: 1, backgroundColor: colors.background },
  content: { padding: 20, gap: 12, paddingBottom: 40 },
  loading: { padding: 20, color: colors.muted },
  locked: { padding: 20, gap: 14 },
  title: { color: colors.text, fontSize: 25, fontWeight: "900" },
  card: { gap: 8 },
  selectedCard: { borderColor: colors.primary },
  cardTitle: { color: colors.text, fontWeight: "900" },
  selection: { color: colors.primary, fontWeight: "800" },
  meta: { color: colors.muted, fontSize: 11, lineHeight: 17 },
  row: { flexDirection: "row", alignItems: "center", justifyContent: "space-between", gap: 10 },
  message: { color: colors.primary, fontWeight: "800" },
});
