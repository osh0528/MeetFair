import type { MeetingPostSummary } from "@meetfair/shared";
import { useCallback, useEffect, useState , useMemo} from "react";
import {
  ActivityIndicator,
  FlatList,
  Pressable,
  StyleSheet,
  Text,
  TextInput,
  View,
} from "react-native";
import { SafeAreaView } from "react-native-safe-area-context";
import type { NativeStackScreenProps } from "@react-navigation/native-stack";
import type { RootStackParamList } from "../../App";
import { Button, Card, ScreenHeader } from "../components/ui";
import { apiRequest } from "../services/api";
import { useSession } from "../services/session";
import { useAppColors } from "../services/theme";


type Props = NativeStackScreenProps<RootStackParamList, "MeetingBoard">;

type PostsResponse = { posts: MeetingPostSummary[]; nextCursor: string | null };
type PostResponse = { post: MeetingPostSummary };

export function MeetingBoardScreen({ navigation, route }: Props) {
  const palette = useAppColors();
  const styles = useStyles();
  const { meetingId, meetingTitle } = route.params;
  const { user } = useSession();

  const [posts, setPosts] = useState<MeetingPostSummary[]>([]);
  const [nextCursor, setNextCursor] = useState<string | null>(null);
  const [loading, setLoading] = useState(true);
  const [loadingMore, setLoadingMore] = useState(false);
  const [error, setError] = useState("");
  const [showCreate, setShowCreate] = useState(false);
  const [title, setTitle] = useState("");
  const [content, setContent] = useState("");
  const [creating, setCreating] = useState(false);
  const [deletingId, setDeletingId] = useState<string | null>(null);

  const loadPosts = useCallback(
    async (cursor: string | null = null) => {
      const isPaging = Boolean(cursor);
      if (isPaging) setLoadingMore(true);
      else setLoading(true);
      setError("");
      try {
        const params = new URLSearchParams();
        params.set("limit", "20");
        if (cursor) params.set("cursor", cursor);
        const data = await apiRequest<PostsResponse>(
          `/meetings/${meetingId}/posts?${params.toString()}`,
        );
        if (isPaging) {
          setPosts((prev) => [...prev, ...data.posts]);
        } else {
          setPosts(data.posts);
        }
        setNextCursor(data.nextCursor);
      } catch (caught) {
        setError(caught instanceof Error ? caught.message : "게시글을 불러오지 못했습니다.");
      } finally {
        if (isPaging) setLoadingMore(false);
        else setLoading(false);
      }
    },
    [meetingId],
  );

  useEffect(() => {
    void loadPosts(null);
  }, [loadPosts]);

  async function handleCreate() {
    const trimmedTitle = title.trim();
    const trimmedContent = content.trim();
    if (!trimmedTitle || !trimmedContent) {
      setError("제목과 내용을 입력해 주세요.");
      return;
    }
    if (trimmedTitle.length > 100) {
      setError("제목은 100자 이내여야 합니다.");
      return;
    }
    if (trimmedContent.length > 5000) {
      setError("내용은 5000자 이내여야 합니다.");
      return;
    }
    setCreating(true);
    setError("");
    try {
      const data = await apiRequest<PostResponse>(`/meetings/${meetingId}/posts`, {
        method: "POST",
        body: JSON.stringify({ title: trimmedTitle, content: trimmedContent }),
      });
      setPosts((prev) => [data.post, ...prev]);
      setTitle("");
      setContent("");
      setShowCreate(false);
    } catch (caught) {
      setError(caught instanceof Error ? caught.message : "게시글을 작성하지 못했습니다.");
    } finally {
      setCreating(false);
    }
  }

  async function handleDelete(postId: string) {
    setDeletingId(postId);
    setError("");
    try {
      await apiRequest<{ success: true }>(`/meetings/${meetingId}/posts/${postId}`, {
        method: "DELETE",
      });
      setPosts((prev) => prev.filter((p) => p.id !== postId));
    } catch (caught) {
      setError(caught instanceof Error ? caught.message : "게시글을 삭제하지 못했습니다.");
    } finally {
      setDeletingId(null);
    }
  }

  function handleRefresh() {
    void loadPosts(null);
  }

  function handleLoadMore() {
    if (nextCursor && !loadingMore && !loading) void loadPosts(nextCursor);
  }

  return (
    <SafeAreaView style={styles.safeArea}>
      <ScreenHeader
        title={meetingTitle ?? "모임 게시판"}
        onBack={() => navigation.goBack()}
        right={
          <Pressable
            accessibilityRole="button"
            onPress={() => setShowCreate((prev) => !prev)}
            style={styles.headerButton}
          >
            <Text style={styles.headerButtonText}>{showCreate ? "닫기" : "글 작성"}</Text>
          </Pressable>
        }
      />
      {error ? <Text style={styles.error}>{error}</Text> : null}
      {showCreate ? (
        <View style={styles.createBox}>
          <Card style={styles.createCard}>
            <Text style={styles.createLabel}>제목</Text>
            <TextInput
              value={title}
              onChangeText={setTitle}
              placeholder="제목"
              placeholderTextColor={palette.subtle}
              style={styles.titleInput}
              maxLength={100}
            />
            <Text style={styles.createLabel}>내용</Text>
            <TextInput
              value={content}
              onChangeText={setContent}
              placeholder="내용"
              placeholderTextColor={palette.subtle}
              style={styles.contentInput}
              maxLength={5000}
              multiline
              textAlignVertical="top"
            />
            <View style={styles.createActions}>
              <Button
                label={creating ? "작성 중..." : "글 작성"}
                onPress={() => void handleCreate()}
                disabled={creating || !title.trim() || !content.trim()}
              />
              <Button
                label="취소"
                variant="secondary"
                onPress={() => {
                  setShowCreate(false);
                  setTitle("");
                  setContent("");
                }}
              />
            </View>
          </Card>
        </View>
      ) : null}
      {loading ? (
        <View style={styles.center}>
          <ActivityIndicator color={palette.primary} />
        </View>
      ) : (
        <FlatList
          data={posts}
          keyExtractor={(item) => item.id}
          contentContainerStyle={styles.listContent}
          onRefresh={handleRefresh}
          refreshing={loading}
          onEndReached={handleLoadMore}
          onEndReachedThreshold={0.5}
          ListEmptyComponent={
            <View style={styles.center}>
              <Text style={styles.meta}>아직 게시글이 없습니다. 첫 글을 작성해보세요.</Text>
            </View>
          }
          ListFooterComponent={
            loadingMore ? (
              <View style={styles.footerLoading}>
                <ActivityIndicator color={palette.primary} />
              </View>
            ) : null
          }
          renderItem={({ item }) => (
            <Pressable
              onPress={() =>
                navigation.navigate("PostDetail", {
                  meetingId,
                  postId: item.id,
                  postTitle: item.title,
                })
              }
            >
              <Card style={styles.card}>
                <View style={styles.cardHeader}>
                  <Text numberOfLines={1} style={styles.cardTitle}>
                    {item.title}
                  </Text>
                  {item.authorId === user?.id ? (
                    <Pressable
                      accessibilityRole="button"
                      onPress={() => void handleDelete(item.id)}
                      disabled={deletingId === item.id}
                      style={styles.deleteButton}
                    >
                      <Text style={styles.deleteButtonText}>
                        {deletingId === item.id ? "..." : "삭제"}
                      </Text>
                    </Pressable>
                  ) : null}
                </View>
                <Text numberOfLines={2} style={styles.preview}>
                  {item.content}
                </Text>
                <View style={styles.cardFooter}>
                  <Text style={styles.meta}>댓글 {item.commentCount ?? 0}개</Text>
                  <Text style={styles.time}>{new Date(item.createdAt).toLocaleString("ko-KR")}</Text>
                </View>
              </Card>
            </Pressable>
          )}
        />
      )}
    </SafeAreaView>
  );
}

