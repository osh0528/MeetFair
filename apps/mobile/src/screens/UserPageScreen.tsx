import type { ProfileTheme, UserPageSummary } from "@meetfair/shared";
import * as DocumentPicker from "expo-document-picker";
import * as ImagePicker from "expo-image-picker";
import { useAudioPlayer, useAudioPlayerStatus } from "expo-audio";
import { manipulateAsync, SaveFormat } from "expo-image-manipulator";
import { useFocusEffect } from "@react-navigation/native";
import type { NativeStackScreenProps } from "@react-navigation/native-stack";
import { useCallback, useEffect, useState } from "react";
import { ActivityIndicator, Image, Modal, Pressable, ScrollView, StyleSheet, Text, TextInput, View } from "react-native";
import { SafeAreaView } from "react-native-safe-area-context";
import type { RootStackParamList } from "../../App";
import { Avatar, Button, Card, ScreenHeader, SectionHeading } from "../components/ui";
import { apiRequest, createClientRequestId } from "../services/api";
import { avatarUrl } from "../services/avatar";
import { profileMusicUrl } from "../services/profileMusic";
import { profilePhotoUrl } from "../services/profilePhoto";
import { useSession } from "../services/session";
import { useAppTheme } from "../services/theme";
import { colors } from "../theme/colors";

type Props = NativeStackScreenProps<RootStackParamList, "UserPage">;

const themes: Record<ProfileTheme, { label: string; background: string; accent: string; soft: string }> = {
  PURPLE: { label: "오프화이트", background: "#F6F6F4", accent: "#333333", soft: "#EAEAE8" },
  PINK: { label: "웜그레이", background: "#F3F2F0", accent: "#5F5B57", soft: "#E7E4E1" },
  BLUE: { label: "쿨그레이", background: "#F1F3F4", accent: "#4F5961", soft: "#E1E5E8" },
  MINT: { label: "실버", background: "#F2F2F2", accent: "#666666", soft: "#E3E3E3" },
  SUNSET: { label: "차콜", background: "#E7E7E7", accent: "#2B2B2B", soft: "#D5D5D5" },
};

const darkThemes: Record<ProfileTheme, { label: string; background: string; accent: string; soft: string }> = {
  PURPLE: { label: "오프화이트", background: "#171717", accent: "#E3E3E3", soft: "#2A2A2A" },
  PINK: { label: "웜그레이", background: "#1A1918", accent: "#D9D4D0", soft: "#302D2A" },
  BLUE: { label: "쿨그레이", background: "#171A1C", accent: "#CBD5DB", soft: "#293035" },
  MINT: { label: "실버", background: "#181818", accent: "#D7D7D7", soft: "#2D2D2D" },
  SUNSET: { label: "차콜", background: "#202020", accent: "#F0F0F0", soft: "#363636" },
};

