import type { FriendSummary } from "@meetfair/shared";
import { useFocusEffect } from "@react-navigation/native";
import type { NativeStackScreenProps } from "@react-navigation/native-stack";
import { useCallback, useEffect, useState } from "react";
import { ActivityIndicator, Pressable, ScrollView, StyleSheet, Switch, Text, TextInput, View } from "react-native";
import { SafeAreaView } from "react-native-safe-area-context";
import type { RootStackParamList } from "../../App";
import { Avatar, Button, Card, ScreenHeader, SectionHeading } from "../components/ui";
import { apiRequest, createClientRequestId } from "../services/api";
import { avatarUrl } from "../services/avatar";
import { useSession } from "../services/session";
import { createMeetingSocket } from "../services/socket";
import { colors } from "../theme/colors";

type Props = NativeStackScreenProps<RootStackParamList, "Friends">;

export function FriendsScreen({ navigation }: Props) {
  const { accessToken } = useSession();
  const [accountId, setAccountId] = useState("");
  const [friends, setFriends] = useState<FriendSummary[]>([]);
  const [onlineUserIds, setOnlineUserIds] = useState<string[]>([]);
  const [message, setMessage] = useState("");
  const [busyFriendId, setBusyFriendId] = useState("");
  const [loading, setLoading] = useState(true);
  const [submitting, setSubmitting] = useState(false);

  const load = useCallback(async () => {
    setLoading(true);
    setMessage("");
    try {
      const [friendData, onlineData] = await Promise.all([
        apiRequest<{ friends: FriendSummary[] }>("/friends"),
        apiRequest<{ onlineUserIds: string[] }>("/friends/online"),
      ]);
      setFriends(friendData.friends);
      setOnlineUserIds(onlineData.onlineUserIds);
    } catch (caught) {
      setMessage(caught instanceof Error ? caught.message : "친구 목록을 불러오지 못했습니다.");
    } finally {
      setLoading(false);
    }
  }, []);

  useFocusEffect(useCallback(() => {
    void load();
  }, [load]));

  useEffect(() => {
    if (!accessToken) return;
    const socket = createMeetingSocket(accessToken);
    socket.on("friend:presence", ({ userId, online }) => {
      setOnlineUserIds((current) => online
        ? [...new Set([...current, userId])]
        : current.filter((id) => id !== userId));
    });
    socket.on("friend:accepted", () => {
      void load();
    });
    socket.connect();
    return () => {
      socket.disconnect();
    };
  }, [accessToken, load]);

  const onlineFriends = friends.filter((friend) => onlineUserIds.includes(friend.userId));

  async function sendRequest() {
    if (submitting) return;
    setSubmitting(true);
    setMessage("");
    try {
      await apiRequest("/friends/friend-requests", {
        method: "POST",
        body: JSON.stringify({ recipientAccountId: accountId }),
      });
      setMessage("친구 요청을 보냈습니다.");
      setAccountId("");
    } catch (caught) {
      setMessage(caught instanceof Error ? caught.message : "친구 요청을 보내지 못했습니다.");
    } finally {
      setSubmitting(false);
    }
  }

  async function updatePokePermission(friend: FriendSummary, allowed: boolean) {
    setBusyFriendId(friend.userId);
    setMessage("");
    try {
      await apiRequest("/friends/" + friend.friendshipId + "/poke-permission", {
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
          <TextInput autoCapitalize="none" onChangeText={setAccountId} placeholder="친구 ID 검색" placeholderTextColor={colors.subtle} style={styles.input} value={accountId} />
          <Pressable disabled={submitting || !accountId.trim()} onPress={sendRequest} style={[styles.addButton, (submitting || !accountId.trim()) && styles.disabled]}>
            <Text style={styles.addText}>{submitting ? "전송 중" : "요청"}</Text>
          </Pressable>
        </View>
        <Button label="친구 요청 확인" onPress={() => navigation.navigate("FriendRequests")} variant="secondary" />
        <Button label="개인 디엠 보기" onPress={() => navigation.navigate("DirectMessages")} variant="soft" />
        {loading ? <ActivityIndicator color={colors.primary} /> : null}
        {message ? <Text style={styles.message}>{message}</Text> : null}

        <SectionHeading title="온라인 친구" action={onlineFriends.length + "명"} />
        {onlineFriends.length ? (
          <ScrollView contentContainerStyle={styles.onlineRow} horizontal showsHorizontalScrollIndicator={false}>
            {onlineFriends.map((friend) => (
              <Pressable key={friend.userId} onPress={() => navigation.navigate("UserPage", { userId: friend.userId })} style={styles.onlineFriend}>
                <Avatar imageUrl={avatarUrl(friend.userId, friend.avatarUpdatedAt)} name={friend.nickname} size={58} status="online" />
                <Text numberOfLines={1} style={styles.onlineName}>{friend.nickname}</Text>
              </Pressable>
            ))}
          </ScrollView>
        ) : !loading ? <Text style={styles.empty}>현재 온라인인 친구가 없습니다.</Text> : null}

        <SectionHeading title="전체 친구" action={friends.length + "명"} />
        {friends.map((friend) => (
          <Card key={friend.userId} style={styles.card}>
            <Pressable onPress={() => navigation.navigate("UserPage", { userId: friend.userId })} style={styles.friendHeader}>
              <Avatar imageUrl={avatarUrl(friend.userId, friend.avatarUpdatedAt)} name={friend.nickname} status={onlineUserIds.includes(friend.userId) ? "online" : undefined} />
              <View style={styles.friendCopy}>
                <Text style={styles.name}>{friend.nickname} · @{friend.accountId}</Text>
                <Text style={onlineUserIds.includes(friend.userId) ? styles.onlineMeta : styles.meta}>{onlineUserIds.includes(friend.userId) ? "온라인" : "오프라인"}</Text>
              </View>
            </Pressable>
            <Text style={styles.meta}>{friend.sharedLatitude != null ? "위치 공유 중 · " + (friend.sharedLocationAt ? new Date(friend.sharedLocationAt).toLocaleTimeString("ko-KR") : "") : "위치 비공개"}</Text>
            <View style={styles.permissionRow}>
              <Text style={styles.meta}>이 친구의 찌르기 허용</Text>
              <Switch disabled={busyFriendId === friend.userId} value={friend.allowsPokesFromFriend} onValueChange={(allowed) => void updatePokePermission(friend, allowed)} />
            </View>
            <Button disabled={busyFriendId === friend.userId} label="찌르기" onPress={() => apiRequest("/pokes", { method: "POST", body: JSON.stringify({ targetUserId: friend.userId, clientRequestId: createClientRequestId() }) })} variant="soft" />
            <Button label="디엠 보내기" onPress={() => navigation.navigate("DirectMessages", { friendId: friend.userId })} variant="secondary" />
          </Card>
        ))}
      </ScrollView>
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  safeArea: { flex: 1, backgroundColor: colors.background },
  content: { padding: 20, gap: 12, paddingBottom: 40 },
  addRow: { flexDirection: "row", gap: 8 },
  input: { flex: 1, height: 48, borderRadius: 14, borderWidth: 1, borderColor: colors.border, backgroundColor: colors.surface, paddingHorizontal: 14, color: colors.text },
  addButton: { paddingHorizontal: 18, borderRadius: 14, backgroundColor: colors.primary, alignItems: "center", justifyContent: "center" },
  addText: { color: colors.surface, fontWeight: "900" },
  message: { color: colors.primary, fontSize: 12 },
  onlineRow: { gap: 16, paddingVertical: 4, paddingRight: 20 },
  onlineFriend: { width: 68, alignItems: "center", gap: 7 },
  onlineName: { width: 68, textAlign: "center", color: colors.text, fontSize: 12, fontWeight: "800" },
  empty: { color: colors.muted, fontSize: 12 },
  card: { gap: 8 },
  name: { color: colors.text, fontWeight: "900" },
  meta: { color: colors.muted, fontSize: 11 },
  onlineMeta: { color: colors.online, fontSize: 11, fontWeight: "800" },
  permissionRow: { flexDirection: "row", alignItems: "center", justifyContent: "space-between" },
  friendHeader: { flexDirection: "row", alignItems: "center", gap: 10 },
  friendCopy: { flex: 1, gap: 3 },
  disabled: { opacity: 0.5 },
});
