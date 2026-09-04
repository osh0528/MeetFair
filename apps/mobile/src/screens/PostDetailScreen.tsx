import type { MeetingPostCommentSummary, MeetingPostSummary } from "@meetfair/shared";
import { useCallback, useEffect, useState , useMemo} from "react";
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
import type { NativeStackScreenProps } from "@react-navigation/native-stack";
import type { RootStackParamList } from "../../App";
import { Card, ScreenHeader } from "../components/ui";
import { apiRequest } from "../services/api";
import { useSession } from "../services/session";
import { useAppColors } from "../services/theme";


type Props = NativeStackScreenProps<RootStackParamList, "PostDetail">;

type PostDetail = MeetingPostSummary & { comments: MeetingPostCommentSummary[] };
type PostResponse = { post: PostDetail };
type CommentResponse = { comment: MeetingPostCommentSummary };

export function PostDetailScreen({ navigation, route }: Props) {
  const palette = useAppColors();
  const styles = useStyles();
  const { meetingId, postId, postTitle } = route.params;
  const { user } = useSession();

  const [post, setPost] = useState<PostDetail | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState("");
  const [commentContent, setCommentContent] = useState("");
  const [sending, setSending] = useState(false);
  const [deletingCommentId, setDeletingCommentId] = useState<string | null>(null);

  const loadPost = useCallback(async () => {
    setLoading(true);
    setError("");
    try {
      const data = await apiRequest<PostResponse>(`/meetings/${meetingId}/posts/${postId}`);
      setPost(data.post);
    } catch (caught) {
      setError(caught instanceof Error ? caught.message : "게시글을 불러오지 못했습니다.");
    } finally {
      setLoading(false);
    }
  }, [meetingId, postId]);

  useEffect(() => {
    void loadPost();
  }, [loadPost]);

  async function handleAddComment() {
    const trimmed = commentContent.trim();
    if (!trimmed) return;
    if (trimmed.length > 2000) {
      setError("댓글은 2000자 이내여야 합니다.");
      return;
    }
    if (sending) return;
    setSending(true);
    setError("");
    try {
      const data = await apiRequest<CommentResponse>(
        `/meetings/${meetingId}/posts/${postId}/comments`,
        {
          method: "POST",
          body: JSON.stringify({ content: trimmed }),
        },
      );
      setPost((prev) => (prev ? { ...prev, comments: [...prev.comments, data.comment] } : prev));
      setCommentContent("");
    } catch (caught) {
      setError(caught instanceof Error ? caught.message : "댓글을 작성하지 못했습니다.");
    } finally {
      setSending(false);
    }
  }

  async function handleDeleteComment(commentId: string) {
    setDeletingCommentId(commentId);
    setError("");
    try {
      await apiRequest<{ success: true }>(
        `/meetings/${meetingId}/posts/${postId}/comments/${commentId}`,
        { method: "DELETE" },
      );
      setPost((prev) =>
        prev ? { ...prev, comments: prev.comments.filter((c) => c.id !== commentId) } : prev,
      );
    } catch (caught) {
      setError(caught instanceof Error ? caught.message : "댓글을 삭제하지 못했습니다.");
    } finally {
      setDeletingCommentId(null);
    }
  }

  if (loading) {
    return (
      <SafeAreaView style={styles.safeArea}>
        <ScreenHeader title={postTitle} onBack={() => navigation.goBack()} />
        <View style={styles.center}>
          <ActivityIndicator color={palette.primary} />
        </View>
      </SafeAreaView>
    );
  }

  if (!post) {
    return (
      <SafeAreaView style={styles.safeArea}>
        <ScreenHeader title={postTitle} onBack={() => navigation.goBack()} />
        <View style={styles.center}>
          <Text style={styles.meta}>{error || "게시글을 찾을 수 없습니다."}</Text>
        </View>
      </SafeAreaView>
    );
  }

  return (
    <SafeAreaView style={styles.safeArea}>
      <ScreenHeader title={postTitle} onBack={() => navigation.goBack()} />
      {error ? <Text style={styles.error}>{error}</Text> : null}
      <KeyboardAvoidingView
        behavior={Platform.OS === "ios" ? "padding" : undefined}
        keyboardVerticalOffset={80}
        style={styles.container}
      >
        <FlatList
          data={post.comments}
          keyExtractor={(item) => item.id}
          contentContainerStyle={styles.listContent}
          ListHeaderComponent={
            <Card style={styles.postCard}>
              <Text style={styles.postTitle}>{post.title}</Text>
              <Text style={styles.postMeta}>
                {post.authorId} · {new Date(post.createdAt).toLocaleString("ko-KR")}
              </Text>
              <Text style={styles.postContent}>{post.content}</Text>
              <View style={styles.postFooter}>
                <Text style={styles.meta}>댓글 {post.comments.length}개</Text>
              </View>
            </Card>
          }
          ListEmptyComponent={
            <View style={styles.emptyBox}>
              <Text style={styles.meta}>아직 댓글이 없습니다.</Text>
            </View>
          }
          renderItem={({ item }) => (
            <Card style={styles.commentCard}>
              <View style={styles.commentHeader}>
                <Text style={styles.commentAuthor}>{item.authorId}</Text>
                <Text style={styles.time}>{new Date(item.createdAt).toLocaleString("ko-KR")}</Text>
              </View>
              <Text style={styles.commentContent}>{item.content}</Text>
              {item.authorId === user?.id ? (
                <Pressable
                  accessibilityRole="button"
                  onPress={() => void handleDeleteComment(item.id)}
                  disabled={deletingCommentId === item.id}
                  style={styles.deleteButton}
                >
                  <Text style={styles.deleteButtonText}>
                    {deletingCommentId === item.id ? "..." : "삭제"}
                  </Text>
                </Pressable>
              ) : null}
            </Card>
          )}
        />
        <View style={styles.inputRow}>
          <TextInput
            value={commentContent}
            onChangeText={setCommentContent}
            placeholder="댓글 입력"
            placeholderTextColor={palette.subtle}
            style={styles.input}
            maxLength={2000}
            multiline
          />
          <Pressable
            accessibilityRole="button"
            onPress={() => void handleAddComment()}
            disabled={sending || !commentContent.trim()}
            style={[styles.sendButton, (!commentContent.trim() || sending) && styles.sendButtonDisabled]}
          >
            <Text style={styles.sendButtonText}>{sending ? "..." : "전송"}</Text>
          </Pressable>
        </View>
      </KeyboardAvoidingView>
    </SafeAreaView>
  );
}

