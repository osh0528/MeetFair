import { useFocusEffect } from "@react-navigation/native";
import type { NativeStackScreenProps } from "@react-navigation/native-stack";
import { useCallback, useEffect, useRef, useState } from "react";
import {
  ActivityIndicator,
  FlatList,
  KeyboardAvoidingView,
  Platform,
  Pressable,
  StyleSheet,
  Text,
  TextInput,
  View,
} from "react-native";
import { SafeAreaView } from "react-native-safe-area-context";
import type { RootStackParamList } from "../../App";
import { Card, ScreenHeader } from "../components/ui";
import { apiRequest, createClientRequestId } from "../services/api";
import { useSession } from "../services/session";
import { createMeetingSocket } from "../services/socket";
import { colors } from "../theme/colors";
import type { MeetingChatMessageSummary } from "@meetfair/shared";

type Props = NativeStackScreenProps<RootStackParamList, "MeetingChat">;

type MessagesResponse = { messages: MeetingChatMessageSummary[]; nextCursor: string | null };
type MessageResponse = { message: MeetingChatMessageSummary };

export function MeetingChatScreen({ navigation, route }: Props) {
  const { meetingId, meetingTitle } = route.params;
  const { accessToken, user } = useSession();

  const [messages, setMessages] = useState<MeetingChatMessageSummary[]>([]);
  const [messagesLoading, setMessagesLoading] = useState(false);
  const [nextCursor, setNextCursor] = useState<string | null>(null);
  const [content, setContent] = useState("");
  const [sending, setSending] = useState(false);
  const [error, setError] = useState("");
  const listRef = useRef<FlatList<MeetingChatMessageSummary>>(null);

  const loadMessages = useCallback(
    async (targetMeetingId: string, cursor?: string | null) => {
      if (!cursor) setMessagesLoading(true);
      try {
        const params = new URLSearchParams();
        params.set("limit", "20");
        if (cursor) params.set("cursor", cursor);
        const data = await apiRequest<MessagesResponse>(
          `/meetings/${targetMeetingId}/chat/messages?${params.toString()}`,
        );
        if (cursor) {
          setMessages((prev) => [...prev, ...data.messages]);
        } else {
          setMessages(data.messages);
        }
        setNextCursor(data.nextCursor);
      } catch (caught) {
        setError(caught instanceof Error ? caught.message : "메시지를 불러오지 못했습니다.");
      } finally {
        setMessagesLoading(false);
      }
    },
    [],
  );

  useFocusEffect(
    useCallback(() => {
      void loadMessages(meetingId, null);
    }, [meetingId, loadMessages]),
  );

  useEffect(() => {
    if (!accessToken) return;
    const socket = createMeetingSocket(accessToken);
    socket.on("meeting:chat:received", (payload: { message: MeetingChatMessageSummary }) => {
      const msg = payload.message;
      if (msg.meetingId !== meetingId) return;
      setMessages((prev) => {
        if (prev.some((m) => m.id === msg.id)) return prev;
        return [msg, ...prev];
      });
    });
    socket.connect();
    return () => {
      socket.disconnect();
    };
  }, [accessToken, meetingId]);

  async function handleSend() {
    const trimmed = content.trim();
    if (!trimmed || sending) return;
    if (trimmed.length > 2000) {
      setError("메시지는 2000자 이내여야 합니다.");
      return;
    }
    setSending(true);
    setError("");
    const clientMessageId = createClientRequestId();
    try {
      const data = await apiRequest<MessageResponse>(`/meetings/${meetingId}/chat/messages`, {
        method: "POST",
        body: JSON.stringify({ content: trimmed, clientMessageId }),
      });
      setMessages((prev) => {
        if (prev.some((m) => m.id === data.message.id)) return prev;
        return [data.message, ...prev];
      });
      setContent("");
    } catch (caught) {
      setError(caught instanceof Error ? caught.message : "메시지를 보내지 못했습니다.");
    } finally {
      setSending(false);
    }
  }

  return (
    <SafeAreaView style={styles.safeArea}>
      <ScreenHeader title={meetingTitle ?? "모임 채팅"} onBack={() => navigation.goBack()} />
      {error ? <Text style={styles.error}>{error}</Text> : null}
      {messagesLoading && !messages.length ? (
        <View style={styles.center}>
          <ActivityIndicator />
        </View>
      ) : (
        <KeyboardAvoidingView
          behavior={Platform.OS === "ios" ? "padding" : undefined}
          keyboardVerticalOffset={80}
          style={styles.threadContainer}
        >
          <FlatList
            ref={listRef}
            data={messages}
            inverted
            keyExtractor={(item) => item.id}
            contentContainerStyle={styles.messagesContent}
            onEndReached={() => {
              if (nextCursor && !messagesLoading) void loadMessages(meetingId, nextCursor);
            }}
            onEndReachedThreshold={0.5}
            ListEmptyComponent={
              <View style={styles.center}>
                <Text style={styles.meta}>아직 메시지가 없습니다. 첫 메시지를 보내보세요.</Text>
              </View>
            }
            renderItem={({ item }) => {
              const isMe = item.senderId === user?.id;
              const timeLabel = new Date(item.createdAt).toLocaleTimeString("ko-KR", {
                hour: "2-digit",
                minute: "2-digit",
              });
              return (
                <View style={[styles.bubbleRow, isMe ? styles.bubbleRowMe : styles.bubbleRowOther]}>
                  <View style={[styles.bubble, isMe ? styles.bubbleMe : styles.bubbleOther]}>
                    <Text style={[styles.bubbleText, isMe ? styles.bubbleTextMe : styles.bubbleTextOther]}>
                      {item.content}
                    </Text>
                    <Text style={styles.bubbleTime}>
                      {isMe ? timeLabel : `${timeLabel} · ${item.senderId.slice(0, 8)}`}
                    </Text>
                  </View>
                </View>
              );
            }}
          />
          <View style={styles.inputRow}>
            <TextInput
              value={content}
              onChangeText={setContent}
              placeholder="메시지 입력"
              placeholderTextColor={colors.subtle}
              style={styles.input}
              maxLength={2000}
              multiline
            />
            <Pressable
              accessibilityRole="button"
              onPress={() => void handleSend()}
              disabled={sending || !content.trim()}
              style={[styles.sendButton, (!content.trim() || sending) && styles.sendButtonDisabled]}
            >
              <Text style={styles.sendButtonText}>{sending ? "..." : "전송"}</Text>
            </Pressable>
          </View>
        </KeyboardAvoidingView>
      )}
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  safeArea: { flex: 1, backgroundColor: colors.background },
  center: { flex: 1, alignItems: "center", justifyContent: "center", padding: 24 },
  error: { color: colors.red, paddingHorizontal: 16, paddingTop: 8 },
  meta: { color: colors.subtle, fontSize: 14, textAlign: "center" },
  threadContainer: { flex: 1 },
  messagesContent: { padding: 16, gap: 8 },
  bubbleRow: { flexDirection: "row", marginVertical: 4 },
  bubbleRowMe: { justifyContent: "flex-end" },
  bubbleRowOther: { justifyContent: "flex-start" },
  bubble: { maxWidth: "78%", borderRadius: 16, paddingHorizontal: 12, paddingVertical: 8, gap: 4 },
  bubbleMe: { backgroundColor: colors.primary },
  bubbleOther: { backgroundColor: colors.surface, borderWidth: 1, borderColor: colors.border },
  bubbleText: { fontSize: 14, lineHeight: 18 },
  bubbleTextMe: { color: colors.surface },
  bubbleTextOther: { color: colors.text },
  bubbleTime: { fontSize: 10, color: colors.subtle },
  inputRow: {
    flexDirection: "row",
    alignItems: "flex-end",
    gap: 8,
    padding: 12,
    borderTopWidth: 1,
    borderTopColor: colors.border,
    backgroundColor: colors.surface,
  },
  input: {
    flex: 1,
    minHeight: 44,
    maxHeight: 100,
    borderWidth: 1,
    borderColor: colors.border,
    borderRadius: 12,
    paddingHorizontal: 12,
    paddingVertical: 10,
    color: colors.text,
    backgroundColor: colors.background,
  },
  sendButton: {
    height: 44,
    paddingHorizontal: 16,
    borderRadius: 12,
    backgroundColor: colors.primary,
    alignItems: "center",
    justifyContent: "center",
  },
  sendButtonDisabled: { opacity: 0.45 },
  sendButtonText: { color: colors.surface, fontWeight: "800" },
});
