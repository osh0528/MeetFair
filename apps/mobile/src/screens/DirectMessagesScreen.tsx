import type { NativeStackScreenProps } from "@react-navigation/native-stack";
import { useMemo, useState } from "react";
import { KeyboardAvoidingView, Platform, Pressable, ScrollView, StyleSheet, Text, TextInput, View } from "react-native";
import type { RootStackParamList } from "../../App";
import { Avatar, Card, ScreenHeader } from "../components/ui";
import { colors } from "../theme/colors";

type Props = NativeStackScreenProps<RootStackParamList, "DirectMessages">;
type MockMessage = { id: string; text: string; mine: boolean; sentAt: string };
type Conversation = { id: string; nickname: string; online: boolean; preview: string; time: string; unread: number; messages: MockMessage[] };

const initialConversations: Conversation[] = [
  { id: "mock-jisu", nickname: "지수", online: true, preview: "이번 주말 모임 장소 정했어?", time: "오후 2:18", unread: 2, messages: [
    { id: "j1", text: "이번 주말 모임 장소 정했어?", mine: false, sentAt: "오후 2:18" },
    { id: "j2", text: "응, 후보 몇 개 보고 있어!", mine: true, sentAt: "오후 2:20" },
  ] },
  { id: "mock-minho", nickname: "민호", online: false, preview: "확인했어. 고마워!", time: "어제", unread: 0, messages: [
    { id: "m1", text: "확인했어. 고마워!", mine: false, sentAt: "어제" },
  ] },
  { id: "mock-sora", nickname: "소라", online: true, preview: "나 지금 접속했어", time: "월요일", unread: 0, messages: [
    { id: "s1", text: "나 지금 접속했어", mine: false, sentAt: "월요일" },
  ] },
];

export function DirectMessagesScreen({ navigation, route }: Props) {
  const [conversations, setConversations] = useState(initialConversations);
  const [selectedId, setSelectedId] = useState(route.params?.friendId ?? "");
  const [draft, setDraft] = useState("");
  const selected = conversations.find((conversation) => conversation.id === selectedId);
  const sortedConversations = useMemo(() => [...conversations].sort((a, b) => (a.unread ? -1 : 1) - (b.unread ? -1 : 1)), [conversations]);

  function selectConversation(id: string) {
    setSelectedId(id);
    setConversations((current) => current.map((conversation) => conversation.id === id ? { ...conversation, unread: 0 } : conversation));
  }

  function sendMessage() {
    const text = draft.trim();
    if (!text || !selected) return;
    setConversations((current) => current.map((conversation) => conversation.id === selected.id
      ? { ...conversation, preview: text, time: "방금", messages: [...conversation.messages, { id: "local-" + Date.now(), text, mine: true, sentAt: "방금" }] }
      : conversation));
    setDraft("");
  }

  return (
    <KeyboardAvoidingView behavior={Platform.OS === "ios" ? "padding" : undefined} style={styles.safeArea}>
      <ScreenHeader title="개인 디엠" onBack={() => navigation.goBack()} />
      <View style={styles.body}>
        <View style={styles.listPane}>
          <Text style={styles.sectionTitle}>대화</Text>
          <ScrollView contentContainerStyle={styles.listContent}>
            {sortedConversations.map((conversation) => (
              <Pressable key={conversation.id} onPress={() => selectConversation(conversation.id)} style={[styles.conversation, selectedId === conversation.id && styles.conversationSelected]}>
                <Avatar name={conversation.nickname} size={48} status={conversation.online ? "online" : undefined} />
                <View style={styles.conversationCopy}>
                  <View style={styles.conversationTitleRow}><Text style={styles.nickname}>{conversation.nickname}</Text><Text style={styles.time}>{conversation.time}</Text></View>
                  <View style={styles.previewRow}><Text numberOfLines={1} style={styles.preview}>{conversation.preview}</Text>{conversation.unread ? <Text style={styles.unread}>{conversation.unread}</Text> : null}</View>
                </View>
              </Pressable>
            ))}
          </ScrollView>
        </View>
        {selected ? (
          <Card style={styles.chatPane}>
            <View style={styles.chatHeader}>
              <Avatar name={selected.nickname} size={40} status={selected.online ? "online" : undefined} />
              <View><Text style={styles.chatName}>{selected.nickname}</Text><Text style={selected.online ? styles.online : styles.offline}>{selected.online ? "온라인" : "오프라인"}</Text></View>
            </View>
            <ScrollView contentContainerStyle={styles.messages}>
              <Text style={styles.mockNotice}>실제 디엠 연결 전 목업 화면입니다.</Text>
              {selected.messages.map((message) => (
                <View key={message.id} style={[styles.messageRow, message.mine && styles.messageRowMine]}>
                  <View style={[styles.bubble, message.mine ? styles.bubbleMine : styles.bubbleTheirs]}><Text style={message.mine ? styles.bubbleTextMine : styles.bubbleText}>{message.text}</Text></View>
                  <Text style={styles.sentAt}>{message.sentAt}</Text>
                </View>
              ))}
            </ScrollView>
            <View style={styles.composer}>
              <TextInput onChangeText={setDraft} onSubmitEditing={sendMessage} placeholder="메시지를 입력하세요" placeholderTextColor={colors.subtle} returnKeyType="send" style={styles.input} value={draft} />
              <Pressable disabled={!draft.trim()} onPress={sendMessage} style={[styles.sendButton, !draft.trim() && styles.disabled]}><Text style={styles.sendText}>전송</Text></Pressable>
            </View>
          </Card>
        ) : (
          <View style={styles.emptyChat}><Text style={styles.emptyTitle}>대화를 선택해 주세요</Text><Text style={styles.emptyBody}>친구와 나눈 디엠을 한 곳에서 확인할 수 있어요.</Text></View>
        )}
      </View>
    </KeyboardAvoidingView>
  );
}

