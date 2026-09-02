import type { FriendSummary, MeetingCallSummary, MeetingMemberStatusEntry, TravelMetric } from "@meetfair/shared";
import type { NativeStackScreenProps } from "@react-navigation/native-stack";
import { useEffect, useState } from "react";
import { Alert, Platform, Pressable, ScrollView, StyleSheet, Text, TextInput, useWindowDimensions, View } from "react-native";
import { SafeAreaView } from "react-native-safe-area-context";
import type { RootStackParamList } from "../../App";
import { Button, Card, Pill, ScreenHeader, SectionHeading } from "../components/ui";
import { ExpandableKakaoAddressMap } from "../components/ExpandableKakaoAddressMap";
import { ApiError, apiRequest, createClientRequestId } from "../services/api";
import { arrivalErrorMessage } from "../services/arrival-errors";
import { getCurrentCoordinates } from "../services/current-location";
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
  travelMetric: TravelMetric;
  locationShareMode: string;
  shareMinutesBefore: number | null;
  voteCountdownEndsAt: string | null;
  confirmedPlace: { id: string; name: string; address: string; latitude: number; longitude: number } | null;
  participants: Array<{
    userId: string;
    arrivedAt: string | null;
    sharingStatus: string;
    cameraPermissionGranted: boolean;
    user: { id: string; nickname: string; accountId: string; homeLatitude?: number | null; homeLongitude?: number | null };
  }>;
  memberStatuses: MeetingMemberStatusEntry[];
  placeCandidates: Array<{
    id: string;
    name: string;
    address: string;
    category: string;
    latitude: number;
    longitude: number;
    providerPlaceId: string | null;
    recommendationRank: number | null;
    votes: Array<{ userId: string }>;
    travelEstimates: Array<{
      userId: string;
      durationMinutes: number;
      distanceMeters: number;
      user: { id: string; nickname: string; accountId: string };
    }>;
  }>;
}

interface JoinRequest {
  id: string;
  status: string;
  requester: { id: string; nickname: string; accountId: string };
}

const travelMetricLabels: Record<TravelMetric, string> = {
  TRANSIT: "대중교통",
  CAR: "자동차",
  DISTANCE: "직선거리",
};

function recommendationErrorMessage(error: unknown, travelMetric: TravelMetric) {
  if (!(error instanceof ApiError) || travelMetric !== "TRANSIT") {
    return error instanceof Error ? error.message : "추천 장소를 계산하지 못했습니다.";
  }
  if (error.code === "TRANSIT_NOT_CONFIGURED") return "대중교통 추천 준비가 완료되지 않았습니다. 잠시 후 다시 시도해 주세요.";
  if (error.code === "TRANSIT_TIMEOUT") return "대중교통 경로 계산이 지연되고 있습니다. 잠시 후 다시 시도해 주세요.";
  if (error.code === "TRANSIT_NO_ROUTE") return "참가자 모두가 이동할 수 있는 대중교통 경로를 찾지 못했습니다.";
  if (error.code === "TRANSIT_API_ERROR" || error.code === "TRANSIT_FAILED") {
    return "대중교통 경로 서비스에 연결하지 못했습니다. 잠시 후 다시 시도해 주세요.";
  }
  return error.message;
}

function formatDistance(meters: number) {
  return meters >= 1000 ? `${(meters / 1000).toFixed(1)}km` : `${Math.round(meters)}m`;
}

function travelValue(estimate: { durationMinutes: number; distanceMeters: number }, travelMetric: TravelMetric) {
  return travelMetric === "DISTANCE" ? formatDistance(estimate.distanceMeters) : `${estimate.durationMinutes}분`;
}

function travelStats(
  estimates: MeetingDetail["placeCandidates"][number]["travelEstimates"],
  travelMetric: TravelMetric,
) {
  const values = estimates.map((estimate) => travelMetric === "DISTANCE" ? estimate.distanceMeters : estimate.durationMinutes);
  if (!values.length) return null;
  const format = travelMetric === "DISTANCE" ? formatDistance : (value: number) => `${Math.round(value)}분`;
  return {
    average: format(values.reduce((sum, value) => sum + value, 0) / values.length),
    maximum: format(Math.max(...values)),
    gap: format(Math.max(...values) - Math.min(...values)),
  };
}