function useStyles() {
  const palette = useAppColors();
  return useMemo(
    () =>
      StyleSheet.create({
  safeArea: { flex: 1, backgroundColor: palette.background },
  container: { flex: 1 },
  center: { flex: 1, alignItems: "center", justifyContent: "center", padding: 24 },
  error: { color: palette.red, paddingHorizontal: 16, paddingTop: 8, fontSize: 12 },
  meta: { color: palette.subtle, fontSize: 13, textAlign: "center" },
  listContent: { padding: 16, gap: 12, paddingBottom: 8 },
  postCard: { gap: 8, padding: 16 },
  postTitle: { fontSize: 17, fontWeight: "900", color: palette.text },
  postMeta: { fontSize: 12, color: palette.subtle },
  postContent: { fontSize: 14, color: palette.text, lineHeight: 20, marginTop: 4 },
  postFooter: { marginTop: 8, flexDirection: "row", justifyContent: "space-between" },
  emptyBox: { paddingVertical: 24, alignItems: "center" },
  commentCard: { padding: 14, gap: 6 },
  commentHeader: { flexDirection: "row", alignItems: "center", justifyContent: "space-between", gap: 8 },
  commentAuthor: { fontSize: 13, fontWeight: "800", color: palette.text },
  commentContent: { fontSize: 13, color: palette.text, lineHeight: 18 },
  time: { fontSize: 11, color: palette.subtle },
  deleteButton: {
    alignSelf: "flex-start",
    marginTop: 4,
    paddingHorizontal: 10,
    height: 28,
    borderRadius: 10,
    backgroundColor: palette.redSoft,
    alignItems: "center",
    justifyContent: "center",
  },
  deleteButtonText: { color: palette.red, fontSize: 12, fontWeight: "800" },
  inputRow: {
    flexDirection: "row",
    alignItems: "flex-end",
    gap: 8,
    padding: 12,
    borderTopWidth: 1,
    borderTopColor: palette.border,
    backgroundColor: palette.surface,
  },
  input: {
    flex: 1,
    minHeight: 44,
    maxHeight: 100,
    borderWidth: 1,
    borderColor: palette.border,
    borderRadius: 12,
    paddingHorizontal: 12,
    paddingVertical: 10,
    color: palette.text,
    backgroundColor: palette.background,
  },
  sendButton: {
    height: 44,
    paddingHorizontal: 16,
    borderRadius: 12,
    backgroundColor: palette.primary,
    alignItems: "center",
    justifyContent: "center",
  },
  sendButtonDisabled: { opacity: 0.45 },
  sendButtonText: { color: palette.surface, fontWeight: "800" },

      }),
    [palette],
  );
}
