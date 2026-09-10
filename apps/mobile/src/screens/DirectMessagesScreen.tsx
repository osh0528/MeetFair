import { useFocusEffect } from "@react-navigation/native";
import type { NativeStackScreenProps } from "@react-navigation/native-stack";
import { useCallback, useEffect, useRef, useState, useMemo } from "react";
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
import { Avatar, Card, ScreenHeader } from "../components/ui";
import { apiRequest, createClientRequestId } from "../services/api";
import {
  clearActiveDirectConversationId,
  setActiveDirectConversationId,
} from "../services/active-direct-conversation";
import { useSession } from "../services/session";
import { createMeetingSocket } from "../services/socket";
import { useAppColors, type Palette } from "../services/theme";
import type {
  DirectConversationSummary,
  DirectMessageSummary,
} from "@meetfair/shared";

type Props = NativeStackScreenProps<RootStackParamList, "DirectMessages">;

type ConversationsResponse = { conversations: DirectConversationSummary[] };
type MessagesResponse = { messages: DirectMessageSummary[]; nextCursor: string | null };
type ConversationResponse = { conversation: DirectConversationSummary };
type MessageResponse = { message: DirectMessageSummary };

export function DirectMessagesScreen({ navigation, route }: Props) {
  const palette = useAppColors();
  const styles = useMemo(() => makeStyles(palette), [palette]);
  const { accessToken, user } = useSession();
  const initialConversationId = route.params?.conversationId ?? null;
  const initialFriendUserId = route.params?.friendUserId ?? null;

  const [conversations, setConversations] = useState<DirectConversationSummary[]>([]);
  const [conversationsLoading, setConversationsLoading] = useState(true);
  const [selectedId, setSelectedId] = useState<string | null>(initialConversationId);
  const [messages, setMessages] = useState<DirectMessageSummary[]>([]);
  const [messagesLoading, setMessagesLoading] = useState(false);
  const [nextCursor, setNextCursor] = useState<string | null>(null);
  const [content, setContent] = useState("");
  const [conversationQuery, setConversationQuery] = useState("");
  const [sending, setSending] = useState(false);
  const [error, setError] = useState("");
  const [initializing, setInitializing] = useState(Boolean(initialFriendUserId));
  const listRef = useRef<FlatList<DirectMessageSummary>>(null);
  const selectedIdRef = useRef(selectedId);
  const messageRequestRef = useRef(0);
  const messagesInFlightRef = useRef<number | null>(null);
  const sendingRef = useRef(false);
  selectedIdRef.current = selectedId;

  const loadConversations = useCallback(async () => {
    try {
      const data = await apiRequest<ConversationsResponse>("/direct-messages/conversations");
      setConversations(data.conversations);
    } catch (caught) {
      setError(caught instanceof Error ? caught.message : "대화 목록을 불러오지 못했습니다.");
    } finally {
      setConversationsLoading(false);
    }
  }, []);

  const loadMessages = useCallback(
    async (conversationId: string, cursor?: string | null) => {
      if (cursor && messagesInFlightRef.current !== null) return;
      const requestId = ++messageRequestRef.current;
      messagesInFlightRef.current = requestId;
      const isCurrent = () => selectedIdRef.current === conversationId && messageRequestRef.current === requestId;
      setMessagesLoading(true);
      try {
        const params = new URLSearchParams();
        params.set("limit", "20");
        if (cursor) params.set("cursor", cursor);
        const data = await apiRequest<MessagesResponse>(
          `/direct-messages/${conversationId}/messages?${params.toString()}`,
        );
        if (!isCurrent()) return;
        setMessages((prev) => Array.from(new Map([...prev, ...data.messages].map((message) => [message.id, message])).values())
          .sort((a, b) => Date.parse(b.createdAt) - Date.parse(a.createdAt)));
        setNextCursor(data.nextCursor);
        const unread = data.messages.filter((m) => m.senderId !== user?.id && !m.readAt);
        const readIds = new Set<string>();
        for (const m of unread) {
          if (!isCurrent()) return;
          try {
            await apiRequest(`/direct-messages/${conversationId}/read`, {
              method: "PATCH",
              body: JSON.stringify({ messageId: m.id }),
            });
            readIds.add(m.id);
          } catch {}
        }
        if (readIds.size && isCurrent()) {
          const now = new Date().toISOString();
          setMessages((prev) =>
            prev.map((m) =>
              readIds.has(m.id) ? { ...m, readAt: now } : m,
            ),
          );
        }
      } catch (caught) {
        if (!isCurrent()) return;
        setError(caught instanceof Error ? caught.message : "메시지를 불러오지 못했습니다.");
      } finally {
        if (messagesInFlightRef.current === requestId) messagesInFlightRef.current = null;
        if (isCurrent()) setMessagesLoading(false);
      }
    },
    [user?.id],
  );

  useFocusEffect(
    useCallback(() => {
      void loadConversations();
    }, [loadConversations]),
  );

  useFocusEffect(
    useCallback(() => {
      setActiveDirectConversationId(selectedId);
      return () => clearActiveDirectConversationId(selectedId);
    }, [selectedId]),
  );

  useEffect(() => {
    if (!initialFriendUserId) {
      setInitializing(false);
      return;
    }
    let active = true;
    setInitializing(true);
    async function ensure() {
      try {
        const data = await apiRequest<ConversationResponse>("/direct-messages/conversations", {
          method: "POST",
          body: JSON.stringify({ friendId: initialFriendUserId }),
        });
        if (!active) return;
        setSelectedId(data.conversation.id);
        void loadConversations();
      } catch (caught) {
        if (!active) return;
        setError(caught instanceof Error ? caught.message : "대화를 시작하지 못했습니다.");
      } finally {
        if (active) setInitializing(false);
      }
    }
    void ensure();
    return () => {
      active = false;
    };
  }, [initialFriendUserId, loadConversations]);

  useEffect(() => {
    if (route.params?.conversationId) setSelectedId(route.params.conversationId);
  }, [route.params?.conversationId]);

  useEffect(() => {
    setMessages([]);
    setNextCursor(null);
    setContent("");
    setError("");
    if (selectedId) void loadMessages(selectedId, null);
    return () => {
      messageRequestRef.current += 1;
      messagesInFlightRef.current = null;
    };
  }, [selectedId, loadMessages]);

  useEffect(() => {
    if (!accessToken) return;
    const socket = createMeetingSocket(accessToken);
    socket.on("direct-message:received", (payload: { message: DirectMessageSummary }) => {
      const msg = payload.message;
      if (msg.conversationId === selectedId) {
        setMessages((prev) => {
          if (prev.some((m) => m.id === msg.id)) return prev;
          return [msg, ...prev];
        });
        if (msg.senderId !== user?.id) {
          void apiRequest(`/direct-messages/${msg.conversationId}/read`, {
            method: "PATCH",
            body: JSON.stringify({ messageId: msg.id }),
          }).then(() => {
            if (selectedIdRef.current !== msg.conversationId) return;
            setMessages((prev) => prev.map((message) => message.id === msg.id
              ? { ...message, readAt: new Date().toISOString() }
              : message));
          }).catch(() => undefined);
        }
      }
      setConversations((prev) => {
        const idx = prev.findIndex((c) => c.id === msg.conversationId);
        if (idx === -1) {
          void loadConversations();
          return prev;
        }
        const conv = prev[idx];
        if (!conv) return prev;
        if (conv.lastMessage?.id === msg.id) return prev;
        const isCurrent = msg.conversationId === selectedId;
        const next: DirectConversationSummary = {
          ...conv,
          lastMessage: msg,
          unreadCount: isCurrent ? conv.unreadCount : conv.unreadCount + (msg.senderId === user?.id ? 0 : 1),
          updatedAt: msg.createdAt,
        };
        const rest = prev.filter((c) => c.id !== msg.conversationId);
        return [next, ...rest];
      });
    });
    socket.on("direct-message:read", (payload: { conversationId: string; messageId: string; readAt: string }) => {
      setMessages((prev) =>
        prev.map((m) => (m.id === payload.messageId ? { ...m, readAt: payload.readAt } : m)),
      );
      setConversations((prev) =>
        prev.map((c) =>
          c.lastMessage?.id === payload.messageId ? { ...c, lastMessage: { ...c.lastMessage, readAt: payload.readAt } } : c,
        ),
      );
    });
    socket.connect();
    return () => {
      socket.disconnect();
    };
  }, [accessToken, selectedId, user?.id, loadConversations]);

  async function handleSend() {
    const trimmed = content.trim();
    if (!trimmed || !selectedId || sendingRef.current) return;
    if (trimmed.length > 2000) {
      setError("메시지는 2000자 이내여야 합니다.");
      return;
    }
    sendingRef.current = true;
    setSending(true);
    setError("");
    const clientMessageId = createClientRequestId();
    try {
      const data = await apiRequest<MessageResponse>(`/direct-messages/${selectedId}/messages`, {
        method: "POST",
        body: JSON.stringify({ content: trimmed, clientMessageId }),
      });
      if (selectedIdRef.current === selectedId) {
        setMessages((prev) => prev.some((message) => message.id === data.message.id) ? prev : [data.message, ...prev]);
        setContent((current) => current === content ? "" : current);
      }
      setConversations((prev) => {
        const idx = prev.findIndex((c) => c.id === selectedId);
        if (idx === -1) return prev;
        const conv = prev[idx];
        if (!conv) return prev;
        const next: DirectConversationSummary = {
          ...conv,
          lastMessage: data.message,
          updatedAt: data.message.createdAt,
        };
        const rest = prev.filter((c) => c.id !== selectedId);
        return [next, ...rest];
      });
    } catch (caught) {
      if (selectedIdRef.current === selectedId) setError(caught instanceof Error ? caught.message : "메시지를 보내지 못했습니다.");
    } finally {
      sendingRef.current = false;
      setSending(false);
    }
  }

  function handleSelect(conversationId: string) {
    setSelectedId(conversationId);
    setConversations((prev) =>
      prev.map((c) => (c.id === conversationId ? { ...c, unreadCount: 0 } : c)),
    );
  }

  function handleBack() {
    if (selectedId && !initialConversationId && !initialFriendUserId) {
      setSelectedId(null);
      return;
    }
    navigation.goBack();
  }

  const filteredConversations = conversations.filter((conversation) => {
    const query = conversationQuery.trim().toLowerCase();
    if (!query) return true;
    return conversation.friend.nickname.toLowerCase().includes(query)
      || conversation.friend.accountId.toLowerCase().includes(query);
  });

  if (initializing) {
    return (
      <SafeAreaView style={styles.safeArea}>
        <ScreenHeader title="다이렉트 메시지" onBack={handleBack} />
        <View style={styles.center}>
          <ActivityIndicator />
        </View>
      </SafeAreaView>
    );
  }

  if (selectedId) {
    const currentConv = conversations.find((c) => c.id === selectedId);
    return (
      <SafeAreaView style={styles.safeArea}>
        <ScreenHeader title={currentConv?.friend.nickname ?? "대화"} onBack={handleBack} />
        {currentConv ? (
          <View style={styles.threadHeader}>
            <Avatar name={currentConv.friend.nickname} size={42} />
            <View style={styles.threadHeaderCopy}>
              <Text style={styles.threadHeaderName}>{currentConv.friend.nickname}</Text>
              <Text style={styles.threadHeaderAccount}>@{currentConv.friend.accountId}</Text>
            </View>
          </View>
        ) : null}
        {error ? <Text style={styles.error}>{error}</Text> : null}
        {messagesLoading && !messages.length ? (
          <View style={styles.center}>
            <ActivityIndicator />
          </View>
        ) : (
          <KeyboardAvoidingView
            behavior={Platform.OS === "ios" ? "padding" : "height"}
            keyboardVerticalOffset={Platform.OS === "ios" ? 80 : 0}
            style={styles.threadContainer}
          >
            <FlatList
              ref={listRef}
              data={messages}
              inverted
              keyExtractor={(item) => item.id}
              contentContainerStyle={styles.messagesContent}
              keyboardShouldPersistTaps="handled"
              onEndReached={() => {
                if (nextCursor && !messagesLoading) void loadMessages(selectedId, nextCursor);
              }}
              onEndReachedThreshold={0.5}
              ListEmptyComponent={
                <View style={styles.center}>
                  <Text style={styles.meta}>아직 메시지가 없습니다. 첫 메시지를 보내보세요.</Text>
                </View>
              }
              renderItem={({ item }) => {
                const isMe = item.senderId === user?.id;
                return (
                  <View style={[styles.bubbleRow, isMe ? styles.bubbleRowMe : styles.bubbleRowOther]}>
                    <View style={[styles.bubble, isMe ? styles.bubbleMe : styles.bubbleOther]}>
                      <Text style={[styles.bubbleText, isMe ? styles.bubbleTextMe : styles.bubbleTextOther]}>
                        {item.content}
                      </Text>
                      <Text style={styles.bubbleTime}>{new Date(item.createdAt).toLocaleTimeString("ko-KR", { hour: "2-digit", minute: "2-digit" })}{item.readAt ? " · 읽음" : ""}</Text>
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
                placeholderTextColor={palette.subtle}
                style={styles.input}
                maxLength={2000}
                multiline={Platform.OS !== "web"}
                onSubmitEditing={() => void handleSend()}
                returnKeyType="send"
                blurOnSubmit={false}
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

  return (
    <SafeAreaView style={styles.safeArea}>
      <ScreenHeader title="다이렉트 메시지" onBack={handleBack} />
      {error ? <Text style={styles.error}>{error}</Text> : null}
      <View style={styles.searchBox}>
        <TextInput
          autoCapitalize="none"
          onChangeText={setConversationQuery}
          placeholder="친구 이름 또는 ID 검색"
          placeholderTextColor={palette.subtle}
          style={styles.searchInput}
          value={conversationQuery}
        />
      </View>
      {conversationsLoading ? (
        <View style={styles.center}>
          <ActivityIndicator />
        </View>
      ) : conversations.length === 0 ? (
        <View style={styles.center}>
          <Text style={styles.meta}>친구와 대화를 시작해보세요.</Text>
        </View>
      ) : filteredConversations.length === 0 ? (
        <View style={styles.center}>
          <Text style={styles.meta}>검색 결과가 없습니다.</Text>
        </View>
      ) : (
        <FlatList
          data={filteredConversations}
          keyExtractor={(item) => item.id}
          contentContainerStyle={styles.listContent}
          renderItem={({ item }) => (
            <Pressable onPress={() => handleSelect(item.id)}>
              <Card style={styles.card}>
                <View style={styles.row}>
                  <View style={styles.cardMain}>
                    <View style={styles.nameRow}>
                      <Text style={styles.cardTitle}>{item.friend.nickname}</Text>
                      <Text style={styles.accountId}>@{item.friend.accountId}</Text>
                    </View>
                    <Text numberOfLines={1} style={styles.preview}>
                      {item.lastMessage ? item.lastMessage.content : "아직 메시지가 없습니다."}
                    </Text>
                    <Text style={styles.time}>{new Date(item.updatedAt).toLocaleString("ko-KR")}</Text>
                  </View>
                  {item.unreadCount > 0 ? (
                    <View style={styles.badge}>
                      <Text style={styles.badgeText}>{item.unreadCount > 99 ? "99+" : String(item.unreadCount)}</Text>
                    </View>
                  ) : null}
                </View>
              </Card>
            </Pressable>
          )}
        />
      )}
    </SafeAreaView>
  );
}

function makeStyles(palette: Palette) {
  return StyleSheet.create({
  safeArea: { flex: 1, backgroundColor: palette.background },
  center: { flex: 1, alignItems: "center", justifyContent: "center", padding: 24 },
  error: { color: palette.red, paddingHorizontal: 16, paddingTop: 8 },
  meta: { color: palette.subtle, fontSize: 14, textAlign: "center" },
  listContent: { padding: 16, gap: 12 },
  card: { padding: 14 },
  row: { flexDirection: "row", alignItems: "center", justifyContent: "space-between", gap: 12 },
  cardMain: { flex: 1, gap: 4 },
  nameRow: { flexDirection: "row", alignItems: "center", gap: 6 },
  cardTitle: { fontSize: 15, fontWeight: "800", color: palette.text },
  accountId: { fontSize: 13, color: palette.subtle },
  preview: { fontSize: 13, color: palette.subtle },
  time: { fontSize: 11, color: palette.subtle },
  badge: { minWidth: 22, height: 22, borderRadius: 11, backgroundColor: palette.primary, alignItems: "center", justifyContent: "center", paddingHorizontal: 6 },
  badgeText: { color: palette.surface, fontSize: 12, fontWeight: "800" },
  threadContainer: { flex: 1 },
  threadHeader: { flexDirection: "row", alignItems: "center", gap: 11, paddingHorizontal: 18, paddingVertical: 12, borderBottomWidth: 1, borderBottomColor: palette.border, backgroundColor: palette.surface },
  threadHeaderCopy: { gap: 2 },
  threadHeaderName: { color: palette.text, fontSize: 15, fontWeight: "900" },
  threadHeaderAccount: { color: palette.subtle, fontSize: 11 },
  searchBox: { marginHorizontal: 16, marginTop: 8, marginBottom: 4 },
  searchInput: { height: 46, borderRadius: 6, borderWidth: 1, borderColor: palette.border, backgroundColor: palette.surface, color: palette.text, paddingHorizontal: 14 },
  messagesContent: { padding: 16, gap: 8 },
  bubbleRow: { flexDirection: "row", marginVertical: 4 },
  bubbleRowMe: { justifyContent: "flex-end" },
  bubbleRowOther: { justifyContent: "flex-start" },
  bubble: { maxWidth: "78%", borderRadius: 6, paddingHorizontal: 12, paddingVertical: 8, gap: 4 },
  bubbleMe: { backgroundColor: palette.primary },
  bubbleOther: { backgroundColor: palette.surface, borderWidth: 1, borderColor: palette.border },
  bubbleText: { fontSize: 14, lineHeight: 18 },
  bubbleTextMe: { color: palette.surface },
  bubbleTextOther: { color: palette.text },
  bubbleTime: { fontSize: 10, color: palette.subtle },
  inputRow: { flexDirection: "row", alignItems: "flex-end", gap: 8, padding: 12, borderTopWidth: 1, borderTopColor: palette.border, backgroundColor: palette.surface },
  input: { flex: 1, minHeight: 44, maxHeight: 100, borderWidth: 1, borderColor: palette.border, borderRadius: 6, paddingHorizontal: 12, paddingVertical: 10, color: palette.text, backgroundColor: palette.background },
  sendButton: { height: 44, paddingHorizontal: 16, borderRadius: 6, backgroundColor: palette.primary, alignItems: "center", justifyContent: "center" },
  sendButtonDisabled: { opacity: 0.45 },
  sendButtonText: { color: palette.surface, fontWeight: "800" },
  });
}