export function MeetingScreen({ navigation, route }: Props) {
  const { width: windowWidth } = useWindowDimensions();
  const isWideLayout = windowWidth >= 720;
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
    void load().catch((error) => setMessage(error instanceof Error ? error.message : "모임을 불러오지 못했습니다."));
  }, [meetingId]);

  useEffect(() => {
    if (busyAction) return;
    const timer = setInterval(() => void load().catch(() => undefined), 5_000);
    return () => clearInterval(timer);
  }, [busyAction, meetingId, user?.id]);

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
  const recommendedCandidate = meeting.placeCandidates.find((candidate) => candidate.recommendationRank === 1);
  const travelMetricLabel = travelMetricLabels[meeting.travelMetric];
  const placeMapMarkers = recommendedCandidate ? [
    ...homeMapMarkers,
    {
      id: recommendedCandidate.id,
      label: "이동시간 BEST",
      kind: "RECOMMENDED" as const,
      address: recommendedCandidate.address,
      latitude: recommendedCandidate.latitude,
      longitude: recommendedCandidate.longitude,
    },
  ] : homeMapMarkers;

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
  async function receiveRecommendedPlace() {
    const selectedTravelMetric = meeting?.travelMetric ?? "DISTANCE";
    const selectedTravelMetricLabel = travelMetricLabels[selectedTravelMetric];
    setBusyAction("recommendation");
    setMessage("");
    try {
      await apiRequest(`/meetings/${meetingId}/recommendations/regenerate`, {
        method: "POST",
        body: "{}",
      }, 60_000);
      await load();
      setMessage(`${selectedTravelMetricLabel} 기준으로 이동시간 차이가 가장 적은 장소를 추가했습니다.`);
    } catch (caught) {
      setMessage(recommendationErrorMessage(caught, selectedTravelMetric));
    } finally {
      setBusyAction("");
    }
  }

  async function arrive() {
    if (busyAction === "arrive") return;
    setBusyAction("arrive");
    setMessage("");
    try {
      const coordinates = await getCurrentCoordinates();
      await apiRequest(`/meetings/${meetingId}/arrive`, {
        method: "POST",
        body: JSON.stringify(coordinates),
      });
      await load();
      setMessage("도착 처리됐습니다.");
    } catch (caught) {
      setMessage(arrivalErrorMessage(caught));
    } finally {
      setBusyAction("");
    }
  }
  async function joinMeetingCall() {
    if (busyAction === "call") return;
    setBusyAction("call");
    setMessage("");
    try {
      const call = await apiRequest<MeetingCallSummary>(`/meeting-calls/meetings/${meetingId}/join`, {
        method: "POST",
        body: "{}",
      });
      navigation.navigate("VideoCall", { callId: call.id, meetingId });
    } catch (caught) {
      setMessage(caught instanceof Error ? caught.message : "영상통화에 참여하지 못했습니다.");
    } finally {
      setBusyAction("");
    }
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
      <ScreenHeader
        title="모임 상세"
        onBack={() => navigation.goBack()}
        right={isHost && meeting.status !== "COMPLETED" && meeting.status !== "CANCELLED" ? (
          <Button compact label={editing ? "수정 닫기" : "정보 수정"} onPress={() => setEditing((current) => !current)} variant="secondary" />
        ) : undefined}
      />
      <ScrollView contentContainerStyle={styles.content}>
        <View style={styles.row}><Pill label={meeting.status} tone="green" /><Text style={styles.meta}>{new Date(meeting.scheduledAt).toLocaleString("ko-KR")}</Text></View>
        <Text style={styles.title}>{meeting.title}</Text>
        <Text style={styles.meta}>위치 공유: {meeting.locationShareMode}{meeting.shareMinutesBefore ? ` · ${meeting.shareMinutesBefore}분 전` : ""}</Text>
        <View style={styles.actionGrid}>
          {!me?.arrivedAt && meeting.status !== "CANCELLED" ? <Button compact disabled={busyAction === "arrive"} label={busyAction === "arrive" ? "위치 확인 중..." : "도착 처리"} onPress={arrive} style={styles.actionButton} /> : null}
          {meeting.status !== "COMPLETED" && meeting.status !== "CANCELLED" ? (
            <Button
              compact
              disabled={busyAction === "call"}
              label={busyAction === "call" ? "통화 연결 중..." : started ? "영상통화" : "사전 영상통화"}
              onPress={() => void joinMeetingCall()}
              style={styles.actionButton}
              variant="soft"
            />
          ) : null}
          {meeting.status !== "CANCELLED" ? <Button compact label="실시간 위치" onPress={() => navigation.navigate("Tracking", { meetingId })} style={styles.actionButton} variant="secondary" /> : null}
          {meeting.status !== "CANCELLED" ? <Button compact label="채팅" onPress={() => navigation.navigate("MeetingChat", { meetingId, meetingTitle: meeting.title })} style={styles.actionButton} variant="secondary" /> : null}
          {isHost && meeting.status !== "COMPLETED" && meeting.status !== "CANCELLED" ? (
            <Button compact disabled={busyAction === "cancel"} label={busyAction === "cancel" ? "취소 중..." : "모임 취소"} onPress={cancelMeeting} style={styles.actionButton} variant="secondary" />
          ) : null}
          {isHost && (meeting.status === "COMPLETED" || meeting.status === "CANCELLED") ? (
            <Button compact disabled={busyAction === "delete"} label={busyAction === "delete" ? "삭제 중..." : "기록 삭제"} onPress={deleteMeeting} style={styles.actionButton} variant="secondary" />
          ) : null}
        </View>
        {isHost && meeting.status !== "COMPLETED" && meeting.status !== "CANCELLED" ? (
          <>
            {editing ? (
              <Card style={styles.card}>
                <TextInput onChangeText={setEditTitle} placeholder="모임 이름" placeholderTextColor={colors.subtle} style={styles.input} value={editTitle} />
                <TextInput autoCapitalize="none" onChangeText={setEditScheduledAt} placeholder="2026-08-24T18:00" placeholderTextColor={colors.subtle} style={styles.input} value={editScheduledAt} />
                <Button disabled={busyAction === "save" || !editTitle.trim()} label={busyAction === "save" ? "저장 중..." : "수정 저장"} onPress={saveMeeting} />
              </Card>
            ) : null}
          </>
        ) : null}

        <View style={[styles.detailLayout, !isWideLayout && styles.detailLayoutNarrow]}>
          <View style={styles.mainColumn}>
        {meeting.confirmedPlace ? (
          <Card style={styles.card}>
            <Text style={styles.cardTitle}>확정 장소 · {meeting.confirmedPlace.name}</Text>
            <Text style={styles.meta}>{meeting.confirmedPlace.address}</Text>
          </Card>
        ) : (
          <>
            <SectionHeading title="모임 장소 추천하기" action={`${meeting.participants.length}명 기준`} />
            <Pressable
              disabled={busyAction === "recommendation"}
              onPress={() => void receiveRecommendedPlace()}
              style={({ pressed }) => [styles.recommendButton, pressed && styles.recommendButtonPressed]}
            >
              <View style={styles.recommendGlow} />
              <Text style={styles.recommendSparkle}>✦</Text>
              <View style={styles.recommendCopy}>
                <Text style={styles.recommendEyebrow}>MEETFAIR SMART PICK</Text>
                <Text style={styles.recommendTitle}>{busyAction === "recommendation" ? `${travelMetricLabel} 경로 계산 중...` : "공평한 장소 받기"}</Text>
                <Text style={styles.recommendDescription}>중심 근처 장소를 검색하고 {travelMetricLabel} 기준 이동시간 차이를 비교해요</Text>
              </View>
              <Text style={styles.recommendArrow}>→</Text>
            </Pressable>
            <SectionHeading title="장소 투표" action={meeting.voteCountdownEndsAt ? "1분 마감 진행 중" : undefined} />
            {voteCountdownSeconds != null ? <Text style={styles.voteCountdown}>모두 투표했습니다. {voteCountdownSeconds}초 후 장소가 확정됩니다.</Text> : null}
            <View style={styles.cardGrid}>
              {meeting.placeCandidates.map((candidate) => {
                const stats = travelStats(candidate.travelEstimates, meeting.travelMetric);
                return (
                  <Pressable
                    key={candidate.id}
                    onPress={() => vote(candidate.id)}
                    style={[styles.cardGridItem, !isWideLayout && styles.cardGridItemNarrow]}
                  >
                  <Card style={[styles.card, candidate.id === recommendedCandidate?.id && styles.recommendedCard]}>
                    {candidate.id === recommendedCandidate?.id ? <Text style={styles.recommendedBadge}>✦ {travelMetricLabel} BEST</Text> : null}
                    <View style={styles.row}><Text style={[styles.cardTitle, candidate.id === recommendedCandidate?.id && styles.recommendedCardTitle]}>{candidate.name}</Text><Pill label={`${candidate.votes.length}표`} /></View>
                    <Text style={styles.meta}>{candidate.address}</Text>
                    {stats ? (
                      <>
                        <View style={styles.travelMetrics}>
                          <View style={styles.travelMetricItem}><Text style={styles.travelMetricCaption}>평균</Text><Text style={styles.travelMetricValue}>{stats.average}</Text></View>
                          <View style={styles.travelMetricItem}><Text style={styles.travelMetricCaption}>최대</Text><Text style={styles.travelMetricValue}>{stats.maximum}</Text></View>
                          <View style={styles.travelMetricItem}><Text style={styles.travelMetricCaption}>{meeting.travelMetric === "DISTANCE" ? "거리 차이" : "시간 차이"}</Text><Text style={styles.travelMetricValue}>{stats.gap}</Text></View>
                        </View>
                        <View style={styles.participantTimes}>
                          {candidate.travelEstimates.map((estimate) => (
                            <View key={estimate.userId} style={styles.participantTimeChip}>
                              <Text style={styles.participantTimeText}>{estimate.user.nickname} {travelValue(estimate, meeting.travelMetric)}</Text>
                            </View>
                          ))}
                        </View>
                        <Text style={styles.travelEstimateNotice}>{travelMetricLabel} 기준 예상 {meeting.travelMetric === "DISTANCE" ? "거리" : "이동시간"}</Text>
                      </>
                    ) : null}
                  </Card>
                  </Pressable>
                );
              })}
            </View>
            <Button compact label="지도에서 장소 직접 추천" onPress={() => setShowPlacePicker((current) => !current)} variant="soft" />
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
                  <ExpandableKakaoAddressMap
                    focusTarget={placeFocusTarget}
                    interactive
                    mapMarkers={placeMapMarkers}
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
            <Button compact label={meeting.placeCandidates.length ? "추천 결과 다시 보기" : "추천 후보 보기"} onPress={() => navigation.navigate("Recommendations", { meetingId })} variant="soft" />
          </>
        )}
          </View>

          <View style={[styles.sideColumn, !isWideLayout && styles.sideColumnNarrow]}>

        <SectionHeading title="참여자" action={`${meeting.participants.length}명`} />
        <View style={styles.sideList}>
          {meeting.participants.map((participant) => {
            const late = started && !participant.arrivedAt;
            return (
              <Card key={participant.userId} style={styles.card}>
              <View style={styles.row}>
                <View><Text style={styles.cardTitle}>{participant.user.nickname}</Text><Text style={styles.meta}>@{participant.user.accountId} · {participant.arrivedAt ? "도착" : late ? "지각" : "도착 전"}</Text></View>
                <View style={styles.compactActions}>
                  {late && me?.arrivedAt && participant.userId !== user?.id ? <Button compact disabled={!!pokeCooldowns[participant.userId]} label={pokeCooldowns[participant.userId] ? `${pokeCooldowns[participant.userId]}초` : "찌르기"} onPress={() => void poke(participant.userId)} variant="soft" /> : null}
                  {isHost && participant.userId !== user?.id && meeting.status !== "COMPLETED" && meeting.status !== "CANCELLED" ? (
                    <Button compact disabled={busyAction === participant.userId} label={busyAction === participant.userId ? "처리 중..." : "내보내기"} onPress={() => removeParticipant(participant.userId, participant.user.nickname)} variant="secondary" />
                  ) : null}
                </View>
              </View>
              </Card>
            );
          })}
        </View>

        {isHost ? <SectionHeading title="친구 추가 초대" action="시작 30분 전까지" /> : null}
        {isHost && canInvite ? (
          <>
            <Button
              compact
              label={showInvitePicker ? "초대 목록 닫기" : "친구 선택하기"}
              onPress={() => setShowInvitePicker((current) => !current)}
              variant="soft"
            />
            {showInvitePicker ? (
              <View style={styles.sideList}>
                {availableFriends.map((friend) => {
                  const selected = selectedInvitees.includes(friend.userId);
                  return (
                    <Pressable
                      key={friend.userId}
                      onPress={() => toggleInvitee(friend.userId)}
                    >
                  <Card style={[styles.card, selected && styles.selectedCard]}>
                    <View style={styles.row}>
                      <Text style={styles.cardTitle}>{friend.nickname} · @{friend.accountId}</Text>
                      <Text style={styles.selection}>{selected ? "선택됨" : "선택"}</Text>
                    </View>
                  </Card>
                    </Pressable>
                  );
                })}
              </View>
            ) : null}
            {showInvitePicker && !availableFriends.length ? <Text style={styles.meta}>추가로 초대할 수 있는 친구가 없습니다.</Text> : null}
            {showInvitePicker && selectedInvitees.length ? (
              <Button compact label={`${selectedInvitees.length}명 초대하기`} onPress={inviteFriends} />
            ) : null}
          </>
        ) : null}
        {isHost && !canInvite ? <Text style={styles.meta}>모임 시작 30분 전부터는 친구를 추가로 초대할 수 없습니다.</Text> : null}

        {isHost && meeting.memberStatuses.some((member) => member.status === "PENDING") ? <SectionHeading title="응답 대기 중인 초대" /> : null}
        {isHost && meeting.memberStatuses.filter((member) => member.status === "PENDING").map((member) => (
          <Card key={member.invitationId ?? member.userId} style={styles.card}>
            <View style={styles.row}>
              <View><Text style={styles.cardTitle}>{member.nickname}</Text><Text style={styles.meta}>@{member.accountId}</Text></View>
              {member.invitationId ? <Button compact disabled={busyAction === member.invitationId} label={busyAction === member.invitationId ? "처리 중..." : "초대 취소"} onPress={() => cancelInvitation(member.invitationId!)} variant="secondary" /> : null}
            </View>
          </Card>
        ))}

        {requests.length ? <SectionHeading title="참가 신청" /> : null}
        {requests.map((request) => (
          <Card key={request.id} style={styles.card}>
            <Text style={styles.cardTitle}>{request.requester.nickname} · @{request.requester.accountId}</Text>
            <View style={styles.compactActions}>
              <Button compact label="승인" onPress={() => respondJoin(request.id, "accept")} />
              <Button compact label="거절" onPress={() => respondJoin(request.id, "reject")} variant="secondary" />
            </View>
          </Card>
        ))}
          </View>
        </View>

        {message ? <Text style={styles.message}>{message}</Text> : null}
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
  title: { color: colors.text, fontSize: 25, fontWeight: "900" },
  card: { gap: 8 },
  detailLayout: { flexDirection: "row", alignItems: "flex-start", gap: 18 },
  detailLayoutNarrow: { flexDirection: "column" },
  mainColumn: { flex: 1, minWidth: 0, gap: 12 },
  sideColumn: { width: 320, flexShrink: 0, gap: 12 },
  sideColumnNarrow: { width: "100%" },
  sideList: { gap: 10 },
  cardGrid: { flexDirection: "row", flexWrap: "wrap", alignItems: "stretch", gap: 10 },
  cardGridItem: { width: "48%", flexGrow: 1 },
  cardGridItemNarrow: { width: "100%" },
  actionGrid: { flexDirection: "row", flexWrap: "wrap", justifyContent: "flex-end", gap: 8 },
  actionButton: { paddingHorizontal: 12 },
  recommendButton: { minHeight: 104, borderRadius: 8, overflow: "hidden", paddingHorizontal: 18, paddingVertical: 17, backgroundColor: "#172554", borderWidth: 1, borderColor: "#60A5FA", flexDirection: "row", alignItems: "center", gap: 13, shadowColor: "#2563EB", shadowOpacity: 0.38, shadowRadius: 18, shadowOffset: { width: 0, height: 8 }, elevation: 10 },
  recommendButtonPressed: { opacity: 0.9, transform: [{ scale: 0.99 }] },
  recommendGlow: { position: "absolute", width: 150, height: 150, borderRadius: 75, right: -35, top: -70, backgroundColor: "rgba(96,165,250,0.32)" },
  recommendSparkle: { width: 46, height: 46, borderRadius: 23, backgroundColor: "#2563EB", color: "#FFFFFF", fontSize: 25, lineHeight: 46, textAlign: "center", fontWeight: "900", borderWidth: 1, borderColor: "#93C5FD" },
  recommendCopy: { flex: 1, gap: 3 },
  recommendEyebrow: { color: "#93C5FD", fontSize: 9, fontWeight: "900", letterSpacing: 1.1 },
  recommendTitle: { color: "#FFFFFF", fontSize: 18, fontWeight: "900" },
  recommendDescription: { color: "#DBEAFE", fontSize: 10, lineHeight: 15 },
  recommendArrow: { color: "#FFFFFF", fontSize: 24, fontWeight: "700" },
  recommendedCard: { borderWidth: 2, borderColor: "#3B82F6", backgroundColor: "#EFF6FF", shadowColor: "#2563EB", shadowOpacity: 0.2, shadowRadius: 14, shadowOffset: { width: 0, height: 6 }, elevation: 7 },
  recommendedBadge: { alignSelf: "flex-start", borderRadius: 5, paddingHorizontal: 10, paddingVertical: 5, overflow: "hidden", backgroundColor: "#2563EB", color: "#FFFFFF", fontSize: 10, fontWeight: "900" },
  recommendedCardTitle: { color: "#1D4ED8", fontSize: 16 },
  travelMetrics: { flexDirection: "row", borderRadius: 6, backgroundColor: "rgba(37,99,235,0.07)", paddingVertical: 10 },
  travelMetricItem: { flex: 1, alignItems: "center", gap: 3 },
  travelMetricCaption: { color: colors.muted, fontSize: 9, fontWeight: "800" },
  travelMetricValue: { color: colors.text, fontSize: 13, fontWeight: "900" },
  participantTimes: { flexDirection: "row", flexWrap: "wrap", gap: 6 },
  participantTimeChip: { borderRadius: 5, backgroundColor: colors.background, paddingHorizontal: 9, paddingVertical: 6 },
  participantTimeText: { color: colors.muted, fontSize: 10, fontWeight: "800" },
  travelEstimateNotice: { color: colors.subtle, fontSize: 9, textAlign: "right" },
  placePickerCard: { gap: 10 },
  placeMap: { height: 280, borderRadius: 6, overflow: "hidden" },
  placeSearchRow: { flexDirection: "row", alignItems: "center", gap: 8 },
  placeSearchInput: { flex: 1 },
  searchButton: { minHeight: 50, paddingHorizontal: 16, borderRadius: 6, backgroundColor: colors.primary, alignItems: "center", justifyContent: "center" },
  searchButtonText: { color: colors.surface, fontWeight: "900" },
  placeCandidateList: { gap: 8 },
  placeCandidate: { borderRadius: 6, borderWidth: 1, borderColor: colors.border, backgroundColor: colors.surface, paddingHorizontal: 14, paddingVertical: 10 },
  placeCandidateSelected: { borderColor: colors.primary, backgroundColor: colors.primarySoft },
  placeCandidateTitle: { color: colors.text, fontWeight: "900", fontSize: 13 },
  placeCandidateAddress: { color: colors.muted, fontSize: 11, marginTop: 3 },
  voteCountdown: { color: colors.red, fontWeight: "900", fontSize: 13 },
  selectedCard: { borderColor: colors.primary },
  cardTitle: { color: colors.text, fontWeight: "900" },
  input: { minHeight: 50, borderRadius: 6, borderWidth: 1, borderColor: colors.border, paddingHorizontal: 14, color: colors.text },
  compactActions: { flexDirection: "row", flexWrap: "wrap", justifyContent: "flex-end", gap: 6 },
  selection: { color: colors.primary, fontWeight: "800" },
  meta: { color: colors.muted, fontSize: 11, lineHeight: 17 },
  row: { flexDirection: "row", alignItems: "center", justifyContent: "space-between", gap: 10 },
  message: { color: colors.primary, fontWeight: "800" },
});
