import type { FriendRequestSummary } from "@meetfair/shared";
import type { NativeStackScreenProps } from "@react-navigation/native-stack";
import { useEffect, useState , useMemo} from "react";
import { ActivityIndicator, ScrollView, StyleSheet, Text, View } from "react-native";
import { SafeAreaView } from "react-native-safe-area-context";
import type { RootStackParamList } from "../../App";
import { Avatar, Button, Card, ScreenHeader, SectionHeading } from "../components/ui";
import { apiRequest } from "../services/api";
import { avatarUrl } from "../services/avatar";
import { useSession } from "../services/session";
import { createMeetingSocket } from "../services/socket";
import { useAppColors } from "../services/theme";


type Props = NativeStackScreenProps<RootStackParamList, "FriendRequests">;

export function FriendRequestsScreen({ navigation }: Props) {
  const palette = useAppColors();
  const styles = useStyles();
  const { accessToken } = useSession();
  const [received, setReceived] = useState<FriendRequestSummary[]>([]);
  const [sent, setSent] = useState<FriendRequestSummary[]>([]);
  const [loading, setLoading] = useState(true);
  const [busyId, setBusyId] = useState("");
  const [message, setMessage] = useState("");

  async function load() {
    setLoading(true);
    setMessage("");
    try {
      const data = await apiRequest<{ received: FriendRequestSummary[]; sent: FriendRequestSummary[] }>("/friends/friend-requests");
      setReceived(data.received.filter((item) => item.status === "PENDING"));
      setSent(data.sent.filter((item) => item.status === "PENDING"));
    } catch (caught) {
      setMessage(caught instanceof Error ? caught.message : "친구 요청을 불러오지 못했습니다.");
    } finally {
      setLoading(false);
    }
  }

  useEffect(() => {
    void load();
  }, []);

  useEffect(() => {
    if (!accessToken) return;
    const socket = createMeetingSocket(accessToken);
    socket.on("friend:request", ({ request }) => {
      setReceived((current) => [request, ...current.filter((item) => item.id !== request.id)]);
    });
    socket.on("friend:accepted", () => {
      void load();
    });
    socket.connect();
    return () => {
      socket.disconnect();
    };
  }, [accessToken]);

  async function respond(id: string, action: "accept" | "reject") {
    setBusyId(id);
    setMessage("");
    try {
      await apiRequest("/friends/friend-requests/" + id, {
        method: "PATCH",
        body: JSON.stringify({ action }),
      });
      await load();
    } catch (caught) {
      setMessage(caught instanceof Error ? caught.message : "친구 요청에 응답하지 못했습니다.");
    } finally {
      setBusyId("");
    }
  }

  return (
    <SafeAreaView style={styles.safeArea}>
      <ScreenHeader title="친구 요청" onBack={() => navigation.goBack()} />
      <ScrollView contentContainerStyle={styles.content}>
        {loading ? <ActivityIndicator color={palette.primary} /> : null}
        {message ? <Text style={styles.message}>{message}</Text> : null}
        <SectionHeading title="받은 요청" action={received.length + "개"} />
        {received.map((request) => (
          <Card key={request.id} style={styles.card}>
            <View style={styles.userRow}>
              <Avatar imageUrl={avatarUrl(request.requester.id, request.requester.avatarUpdatedAt)} name={request.requester.nickname} />
              <View><Text style={styles.name}>{request.requester.nickname}</Text><Text style={styles.meta}>@{request.requester.accountId}</Text></View>
            </View>
            <Button disabled={busyId === request.id} label={busyId === request.id ? "처리 중..." : "수락"} onPress={() => respond(request.id, "accept")} />
            <Button disabled={busyId === request.id} label="거절" onPress={() => respond(request.id, "reject")} variant="secondary" />
          </Card>
        ))}
        {!loading && !received.length ? <Text style={styles.empty}>받은 친구 요청이 없습니다.</Text> : null}

        <SectionHeading title="보낸 요청" action={sent.length + "개"} />
        {sent.map((request) => (
          <Card key={request.id} style={styles.card}>
            <View style={styles.userRow}>
              <Avatar imageUrl={avatarUrl(request.recipient.id, request.recipient.avatarUpdatedAt)} name={request.recipient.nickname} />
              <View><Text style={styles.name}>{request.recipient.nickname}</Text><Text style={styles.meta}>@{request.recipient.accountId} · 수락 대기 중</Text></View>
            </View>
          </Card>
        ))}
        {!loading && !sent.length ? <Text style={styles.empty}>대기 중인 보낸 요청이 없습니다.</Text> : null}
      </ScrollView>
    </SafeAreaView>
  );
}

function useStyles() {
  const palette = useAppColors();
  return useMemo(
    () =>
      StyleSheet.create({
  safeArea: { flex: 1, backgroundColor: palette.background },
  content: { padding: 20, gap: 12, paddingBottom: 40 },
  card: { gap: 9 },
  userRow: { flexDirection: "row", alignItems: "center", gap: 10 },
  name: { color: palette.text, fontWeight: "900" },
  meta: { color: palette.muted, fontSize: 11, marginTop: 3 },
  message: { color: palette.red, fontSize: 12 },
  empty: { color: palette.muted, fontSize: 12 },

      }),
    [palette],
  );
}
