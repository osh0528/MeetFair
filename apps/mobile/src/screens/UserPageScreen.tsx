import type { ProfileTheme, UserPageSummary } from "@meetfair/shared";
import * as DocumentPicker from "expo-document-picker";
import { useAudioPlayer, useAudioPlayerStatus } from "expo-audio";
import { useFocusEffect } from "@react-navigation/native";
import type { NativeStackScreenProps } from "@react-navigation/native-stack";
import { useCallback, useEffect, useState } from "react";
import { ActivityIndicator, Pressable, ScrollView, StyleSheet, Text, TextInput, View } from "react-native";
import { SafeAreaView } from "react-native-safe-area-context";
import type { RootStackParamList } from "../../App";
import { Avatar, Button, Card, ScreenHeader, SectionHeading } from "../components/ui";
import { apiRequest } from "../services/api";
import { avatarUrl } from "../services/avatar";
import { profileMusicUrl } from "../services/profileMusic";
import { useSession } from "../services/session";
import { colors } from "../theme/colors";

type Props = NativeStackScreenProps<RootStackParamList, "UserPage">;

const themes: Record<ProfileTheme, { label: string; background: string; accent: string; soft: string }> = {
  PURPLE: { label: "보라", background: "#F1EEFF", accent: "#6657E8", soft: "#E4DFFF" },
  PINK: { label: "분홍", background: "#FFF0F5", accent: "#D85B88", soft: "#FFDCE8" },
  BLUE: { label: "파랑", background: "#EAF4FF", accent: "#397FD8", soft: "#D4E9FF" },
  MINT: { label: "민트", background: "#E8F8F2", accent: "#168866", soft: "#D2F1E5" },
  SUNSET: { label: "노을", background: "#FFF2E5", accent: "#D96F31", soft: "#FFE1C4" },
};

