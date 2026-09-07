// 백엔드와 프론트가 함께 사용하는 모임 관련 공유 타입입니다.
import type { FriendSummary, MeetingCallSummary, MeetingMemberStatusEntry, TravelMetric } from "@meetfair/shared";
// Meeting 화면에서 사용할 navigation과 route의 타입을 가져옵니다.
import type { NativeStackScreenProps } from "@react-navigation/native-stack";
// useState는 화면 상태를 저장하고 useEffect는 조회 및 타이머를 실행합니다.
import { useEffect, useState } from "react";
// 화면을 구성하는 React Native 기본 컴포넌트입니다.
import { Alert, Platform, Pressable, ScrollView, StyleSheet, Text, TextInput, useWindowDimensions, View } from "react-native";
// 노치와 상태 표시줄 영역을 피해 내용을 배치합니다.
import { SafeAreaView } from "react-native-safe-area-context";
// 앱 전체 화면 이름과 각 화면이 받는 파라미터 타입입니다.
import type { RootStackParamList } from "../../App";
// 프로젝트에서 공통으로 사용하는 버튼, 카드, 상태 표시, 헤더입니다.
import { Button, Card, Pill, ScreenHeader, SectionHeading } from "../components/ui";
// 카카오 지도에서 주소 검색, 마커 표시, 위치 선택을 처리합니다.
import { ExpandableKakaoAddressMap } from "../components/ExpandableKakaoAddressMap";
// API 요청과 중복 요청 방지용 고유 ID 생성 기능입니다.
import { ApiError, apiRequest, createClientRequestId } from "../services/api";
// 도착 처리 실패 원인을 사용자용 문장으로 변환합니다.
import { arrivalErrorMessage } from "../services/arrival-errors";
// 기기의 현재 GPS 좌표를 가져옵니다.
import { getCurrentCoordinates } from "../services/current-location";
// 현재 로그인한 사용자 정보를 가져옵니다.
import { useSession } from "../services/session";
import { colors } from "../theme/colors";
// 지도 검색 결과와 최종 선택 위치의 타입입니다.
import type { AddressCandidate, AddressSelection } from "../types/location";