function useStyles() {
  const palette = useAppColors();
  return useMemo(
    () =>
      StyleSheet.create({
  safeArea: { flex: 1, backgroundColor: palette.background },
  center: { flex: 1, alignItems: "center", justifyContent: "center", padding: 24 },
  error: { color: palette.red, paddingHorizontal: 16, paddingTop: 8, fontSize: 12 },
  meta: { color: palette.subtle, fontSize: 13, textAlign: "center" },
  headerButton: {
    paddingHorizontal: 14,
    height: 36,
    borderRadius: 12,
    backgroundColor: palette.primary,
    alignItems: "center",
    justifyContent: "center",
  },
  headerButtonText: { color: palette.surface, fontSize: 13, fontWeight: "800" },
  createBox: { paddingHorizontal: 16, paddingTop: 8 },
  createCard: { gap: 10, padding: 16 },
  createLabel: { color: palette.text, fontSize: 13, fontWeight: "800" },
  titleInput: {
    height: 44,
    borderRadius: 12,
    borderWidth: 1,
    borderColor: palette.border,
    backgroundColor: palette.surface,
    color: palette.text,
    paddingHorizontal: 12,
  },
  contentInput: {
    minHeight: 90,
    maxHeight: 140,
    borderRadius: 12,
    borderWidth: 1,
    borderColor: palette.border,
    backgroundColor: palette.surface,
    color: palette.text,
    paddingHorizontal: 12,
    paddingVertical: 10,
  },
  createActions: { flexDirection: "row", gap: 8, marginTop: 4 },
  listContent: { padding: 16, gap: 12 },
  card: { padding: 14, gap: 8 },
  cardHeader: { flexDirection: "row", alignItems: "center", justifyContent: "space-between", gap: 12 },
  cardTitle: { flex: 1, fontSize: 15, fontWeight: "800", color: palette.text },
  preview: { fontSize: 13, color: palette.muted, lineHeight: 18 },
  cardFooter: { flexDirection: "row", alignItems: "center", justifyContent: "space-between", marginTop: 4 },
  time: { fontSize: 11, color: palette.subtle },
  deleteButton: {
    paddingHorizontal: 10,
    height: 30,
    borderRadius: 10,
    backgroundColor: palette.redSoft,
    alignItems: "center",
    justifyContent: "center",
  },
  deleteButtonText: { color: palette.red, fontSize: 12, fontWeight: "800" },
  footerLoading: { paddingVertical: 16, alignItems: "center" },

      }),
    [palette],
  );
}
