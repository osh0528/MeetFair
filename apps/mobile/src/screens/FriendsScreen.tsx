import type { FriendRequestSummary, FriendSummary } from "@meetfair/shared";
import type { NativeStackScreenProps } from "@react-navigation/native-stack";
import { useEffect, useState } from "react";
import { ActivityIndicator, Pressable, ScrollView, StyleSheet, Switch, Text, TextInput, View } from "react-native";
import { SafeAreaView } from "react-native-safe-area-context";
import type { RootStackParamList } from "../../App";
import { Button, Card, ScreenHeader, SectionHeading } from "../components/ui";
import { apiRequest, createClientRequestId } from "../services/api";
import { colors } from "../theme/colors";

type Props = NativeStackScreenProps<RootStackParamList, "Friends">;

export function FriendsScreen({ navigation }: Props) {
  const [accountId, setAccountId] = useState("");
  const [friends, setFriends] = useState<FriendSummary[]>([]);
  const [received, setReceived] = useState<FriendRequestSummary[]>([]);
  const [message, setMessage] = useState("");
  const [busyFriendId, setBusyFriendId] = useState("");
  const [loading, setLoading] = useState(true);
  const [submitting, setSubmitting] = useState(false);

  async function load() {
    setLoading(true);
    setMessage("");
    try {
      const [friendData, requestData] = await Promise.all([
        apiRequest<{ friends: FriendSummary[] }>("/friends"),
        apiRequest<{ received: FriendRequestSummary[]; sent: FriendRequestSummary[] }>("/friends/friend-requests"),
      ]);
      setFriends(friendData.friends);
      setReceived(requestData.received.filter((item) => item.status === "PENDING"));
    } catch (caught) {
      setMessage(caught instanceof Error ? caught.message : "친구 목록을 불러오지 못했습니다.");
    } finally {
      setLoading(false);
    }
  }
  useEffect(() => { void load(); }, []);

  async function sendRequest() {
    if (submitting) return;
    setSubmitting(true);
    try {
      await apiRequest("/friends/friend-requests", {
        method: "POST",
        body: JSON.stringify({ recipientAccountId: accountId }),
      });
      setMessage("친구 요청을 보냈습니다.");
      setAccountId("");
    } catch (caught) {
      setMessage(caught instanceof Error ? caught.message : "요청하지 못했습니다.");
    } finally {
      setSubmitting(false);
    }
  }

  async function respond(id: string, action: "accept" | "reject") {
    await apiRequest(`/friends/friend-requests/${id}`, { method: "PATCH", body: JSON.stringify({ action }) });
    await load();
  }
  async function updatePokePermission(friend: FriendSummary, allowed: boolean) {
    setBusyFriendId(friend.userId);
    setMessage("");
    try {
      await apiRequest(`/friends/${friend.friendshipId}/poke-permission`, {
        method: "PATCH",
        body: JSON.stringify({ allowed }),
      });
      setFriends((current) => current.map((item) => item.userId === friend.userId
        ? { ...item, allowsPokesFromFriend: allowed }
        : item));
    } catch (caught) {
      setMessage(caught instanceof Error ? caught.message : "찌르기 설정을 변경하지 못했습니다.");
    } finally {
      setBusyFriendId("");
    }
  }

  return (
    <SafeAreaView style={styles.safeArea}>
      <ScreenHeader title="친구" onBack={() => navigation.goBack()} />
      <ScrollView contentContainerStyle={styles.content}>
        <View style={styles.addRow}>
          <TextInput autoCapitalize="none" onChangeText={setAccountId} placeholder="친구 accountId" placeholderTextColor={colors.subtle} style={styles.input} value={accountId} />
          <Pressable disabled={submitting || !accountId.trim()} onPress={sendRequest} style={[styles.addButton, (submitting || !accountId.trim()) && styles.disabled]}><Text style={styles.addText}>{submitting ? "전송 중" : "추가"}</Text></Pressable>
        </View>
        {loading ? <ActivityIndicator color={colors.primary} /> : null}
        {message ? <Text style={styles.message}>{message}</Text> : null}
        {!loading && message ? <Button label="목록 다시 불러오기" onPress={load} variant="soft" /> : null}
        <SectionHeading title="받은 요청" />
        {received.map((request) => (
          <Card key={request.id} style={styles.card}>
            <Text style={styles.name}>{request.requester.nickname} · @{request.requester.accountId}</Text>
            <View style={styles.buttons}><Button label="수락" onPress={() => respond(request.id, "accept")} /><Button label="거절" onPress={() => respond(request.id, "reject")} variant="secondary" /></View>
          </Card>
        ))}
        <SectionHeading title="친구 목록" action={`${friends.length}명`} />
        {friends.map((friend) => (
          <Card key={friend.userId} style={styles.card}>
            <Text style={styles.name}>{friend.nickname} · @{friend.accountId}</Text>
            <Text style={styles.meta}>{friend.sharedLatitude != null ? `위치 공유 중 · ${friend.sharedLocationAt ? new Date(friend.sharedLocationAt).toLocaleTimeString("ko-KR") : ""}` : "위치 비공개"}</Text>
            <View style={styles.permissionRow}>
              <Text style={styles.meta}>이 친구의 찌르기 허용</Text>
              <Switch disabled={busyFriendId === friend.userId} value={friend.allowsPokesFromFriend} onValueChange={(allowed) => void updatePokePermission(friend, allowed)} />
            </View>
            <Button disabled={busyFriendId === friend.userId} label="찌르기" onPress={() => apiRequest(`/pokes`, { method: "POST", body: JSON.stringify({ targetUserId: friend.userId, clientRequestId: createClientRequestId() }) })} variant="soft" />
          </Card>
        ))}
      </ScrollView>
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  safeArea: { flex: 1, backgroundColor: colors.background },
  content: { padding: 20, gap: 12 },
  addRow: { flexDirection: "row", gap: 8 },
  input: { flex: 1, height: 48, borderRadius: 14, borderWidth: 1, borderColor: colors.border, backgroundColor: colors.surface, paddingHorizontal: 14, color: colors.text },
  addButton: { paddingHorizontal: 18, borderRadius: 14, backgroundColor: colors.primary, alignItems: "center", justifyContent: "center" },
  addText: { color: colors.surface, fontWeight: "900" },
  message: { color: colors.primary, fontSize: 12 },
  card: { gap: 8 },
  name: { color: colors.text, fontWeight: "900" },
  meta: { color: colors.muted, fontSize: 11 },
  buttons: { gap: 7 },
  permissionRow: { flexDirection: "row", alignItems: "center", justifyContent: "space-between" },
  disabled: { opacity: 0.5 },
});
