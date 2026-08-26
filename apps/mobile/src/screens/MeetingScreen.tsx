import type { FriendSummary, MeetingMemberStatusEntry } from "@meetfair/shared";
import type { NativeStackScreenProps } from "@react-navigation/native-stack";
import { Camera } from "expo-camera";
import { useEffect, useState } from "react";
import { Alert, Linking, Platform, Pressable, ScrollView, StyleSheet, Text, TextInput, View } from "react-native";
import { SafeAreaView } from "react-native-safe-area-context";
import type { RootStackParamList } from "../../App";
import { Button, Card, Pill, ScreenHeader, SectionHeading } from "../components/ui";
import { KakaoAddressMap } from "../components/KakaoAddressMap";
import { apiRequest, createClientRequestId } from "../services/api";
import { useSession } from "../services/session";
import { colors } from "../theme/colors";
import type { AddressCandidate, AddressSelection } from "../types/location";

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
    user: { id: string; nickname: string; accountId: string; homeLatitude?: number | null; homeLongitude?: number | null };
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
  const [editing, setEditing] = useState(false);
  const [editTitle, setEditTitle] = useState("");
  const [editScheduledAt, setEditScheduledAt] = useState("");
  const [busyAction, setBusyAction] = useState("");
  const [locked, setLocked] = useState(false);
  const [message, setMessage] = useState("");
  const [pokeCooldowns, setPokeCooldowns] = useState<Record<string, number>>({});
  const [showPlacePicker, setShowPlacePicker] = useState(false);
  const [pickedPlace, setPickedPlace] = useState<AddressSelection | null>(null);
  const [placeInput, setPlaceInput] = useState("");
  const [placeQuery, setPlaceQuery] = useState("");
  const [placeRequestId, setPlaceRequestId] = useState(0);
  const [placeCandidates, setPlaceCandidates] = useState<AddressCandidate[]>([]);
  const [placeFocusTarget, setPlaceFocusTarget] = useState<AddressSelection | null>(null);
  const [voteCountdownSeconds, setVoteCountdownSeconds] = useState<number | null>(null);
  const [placeName, setPlaceName] = useState("");
  const [placeCategory, setPlaceCategory] = useState("직접 추천");

  async function load() {
    const data = await apiRequest<MeetingDetail>(`/meetings/${meetingId}`);
    setMeeting(data);
    setEditTitle(data.title);
    setEditScheduledAt(new Date(data.scheduledAt).toISOString().slice(0, 16));
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

  useEffect(() => {
    const timer = setInterval(() => void load().catch(() => undefined), 5_000);
    return () => clearInterval(timer);
  }, [meetingId, user?.id]);

  useEffect(() => {
    if (!meeting?.voteCountdownEndsAt) {
      setVoteCountdownSeconds(null);
      return;
    }
    const update = () => {
      const remaining = Math.max(0, Math.ceil((new Date(meeting.voteCountdownEndsAt!).getTime() - Date.now()) / 1000));
      setVoteCountdownSeconds(remaining);
      if (remaining === 0) void load().catch(() => undefined);
    };
    update();
    const timer = setInterval(update, 1000);
    return () => clearInterval(timer);
  }, [meeting?.voteCountdownEndsAt]);

  useEffect(() => {
    if (!Object.keys(pokeCooldowns).length) return;
    const timer = setInterval(() => {
      setPokeCooldowns((current) => {
        const next: Record<string, number> = {};
        let changed = false;
        for (const [id, remaining] of Object.entries(current)) {
          const updated = remaining - 1;
          if (updated > 0) {
            next[id] = updated;
            changed = true;
          } else {
            changed = true;
          }
        }
        return changed ? next : current;
      });
    }, 1000);
    return () => clearInterval(timer);
  }, [pokeCooldowns]);

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
  const homeMapMarkers = meeting.participants.flatMap((participant) => (
    participant.userId !== user?.id
    && participant.user.homeLatitude != null
    && participant.user.homeLongitude != null
      ? [{
          id: `home:${participant.userId}`,
          label: participant.user.nickname,
          kind: "HOME" as const,
          address: "친구가 설정한 집 근처",
          latitude: participant.user.homeLatitude,
          longitude: participant.user.homeLongitude,
        }]
      : []
  ));
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
    try {
      await apiRequest(`/meetings/${meetingId}/votes`, { method: "POST", body: JSON.stringify({ placeCandidateId }) });
      await load();
      setMessage("투표했습니다.");
    } catch (caught) {
      setMessage(caught instanceof Error ? caught.message : "투표하지 못했습니다.");
    }
  }

  function searchPlace() {
    const query = placeInput.trim();
    if (!query) return;
    setPlaceQuery(query);
    setPlaceRequestId((current) => current + 1);
  }

  function handlePlaceResults(items: AddressCandidate[]) {
    setPlaceCandidates(items);
    if (items.length === 1 && items[0]) {
      setPickedPlace(items[0]);
      setPlaceFocusTarget(items[0]);
      setPlaceName(items[0].title);
    }
  }

  function handlePlaceResolved(selection: AddressSelection) {
    setPickedPlace(selection);
    setPlaceFocusTarget(selection);
    setPlaceCandidates([{ ...selection, title: selection.address }]);
    if (!placeName.trim()) setPlaceName(selection.address);
  }

  async function addPlaceCandidate() {
    if (!pickedPlace || !placeName.trim()) {
      setMessage("장소 이름과 지도 위치를 모두 선택해 주세요.");
      return;
    }
    setBusyAction("place");
    setMessage("");
    try {
      await apiRequest(`/meetings/${meetingId}/candidates`, {
        method: "POST",
        body: JSON.stringify({
          providerPlaceId: `manual:${pickedPlace.latitude}:${pickedPlace.longitude}`,
          name: placeName.trim(),
          category: placeCategory.trim() || "직접 추천",
          ...pickedPlace,
        }),
      });
      setPlaceName("");
      setPickedPlace(null);
      setShowPlacePicker(false);
      setMessage("직접 추천한 장소를 추가했습니다.");
      await load();
    } catch (caught) {
      setMessage(caught instanceof Error ? caught.message : "장소 후보를 추가하지 못했습니다.");
    } finally {
      setBusyAction("");
    }
  }
  async function arrive() {
    await apiRequest(`/meetings/${meetingId}/arrive`, { method: "POST", body: "{}" });
    await load();
  }
  async function poke(targetId: string) {
    if (pokeCooldowns[targetId]) return;
    setMessage("");
    try {
      await apiRequest(`/meetings/${meetingId}/pokes`, {
        method: "POST",
        body: JSON.stringify({ targetId, clientRequestId: createClientRequestId() }),
      });
      setMessage("찌르기 알림을 보냈습니다.");
      setPokeCooldowns((current) => ({ ...current, [targetId]: 2 }));
    } catch (caught) {
      const msg = caught instanceof Error ? caught.message : "찌르기를 보내지 못했습니다.";
      if (msg.includes("POKE_COOLDOWN") || msg.includes("Please wait")) {
        const match = msg.match(/(\d+)s/);
        const seconds = match ? Number(match[1]) : 120;
        setPokeCooldowns((current) => ({ ...current, [targetId]: seconds }));
        setMessage(`잠시 후 다시 찌를 수 있습니다. (${seconds}초)`);
      } else {
        setMessage(msg);
      }
    }
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
  async function saveMeeting() {
    setBusyAction("save");
    setMessage("");
    try {
      await apiRequest(`/meetings/${meetingId}`, {
        method: "PATCH",
        body: JSON.stringify({
          title: editTitle.trim(),
          scheduledAt: new Date(editScheduledAt).toISOString(),
        }),
      });
      setEditing(false);
      setMessage("모임 정보를 수정했습니다.");
      await load();
    } catch (caught) {
      setMessage(caught instanceof Error ? caught.message : "모임 정보를 수정하지 못했습니다.");
    } finally {
      setBusyAction("");
    }
  }
  function cancelMeeting() {
    confirmAction("모임 취소", "모임을 취소하면 참여자들에게 알림이 전송됩니다.", () => {
      setBusyAction("cancel");
      void apiRequest(`/meetings/${meetingId}/cancel`, { method: "PATCH", body: "{}" })
        .then(async () => {
          setMessage("모임을 취소했습니다.");
          await load();
        })
        .catch((caught) => setMessage(caught instanceof Error ? caught.message : "모임을 취소하지 못했습니다."))
        .finally(() => setBusyAction(""));
    });
  }
  function removeParticipant(participantUserId: string, nickname: string) {
    confirmAction("참여자 내보내기", `${nickname}님을 모임에서 내보낼까요?`, () => {
      setBusyAction(participantUserId);
      void apiRequest(`/meetings/${meetingId}/participants/${participantUserId}`, { method: "DELETE" })
        .then(load)
        .catch((caught) => setMessage(caught instanceof Error ? caught.message : "참여자를 내보내지 못했습니다."))
        .finally(() => setBusyAction(""));
    });
  }
  function deleteMeeting() {
    confirmAction("모임 기록 삭제", "모임과 관련된 초대, 투표, 위치 기록이 모두 삭제되며 복구할 수 없습니다.", () => {
      setBusyAction("delete");
      void apiRequest(`/meetings/${meetingId}`, { method: "DELETE" })
        .then(() => navigation.replace("Home"))
        .catch((caught) => setMessage(caught instanceof Error ? caught.message : "모임 기록을 삭제하지 못했습니다."))
        .finally(() => setBusyAction(""));
    });
  }
  async function cancelInvitation(invitationId: string) {
    setBusyAction(invitationId);
    setMessage("");
    try {
      await apiRequest(`/meetings/${meetingId}/invitations/${invitationId}`, { method: "DELETE" });
      setMessage("초대를 취소했습니다.");
      await load();
    } catch (caught) {
      setMessage(caught instanceof Error ? caught.message : "초대를 취소하지 못했습니다.");
    } finally {
      setBusyAction("");
    }
  }

  return (
    <SafeAreaView style={styles.safeArea}>
      <ScreenHeader title="모임 상세" onBack={() => navigation.goBack()} />
      <ScrollView contentContainerStyle={styles.content}>
        <View style={styles.row}><Pill label={meeting.status} tone="green" /><Text style={styles.meta}>{new Date(meeting.scheduledAt).toLocaleString("ko-KR")}</Text></View>
        <Text style={styles.title}>{meeting.title}</Text>
        <Text style={styles.meta}>위치 공유: {meeting.locationShareMode}{meeting.shareMinutesBefore ? ` · ${meeting.shareMinutesBefore}분 전` : ""}</Text>
        {isHost && meeting.status !== "COMPLETED" && meeting.status !== "CANCELLED" ? (
          <>
            <Button label={editing ? "수정 닫기" : "모임 정보 수정"} onPress={() => setEditing((current) => !current)} variant="secondary" />
            {editing ? (
              <Card style={styles.card}>
                <TextInput onChangeText={setEditTitle} placeholder="모임 이름" placeholderTextColor={colors.subtle} style={styles.input} value={editTitle} />
                <TextInput autoCapitalize="none" onChangeText={setEditScheduledAt} placeholder="2026-08-24T18:00" placeholderTextColor={colors.subtle} style={styles.input} value={editScheduledAt} />
                <Button disabled={busyAction === "save" || !editTitle.trim()} label={busyAction === "save" ? "저장 중..." : "수정 저장"} onPress={saveMeeting} />
              </Card>
            ) : null}
          </>
        ) : null}

        {meeting.confirmedPlace ? (
          <Card style={styles.card}>
            <Text style={styles.cardTitle}>확정 장소 · {meeting.confirmedPlace.name}</Text>
            <Text style={styles.meta}>{meeting.confirmedPlace.address}</Text>
          </Card>
        ) : (
          <>
            <SectionHeading title="장소 투표" action={meeting.voteCountdownEndsAt ? "1분 마감 진행 중" : undefined} />
            {voteCountdownSeconds != null ? <Text style={styles.voteCountdown}>모두 투표했습니다. {voteCountdownSeconds}초 후 장소가 확정됩니다.</Text> : null}
            {meeting.placeCandidates.map((candidate) => (
              <Pressable key={candidate.id} onPress={() => vote(candidate.id)}>
                <Card style={styles.card}>
                  <View style={styles.row}><Text style={styles.cardTitle}>{candidate.name}</Text><Pill label={`${candidate.votes.length}표`} /></View>
                  <Text style={styles.meta}>{candidate.address}</Text>
                </Card>
              </Pressable>
            ))}
            <Button label="지도에서 장소 직접 추천" onPress={() => setShowPlacePicker((current) => !current)} variant="soft" />
            {showPlacePicker ? (
              <Card style={styles.placePickerCard}>
                <Text style={styles.cardTitle}>지도를 눌러 장소를 선택하세요</Text>
                <TextInput onChangeText={setPlaceName} placeholder="장소 이름" placeholderTextColor={colors.subtle} style={styles.input} value={placeName} />
                <TextInput onChangeText={setPlaceCategory} placeholder="장소 종류 (선택)" placeholderTextColor={colors.subtle} style={styles.input} value={placeCategory} />
                <View style={styles.placeSearchRow}>
                  <TextInput
                    onChangeText={setPlaceInput}
                    onSubmitEditing={searchPlace}
                    placeholder="장소명 또는 주소 검색"
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
                  <KakaoAddressMap
                    focusTarget={placeFocusTarget}
                    interactive
                    mapMarkers={homeMapMarkers}
                    onResolved={handlePlaceResolved}
                    onResults={handlePlaceResults}
                    query={placeQuery}
                    requestId={placeRequestId}
                  />
                </View>
                {placeCandidates.length > 1 ? (
                  <View style={styles.placeCandidateList}>
                    {placeCandidates.map((candidate) => (
                      <Pressable
                        key={`${candidate.latitude}-${candidate.longitude}-${candidate.title}`}
                        onPress={() => { setPickedPlace(candidate); setPlaceFocusTarget(candidate); setPlaceName(candidate.title); }}
                        style={[styles.placeCandidate, pickedPlace?.latitude === candidate.latitude && pickedPlace?.longitude === candidate.longitude && styles.placeCandidateSelected]}
                      >
                        <Text numberOfLines={1} style={styles.placeCandidateTitle}>{candidate.title}</Text>
                        <Text numberOfLines={1} style={styles.placeCandidateAddress}>{candidate.address}</Text>
                      </Pressable>
                    ))}
                  </View>
                ) : null}
                <Text style={styles.meta}>{pickedPlace ? `선택 위치: ${pickedPlace.address}` : "지도를 눌러 위치를 선택하세요."}</Text>
                <Button disabled={busyAction === "place" || !pickedPlace || !placeName.trim()} label={busyAction === "place" ? "추가 중..." : "이 장소를 후보로 추가"} onPress={() => void addPlaceCandidate()} />
              </Card>
            ) : null}
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
                <View style={styles.compactActions}>
                  {late && me?.arrivedAt && participant.userId !== user?.id ? <Button disabled={!!pokeCooldowns[participant.userId]} label={pokeCooldowns[participant.userId] ? `${pokeCooldowns[participant.userId]}초` : "찌르기"} onPress={() => void poke(participant.userId)} variant="soft" /> : null}
                  {isHost && participant.userId !== user?.id && meeting.status !== "COMPLETED" && meeting.status !== "CANCELLED" ? (
                    <Button disabled={busyAction === participant.userId} label={busyAction === participant.userId ? "처리 중..." : "내보내기"} onPress={() => removeParticipant(participant.userId, participant.user.nickname)} variant="secondary" />
                  ) : null}
                </View>
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

        {isHost && meeting.memberStatuses.some((member) => member.status === "PENDING") ? <SectionHeading title="응답 대기 중인 초대" /> : null}
        {isHost && meeting.memberStatuses.filter((member) => member.status === "PENDING").map((member) => (
          <Card key={member.invitationId ?? member.userId} style={styles.card}>
            <View style={styles.row}>
              <View><Text style={styles.cardTitle}>{member.nickname}</Text><Text style={styles.meta}>@{member.accountId}</Text></View>
              {member.invitationId ? <Button disabled={busyAction === member.invitationId} label={busyAction === member.invitationId ? "처리 중..." : "초대 취소"} onPress={() => cancelInvitation(member.invitationId!)} variant="secondary" /> : null}
            </View>
          </Card>
        ))}

        {requests.length ? <SectionHeading title="참가 신청" /> : null}
        {requests.map((request) => (
          <Card key={request.id} style={styles.card}>
            <Text style={styles.cardTitle}>{request.requester.nickname} · @{request.requester.accountId}</Text>
            <Button label="승인" onPress={() => respondJoin(request.id, "accept")} />
            <Button label="거절" onPress={() => respondJoin(request.id, "reject")} variant="secondary" />
          </Card>
        ))}

        {message ? <Text style={styles.message}>{message}</Text> : null}
        {!me?.arrivedAt && meeting.status !== "CANCELLED" ? <Button label="도착 처리" onPress={arrive} /> : null}
        {meeting.status !== "CANCELLED" ? <Button label="실시간 위치 지도" onPress={() => navigation.navigate("Tracking", { meetingId })} variant="secondary" /> : null}
        {meeting.status !== "CANCELLED" ? <Button label="채팅" onPress={() => navigation.navigate("MeetingChat", { meetingId, meetingTitle: meeting.title })} variant="secondary" /> : null}
        {meeting.status !== "CANCELLED" ? <Button label="게시판" onPress={() => navigation.navigate("MeetingBoard", { meetingId, meetingTitle: meeting.title })} variant="secondary" /> : null}
        {isHost && meeting.status !== "COMPLETED" && meeting.status !== "CANCELLED" ? (
          <Button disabled={busyAction === "cancel"} label={busyAction === "cancel" ? "취소 처리 중..." : "모임 취소"} onPress={cancelMeeting} variant="secondary" />
        ) : null}
        {isHost && (meeting.status === "COMPLETED" || meeting.status === "CANCELLED") ? (
          <Button disabled={busyAction === "delete"} label={busyAction === "delete" ? "삭제 중..." : "모임 기록 삭제"} onPress={deleteMeeting} variant="secondary" />
        ) : null}
      </ScrollView>
    </SafeAreaView>
  );
}

function confirmAction(title: string, message: string, onConfirm: () => void) {
  if (Platform.OS === "web") {
    if (globalThis.confirm(`${title}\n\n${message}`)) onConfirm();
    return;
  }
  Alert.alert(title, message, [
    { text: "돌아가기", style: "cancel" },
    { text: "확인", style: "destructive", onPress: onConfirm },
  ]);
}

const styles = StyleSheet.create({
  safeArea: { flex: 1, backgroundColor: colors.background },
  content: { padding: 20, gap: 12, paddingBottom: 40 },
  loading: { padding: 20, color: colors.muted },
  locked: { padding: 20, gap: 14 },
  title: { color: colors.text, fontSize: 25, fontWeight: "900" },
  card: { gap: 8 },
  placePickerCard: { gap: 10 },
  placeMap: { height: 280, borderRadius: 16, overflow: "hidden" },
  placeSearchRow: { flexDirection: "row", alignItems: "center", gap: 8 },
  placeSearchInput: { flex: 1 },
  searchButton: { minHeight: 50, paddingHorizontal: 16, borderRadius: 14, backgroundColor: colors.primary, alignItems: "center", justifyContent: "center" },
  searchButtonText: { color: colors.surface, fontWeight: "900" },
  placeCandidateList: { gap: 8 },
  placeCandidate: { borderRadius: 14, borderWidth: 1, borderColor: colors.border, backgroundColor: colors.surface, paddingHorizontal: 14, paddingVertical: 10 },
  placeCandidateSelected: { borderColor: colors.primary, backgroundColor: colors.primarySoft },
  placeCandidateTitle: { color: colors.text, fontWeight: "900", fontSize: 13 },
  placeCandidateAddress: { color: colors.muted, fontSize: 11, marginTop: 3 },
  voteCountdown: { color: colors.red, fontWeight: "900", fontSize: 13 },
  selectedCard: { borderColor: colors.primary },
  cardTitle: { color: colors.text, fontWeight: "900" },
  input: { minHeight: 50, borderRadius: 14, borderWidth: 1, borderColor: colors.border, paddingHorizontal: 14, color: colors.text },
  compactActions: { gap: 6 },
  selection: { color: colors.primary, fontWeight: "800" },
  meta: { color: colors.muted, fontSize: 11, lineHeight: 17 },
  row: { flexDirection: "row", alignItems: "center", justifyContent: "space-between", gap: 10 },
  message: { color: colors.primary, fontWeight: "800" },
});