export function UserPageScreen({ navigation, route }: Props) {
  const { user } = useSession();
  const { mode } = useAppTheme();
  const [page, setPage] = useState<UserPageSummary | null>(null);
  const [loading, setLoading] = useState(true);
  const [busy, setBusy] = useState(false);
  const [message, setMessage] = useState("");
  const [guestbookContent, setGuestbookContent] = useState("");
  const [statusMessage, setStatusMessage] = useState("");
  const [bio, setBio] = useState("");
  const [emoji, setEmoji] = useState("🌟");
  const [theme, setTheme] = useState<ProfileTheme>("PURPLE");
  const [musicTitle, setMusicTitle] = useState("");
  const [musicBusy, setMusicBusy] = useState(false);
  const [photoBusy, setPhotoBusy] = useState(false);
  const [photoCaption, setPhotoCaption] = useState("");
  const [selectedPhotoId, setSelectedPhotoId] = useState<string | null>(null);
  const [pokeBusy, setPokeBusy] = useState(false);
  const [pokeCooldown, setPokeCooldown] = useState(0);
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

  useFocusEffect(useCallback(() => {
    if (!musicSource) return;
    musicPlayer.play();
    return () => musicPlayer.pause();
  }, [musicPlayer, musicSource]));

  useEffect(() => {
    if (!pokeCooldown) return;
    const timer = setInterval(() => setPokeCooldown((current) => (current > 1 ? current - 1 : 0)), 1000);
    return () => clearInterval(timer);
  }, [pokeCooldown]);

  async function handlePoke() {
    if (!page || page.isOwner || pokeBusy || pokeCooldown) return;
    setPokeBusy(true);
    setMessage("");
    try {
      await apiRequest("/pokes", {
        method: "POST",
        body: JSON.stringify({ targetUserId: page.user.id, clientRequestId: createClientRequestId() }),
      });
      setMessage("찌르기 알림을 보냈습니다.");
      setPokeCooldown(60);
    } catch (caught) {
      const msg = caught instanceof Error ? caught.message : "찌르기를 보내지 못했습니다.";
      if (msg.includes("POKE_COOLDOWN") || msg.includes("Please wait")) {
        const match = msg.match(/(\d+)s/);
        setPokeCooldown(match ? Number(match[1]) : 60);
      }
      setMessage(msg);
    } finally {
      setPokeBusy(false);
    }
  }

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

  async function addPhoto() {
    if (!page?.isOwner || photoBusy || page.photos.length >= 30) return;
    setPhotoBusy(true);
    setMessage("");
    try {
      const permission = await ImagePicker.requestMediaLibraryPermissionsAsync();
      if (!permission.granted) throw new Error("사진첩에 올리려면 사진 접근 권한이 필요합니다.");
      const result = await ImagePicker.launchImageLibraryAsync({
        mediaTypes: ImagePicker.MediaTypeOptions.Images,
        allowsEditing: false,
        allowsMultipleSelection: true,
        selectionLimit: Math.max(1, 30 - page.photos.length),
        quality: 1,
      });
      if (result.canceled) return;
      const uploadedPhotos: UserPageSummary["photos"] = [];
      for (const image of result.assets) {
        if (!image.uri || !image.width || !image.height) continue;
        const resize = image.width >= image.height
          ? { width: Math.min(1200, image.width) }
          : { height: Math.min(1200, image.height) };
        const edited = await manipulateAsync(
          image.uri,
          [{ resize }],
          { base64: true, compress: 0.76, format: SaveFormat.JPEG },
        );
        if (!edited.base64) continue;
        const data = await apiRequest<{ photo: UserPageSummary["photos"][number] }>("/users/me/page-photos", {
          method: "POST",
          body: JSON.stringify({
            imageBase64: edited.base64,
            mimeType: "image/jpeg",
            caption: photoCaption.trim() || null,
            width: edited.width,
            height: edited.height,
          }),
        });
        uploadedPhotos.push(data.photo);
      }
      if (!uploadedPhotos.length) throw new Error("선택한 사진을 업로드하지 못했습니다.");
      setPage((current) => current
        ? { ...current, photos: [...uploadedPhotos, ...current.photos] }
        : current);
      setPhotoCaption("");
      setMessage("사진첩에 " + uploadedPhotos.length + "장의 사진을 추가했습니다.");
    } catch (caught) {
      setMessage(caught instanceof Error ? caught.message : "사진을 추가하지 못했습니다.");
    } finally {
      setPhotoBusy(false);
    }
  }

  async function deletePhoto(photoId: string) {
    if (!page?.isOwner || photoBusy) return;
    setPhotoBusy(true);
    setMessage("");
    try {
      await apiRequest("/users/me/page-photos/" + photoId, { method: "DELETE" });
      setPage((current) => current
        ? { ...current, photos: current.photos.filter((photo) => photo.id !== photoId) }
        : current);
      setSelectedPhotoId(null);
      setMessage("사진첩에서 사진을 삭제했습니다.");
    } catch (caught) {
      setMessage(caught instanceof Error ? caught.message : "사진을 삭제하지 못했습니다.");
    } finally {
      setPhotoBusy(false);
    }
  }

  const palette = (mode === "DARK" ? darkThemes : themes)[page?.theme ?? theme];

  return (
    <SafeAreaView style={[styles.safeArea, { backgroundColor: palette.background }]}>
      <ScreenHeader
        title={page ? page.user.nickname + "의 미니홈피" : "미니홈피"}
        subtitle={page ? "@" + page.user.accountId : undefined}
        onBack={() => navigation.goBack()}
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
            {!page.isOwner ? (
              <Button
                disabled={pokeBusy || !!pokeCooldown}
                label={pokeCooldown ? `${pokeCooldown}초 후 가능` : pokeBusy ? "찌르기 중..." : "찌르기"}
                onPress={() => void handlePoke()}
                variant="soft"
              />
            ) : null}

            {page.isOwner ? (
              <Card style={styles.editorCard}>
                <SectionHeading title="간편 설정" action="나만 수정 가능" />
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
                        {
                          backgroundColor: (mode === "DARK" ? darkThemes : themes)[item].background,
                          borderColor: theme === item ? (mode === "DARK" ? darkThemes : themes)[item].accent : colors.border,
                        },
                      ]}
                    >
                      <View style={[styles.themeDot, { backgroundColor: (mode === "DARK" ? darkThemes : themes)[item].accent }]} />
                      <Text style={[styles.themeLabel, { color: mode === "DARK" ? colors.text : "#1C1C1C" }]}>{themes[item].label}</Text>
                    </Pressable>
                  ))}
                </View>
                <Button disabled={busy || !emoji.trim()} label={busy ? "저장 중" : "변경사항 저장"} onPress={() => void savePage()} />
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
                    <View style={[styles.progressTrack, { backgroundColor: mode === "DARK" ? "#525252" : "#D1D1D1" }]}>
                      <View
                        style={[
                          styles.progressFill,
                          {
                            backgroundColor: palette.accent,
                            width: ((musicStatus.duration > 0
                              ? Math.max(2, Math.min(100, musicStatus.currentTime / musicStatus.duration * 100))
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

            <View style={styles.pageColumns}>
              <Card style={styles.aboutPhotoPanel}>
                <View style={styles.introSection}>
                  <SectionHeading title="About me" />
                  <Text style={styles.bio}>{page.bio || "아직 소개글이 없습니다."}</Text>
                </View>

                <View style={styles.panelSection}>
                  <SectionHeading title="사진첩" action={page.photos.length + " / 30"} />
                  {page.isOwner ? (
                    <View style={styles.photoComposer}>
                      <TextInput
                        maxLength={150}
                        onChangeText={setPhotoCaption}
                        placeholder="사진 설명을 입력해 주세요. (선택)"
                        placeholderTextColor={colors.subtle}
                        style={styles.input}
                        value={photoCaption}
                      />
                      <Button
                        disabled={photoBusy || page.photos.length >= 30}
                        label={photoBusy ? "사진 처리 중..." : page.photos.length >= 30 ? "사진첩이 가득 찼습니다" : "사진 여러 장 선택해서 올리기"}
                        onPress={() => void addPhoto()}
                        variant="soft"
                      />
                      <Text style={styles.photoHelp}>최대 30장 · 업로드 시 크기를 자동으로 줄입니다.</Text>
                    </View>
                  ) : null}
                  {page.photos.length ? (
                    <View style={styles.photoGrid}>
                      {page.photos.map((photo) => (
                        <Pressable key={photo.id} onPress={() => setSelectedPhotoId(photo.id)} style={styles.photoTile}>
                          <Image
                            resizeMode="cover"
                            source={{ uri: profilePhotoUrl(page.user.id, photo.id) }}
                            style={styles.photoThumbnail}
                          />
                          {photo.caption ? <Text numberOfLines={2} style={styles.photoCaption}>{photo.caption}</Text> : null}
                        </Pressable>
                      ))}
                    </View>
                  ) : <Text style={styles.empty}>아직 사진첩에 등록된 사진이 없습니다.</Text>}
                </View>
              </Card>

              <Card style={styles.guestbookPanel}>
                <SectionHeading title="방명록" action={page.guestbook.length + "개"} />
                <View style={styles.guestbookComposer}>
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
                </View>
                {page.guestbook.map((entry) => (
                  <View key={entry.id} style={styles.guestbookCard}>
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
                  </View>
                ))}
                {!page.guestbook.length ? <Text style={styles.empty}>첫 번째 방명록을 남겨 보세요.</Text> : null}
              </Card>
            </View>
          </>
        ) : !loading ? <Button label="다시 시도" onPress={() => void load()} variant="secondary" /> : null}
      </ScrollView>
      <Modal animationType="fade" onRequestClose={() => setSelectedPhotoId(null)} transparent visible={selectedPhotoId !== null}>
        <View style={styles.photoModalBackdrop}>
          {page && selectedPhotoId ? (() => {
            const photo = page.photos.find((item) => item.id === selectedPhotoId);
            if (!photo) return null;
            return (
              <SafeAreaView style={styles.photoModalContent}>
                <View style={styles.photoModalHeader}>
                  <Pressable onPress={() => setSelectedPhotoId(null)} style={styles.photoModalButton}>
                    <Text style={styles.photoModalButtonText}>닫기</Text>
                  </Pressable>
                  {page.isOwner ? (
                    <Pressable disabled={photoBusy} onPress={() => void deletePhoto(photo.id)} style={[styles.photoModalButton, styles.photoDeleteButton]}>
                      <Text style={styles.photoDeleteText}>{photoBusy ? "처리 중" : "삭제"}</Text>
                    </Pressable>
                  ) : null}
                </View>
                <Image
                  resizeMode="contain"
                  source={{ uri: profilePhotoUrl(page.user.id, photo.id) }}
                  style={styles.photoDetail}
                />
                {photo.caption ? <Text style={styles.photoDetailCaption}>{photo.caption}</Text> : null}
                <Text style={styles.photoDetailDate}>{new Date(photo.createdAt).toLocaleString("ko-KR")}</Text>
              </SafeAreaView>
            );
          })() : null}
        </View>
      </Modal>
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  safeArea: { flex: 1 },
  loader: { marginTop: 40 },
  content: { padding: 20, paddingBottom: 48, gap: 14 },
  message: { fontSize: 12, fontWeight: "700", textAlign: "center" },
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
  pageColumns: { flexDirection: "row", alignItems: "flex-start", gap: 14 },
  aboutPhotoPanel: { flex: 7, minWidth: 0, gap: 18 },
  guestbookPanel: { flex: 3, minWidth: 0, gap: 14 },
  introSection: { gap: 12 },
  panelSection: { gap: 14, borderTopWidth: 1, borderTopColor: colors.border, paddingTop: 18 },
  bio: { color: colors.text, fontSize: 14, lineHeight: 22 },
  photoComposer: { gap: 10, padding: 12, borderRadius: 16, backgroundColor: colors.background },
  photoHelp: { color: colors.muted, fontSize: 11, textAlign: "center" },
  photoGrid: { flexDirection: "row", flexWrap: "wrap", gap: 10 },
  photoTile: { width: "48%", borderRadius: 16, overflow: "hidden", backgroundColor: colors.surface, borderWidth: 1, borderColor: colors.border },
  photoThumbnail: { width: "100%", aspectRatio: 1, backgroundColor: colors.background },
  photoCaption: { color: colors.text, fontSize: 11, lineHeight: 16, fontWeight: "700", padding: 9, minHeight: 42 },
  photoModalBackdrop: { flex: 1, backgroundColor: "rgba(18,19,24,0.94)", justifyContent: "center" },
  photoModalContent: { flex: 1, padding: 18, justifyContent: "center", gap: 14 },
  photoModalHeader: { position: "absolute", top: 16, left: 18, right: 18, zIndex: 2, flexDirection: "row", justifyContent: "space-between" },
  photoModalButton: { minWidth: 60, height: 42, borderRadius: 14, paddingHorizontal: 14, backgroundColor: "rgba(255,255,255,0.16)", alignItems: "center", justifyContent: "center" },
  photoModalButtonText: { color: colors.surface, fontSize: 13, fontWeight: "900" },
  photoDeleteButton: { backgroundColor: "rgba(232,93,106,0.22)" },
  photoDeleteText: { color: "#FF9AA4", fontSize: 13, fontWeight: "900" },
  photoDetail: { width: "100%", height: "72%" },
  photoDetailCaption: { color: colors.surface, fontSize: 15, lineHeight: 22, textAlign: "center", fontWeight: "700" },
  photoDetailDate: { color: colors.subtle, fontSize: 11, textAlign: "center" },
  guestbookComposer: { gap: 10, paddingBottom: 14 },
  guestbookInput: { minHeight: 80 },
  guestbookCard: { gap: 11, borderTopWidth: 1, borderTopColor: colors.border, paddingTop: 14 },
  guestbookHeader: { flexDirection: "row", alignItems: "center", flexWrap: "wrap", gap: 9 },
  guestbookAuthor: { flex: 1, gap: 2 },
  authorName: { color: colors.text, fontSize: 13, fontWeight: "900" },
  date: { color: colors.muted, fontSize: 10 },
  deleteText: { color: colors.red, fontSize: 11, fontWeight: "800" },
  guestbookText: { color: colors.text, fontSize: 13, lineHeight: 20 },
  empty: { color: colors.muted, fontSize: 12, textAlign: "center", padding: 12 },
});