export function UserPageScreen({ navigation, route }: Props) {
  const { user } = useSession();
  const [page, setPage] = useState<UserPageSummary | null>(null);
  const [loading, setLoading] = useState(true);
  const [busy, setBusy] = useState(false);
  const [editing, setEditing] = useState(false);
  const [message, setMessage] = useState("");
  const [guestbookContent, setGuestbookContent] = useState("");
  const [statusMessage, setStatusMessage] = useState("");
  const [bio, setBio] = useState("");
  const [emoji, setEmoji] = useState("🌟");
  const [theme, setTheme] = useState<ProfileTheme>("PURPLE");
  const [musicTitle, setMusicTitle] = useState("");
  const [musicBusy, setMusicBusy] = useState(false);
  const musicSource = page?.hasMusic
    ? profileMusicUrl(page.user.id, page.musicUpdatedAt)
    : null;
  const musicPlayer = useAudioPlayer(musicSource, { updateInterval: 500 });
  const musicStatus = useAudioPlayerStatus(musicPlayer);

  useEffect(() => {
    musicPlayer.loop = true;
  }, [musicPlayer]);

  const applyPage = useCallback((next: UserPageSummary) => {
    setPage(next);
    setStatusMessage(next.statusMessage ?? "");
    setBio(next.bio ?? "");
    setEmoji(next.emoji);
    setTheme(next.theme);
    setMusicTitle(next.musicTitle ?? "");
  }, []);

  const load = useCallback(async () => {
    setLoading(true);
    setMessage("");
    try {
      const data = await apiRequest<{ page: UserPageSummary }>("/users/" + route.params.userId + "/page");
      applyPage(data.page);
    } catch (caught) {
      setMessage(caught instanceof Error ? caught.message : "개인 페이지를 불러오지 못했습니다.");
    } finally {
      setLoading(false);
    }
  }, [applyPage, route.params.userId]);

  useFocusEffect(useCallback(() => {
    void load();
  }, [load]));

  async function savePage() {
    if (!emoji.trim() || busy) return;
    setBusy(true);
    setMessage("");
    try {
      const data = await apiRequest<{ page: UserPageSummary }>("/users/me/page", {
        method: "PATCH",
        body: JSON.stringify({
          statusMessage,
          bio,
          emoji: emoji.trim(),
          theme,
          musicTitle,
        }),
      });
      applyPage(data.page);
      setEditing(false);
      setMessage("미니홈피 꾸미기를 저장했습니다.");
    } catch (caught) {
      setMessage(caught instanceof Error ? caught.message : "꾸미기 설정을 저장하지 못했습니다.");
    } finally {
      setBusy(false);
    }
  }

  async function writeGuestbook() {
    if (!guestbookContent.trim() || busy) return;
    setBusy(true);
    setMessage("");
    try {
      await apiRequest("/users/" + route.params.userId + "/guestbook", {
        method: "POST",
        body: JSON.stringify({ content: guestbookContent }),
      });
      setGuestbookContent("");
      await load();
    } catch (caught) {
      setMessage(caught instanceof Error ? caught.message : "방명록을 등록하지 못했습니다.");
    } finally {
      setBusy(false);
    }
  }

  async function deleteGuestbook(entryId: string) {
    if (busy) return;
    setBusy(true);
    setMessage("");
    try {
      await apiRequest("/users/" + route.params.userId + "/guestbook/" + entryId, { method: "DELETE" });
      setPage((current) => current
        ? { ...current, guestbook: current.guestbook.filter((entry) => entry.id !== entryId) }
        : current);
    } catch (caught) {
      setMessage(caught instanceof Error ? caught.message : "방명록을 삭제하지 못했습니다.");
    } finally {
      setBusy(false);
    }
  }

  function musicMimeType(file: DocumentPicker.DocumentPickerAsset) {
    const mimeType = file.mimeType?.toLowerCase();
    const extension = file.name.split(".").pop()?.toLowerCase();
    if (mimeType === "audio/mpeg" || extension === "mp3") return "audio/mpeg";
    if (mimeType === "audio/mp4" || mimeType === "audio/x-m4a" || extension === "m4a" || extension === "mp4") return "audio/mp4";
    if (mimeType === "audio/wav" || mimeType === "audio/x-wav" || extension === "wav") return "audio/wav";
    if (mimeType === "audio/ogg" || extension === "ogg") return "audio/ogg";
    return null;
  }

  async function chooseMusic() {
    if (!musicTitle.trim() || musicBusy) return;
    setMusicBusy(true);
    setMessage("");
    try {
      musicPlayer.pause();
      const result = await DocumentPicker.getDocumentAsync({
        type: ["audio/mpeg", "audio/mp4", "audio/x-m4a", "audio/wav", "audio/x-wav", "audio/ogg"],
        copyToCacheDirectory: true,
        base64: true,
      });
      if (result.canceled) return;
      const file = result.assets[0];
      if (!file) throw new Error("선택한 음원 파일을 읽지 못했습니다.");
      if (file.size && file.size > 6 * 1024 * 1024) {
        throw new Error("BGM 파일은 6MB 이하만 등록할 수 있습니다.");
      }
      const mimeType = musicMimeType(file);
      if (!mimeType) throw new Error("MP3, M4A, WAV, OGG 파일만 등록할 수 있습니다.");
      const rawBase64 = file.base64?.includes(",") ? file.base64.split(",").pop() : file.base64;
      if (!rawBase64) throw new Error("선택한 음원 파일을 변환하지 못했습니다.");
      const data = await apiRequest<{ page: UserPageSummary }>("/users/me/page-music", {
        method: "PUT",
        body: JSON.stringify({
          fileBase64: rawBase64,
          mimeType,
          title: musicTitle.trim(),
        }),
      });
      applyPage(data.page);
      setMessage("미니홈피 BGM을 등록했습니다.");
    } catch (caught) {
      setMessage(caught instanceof Error ? caught.message : "BGM을 등록하지 못했습니다.");
    } finally {
      setMusicBusy(false);
    }
  }

  async function removeMusic() {
    if (musicBusy) return;
    setMusicBusy(true);
    setMessage("");
    try {
      musicPlayer.pause();
      await apiRequest("/users/me/page-music", { method: "DELETE" });
      setPage((current) => current
        ? { ...current, hasMusic: false, musicTitle: null, musicUpdatedAt: null }
        : current);
      setMusicTitle("");
      setMessage("미니홈피 BGM을 삭제했습니다.");
    } catch (caught) {
      setMessage(caught instanceof Error ? caught.message : "BGM을 삭제하지 못했습니다.");
    } finally {
      setMusicBusy(false);
    }
  }

  async function toggleMusic() {
    if (!page?.hasMusic) return;
    if (musicStatus.playing) {
      musicPlayer.pause();
      return;
    }
    if (musicStatus.duration > 0 && musicStatus.currentTime >= musicStatus.duration - 0.2) {
      await musicPlayer.seekTo(0);
    }
    musicPlayer.play();
  }

  function formatTime(seconds: number) {
    if (!Number.isFinite(seconds) || seconds < 0) return "0:00";
    const whole = Math.floor(seconds);
    return Math.floor(whole / 60) + ":" + String(whole % 60).padStart(2, "0");
  }

  const palette = themes[page?.theme ?? theme];

  return (
    <SafeAreaView style={[styles.safeArea, { backgroundColor: palette.background }]}>
      <ScreenHeader
        title={page ? page.user.nickname + "의 미니홈피" : "미니홈피"}
        subtitle={page ? "@" + page.user.accountId : undefined}
        onBack={() => navigation.goBack()}
        right={page?.isOwner ? (
          <Pressable onPress={() => setEditing((current) => !current)} style={[styles.editButton, { backgroundColor: palette.soft }]}>
            <Text style={[styles.editButtonText, { color: palette.accent }]}>{editing ? "닫기" : "꾸미기"}</Text>
          </Pressable>
        ) : undefined}
      />
      {loading && !page ? <ActivityIndicator color={palette.accent} style={styles.loader} /> : null}
      <ScrollView contentContainerStyle={styles.content}>
        {message ? <Text style={[styles.message, { color: palette.accent }]}>{message}</Text> : null}
        {page ? (
          <>
            <Card style={[styles.heroCard, { borderColor: palette.soft }]}>
              <Text style={styles.emoji}>{page.emoji}</Text>
              <Avatar imageUrl={avatarUrl(page.user.id, page.user.avatarUpdatedAt)} name={page.user.nickname} size={92} />
              <Text style={styles.nickname}>{page.user.nickname}</Text>
              <Text style={[styles.accountId, { color: palette.accent }]}>@{page.user.accountId}</Text>
              <View style={[styles.statusBox, { backgroundColor: palette.soft }]}>
                <Text style={styles.statusText}>{page.statusMessage || "오늘의 기분을 남겨 보세요."}</Text>
              </View>
            </Card>

            {editing && page.isOwner ? (
              <Card style={styles.editorCard}>
                <SectionHeading title="내 공간 꾸미기" action="나만 수정 가능" />
                <Text style={styles.label}>대표 이모지</Text>
                <TextInput maxLength={16} onChangeText={setEmoji} style={styles.input} value={emoji} />
                <Text style={styles.label}>상태 메시지</Text>
                <TextInput maxLength={60} onChangeText={setStatusMessage} placeholder="오늘의 기분 한 줄" placeholderTextColor={colors.subtle} style={styles.input} value={statusMessage} />
                <Text style={styles.label}>소개글</Text>
                <TextInput maxLength={500} multiline onChangeText={setBio} placeholder="나를 소개해 주세요." placeholderTextColor={colors.subtle} style={[styles.input, styles.multiline]} textAlignVertical="top" value={bio} />
                <Text style={styles.label}>BGM 제목</Text>
                <TextInput maxLength={100} onChangeText={setMusicTitle} placeholder="내 페이지에 어울리는 노래" placeholderTextColor={colors.subtle} style={styles.input} value={musicTitle} />
                <Text style={styles.musicHelp}>MP3·M4A·WAV·OGG, 최대 6MB</Text>
                <Button
                  disabled={musicBusy || !musicTitle.trim()}
                  label={musicBusy ? "BGM 처리 중..." : page.hasMusic ? "BGM 음원 교체" : "BGM 음원 선택"}
                  onPress={() => void chooseMusic()}
                  variant="soft"
                />
                {page.hasMusic ? <Button disabled={musicBusy} label="BGM 삭제" onPress={() => void removeMusic()} variant="secondary" /> : null}
                <Text style={styles.label}>테마</Text>
                <View style={styles.themeRow}>
                  {(Object.keys(themes) as ProfileTheme[]).map((item) => (
                    <Pressable
                      key={item}
                      onPress={() => setTheme(item)}
                      style={[
                        styles.themeChoice,
                        { backgroundColor: themes[item].background, borderColor: theme === item ? themes[item].accent : colors.border },
                      ]}
                    >
                      <View style={[styles.themeDot, { backgroundColor: themes[item].accent }]} />
                      <Text style={styles.themeLabel}>{themes[item].label}</Text>
                    </Pressable>
                  ))}
                </View>
                <Button disabled={busy || !emoji.trim()} label={busy ? "저장 중" : "꾸미기 저장"} onPress={() => void savePage()} />
              </Card>
            ) : null}

            <Card style={[styles.musicCard, { backgroundColor: palette.soft, borderColor: palette.soft }]}>
              <Pressable
                disabled={!page.hasMusic}
                onPress={() => void toggleMusic()}
                style={[styles.musicControl, { backgroundColor: page.hasMusic ? palette.accent : colors.subtle }]}
              >
                <Text style={styles.musicControlText}>{musicStatus.playing ? "Ⅱ" : "▶"}</Text>
              </Pressable>
              <View style={styles.musicCopy}>
                <Text style={[styles.musicLabel, { color: palette.accent }]}>MY BGM</Text>
                <Text style={styles.musicTitle}>{page.musicTitle || "아직 설정한 BGM이 없습니다."}</Text>
                {page.hasMusic ? (
                  <>
                    <View style={styles.progressTrack}>
                      <View
                        style={[
                          styles.progressFill,
                          {
                            backgroundColor: palette.accent,
                            width: ((musicStatus.duration > 0
                              ? Math.min(100, musicStatus.currentTime / musicStatus.duration * 100)
                              : 0) + "%") as `${number}%`,
                          },
                        ]}
                      />
                    </View>
                    <Text style={styles.musicTime}>
                      {musicStatus.isBuffering ? "불러오는 중..." : formatTime(musicStatus.currentTime) + " / " + formatTime(musicStatus.duration)}
                    </Text>
                    {musicStatus.error ? <Text style={styles.musicError}>음원을 재생하지 못했습니다.</Text> : null}
                  </>
                ) : null}
              </View>
            </Card>

            <Card style={styles.introCard}>
              <SectionHeading title="About me" />
              <Text style={styles.bio}>{page.bio || "아직 소개글이 없습니다."}</Text>
            </Card>

            <SectionHeading title="방명록" action={page.guestbook.length + "개"} />
            <Card style={styles.guestbookComposer}>
              <TextInput
                maxLength={200}
                multiline
                onChangeText={setGuestbookContent}
                placeholder="따뜻한 한마디를 남겨 주세요."
                placeholderTextColor={colors.subtle}
                style={[styles.input, styles.guestbookInput]}
                textAlignVertical="top"
                value={guestbookContent}
              />
              <Button disabled={busy || !guestbookContent.trim()} label="방명록 남기기" onPress={() => void writeGuestbook()} variant="soft" />
            </Card>
            {page.guestbook.map((entry) => (
              <Card key={entry.id} style={styles.guestbookCard}>
                <View style={styles.guestbookHeader}>
                  <Avatar imageUrl={avatarUrl(entry.author.id, entry.author.avatarUpdatedAt)} name={entry.author.nickname} size={38} />
                  <View style={styles.guestbookAuthor}>
                    <Text style={styles.authorName}>{entry.author.nickname}</Text>
                    <Text style={styles.date}>{new Date(entry.createdAt).toLocaleString("ko-KR")}</Text>
                  </View>
                  {page.isOwner || entry.author.id === user?.id ? (
                    <Pressable disabled={busy} onPress={() => void deleteGuestbook(entry.id)}>
                      <Text style={styles.deleteText}>삭제</Text>
                    </Pressable>
                  ) : null}
                </View>
                <Text style={styles.guestbookText}>{entry.content}</Text>
              </Card>
            ))}
            {!page.guestbook.length ? <Text style={styles.empty}>첫 번째 방명록을 남겨 보세요.</Text> : null}
          </>
        ) : !loading ? <Button label="다시 시도" onPress={() => void load()} variant="secondary" /> : null}
      </ScrollView>
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  safeArea: { flex: 1 },
  loader: { marginTop: 40 },
  content: { padding: 20, paddingBottom: 48, gap: 14 },
  message: { fontSize: 12, fontWeight: "700", textAlign: "center" },
  editButton: { minWidth: 58, height: 38, borderRadius: 13, alignItems: "center", justifyContent: "center", paddingHorizontal: 10 },
  editButtonText: { fontSize: 12, fontWeight: "900" },
  heroCard: { alignItems: "center", gap: 6, overflow: "hidden" },
  emoji: { position: "absolute", right: 16, top: 12, fontSize: 34 },
  nickname: { marginTop: 8, color: colors.text, fontSize: 23, fontWeight: "900" },
  accountId: { fontSize: 13, fontWeight: "800" },
  statusBox: { marginTop: 10, alignSelf: "stretch", padding: 12, borderRadius: 14 },
  statusText: { color: colors.text, textAlign: "center", fontSize: 13, fontWeight: "700" },
  editorCard: { gap: 10 },
  label: { color: colors.text, fontSize: 12, fontWeight: "800", marginTop: 2 },
  input: { minHeight: 48, borderRadius: 14, borderWidth: 1, borderColor: colors.border, backgroundColor: colors.surface, color: colors.text, paddingHorizontal: 14, paddingVertical: 12 },
  multiline: { minHeight: 112 },
  themeRow: { flexDirection: "row", flexWrap: "wrap", gap: 8 },
  themeChoice: { minWidth: 66, padding: 9, borderRadius: 13, borderWidth: 2, flexDirection: "row", alignItems: "center", gap: 6 },
  themeDot: { width: 10, height: 10, borderRadius: 5 },
  themeLabel: { color: colors.text, fontSize: 11, fontWeight: "800" },
  musicCard: { flexDirection: "row", alignItems: "center", gap: 14 },
  musicControl: { width: 46, height: 46, borderRadius: 23, alignItems: "center", justifyContent: "center" },
  musicControlText: { color: colors.surface, fontSize: 17, fontWeight: "900", marginLeft: 2 },
  musicCopy: { flex: 1, gap: 3 },
  musicLabel: { fontSize: 10, fontWeight: "900" },
  musicTitle: { color: colors.text, fontSize: 14, fontWeight: "800" },
  musicHelp: { color: colors.muted, fontSize: 11 },
  progressTrack: { height: 4, borderRadius: 2, backgroundColor: "rgba(255,255,255,0.75)", overflow: "hidden", marginTop: 5 },
  progressFill: { height: 4, borderRadius: 2 },
  musicTime: { color: colors.muted, fontSize: 10 },
  musicError: { color: colors.red, fontSize: 10 },
  introCard: { gap: 12 },
  bio: { color: colors.text, fontSize: 14, lineHeight: 22 },
  guestbookComposer: { gap: 10 },
  guestbookInput: { minHeight: 80 },
  guestbookCard: { gap: 11 },
  guestbookHeader: { flexDirection: "row", alignItems: "center", gap: 9 },
  guestbookAuthor: { flex: 1, gap: 2 },
  authorName: { color: colors.text, fontSize: 13, fontWeight: "900" },
  date: { color: colors.muted, fontSize: 10 },
  deleteText: { color: colors.red, fontSize: 11, fontWeight: "800" },
  guestbookText: { color: colors.text, fontSize: 13, lineHeight: 20 },
  empty: { color: colors.muted, fontSize: 12, textAlign: "center", padding: 12 },
});