const styles = StyleSheet.create({
  safeArea: { flex: 1, backgroundColor: colors.background },
  body: { flex: 1, padding: 16, gap: 12 },
  listPane: { flex: 1 },
  sectionTitle: { color: colors.text, fontSize: 18, fontWeight: "900", marginBottom: 8 },
  listContent: { gap: 6 },
  conversation: { flexDirection: "row", alignItems: "center", gap: 11, padding: 11, borderRadius: 16 },
  conversationSelected: { backgroundColor: colors.primarySoft },
  conversationCopy: { flex: 1, gap: 5 },
  conversationTitleRow: { flexDirection: "row", justifyContent: "space-between", alignItems: "center" },
  nickname: { color: colors.text, fontSize: 14, fontWeight: "900" },
  time: { color: colors.subtle, fontSize: 10 },
  previewRow: { flexDirection: "row", alignItems: "center", gap: 8 },
  preview: { flex: 1, color: colors.muted, fontSize: 12 },
  unread: { minWidth: 20, paddingHorizontal: 6, paddingVertical: 2, borderRadius: 10, backgroundColor: colors.primary, color: colors.surface, fontSize: 10, fontWeight: "900", textAlign: "center" },
  chatPane: { flex: 1, gap: 10, padding: 14 },
  chatHeader: { flexDirection: "row", alignItems: "center", gap: 10, paddingBottom: 8, borderBottomWidth: 1, borderBottomColor: colors.border },
  chatName: { color: colors.text, fontSize: 15, fontWeight: "900" },
  online: { color: colors.online, fontSize: 11, fontWeight: "800", marginTop: 2 },
  offline: { color: colors.muted, fontSize: 11, marginTop: 2 },
  messages: { flexGrow: 1, justifyContent: "flex-end", gap: 10, paddingVertical: 10 },
  mockNotice: { alignSelf: "center", color: colors.subtle, fontSize: 10, marginBottom: 6 },
  messageRow: { alignItems: "flex-start", gap: 3 },
  messageRowMine: { alignItems: "flex-end" },
  bubble: { maxWidth: "78%", paddingHorizontal: 13, paddingVertical: 10, borderRadius: 16 },
  bubbleTheirs: { backgroundColor: colors.primarySoft, borderBottomLeftRadius: 5 },
  bubbleMine: { backgroundColor: colors.primary, borderBottomRightRadius: 5 },
  bubbleText: { color: colors.text, fontSize: 13, lineHeight: 19 },
  bubbleTextMine: { color: colors.surface, fontSize: 13, lineHeight: 19 },
  sentAt: { color: colors.subtle, fontSize: 9 },
  composer: { flexDirection: "row", gap: 8, alignItems: "center", borderTopWidth: 1, borderTopColor: colors.border, paddingTop: 10 },
  input: { flex: 1, minHeight: 44, maxHeight: 100, borderRadius: 14, borderWidth: 1, borderColor: colors.border, backgroundColor: colors.background, paddingHorizontal: 13, color: colors.text },
  sendButton: { minHeight: 44, paddingHorizontal: 14, borderRadius: 14, backgroundColor: colors.primary, alignItems: "center", justifyContent: "center" },
  sendText: { color: colors.surface, fontSize: 12, fontWeight: "900" },
  disabled: { opacity: 0.45 },
  emptyChat: { flex: 1, alignItems: "center", justifyContent: "center", gap: 6 },
  emptyTitle: { color: colors.text, fontSize: 17, fontWeight: "900" },
  emptyBody: { color: colors.muted, fontSize: 12 },
});