// 이 화면은 Meeting 라우트에 연결되며 route.params로 meetingId를 받습니다.
type Props = NativeStackScreenProps<RootStackParamList, "Meeting">;
// interface는 객체가 반드시 가져야 할 속성과 각 속성의 타입을 정하는 TypeScript의 설계도입니다.
// 실행 중에 새 객체를 만드는 코드는 아니며, 개발 중 잘못된 속성이나 타입을 사용하면 미리 오류를 알려줍니다.
// 아래 MeetingDetail은 서버의 모임 상세 조회 API가 반환해야 하는 전체 데이터 구조를 정의합니다.
interface MeetingDetail {
  // 모임의 기본 정보입니다.
  id: string;
  title: string;
  scheduledAt: string;
  status: string;
  hostId: string;
  // 공평한 장소를 계산할 때 사용할 교통·거리 기준입니다.
  travelMetric: TravelMetric;
  // 위치 공유 방식과 모임 몇 분 전부터 공유할지를 나타냅니다.
  locationShareMode: string;
  shareMinutesBefore: number | null;
  // 모든 투표가 끝난 뒤 최종 장소 확정까지의 마감 시각입니다.
  voteCountdownEndsAt: string | null;
  // 투표가 끝나 확정된 장소이며 아직 확정 전이면 null입니다.
  confirmedPlace: { id: string; name: string; address: string; latitude: number; longitude: number } | null;
  // 실제 모임에 참여 중인 사용자 목록입니다.
  participants: Array<{
    userId: string;
    arrivedAt: string | null;
    sharingStatus: string;
    cameraPermissionGranted: boolean;
    user: { id: string; nickname: string; accountId: string; homeLatitude?: number | null; homeLongitude?: number | null };
  }>;
  // 초대받았지만 아직 응답하지 않은 사용자 등의 상태 목록입니다.
  memberStatuses: MeetingMemberStatusEntry[];
  // 추천 또는 직접 추가된 장소 후보와 투표·이동 예상값입니다.
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

// 이 interface는 공개 모임에 참가를 신청한 사용자 한 명의 데이터 구조를 정의합니다.
interface JoinRequest {
  id: string;
  status: string;
  requester: { id: string; nickname: string; accountId: string };
}

// 서버의 이동 기준 코드를 화면에 보여줄 한글 이름으로 변환합니다.
const travelMetricLabels: Record<TravelMetric, string> = {
  TRANSIT: "대중교통",
  CAR: "자동차",
  DISTANCE: "직선거리",
};

// 장소 추천 API 오류를 사용자가 이해할 수 있는 메시지로 변환합니다.
function recommendationErrorMessage(error: unknown, travelMetric: TravelMetric) {
  // 대중교통 추천 오류가 아니면 원래 오류 메시지를 사용합니다.
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

// 미터 단위 거리를 1km 미만은 m, 이상은 km 문자열로 표시합니다.
function formatDistance(meters: number) {
  return meters >= 1000 ? `${(meters / 1000).toFixed(1)}km` : `${Math.round(meters)}m`;
}

// 모임의 이동 기준에 따라 개인별 값을 거리 또는 소요 시간으로 표시합니다.
function travelValue(estimate: { durationMinutes: number; distanceMeters: number }, travelMetric: TravelMetric) {
  return travelMetric === "DISTANCE" ? formatDistance(estimate.distanceMeters) : `${estimate.durationMinutes}분`;
}

// 한 후보 장소에 대한 참여자 이동값의 평균, 최대, 편차를 계산합니다.
function travelStats(
  estimates: MeetingDetail["placeCandidates"][number]["travelEstimates"],
  travelMetric: TravelMetric,
) {
  // 거리 기준이면 미터를, 교통 기준이면 소요 시간을 계산 대상으로 사용합니다.
  const values = estimates.map((estimate) => travelMetric === "DISTANCE" ? estimate.distanceMeters : estimate.durationMinutes);
  // 계산할 이동 정보가 없으면 통계도 표시하지 않습니다.
  if (!values.length) return null;
  const format = travelMetric === "DISTANCE" ? formatDistance : (value: number) => `${Math.round(value)}분`;
  return {
    average: format(values.reduce((sum, value) => sum + value, 0) / values.length),
    maximum: format(Math.max(...values)),
    gap: format(Math.max(...values) - Math.min(...values)),
  };
}

// 모임 상세 조회와 모임 내 모든 사용자 동작을 담당하는 메인 화면입니다.
export function MeetingScreen({ navigation, route }: Props) {
  // 화면 폭이 720px 이상이면 PC용 2열 레이아웃을 사용합니다.
  const { width: windowWidth } = useWindowDimensions();
  const isWideLayout = windowWidth >= 720;
  // 현재 로그인한 사용자와 이전 화면에서 전달한 모임 ID를 가져옵니다.
  const { user } = useSession();
  const meetingId = route.params.meetingId;
  // 서버에서 가져온 모임 상세 데이터입니다. 조회 전에는 null입니다.
  const [meeting, setMeeting] = useState<MeetingDetail | null>(null);
  // 방장에게 보여줄 참가 신청과 추가 초대용 친구 목록입니다.
  const [requests, setRequests] = useState<JoinRequest[]>([]);
  const [friends, setFriends] = useState<FriendSummary[]>([]);
  // 친구 추가 초대 UI의 선택 상태입니다.
  const [selectedInvitees, setSelectedInvitees] = useState<string[]>([]);
  const [showInvitePicker, setShowInvitePicker] = useState(false);
  // 방장이 모임 이름과 시간을 수정할 때 사용하는 상태입니다.
  const [editing, setEditing] = useState(false);
  const [editTitle, setEditTitle] = useState("");
  const [editScheduledAt, setEditScheduledAt] = useState("");
  // 현재 실행 중인 API 동작과 화면에 표시할 결과 메시지입니다.
  const [busyAction, setBusyAction] = useState("");
  const [message, setMessage] = useState("");
  // 참여자별 찌르기 버튼의 남은 재사용 대기시간입니다.
  const [pokeCooldowns, setPokeCooldowns] = useState<Record<string, number>>({});
  // 지도에서 장소를 직접 추천하는 입력창과 선택 결과입니다.
  const [showPlacePicker, setShowPlacePicker] = useState(false);
  const [pickedPlace, setPickedPlace] = useState<AddressSelection | null>(null);
  const [placeInput, setPlaceInput] = useState("");
  const [placeQuery, setPlaceQuery] = useState("");
  const [placeRequestId, setPlaceRequestId] = useState(0);
  const [placeCandidates, setPlaceCandidates] = useState<AddressCandidate[]>([]);
  const [placeFocusTarget, setPlaceFocusTarget] = useState<AddressSelection | null>(null);
  // 모든 투표 완료 후 장소 확정까지 남은 초입니다.
  const [voteCountdownSeconds, setVoteCountdownSeconds] = useState<number | null>(null);
  // 직접 추천할 장소의 이름과 카테고리입니다.
  const [placeName, setPlaceName] = useState("");
  const [placeCategory, setPlaceCategory] = useState("직접 추천");

  // async는 API처럼 결과가 나중에 도착하는 비동기 작업을 처리하는 함수에 붙입니다.
  // async 함수 안에서는 await로 각 요청의 완료를 기다릴 수 있고, async 함수의 반환값은 항상 Promise가 됩니다.
  // await는 앱 전체를 멈추는 것이 아니라 이 함수의 다음 코드만 잠시 기다리게 하므로 화면은 계속 반응할 수 있습니다.
  // 이 함수는 모임 상세정보를 다시 조회하고 방장에게 필요한 신청·친구 목록도 함께 갱신합니다.
  async function load() {
    // route에서 받은 ID로 현재 모임의 최신 정보를 조회합니다.
    const data = await apiRequest<MeetingDetail>(`/meetings/${meetingId}`);
    setMeeting(data);
    // 조회한 값을 정보 수정 입력창의 초깃값으로 복사합니다.
    setEditTitle(data.title);
    setEditScheduledAt(new Date(data.scheduledAt).toISOString().slice(0, 16));
    // 참가 신청과 친구 목록은 방장에게만 필요하므로 방장일 때만 요청합니다.
    if (data.hostId === user?.id) {
      // 서로 의존하지 않는 두 요청을 동시에 실행해 대기 시간을 줄입니다.
      const [requestData, friendData] = await Promise.all([
        apiRequest<{ joinRequests: JoinRequest[] }>(`/meetings/${meetingId}/join-requests`),
        apiRequest<{ friends: FriendSummary[] }>("/friends"),
      ]);
      setRequests(requestData.joinRequests.filter((item) => item.status === "PENDING"));
      setFriends(friendData.friends);
    }
  }

  // 화면 최초 진입 또는 다른 모임 ID로 변경될 때 상세정보를 불러옵니다.
  useEffect(() => {
    void load().catch((error) => setMessage(error instanceof Error ? error.message : "모임을 불러오지 못했습니다."));
  }, [meetingId]);

  // 투표와 참여 상태를 최신으로 유지하기 위해 5초마다 모임을 다시 조회합니다.
  useEffect(() => {
    // API 작업 중에는 자동 갱신과 사용자 요청이 겹치지 않게 타이머를 만들지 않습니다.
    if (busyAction) return;
    const timer = setInterval(() => void load().catch(() => undefined), 5_000);
    return () => clearInterval(timer);
  }, [busyAction, meetingId, user?.id]);

  // 모든 투표 완료 후 최종 장소 확정까지 남은 시간을 1초마다 계산합니다.
  useEffect(() => {
    // 투표 마감 시각이 없으면 카운트다운을 표시하지 않습니다.
    if (!meeting?.voteCountdownEndsAt) {
      setVoteCountdownSeconds(null);
      return;
    }
    const update = () => {
      // 서버 마감 시각과 현재 시각의 차이를 초 단위로 바꿉니다.
      const remaining = Math.max(0, Math.ceil((new Date(meeting.voteCountdownEndsAt!).getTime() - Date.now()) / 1000));
      setVoteCountdownSeconds(remaining);
      // 카운트가 끝나면 서버에서 확정 장소를 다시 가져옵니다.
      if (remaining === 0) void load().catch(() => undefined);
    };
    update();
    const timer = setInterval(update, 1000);
    return () => clearInterval(timer);
  }, [meeting?.voteCountdownEndsAt]);

  // 사용자별 찌르기 버튼의 쿨다운을 1초씩 감소시킵니다.
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

  // 첫 조회가 끝나기 전에는 본문 대신 로딩 또는 조회 오류를 표시합니다.
  if (!meeting) {
    return <SafeAreaView style={styles.safeArea}><ScreenHeader title="모임" onBack={() => navigation.goBack()} /><Text style={styles.loading}>{message || "불러오는 중..."}</Text></SafeAreaView>;
  }

  // 현재 로그인 사용자의 참여 정보와 모임 진행 상태를 계산합니다.
  const me = meeting.participants.find((participant) => participant.userId === user?.id);
  // 나를 제외하고 집 근처 좌표가 있는 참여자를 지도 마커로 변환합니다.
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
  // 모임 시작 여부, 방장 여부, 추가 초대 가능 시간을 계산합니다.
  const started = new Date(meeting.scheduledAt) <= new Date();
  const inviteCutoff = new Date(meeting.scheduledAt).getTime() - 30 * 60_000;
  const isHost = meeting.hostId === user?.id;
  const canInvite = isHost
    && Date.now() <= inviteCutoff
    && meeting.status !== "COMPLETED"
    && meeting.status !== "CANCELLED";
  // 이미 참여 중이거나 초대된 사용자는 친구 선택 목록에서 제외합니다.
  const unavailableUserIds = new Set([
    ...meeting.participants.map((participant) => participant.userId),
    ...meeting.memberStatuses.map((member) => member.userId),
  ]);
  const availableFriends = friends.filter((friend) => !unavailableUserIds.has(friend.userId));
  // 추천 순위가 1위인 장소를 BEST 후보로 사용합니다.
  const recommendedCandidate = meeting.placeCandidates.find((candidate) => candidate.recommendationRank === 1);
  const travelMetricLabel = travelMetricLabels[meeting.travelMetric];
  // 직접 추천 지도에는 참여자 집 근처와 BEST 장소를 함께 표시합니다.
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
  // 후보 위치 한눈에 보기 지도에는 상위 세 장소를 번호와 함께 표시합니다.
  const candidateOverviewMarkers = meeting.placeCandidates.slice(0, 3).map((candidate, index) => ({
    id: `candidate-overview:${candidate.id}`,
    label: `${index + 1}. ${candidate.name}`,
    kind: "RECOMMENDED" as const,
    address: candidate.address,
    latitude: candidate.latitude,
    longitude: candidate.longitude,
  }));

  // 선택한 후보 장소에 한 표를 보내고 최신 투표 결과를 다시 불러옵니다.
  async function vote(placeCandidateId: string) {
    try {
      await apiRequest(`/meetings/${meetingId}/votes`, { method: "POST", body: JSON.stringify({ placeCandidateId }) });
      await load();
      setMessage("투표했습니다.");
    } catch (caught) {
      setMessage(caught instanceof Error ? caught.message : "투표하지 못했습니다.");
    }
  }

  // 입력한 장소명 또는 주소로 지도 검색을 시작합니다.
  function searchPlace() {
    const query = placeInput.trim();
    if (!query) return;
    setPlaceQuery(query);
    // 같은 검색어를 다시 입력해도 새 검색으로 인식하도록 요청 번호를 증가시킵니다.
    setPlaceRequestId((current) => current + 1);
  }

  // 지도 검색 결과를 저장하고 결과가 하나면 자동 선택합니다.
  function handlePlaceResults(items: AddressCandidate[]) {
    setPlaceCandidates(items);
    if (items.length === 1 && items[0]) {
      setPickedPlace(items[0]);
      setPlaceFocusTarget(items[0]);
      setPlaceName(items[0].title);
    }
  }

  // 지도 클릭 또는 주소 해석으로 얻은 위치를 최종 선택 상태에 저장합니다.
  function handlePlaceResolved(selection: AddressSelection) {
    setPickedPlace(selection);
    setPlaceFocusTarget(selection);
    setPlaceCandidates([{ ...selection, title: selection.address }]);
    if (!placeName.trim()) setPlaceName(selection.address);
  }

  // 사용자가 직접 선택한 위치를 모임의 새 장소 후보로 등록합니다.
  async function addPlaceCandidate() {
    // 장소 이름과 지도 좌표가 모두 있어야 후보로 등록할 수 있습니다.
    if (!pickedPlace || !placeName.trim()) {
      setMessage("장소 이름과 지도 위치를 모두 선택해 주세요.");
      return;
    }
    setBusyAction("place");
    setMessage("");
    try {
      // 직접 선택한 좌표를 식별할 수 있도록 manual 형식의 장소 ID를 만듭니다.
      await apiRequest(`/meetings/${meetingId}/candidates`, {
        method: "POST",
        body: JSON.stringify({
          providerPlaceId: `manual:${pickedPlace.latitude}:${pickedPlace.longitude}`,
          name: placeName.trim(),
          category: placeCategory.trim() || "직접 추천",
          ...pickedPlace,
        }),
      });
      // 등록 후 입력값과 장소 선택창을 초기화합니다.
      setPlaceName("");
      setPickedPlace(null);
      setShowPlacePicker(false);
      setMessage("직접 추천한 장소를 추가했습니다.");
      // 새 후보가 포함된 모임 정보를 다시 불러옵니다.
      await load();
    } catch (caught) {
      setMessage(caught instanceof Error ? caught.message : "장소 후보를 추가하지 못했습니다.");
    } finally {
      setBusyAction("");
    }
  }

  // 참여자 집 주소와 선택된 이동 기준으로 공평한 장소 추천을 서버에 요청합니다.
  async function receiveRecommendedPlace() {
    const selectedTravelMetric = meeting?.travelMetric ?? "DISTANCE";
    const selectedTravelMetricLabel = travelMetricLabels[selectedTravelMetric];
    setBusyAction("recommendation");
    setMessage("");
    try {
      // 경로 계산이 길어질 수 있으므로 이 요청은 최대 60초까지 기다립니다.
      await apiRequest(`/meetings/${meetingId}/recommendations/regenerate`, {
        method: "POST",
        body: "{}",
      }, 60_000);
      // 서버가 추가한 추천 후보와 이동 예상값을 다시 조회합니다.
      await load();
      setMessage(`${selectedTravelMetricLabel} 기준으로 이동시간 차이가 가장 적은 장소를 추가했습니다.`);
    } catch (caught) {
      setMessage(recommendationErrorMessage(caught, selectedTravelMetric));
    } finally {
      setBusyAction("");
    }
  }

  // 현재 GPS 좌표를 서버에 보내 모임 장소 도착 여부를 처리합니다.
  async function arrive() {
    if (busyAction === "arrive") return;
    setBusyAction("arrive");
    setMessage("");
    try {
      // 모바일 또는 브라우저의 위치 권한을 통해 현재 좌표를 가져옵니다.
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

  // 모임에 연결된 영상통화 방에 참여합니다.
  async function joinMeetingCall() {
    if (busyAction === "call") return;
    setBusyAction("call");
    setMessage("");
    try {
      // 서버에서 통화방 ID를 받은 후 실제 영상통화 화면으로 이동합니다.
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

  // 아직 도착하지 않은 참여자에게 찌르기 알림을 보냅니다.
  async function poke(targetId: string) {
    // 해당 참여자의 쿨다운이 남아 있으면 중복 알림을 보내지 않습니다.
    if (pokeCooldowns[targetId]) return;
    setMessage("");
    try {
      await apiRequest(`/meetings/${meetingId}/pokes`, {
        method: "POST",
        // 고유 요청 ID를 함께 보내 같은 요청의 중복 처리를 방지합니다.
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

  // 방장이 공개 모임 참가 신청을 승인하거나 거절합니다.
  async function respondJoin(requestId: string, action: "accept" | "reject") {
    await apiRequest(`/meetings/${meetingId}/join-requests/${requestId}`, {
      method: "PATCH",
      body: JSON.stringify({ action }),
    });
    await load();
  }

  // 추가 초대할 친구 ID를 선택하거나 선택 해제합니다.
  function toggleInvitee(friendId: string) {
    setSelectedInvitees((current) => current.includes(friendId)
      ? current.filter((id) => id !== friendId)
      : [...current, friendId]);
  }

  // 선택한 친구들에게 모임 초대를 전송합니다.
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

  // 방장이 수정한 모임 이름과 시간을 서버에 저장합니다.
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

  // 확인창을 거쳐 진행 중인 모임을 취소합니다.
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

  // 확인창을 거쳐 특정 참여자를 모임에서 내보냅니다.
  function removeParticipant(participantUserId: string, nickname: string) {
    confirmAction("참여자 내보내기", `${nickname}님을 모임에서 내보낼까요?`, () => {
      setBusyAction(participantUserId);
      void apiRequest(`/meetings/${meetingId}/participants/${participantUserId}`, { method: "DELETE" })
        .then(load)
        .catch((caught) => setMessage(caught instanceof Error ? caught.message : "참여자를 내보내지 못했습니다."))
        .finally(() => setBusyAction(""));
    });
  }

  // 완료 또는 취소된 모임과 관련 기록을 삭제한 뒤 홈으로 이동합니다.
  function deleteMeeting() {
    confirmAction("모임 기록 삭제", "모임과 관련된 초대, 투표, 위치 기록이 모두 삭제되며 복구할 수 없습니다.", () => {
      setBusyAction("delete");
      void apiRequest(`/meetings/${meetingId}`, { method: "DELETE" })
        .then(() => navigation.replace("Home"))
        .catch((caught) => setMessage(caught instanceof Error ? caught.message : "모임 기록을 삭제하지 못했습니다."))
        .finally(() => setBusyAction(""));
    });
  }

  // 아직 응답하지 않은 친구에게 보낸 초대를 취소합니다.
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

  // 위에서 준비한 상태와 함수들을 실제 모임 상세 화면으로 렌더링합니다.
  return (
    <SafeAreaView style={styles.safeArea}>
      {/* 상단에는 뒤로가기, 화면 제목, 방장 전용 정보 수정 버튼을 표시합니다. */}
      <ScreenHeader
        title="모임 상세"
        onBack={() => navigation.goBack()}
        right={isHost && meeting.status !== "COMPLETED" && meeting.status !== "CANCELLED" ? (
          <Button compact label={editing ? "수정 닫기" : "정보 수정"} onPress={() => setEditing((current) => !current)} variant="secondary" />
        ) : undefined}
      />
      <ScrollView contentContainerStyle={[styles.content, !isWideLayout && styles.contentNarrow]}>
        {/* 모임 상태, 예정 시각, 제목, 위치 공유 설정을 보여주는 기본 정보 영역입니다. */}
        <View style={styles.row}><Pill label={meeting.status} tone="green" /><Text style={styles.meta}>{new Date(meeting.scheduledAt).toLocaleString("ko-KR")}</Text></View>
        <Text style={styles.title}>{meeting.title}</Text>
        <Text style={styles.meta}>위치 공유: {meeting.locationShareMode}{meeting.shareMinutesBefore ? ` · ${meeting.shareMinutesBefore}분 전` : ""}</Text>
        {/* 모임 상태와 사용자 권한에 맞는 주요 실행 버튼을 표시합니다. */}
        <View style={styles.actionGrid}>
          {/* 아직 도착하지 않은 참여자에게만 도착 처리 버튼을 보여줍니다. */}
          {!me?.arrivedAt && meeting.status !== "CANCELLED" ? <Button compact disabled={busyAction === "arrive"} label={busyAction === "arrive" ? "위치 확인 중..." : "도착 처리"} onPress={arrive} style={styles.actionButton} /> : null}
          {/* 취소·완료 전에는 영상통화, 실시간 위치, 채팅으로 이동할 수 있습니다. */}
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
          {/* 방장은 진행 중인 모임을 취소하거나 종료된 기록을 삭제할 수 있습니다. */}
          {isHost && meeting.status !== "COMPLETED" && meeting.status !== "CANCELLED" ? (
            <Button compact disabled={busyAction === "cancel"} label={busyAction === "cancel" ? "취소 중..." : "모임 취소"} onPress={cancelMeeting} style={styles.actionButton} variant="secondary" />
          ) : null}
          {isHost && (meeting.status === "COMPLETED" || meeting.status === "CANCELLED") ? (
            <Button compact disabled={busyAction === "delete"} label={busyAction === "delete" ? "삭제 중..." : "기록 삭제"} onPress={deleteMeeting} style={styles.actionButton} variant="secondary" />
          ) : null}
        </View>
        {/* 정보 수정 모드에서는 모임 이름과 일정을 입력받아 저장합니다. */}
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

        {/* 넓은 화면은 장소 영역과 참여자 영역을 두 열로 배치합니다. */}
        <View style={[styles.detailLayout, !isWideLayout && styles.detailLayoutNarrow]}>
          <View style={styles.mainColumn}>
        {/* 장소가 확정됐으면 확정 장소만 보여주고, 아니면 추천과 투표 기능을 보여줍니다. */}
        {meeting.confirmedPlace ? (
          <Card style={styles.card}>
            <Text style={styles.cardTitle}>확정 장소 · {meeting.confirmedPlace.name}</Text>
            <Text style={styles.meta}>{meeting.confirmedPlace.address}</Text>
          </Card>
        ) : (
          <>
            <SectionHeading title="모임 장소 추천하기" action={`${meeting.participants.length}명 기준`} />
            {/* 서버에 공평한 장소 재계산을 요청하는 핵심 버튼입니다. */}
            <Pressable
              disabled={busyAction === "recommendation"}
              onPress={() => void receiveRecommendedPlace()}
              style={({ pressed }) => [styles.recommendButton, !isWideLayout && styles.recommendButtonNarrow, pressed && styles.recommendButtonPressed]}
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
            {/* 추천 후보 지도와 장소 투표 목록을 나란히 또는 세로로 표시합니다. */}
            <View style={[styles.recommendationResultLayout, !isWideLayout && styles.recommendationResultLayoutNarrow]}>
              <View style={[styles.candidateOverviewSection, styles.recommendationMapColumn, !isWideLayout && styles.recommendationColumnNarrow]}>
                <Text style={styles.candidateOverviewTitle}>후보 위치 한눈에 보기</Text>
                <Text style={styles.candidateOverviewCaption}>
                  {candidateOverviewMarkers.length
                    ? `추천 후보 ${candidateOverviewMarkers.length}곳을 지도에서 확인해 보세요.`
                    : "장소를 추천받으면 후보 위치가 지도에 표시됩니다."}
                </Text>
                <View style={[styles.candidateOverviewMap, isWideLayout && styles.candidateOverviewMapWide]}>
                  {/* 추천 후보 상위 세 곳의 위치를 한 지도에 표시합니다. */}
                  <ExpandableKakaoAddressMap
                    interactive
                    mapMarkers={candidateOverviewMarkers}
                    query=""
                    requestId={0}
                  />
                </View>
              </View>
              <View style={[styles.candidateStack, !isWideLayout && styles.recommendationColumnNarrow]}>
                <SectionHeading title="장소 투표" action={meeting.voteCountdownEndsAt ? "1분 마감 진행 중" : undefined} />
                {/* 모든 투표가 끝났다면 최종 확정까지 남은 시간을 표시합니다. */}
                {voteCountdownSeconds != null ? <Text style={styles.voteCountdown}>모두 투표했습니다. {voteCountdownSeconds}초 후 장소가 확정됩니다.</Text> : null}
              {/* 후보 카드를 누르면 vote 함수가 실행되며 이동 통계와 개인별 값을 보여줍니다. */}
              {meeting.placeCandidates.map((candidate) => {
                const stats = travelStats(candidate.travelEstimates, meeting.travelMetric);
                return (
                  <Pressable
                    key={candidate.id}
                    onPress={() => vote(candidate.id)}
                    style={styles.candidateStackItem}
                  >
                  <Card style={[styles.card, candidate.id === recommendedCandidate?.id && styles.recommendedCard]}>
                    {candidate.id === recommendedCandidate?.id ? <Text style={styles.recommendedBadge}>✦ {travelMetricLabel} BEST</Text> : null}
                    <View style={styles.candidateHeaderRow}><Text numberOfLines={2} style={[styles.cardTitle, styles.candidateName, candidate.id === recommendedCandidate?.id && styles.recommendedCardTitle]}>{candidate.name}</Text><Pill label={`${candidate.votes.length}표`} /></View>
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
                {!meeting.placeCandidates.length ? (
                  <Card style={styles.emptyCandidateCard}>
                    <Text style={styles.meta}>아직 추천된 후보가 없습니다.</Text>
                  </Card>
                ) : null}
              </View>
            </View>
            {/* 사용자가 지도에서 직접 장소를 선택할 수 있는 영역을 열고 닫습니다. */}
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
                  {/* 자동 마커 맞춤을 끄고 검색 결과 또는 사용자가 선택한 위치를 표시합니다. */}
                  <ExpandableKakaoAddressMap
                    fitMarkers={false}
                    focusTarget={placeFocusTarget}
                    interactive
                    mapMarkers={placeMapMarkers}
                    onResolved={handlePlaceResolved}
                    onResults={handlePlaceResults}
                    query={placeQuery}
                    requestId={placeRequestId}
                  />
                </View>
                {/* 검색 결과가 여러 개면 사용자가 원하는 주소를 고를 수 있게 목록을 표시합니다. */}
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
            {/* 자세한 추천 결과 화면으로 이동합니다. */}
            <Button compact label={meeting.placeCandidates.length ? "추천 결과 다시 보기" : "추천 후보 보기"} onPress={() => navigation.navigate("Recommendations", { meetingId })} variant="soft" />
          </>
        )}
          </View>

          <View style={[styles.sideColumn, !isWideLayout && styles.sideColumnNarrow]}>

        {/* 참여자의 도착·지각 상태와 방장용 내보내기 버튼을 표시합니다. */}
        <SectionHeading title="참여자" action={`${meeting.participants.length}명`} />
        <View style={styles.sideList}>
          {meeting.participants.map((participant) => {
            const late = started && !participant.arrivedAt;
            return (
              <Card key={participant.userId} style={styles.card}>
              <View style={styles.row}>
                <View style={styles.identityCopy}><Text numberOfLines={2} style={styles.cardTitle}>{participant.user.nickname}</Text><Text numberOfLines={2} style={styles.meta}>@{participant.user.accountId} · {participant.arrivedAt ? "도착" : late ? "지각" : "도착 전"}</Text></View>
                <View style={styles.compactActions}>
                  {/* 나는 도착했지만 상대가 지각한 경우에만 찌르기 버튼을 표시합니다. */}
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

        {/* 방장은 모임 시작 30분 전까지 새로운 친구를 추가로 초대할 수 있습니다. */}
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
                {/* 이미 참여 중이거나 초대된 사용자를 제외한 친구 목록입니다. */}
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

        {/* 아직 수락하지 않은 초대 목록과 초대 취소 버튼입니다. */}
        {isHost && meeting.memberStatuses.some((member) => member.status === "PENDING") ? <SectionHeading title="응답 대기 중인 초대" /> : null}
        {isHost && meeting.memberStatuses.filter((member) => member.status === "PENDING").map((member) => (
          <Card key={member.invitationId ?? member.userId} style={styles.card}>
            <View style={styles.row}>
              <View style={styles.identityCopy}><Text numberOfLines={2} style={styles.cardTitle}>{member.nickname}</Text><Text numberOfLines={2} style={styles.meta}>@{member.accountId}</Text></View>
              {member.invitationId ? <Button compact disabled={busyAction === member.invitationId} label={busyAction === member.invitationId ? "처리 중..." : "초대 취소"} onPress={() => cancelInvitation(member.invitationId!)} variant="secondary" /> : null}
            </View>
          </Card>
        ))}

        {/* 공개 모임 참가 신청을 방장이 승인하거나 거절하는 영역입니다. */}
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

        {/* 각 API 동작의 성공 또는 실패 결과를 사용자에게 알려줍니다. */}
        {message ? <Text style={styles.message}>{message}</Text> : null}
      </ScrollView>
    </SafeAreaView>
  );
}

// 삭제·취소·내보내기처럼 되돌리기 어려운 작업 전에 확인창을 표시합니다.
function confirmAction(title: string, message: string, onConfirm: () => void) {
  // 웹은 브라우저 confirm을 사용합니다.
  if (Platform.OS === "web") {
    if (globalThis.confirm(`${title}\n\n${message}`)) onConfirm();
    return;
  }
  // Android와 iOS에서는 React Native Alert를 사용합니다.
  Alert.alert(title, message, [
    { text: "돌아가기", style: "cancel" },
    { text: "확인", style: "destructive", onPress: onConfirm },
  ]);
}

const styles = StyleSheet.create({
  safeArea: { flex: 1, backgroundColor: colors.background },
  content: { padding: 20, gap: 12, paddingBottom: 40 },
  contentNarrow: { paddingHorizontal: 14, paddingTop: 14 },
  loading: { padding: 20, color: colors.muted },
  title: { color: colors.text, fontSize: 25, fontWeight: "900" },
  card: { gap: 8 },
  detailLayout: { flexDirection: "row", alignItems: "flex-start", gap: 18 },
  detailLayoutNarrow: { flexDirection: "column" },
  mainColumn: { flex: 1, minWidth: 0, gap: 12 },
  sideColumn: { width: 320, flexShrink: 0, gap: 12 },
  sideColumnNarrow: { width: "100%" },
  sideList: { gap: 10 },
  recommendationResultLayout: { flexDirection: "row", alignItems: "flex-start", gap: 12 },
  recommendationResultLayoutNarrow: { flexDirection: "column", alignItems: "stretch", width: "100%", gap: 20 },
  recommendationMapColumn: { flex: 1.2, minWidth: 0 },
  candidateStack: { flex: 0.8, minWidth: 0, gap: 10 },
  recommendationColumnNarrow: { flexGrow: 0, flexShrink: 0, flexBasis: "auto", width: "100%" },
  candidateStackItem: { width: "100%" },
  emptyCandidateCard: { minHeight: 100, alignItems: "center", justifyContent: "center" },
  actionGrid: { flexDirection: "row", flexWrap: "wrap", justifyContent: "flex-end", gap: 8 },
  actionButton: { paddingHorizontal: 12 },
  recommendButton: { minHeight: 104, borderRadius: 8, overflow: "hidden", paddingHorizontal: 18, paddingVertical: 17, backgroundColor: "#172554", borderWidth: 1, borderColor: "#60A5FA", flexDirection: "row", alignItems: "center", gap: 13, shadowColor: "#2563EB", shadowOpacity: 0.38, shadowRadius: 18, shadowOffset: { width: 0, height: 8 }, elevation: 10 },
  recommendButtonNarrow: { paddingHorizontal: 13, gap: 9 },
  recommendButtonPressed: { opacity: 0.9, transform: [{ scale: 0.99 }] },
  recommendGlow: { position: "absolute", width: 150, height: 150, borderRadius: 75, right: -35, top: -70, backgroundColor: "rgba(96,165,250,0.32)" },
  recommendSparkle: { width: 46, height: 46, flexShrink: 0, borderRadius: 23, backgroundColor: "#2563EB", color: "#FFFFFF", fontSize: 25, lineHeight: 46, textAlign: "center", fontWeight: "900", borderWidth: 1, borderColor: "#93C5FD" },
  recommendCopy: { flex: 1, minWidth: 0, gap: 3 },
  recommendEyebrow: { color: "#93C5FD", fontSize: 9, fontWeight: "900", letterSpacing: 1.1 },
  recommendTitle: { color: "#FFFFFF", fontSize: 18, fontWeight: "900", flexShrink: 1 },
  recommendDescription: { color: "#DBEAFE", fontSize: 10, lineHeight: 15, flexShrink: 1 },
  recommendArrow: { color: "#FFFFFF", fontSize: 24, fontWeight: "700", flexShrink: 0 },
  recommendedCard: { borderWidth: 2, borderColor: "#3B82F6", backgroundColor: "#EFF6FF", shadowColor: "#2563EB", shadowOpacity: 0.2, shadowRadius: 14, shadowOffset: { width: 0, height: 6 }, elevation: 7 },
  recommendedBadge: { alignSelf: "flex-start", borderRadius: 5, paddingHorizontal: 10, paddingVertical: 5, overflow: "hidden", backgroundColor: "#2563EB", color: "#FFFFFF", fontSize: 10, fontWeight: "900" },
  recommendedCardTitle: { color: "#1D4ED8", fontSize: 16 },
  candidateHeaderRow: { flexDirection: "row", alignItems: "flex-start", justifyContent: "space-between", gap: 8 },
  candidateName: { flex: 1, minWidth: 0 },
  travelMetrics: { flexDirection: "row", borderRadius: 6, backgroundColor: "rgba(37,99,235,0.07)", paddingVertical: 10 },
  travelMetricItem: { flex: 1, alignItems: "center", gap: 3 },
  travelMetricCaption: { color: colors.muted, fontSize: 9, fontWeight: "800" },
  travelMetricValue: { color: colors.text, fontSize: 13, fontWeight: "900" },
  participantTimes: { flexDirection: "row", flexWrap: "wrap", gap: 6 },
  participantTimeChip: { borderRadius: 5, backgroundColor: colors.background, paddingHorizontal: 9, paddingVertical: 6 },
  participantTimeText: { color: colors.muted, fontSize: 10, fontWeight: "800" },
  travelEstimateNotice: { color: colors.subtle, fontSize: 9, textAlign: "right" },
  candidateOverviewSection: { gap: 6, marginTop: 2, width: "100%" },
  candidateOverviewTitle: { color: colors.text, fontSize: 15, fontWeight: "900" },
  candidateOverviewCaption: { color: colors.muted, fontSize: 10 },
  candidateOverviewMap: { height: 230, borderRadius: 6, overflow: "hidden", borderWidth: 1, borderColor: colors.border },
  candidateOverviewMapWide: { height: 420 },
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
  cardTitle: { color: colors.text, fontWeight: "900", flexShrink: 1 },
  input: { minHeight: 50, borderRadius: 6, borderWidth: 1, borderColor: colors.border, paddingHorizontal: 14, color: colors.text },
  compactActions: { flexDirection: "row", flexWrap: "wrap", justifyContent: "flex-end", gap: 6 },
  selection: { color: colors.primary, fontWeight: "800" },
  meta: { color: colors.muted, fontSize: 11, lineHeight: 17 },
  identityCopy: { flex: 1, minWidth: 0 },
  row: { flexDirection: "row", flexWrap: "wrap", alignItems: "center", justifyContent: "space-between", gap: 10 },
  message: { color: colors.primary, fontWeight: "800" },
});
