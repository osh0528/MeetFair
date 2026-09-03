import { ROOM_DECORATIONS, ROOM_WALLPAPERS, type ProfileTheme, type RoomDecoration, type RoomDecorationPlacement, type RoomWallpaper, type UserPageSummary } from "@meetfair/shared";
import AsyncStorage from "@react-native-async-storage/async-storage";
import * as DocumentPicker from "expo-document-picker";
import * as ImagePicker from "expo-image-picker";
import { useAudioPlayer, useAudioPlayerStatus } from "expo-audio";
import { manipulateAsync, SaveFormat } from "expo-image-manipulator";
import { useFocusEffect } from "@react-navigation/native";
import type { NativeStackScreenProps } from "@react-navigation/native-stack";
import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { ActivityIndicator, Image, Modal, PanResponder, Pressable, ScrollView, StyleSheet, Text, TextInput, useWindowDimensions, View } from "react-native";
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
  PURPLE: { label: "포근한 방", background: "#F6F6F4", accent: "#333333", soft: "#EAEAE8" },
  PINK: { label: "따뜻한 방", background: "#F3F2F0", accent: "#5F5B57", soft: "#E7E4E1" },
  BLUE: { label: "차분한 방", background: "#F1F3F4", accent: "#4F5961", soft: "#E1E5E8" },
  MINT: { label: "깔끔한 방", background: "#F2F2F2", accent: "#666666", soft: "#E3E3E3" },
  SUNSET: { label: "밤의 방", background: "#E7E7E7", accent: "#2B2B2B", soft: "#D5D5D5" },
};

const darkThemes: Record<ProfileTheme, { label: string; background: string; accent: string; soft: string }> = {
  PURPLE: { label: "오프화이트", background: "#171717", accent: "#E3E3E3", soft: "#2A2A2A" },
  PINK: { label: "웜그레이", background: "#1A1918", accent: "#D9D4D0", soft: "#302D2A" },
  BLUE: { label: "쿨그레이", background: "#171A1C", accent: "#CBD5DB", soft: "#293035" },
  MINT: { label: "실버", background: "#181818", accent: "#D7D7D7", soft: "#2D2D2D" },
  SUNSET: { label: "차콜", background: "#202020", accent: "#F0F0F0", soft: "#363636" },
};

const wallpapers: Record<RoomWallpaper, { background: string; pattern: string; patternColor: string }> = {
  CREAM: { background: "#FFF4DC", pattern: "plain", patternColor: "transparent" },
  STRIPES: { background: "#F8EDE3", pattern: "stripes", patternColor: "rgba(197, 137, 112, 0.18)" },
  CHECK: { background: "#F5F1E8", pattern: "check", patternColor: "rgba(113, 139, 121, 0.16)" },
  FLORAL: { background: "#FFF0F3", pattern: "floral", patternColor: "#D98E9F" },
  SKY: { background: "#E8F5FF", pattern: "clouds", patternColor: "rgba(255, 255, 255, 0.9)" },
  FOREST: { background: "#DDEBDD", pattern: "leaves", patternColor: "#65966B" },
  NIGHT: { background: "#29324A", pattern: "stars", patternColor: "#FFE9A6" },
  BRICK: { background: "#E9C1A7", pattern: "bricks", patternColor: "rgba(145, 82, 61, 0.22)" },
};

function WallpaperPattern({ pattern, color, compact = false }: { pattern: string; color: string; compact?: boolean }) {
  if (pattern === "plain") return null;
  if (pattern === "stripes") return (
    <View pointerEvents="none" style={styles.wallpaperPatternLayer}>
      {[0, 1, 2, 3, 4, 5, 6].map((item) => <View key={item} style={[styles.wallpaperStripe, { backgroundColor: color, left: item * (compact ? 22 : 56) - 18 }]} />)}
    </View>
  );
  if (pattern === "check" || pattern === "bricks") return (
    <View pointerEvents="none" style={styles.wallpaperPatternLayer}>
      {[1, 2, 3, 4].map((item) => <View key={"h" + item} style={[styles.wallpaperHorizontal, { backgroundColor: color, top: item * (compact ? 12 : 30) }]} />)}
      {[1, 2, 3, 4, 5, 6].map((item) => <View key={"v" + item} style={[styles.wallpaperVertical, { backgroundColor: color, left: item * (compact ? 22 : 52) }]} />)}
    </View>
  );
  const symbols = pattern === "floral" ? ["✿", "❀", "✿", "❀", "✿"] : pattern === "clouds" ? ["☁", "☁", "☁", "☁"] : pattern === "leaves" ? ["❧", "❧", "❧", "❧", "❧"] : ["✦", "·", "✧", "·", "✦", "✧"] ;
  return (
    <View pointerEvents="none" style={styles.wallpaperPatternLayer}>
      {symbols.map((symbol, item) => <Text key={item} style={[styles.wallpaperMotif, { color, left: 10 + item * (compact ? 19 : 58), top: compact ? (item % 2) * 24 + 6 : (item % 3) * 38 + 10 }]}>{symbol}</Text>)}
    </View>
  );
}

const homeDecorIcons: Record<RoomDecoration, string> = {
  WINDOW: "🪟", PLANT: "🌿", SOFA: "🛋️", LAMP: "💡", RUG: "🧶",
  BED: "🛏️", DESK: "🖥️", BOOKSHELF: "📚", TV: "📺", TABLE: "☕",
  CLOCK: "🕰️", POSTER: "🖼️", CAT: "🐈", CACTUS: "🌵", TEDDY: "🧸",
};

function defaultRoomLayout(decorations: RoomDecoration[]): RoomDecorationPlacement[] {
  return decorations.map((id, index) => ({
    id,
    x: index % 2 ? 0.82 : 0.08,
    y: Math.min(0.92, 0.08 + index * 0.06),
    scale: 1,
    rotation: 0,
  }));
}

type SavedRoomCustomization = {
  wallpaper: RoomWallpaper;
  decorations: RoomDecoration[];
  layout: RoomDecorationPlacement[];
};

const roomWallpaperIds = new Set(ROOM_WALLPAPERS.map((item) => item.id));
const roomDecorationIds = new Set(ROOM_DECORATIONS.map((item) => item.id));

function roomCustomizationKey(userId: string) {
  return "meetfair:room-customization:" + userId;
}

async function readSavedRoomCustomization(userId: string): Promise<SavedRoomCustomization | null> {
  try {
    const raw = await AsyncStorage.getItem(roomCustomizationKey(userId));
    if (!raw) return null;
    const parsed = JSON.parse(raw) as { wallpaper?: unknown; decorations?: unknown; layout?: unknown };
    if (!roomWallpaperIds.has(parsed.wallpaper as RoomWallpaper) || !Array.isArray(parsed.decorations)) return null;
    const decorations = parsed.decorations.filter((item): item is RoomDecoration => roomDecorationIds.has(item as RoomDecoration));
    return {
      wallpaper: parsed.wallpaper as RoomWallpaper,
      decorations,
      layout: Array.isArray(parsed.layout) ? parsed.layout as RoomDecorationPlacement[] : defaultRoomLayout(decorations),
    };
  } catch {
    return null;
  }
}

async function writeSavedRoomCustomization(userId: string, wallpaper: RoomWallpaper, decorations: RoomDecoration[], layout: RoomDecorationPlacement[]) {
  await AsyncStorage.setItem(roomCustomizationKey(userId), JSON.stringify({ wallpaper, decorations, layout }));
}

function EditableDecoration({
  placement,
  width,
  height,
  editable,
  onChange,
}: {
  placement: RoomDecorationPlacement;
  width: number;
  height: number;
  editable: boolean;
  onChange: (next: RoomDecorationPlacement, finished: boolean) => void;
}) {
  const gestureStart = useRef({ x: placement.x, y: placement.y, scale: placement.scale, rotation: placement.rotation, distance: 0, angle: 0 });
  const latest = useRef(placement);
  latest.current = placement;
  const responder = useMemo(() => PanResponder.create({
    onStartShouldSetPanResponder: () => editable,
    onMoveShouldSetPanResponder: () => editable,
    onPanResponderGrant: (event) => {
      const touches = event.nativeEvent.touches;
      const first = touches[0];
      const second = touches[1];
      const dx = second && first ? second.pageX - first.pageX : 0;
      const dy = second && first ? second.pageY - first.pageY : 0;
      gestureStart.current = {
        x: latest.current.x,
        y: latest.current.y,
        scale: latest.current.scale,
        rotation: latest.current.rotation,
        distance: Math.hypot(dx, dy),
        angle: Math.atan2(dy, dx) * 180 / Math.PI,
      };
    },
    onPanResponderMove: (event, gesture) => {
      const touches = event.nativeEvent.touches;
      const first = touches[0];
      const second = touches[1];
      if (first && second) {
        const dx = second.pageX - first.pageX;
        const dy = second.pageY - first.pageY;
        const distance = Math.hypot(dx, dy);
        const angle = Math.atan2(dy, dx) * 180 / Math.PI;
        const start = gestureStart.current;
        onChange({
          ...latest.current,
          scale: Math.max(0.5, Math.min(2.5, start.scale * (start.distance ? distance / start.distance : 1))),
          rotation: Math.max(-180, Math.min(180, start.rotation + angle - start.angle)),
        }, false);
        return;
      }
      const start = gestureStart.current;
      onChange({
        ...latest.current,
        x: Math.max(0, Math.min(1, start.x + gesture.dx / Math.max(1, width - 48))),
        y: Math.max(0, Math.min(1, start.y + gesture.dy / Math.max(1, height - 48))),
      }, false);
    },
    onPanResponderRelease: () => onChange(latest.current, true),
    onPanResponderTerminate: () => onChange(latest.current, true),
  }), [editable, height, onChange, width]);
  return (
    <View
      {...responder.panHandlers}
      style={[
        styles.homeDecorItem,
        {
          left: placement.x * Math.max(1, width - 48),
          top: placement.y * Math.max(1, height - 48),
          opacity: editable ? 0.9 : 0.38,
          transform: [{ scale: placement.scale }, { rotate: placement.rotation + "deg" }],
        },
        editable && styles.homeDecorItemEditing,
      ]}
    >
      <Text style={styles.homeDecorEmoji}>{homeDecorIcons[placement.id]}</Text>
    </View>
  );
}

function HomeDecorations({ layout, width, height, editable, onChange }: {
  layout: RoomDecorationPlacement[];
  width: number;
  height: number;
  editable: boolean;
  onChange: (next: RoomDecorationPlacement, finished: boolean) => void;
}) {
  return (
    <View pointerEvents={editable ? "box-none" : "none"} style={styles.homeDecorLayer}>
      {layout.map((placement) => (
        <EditableDecoration editable={editable} height={height} key={placement.id} onChange={onChange} placement={placement} width={width} />
      ))}
    </View>
  );
}
export function UserPageScreen({ navigation, route }: Props) {
  const { width: windowWidth, height: windowHeight } = useWindowDimensions();
  const isCompactLayout = windowWidth < 768;
  const isNarrowLayout = windowWidth < 480;
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
  const [roomWallpaper, setRoomWallpaper] = useState<RoomWallpaper>("CREAM");
  const [roomDecorations, setRoomDecorations] = useState<RoomDecoration[]>([]);
  const [roomLayout, setRoomLayout] = useState<RoomDecorationPlacement[]>([]);
  const [decorating, setDecorating] = useState(false);
  const [houseSize, setHouseSize] = useState({ width: 1, height: 1 });
  const [musicTitle, setMusicTitle] = useState("");
  const [musicBusy, setMusicBusy] = useState(false);
  const [photoBusy, setPhotoBusy] = useState(false);
  const [photoCaption, setPhotoCaption] = useState("");
  const [likingPhotoId, setLikingPhotoId] = useState<string | null>(null);
  const [selectedPhotoId, setSelectedPhotoId] = useState<string | null>(null);
  const [editing, setEditing] = useState(false);
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
    setRoomWallpaper(next.roomWallpaper ?? "CREAM");
    const nextDecorations = Array.isArray(next.roomDecorations) ? next.roomDecorations : [];
    setRoomDecorations(nextDecorations);
    setRoomLayout(Array.isArray(next.roomLayout) && next.roomLayout.length ? next.roomLayout : defaultRoomLayout(nextDecorations));
    setMusicTitle(next.musicTitle ?? "");
  }, []);

  const load = useCallback(async () => {
    setLoading(true);
    setMessage("");
    try {
      const data = await apiRequest<{ page: UserPageSummary }>("/users/" + route.params.userId + "/page");
      const savedRoom = data.page.isOwner ? await readSavedRoomCustomization(data.page.user.id) : null;
      applyPage(savedRoom ? {
        ...data.page,
        roomWallpaper: savedRoom.wallpaper,
        roomDecorations: savedRoom.decorations,
        roomLayout: savedRoom.layout,
      } : data.page);
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
      setPokeCooldown(2);
    } catch (caught) {
      const msg = caught instanceof Error ? caught.message : "찌르기를 보내지 못했습니다.";
      if (msg.includes("POKE_COOLDOWN") || msg.includes("Please wait")) {
        const match = msg.match(/(\d+)s/);
        setPokeCooldown(match ? Number(match[1]) : 2);
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
      if (page?.user.id) await writeSavedRoomCustomization(page.user.id, roomWallpaper, roomDecorations, roomLayout);
      const data = await apiRequest<{ page: UserPageSummary }>("/users/me/page", {
        method: "PATCH",
        body: JSON.stringify({
          statusMessage,
          bio,
          emoji: emoji.trim(),
          theme,
          roomWallpaper,
          roomDecorations,
          roomLayout,
          musicTitle,
        }),
      });
      applyPage({ ...data.page, roomWallpaper, roomDecorations, roomLayout });
      if (isCompactLayout) setEditing(false);
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
        // 일부 Android/브라우저 선택기는 양의 selectionLimit을 단일 선택으로 처리할 수 있어
        // 시스템 최대값으로 열고, 실제 30장 제한은 업로드 전에 앱에서 적용합니다.
        selectionLimit: 0,
        quality: 1,
      });
      if (result.canceled) return;
      const uploadedPhotos: UserPageSummary["photos"] = [];
      const groupId = createClientRequestId();
      let failedCount = 0;
      for (const image of result.assets.slice(0, Math.max(1, 30 - page.photos.length))) {
        if (!image.uri || !image.width || !image.height) continue;
        try {
          const resize = image.width >= image.height
            ? { width: Math.min(1200, image.width) }
            : { height: Math.min(1200, image.height) };
          const edited = await manipulateAsync(
            image.uri,
            [{ resize }],
            { base64: true, compress: 0.68, format: SaveFormat.JPEG },
          );
          if (!edited.base64) {
            failedCount += 1;
            continue;
          }
          const data = await apiRequest<{ photo: UserPageSummary["photos"][number] }>("/users/me/page-photos", {
            method: "POST",
            body: JSON.stringify({
              imageBase64: edited.base64,
              mimeType: "image/jpeg",
              groupId,
              caption: photoCaption.trim() || null,
              width: edited.width,
              height: edited.height,
            }),
          });
          uploadedPhotos.push(data.photo);
        } catch {
          failedCount += 1;
        }
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

  async function togglePhotoLike(photoId: string, likedByMe: boolean) {
    if (likingPhotoId) return;
    setLikingPhotoId(photoId);
    try {
      const result = await apiRequest<{ likedByMe: boolean; likesCount: number }>(
        "/users/page-photos/" + photoId + "/like",
        { method: likedByMe ? "DELETE" : "POST" },
      );
      setPage((current) => current ? {
        ...current,
        photos: current.photos.map((photo) => photo.id === photoId
          ? { ...photo, likedByMe: result.likedByMe, likesCount: result.likesCount }
          : photo),
      } : current);
    } catch (caught) {
      setMessage(caught instanceof Error ? caught.message : "사진 좋아요를 변경하지 못했습니다.");
    } finally {
      setLikingPhotoId(null);
    }
  }

  const activeTheme = page?.isOwner ? theme : page?.theme ?? theme;
  const palette = (mode === "DARK" ? darkThemes : themes)[activeTheme];
  const activeWallpaper = page?.isOwner ? roomWallpaper : page?.roomWallpaper ?? roomWallpaper;
  const wallpaper = wallpapers[activeWallpaper];
  const wallpaperTextColor = activeWallpaper === "NIGHT" ? "#FFF8E7" : "#2D2A26";
  const wallpaperMutedColor = activeWallpaper === "NIGHT" ? "#E8DDBF" : "#665F56";
  const themedPanel = { backgroundColor: palette.background, borderColor: palette.accent };
  const housePanel = { backgroundColor: "transparent", borderColor: "transparent" };
  async function saveRoom(nextWallpaper: RoomWallpaper, nextDecorations: RoomDecoration[], nextLayout: RoomDecorationPlacement[] = roomLayout) {
    setRoomWallpaper(nextWallpaper);
    setRoomDecorations(nextDecorations);
    setRoomLayout(nextLayout);
    setPage((current) => current ? { ...current, roomWallpaper: nextWallpaper, roomDecorations: nextDecorations, roomLayout: nextLayout } : current);
    try {
      if (page?.user.id) await writeSavedRoomCustomization(page.user.id, nextWallpaper, nextDecorations, nextLayout);
      const data = await apiRequest<{ page: UserPageSummary }>("/users/me/page", {
        method: "PATCH",
        body: JSON.stringify({ roomWallpaper: nextWallpaper, roomDecorations: nextDecorations, roomLayout: nextLayout }),
      });
      applyPage({
        ...data.page,
        roomWallpaper: nextWallpaper,
        roomDecorations: nextDecorations,
        roomLayout: nextLayout,
      });
      setMessage("방 꾸미기가 자동 저장되었습니다.");
    } catch (caught) {
      setMessage(caught instanceof Error ? caught.message : "방 꾸미기를 저장하지 못했습니다.");
    }
  }
  const toggleRoomDecoration = (decoration: RoomDecoration) => {
    const selected = roomDecorations.includes(decoration);
    const nextDecorations = selected ? roomDecorations.filter((item) => item !== decoration) : [...roomDecorations, decoration];
    const nextLayout = selected
      ? roomLayout.filter((item) => item.id !== decoration)
      : [...roomLayout, { ...defaultRoomLayout([decoration])[0]!, y: Math.min(0.9, 0.12 + roomLayout.length * 0.06) }];
    void saveRoom(roomWallpaper, nextDecorations, nextLayout);
  };
  const updateDecorationPlacement = (next: RoomDecorationPlacement, finished: boolean) => {
    const nextLayout = roomLayout.map((item) => item.id === next.id ? next : item);
    setRoomLayout(nextLayout);
    setPage((current) => current ? { ...current, roomLayout: nextLayout } : current);
    if (finished) void saveRoom(roomWallpaper, roomDecorations, nextLayout);
  };
  const wallpaperEditor = page?.isOwner ? (
    <View style={styles.wallpaperEditor}>
      <Text style={styles.label}>벽지</Text>
      <Text style={styles.decorHelp}>모든 벽지를 자유롭게 골라 사용할 수 있어요.</Text>
      <View style={styles.wallpaperChoices}>
        {ROOM_WALLPAPERS.map((item) => {
          const selected = roomWallpaper === item.id;
          const preview = wallpapers[item.id];
          return (
            <Pressable accessibilityLabel={item.label + " 벽지 선택"} key={item.id} onPress={() => void saveRoom(item.id, roomDecorations, roomLayout)} style={[styles.wallpaperChoice, selected && { backgroundColor: palette.soft }]}>
              <View style={[styles.wallpaperPreview, { backgroundColor: preview.background }]}>
                <WallpaperPattern color={preview.patternColor} compact pattern={preview.pattern} />
                {selected ? <Text style={styles.wallpaperCheck}>✓</Text> : null}
              </View>
              <Text numberOfLines={1} style={styles.wallpaperLabel}>{item.label}</Text>
            </Pressable>
          );
        })}
      </View>
    </View>
  ) : null;
  const roomDecorEditor = page?.isOwner ? (
    <View style={styles.decorEditor}>
      <View style={styles.decorProgressHeader}>
        <Text style={styles.label}>가구와 소품</Text>
        <Text style={[styles.decorPoints, { color: palette.accent }]}>{roomDecorations.length}개 배치 중</Text>
      </View>
      <Text style={styles.decorHelp}>원하는 아이템을 눌러 자유롭게 배치하거나 치워보세요.</Text>
      <View style={styles.decorChoices}>
        {ROOM_DECORATIONS.map((item) => {
          const selected = roomDecorations.includes(item.id);
          return (
            <Pressable
              accessibilityLabel={`${item.label} ${selected ? "치우기" : "배치하기"}`}
              key={item.id}
              onPress={() => toggleRoomDecoration(item.id)}
              style={[
                styles.decorChoice,
                selected && { borderColor: palette.accent, backgroundColor: palette.soft },
              ]}
            >
              <Text style={styles.decorIcon}>{item.icon}</Text>
              <Text numberOfLines={1} style={styles.decorLabel}>{item.label}</Text>
              <Text style={styles.decorState}>{selected ? "배치됨" : "배치하기"}</Text>
            </Pressable>
          );
        })}
      </View>
    </View>
  ) : null;
  const photoGroups = page ? Object.values(page.photos.reduce<Record<string, UserPageSummary["photos"]>>((groups, photo) => {
    const key = photo.groupId ?? photo.id;
    groups[key] ??= [];
    groups[key].push(photo);
    return groups;
  }, {})) : [];

  const musicPlayerCard = page ? (
    <Card style={[styles.musicCard, styles.heroMusicCard]}>
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
  ) : null;

  return (
    <SafeAreaView style={[styles.safeArea, { backgroundColor: palette.background }]}>
      <ScreenHeader
        title={page ? page.user.nickname + "의 미니홈피" : "미니홈피"}
        subtitle={page ? "@" + page.user.accountId : undefined}
        onBack={() => navigation.goBack()}
        right={page?.isOwner && isCompactLayout ? (
          <Pressable
            accessibilityRole="button"
            onPress={() => setEditing(true)}
            style={styles.headerEditButton}
          >
            <Text style={styles.headerEditButtonText}>홈피 편집</Text>
          </Pressable>
        ) : undefined}
      />
      {loading && !page ? <ActivityIndicator color={palette.accent} style={styles.loader} /> : null}
      <ScrollView contentContainerStyle={styles.content} scrollEnabled={!decorating}>
        {message ? <Text style={[styles.message, { color: palette.accent }]}>{message}</Text> : null}
        {page ? (
          <View onLayout={(event) => setHouseSize(event.nativeEvent.layout)} style={[styles.houseShell, { backgroundColor: wallpaper.background }]}>
            <WallpaperPattern color={wallpaper.patternColor} pattern={wallpaper.pattern} />
            <HomeDecorations editable={decorating} height={houseSize.height} layout={roomLayout} onChange={updateDecorationPlacement} width={houseSize.width} />
            {page.isOwner && roomDecorations.length ? (
              <Pressable onPress={() => setDecorating((current) => !current)} style={[styles.layoutEditButton, { backgroundColor: palette.soft }]}>
                <Text style={[styles.layoutEditText, { color: wallpaperTextColor }]}>{decorating ? "배치 완료" : "가구 위치 편집"}</Text>
              </Pressable>
            ) : null}
            <Card style={[styles.heroCard, housePanel]}>
              <Text style={styles.emoji}>{page.emoji}</Text>
              <View style={[styles.heroRow, isCompactLayout && styles.heroRowMobile]}>
                <View style={[styles.profileIdentity, isCompactLayout && styles.profileIdentityMobile]}>
                  <Avatar imageUrl={avatarUrl(page.user.id, page.user.avatarUpdatedAt)} name={page.user.nickname} size={80} />
                  <View style={styles.profileText}>
                    <Text style={[styles.nickname, { color: wallpaperTextColor }]}> {page.user.nickname}</Text>
                    <Text style={[styles.accountId, { color: palette.accent }]}>@{page.user.accountId}</Text>
                  </View>
                </View>
                <View style={[styles.heroMusic, isCompactLayout && styles.heroMusicMobile, { borderLeftColor: palette.soft }]}>{musicPlayerCard}</View>
              </View>
              <View style={[styles.statusBox, { backgroundColor: palette.soft }]}>
                <Text style={[styles.statusText, { color: wallpaperTextColor }]}> {page.statusMessage || "오늘의 기분을 남겨 보세요."}</Text>
              </View>
            </Card>
            {!page.isOwner ? (
              <View style={styles.profileActions}>
                <Button
                  disabled={pokeBusy || !!pokeCooldown}
                  label={pokeCooldown ? `${pokeCooldown}초 후 가능` : pokeBusy ? "찌르기 중..." : "찌르기"}
                  onPress={() => void handlePoke()}
                  style={styles.profileAction}
                  variant="soft"
                />
                <Button
                  label="개인 디엠으로 가기"
                  onPress={() => navigation.navigate("DirectMessages", { friendUserId: page.user.id })}
                  style={styles.profileAction}
                  variant="secondary"
                />
              </View>
            ) : null}

            {page.isOwner && !isCompactLayout ? (
              <Card style={[styles.editorCard, themedPanel]}>
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
                <Text style={styles.label}>방 분위기</Text>
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
                {wallpaperEditor}
                {roomDecorEditor}
                <Button disabled={busy || !emoji.trim()} label={busy ? "저장 중" : "변경사항 저장"} onPress={() => void savePage()} />
              </Card>
            ) : null}
            {page && false ? <Card style={[styles.musicCard, { backgroundColor: palette.soft, borderColor: palette.soft }]}>
              <Pressable
                disabled={!page!.hasMusic}
                onPress={() => void toggleMusic()}
                style={[styles.musicControl, { backgroundColor: page!.hasMusic ? palette.accent : colors.subtle }]}
              >
                <Text style={styles.musicControlText}>{musicStatus.playing ? "Ⅱ" : "▶"}</Text>
              </Pressable>
              <View style={styles.musicCopy}>
                <Text style={[styles.musicLabel, { color: palette.accent }]}>MY BGM</Text>
                <Text style={styles.musicTitle}>{page?.musicTitle || "아직 설정한 BGM이 없습니다."}</Text>
                {page!.hasMusic ? (
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
            </Card> : null}
            <View style={[styles.pageColumns, isCompactLayout && styles.pageColumnsMobile]}>
              <Card style={[styles.aboutPhotoPanel, isCompactLayout && styles.mobilePanel, housePanel]}>
                <View style={styles.photoSection}>
                  <SectionHeading color={wallpaperTextColor} title="사진첩" action={page.photos.length + " / 30"} />
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
                      {photoGroups.map((group) => {
                        const representative = group[0];
                        if (!representative) return null;
                        const extraCount = group.length - 1;
                        return (
                        <Pressable
                          key={representative.id}
                          onPress={() => setSelectedPhotoId(representative.id)}
                          style={[styles.photoTile, { borderColor: palette.accent }]}
                        >
                          <View style={styles.photoImageWrap}>
                          <Image
                            resizeMode="cover"
                            source={{ uri: profilePhotoUrl(page.user.id, representative.id) }}
                            style={styles.photoThumbnail}
                          />
                          {extraCount > 0 ? (
                            <View style={styles.photoGroupOverlay}>
                              <Text style={styles.photoGroupCount}>+{extraCount}</Text>
                            </View>
                          ) : null}
                          </View>
                          {representative.caption ? <Text numberOfLines={isNarrowLayout ? 1 : 2} style={[styles.photoCaption, { color: wallpaperTextColor }]}> {representative.caption}</Text> : null}
                          <Pressable
                            accessibilityLabel={representative.likedByMe ? "사진 좋아요 취소" : "사진 좋아요"}
                            disabled={likingPhotoId === representative.id}
                            onPress={(event) => {
                              event.stopPropagation();
                              void togglePhotoLike(representative.id, representative.likedByMe);
                            }}
                            style={styles.photoLikeButton}
                          >
                            <Text style={[styles.photoLikeText, representative.likedByMe && styles.photoLikeTextActive]}>
                              {representative.likedByMe ? "♥" : "♡"} {representative.likesCount}
                            </Text>
                          </Pressable>
                        </Pressable>
                        );
                      })}
                    </View>
                  ) : <Text style={styles.empty}>아직 사진첩에 등록된 사진이 없습니다.</Text>}
                </View>

                <View style={styles.panelSection}>
                  <SectionHeading color={wallpaperTextColor} title="About me" />
                  <Text style={[styles.bio, { color: wallpaperTextColor }]}> {page.bio || "아직 소개글이 없습니다."}</Text>
                </View>
              </Card>

              <Card style={[styles.guestbookPanel, isCompactLayout && styles.mobilePanel, housePanel]}>
                <SectionHeading color={wallpaperTextColor} title="방명록" action={page.guestbook.length + "개"} />
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
                        <Text style={[styles.authorName, { color: wallpaperTextColor }]}> {entry.author.nickname}</Text>
                        <Text style={[styles.date, { color: wallpaperMutedColor }]}> {new Date(entry.createdAt).toLocaleString("ko-KR")}</Text>
                      </View>
                      {page.isOwner || entry.author.id === user?.id ? (
                        <Pressable disabled={busy} onPress={() => void deleteGuestbook(entry.id)}>
                          <Text style={styles.deleteText}>삭제</Text>
                        </Pressable>
                      ) : null}
                    </View>
                    <Text style={[styles.guestbookText, { color: wallpaperTextColor }]}> {entry.content}</Text>
                  </View>
                ))}
                {!page.guestbook.length ? <Text style={styles.empty}>첫 번째 방명록을 남겨 보세요.</Text> : null}
              </Card>
            </View>
          </View>
        ) : !loading ? <Button label="다시 시도" onPress={() => void load()} variant="secondary" /> : null}
      </ScrollView>
      <Modal animationType="slide" onRequestClose={() => setEditing(false)} visible={editing && page?.isOwner}>
        <SafeAreaView style={[styles.editModalSafeArea, { backgroundColor: palette.background }]}>
          <View style={styles.editModalHeader}>
            <ScreenHeader title="홈피 편집" onBack={() => setEditing(false)} />
          </View>
          <ScrollView contentContainerStyle={styles.editModalContent}>
            <Card style={[styles.editorCard, themedPanel]}>
              <Text style={styles.label}>대표 이모지</Text>
              <TextInput maxLength={16} onChangeText={setEmoji} style={styles.input} value={emoji} />
              <Text style={styles.label}>상태 메시지</Text>
              <TextInput maxLength={60} onChangeText={setStatusMessage} placeholder="오늘의 기분 한 줄" placeholderTextColor={colors.subtle} style={styles.input} value={statusMessage} />
              <Text style={styles.label}>소개글</Text>
              <TextInput maxLength={500} multiline onChangeText={setBio} placeholder="나를 소개해 주세요." placeholderTextColor={colors.subtle} style={[styles.input, styles.multiline]} textAlignVertical="top" value={bio} />
              <Text style={styles.label}>BGM 제목</Text>
              <TextInput maxLength={100} onChangeText={setMusicTitle} placeholder="내 페이지에 어울리는 노래" placeholderTextColor={colors.subtle} style={styles.input} value={musicTitle} />
              <Text style={styles.musicHelp}>MP3·M4A·WAV·OGG, 최대 6MB</Text>
              <Button disabled={musicBusy || !musicTitle.trim()} label={musicBusy ? "BGM 처리 중..." : page?.hasMusic ? "BGM 음원 교체" : "BGM 음원 선택"} onPress={() => void chooseMusic()} variant="soft" />
              {page?.hasMusic ? <Button disabled={musicBusy} label="BGM 삭제" onPress={() => void removeMusic()} variant="secondary" /> : null}
              <Text style={styles.label}>방 분위기</Text>
              <View style={styles.themeRow}>
                {(Object.keys(themes) as ProfileTheme[]).map((item) => (
                  <Pressable key={item} onPress={() => setTheme(item)} style={[styles.themeChoice, { backgroundColor: (mode === "DARK" ? darkThemes : themes)[item].background, borderColor: theme === item ? (mode === "DARK" ? darkThemes : themes)[item].accent : colors.border }]}>
                    <View style={[styles.themeDot, { backgroundColor: (mode === "DARK" ? darkThemes : themes)[item].accent }]} />
                    <Text style={[styles.themeLabel, { color: mode === "DARK" ? colors.text : "#1C1C1C" }]}>{themes[item].label}</Text>
                  </Pressable>
                ))}
              </View>
              {wallpaperEditor}
              {roomDecorEditor}
              <Button disabled={busy || !emoji.trim()} label={busy ? "저장 중" : "변경사항 저장"} onPress={() => void savePage()} />
            </Card>
          </ScrollView>
        </SafeAreaView>
      </Modal>
      <Modal animationType="fade" onRequestClose={() => setSelectedPhotoId(null)} transparent visible={selectedPhotoId !== null}>
        <View style={styles.photoModalBackdrop}>
          {page && selectedPhotoId ? (() => {
            const photo = page.photos.find((item) => item.id === selectedPhotoId);
            if (!photo) return null;
            const selectedGroup = page.photos.filter((item) => photo.groupId ? item.groupId === photo.groupId : item.id === photo.id);
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
                <ScrollView contentContainerStyle={styles.photoGroupDetail} horizontal pagingEnabled style={styles.photoDetailScroller}>
                  {selectedGroup.map((groupPhoto) => (
                    <View key={groupPhoto.id} style={[styles.photoDetailPage, { width: Math.max(1, windowWidth - 36) }]}>
                      <Image
                        resizeMode="contain"
                        source={{ uri: profilePhotoUrl(page.user.id, groupPhoto.id) }}
                        style={[styles.photoDetail, { height: Math.max(240, windowHeight - 190) }]}
                      />
                      {groupPhoto.caption ? <Text style={styles.photoDetailCaption}>{groupPhoto.caption}</Text> : null}
                    </View>
                  ))}
                </ScrollView>
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
  headerEditButton: {
    minWidth: 72,
    height: 38,
    paddingHorizontal: 12,
    borderRadius: 6,
    borderWidth: 1,
    borderColor: colors.border,
    backgroundColor: colors.surface,
    alignItems: "center",
    justifyContent: "center",
  },
  headerEditButtonText: { color: colors.text, fontSize: 12, fontWeight: "900" },
  editModalSafeArea: { flex: 1 },
  editModalHeader: { paddingHorizontal: 4 },
  editModalContent: { padding: 20, paddingBottom: 48, gap: 14 },
  message: { fontSize: 12, fontWeight: "700", textAlign: "center" },
  houseShell: { borderRadius: 24, padding: 14, gap: 12, overflow: "hidden", position: "relative" },
  homeDecorLayer: { position: "absolute", left: 0, right: 0, top: 0, bottom: 0, overflow: "hidden" },
  homeDecorItem: { position: "absolute", width: 52, height: 52, alignItems: "center", justifyContent: "center", zIndex: 3 },
  homeDecorItemEditing: { backgroundColor: "rgba(255,255,255,0.7)", borderRadius: 26 },
  homeDecorEmoji: { fontSize: 38 },
  layoutEditButton: { alignSelf: "flex-end", minHeight: 38, borderRadius: 19, paddingHorizontal: 14, alignItems: "center", justifyContent: "center", position: "relative", zIndex: 5 },
  layoutEditText: { fontSize: 12, fontWeight: "900" },
  heroCard: { gap: 12, overflow: "hidden", position: "relative", zIndex: 1 },
  heroRow: { flexDirection: "row", alignItems: "center", gap: 24 },
  heroRowMobile: { gap: 10 },
  profileIdentity: { flexDirection: "row", alignItems: "center", gap: 12, flex: 0.9, minWidth: 0 },
  profileIdentityMobile: { flex: 1 },
  profileText: { flex: 1, minWidth: 0 },
  emoji: { position: "absolute", right: 16, top: 12, fontSize: 34 },
  nickname: { color: colors.text, fontSize: 23, fontWeight: "900" },
  accountId: { fontSize: 13, fontWeight: "800" },
  statusBox: { marginTop: 10, alignSelf: "stretch", padding: 12, borderRadius: 6 },
  statusText: { color: colors.text, textAlign: "center", fontSize: 13, fontWeight: "700" },
  profileActions: { flexDirection: "row", gap: 12 },
  profileAction: { flex: 1, minWidth: 0 },
  editorCard: { gap: 10 },
  label: { color: colors.text, fontSize: 12, fontWeight: "800", marginTop: 2 },
  input: { minHeight: 48, borderRadius: 6, borderWidth: 1, borderColor: colors.border, backgroundColor: colors.surface, color: colors.text, paddingHorizontal: 14, paddingVertical: 12 },
  multiline: { minHeight: 112 },
  themeRow: { flexDirection: "row", flexWrap: "wrap", gap: 8 },
  themeChoice: { minWidth: 66, padding: 9, borderRadius: 8, flexDirection: "row", alignItems: "center", gap: 6 },
  themeDot: { width: 10, height: 10, borderRadius: 5 },
  themeLabel: { color: colors.text, fontSize: 11, fontWeight: "800" },
  decorEditor: { gap: 8, marginTop: 4 },
  decorProgressHeader: { flexDirection: "row", alignItems: "center", justifyContent: "space-between", gap: 8 },
  decorPoints: { fontSize: 11, fontWeight: "900" },
  decorHelp: { color: colors.muted, fontSize: 10 },
  decorChoices: { flexDirection: "row", flexWrap: "wrap", gap: 8 },
  decorChoice: { width: 96, minHeight: 92, borderRadius: 12, backgroundColor: colors.surface, padding: 8, alignItems: "center", justifyContent: "center", gap: 3 },
  wallpaperEditor: { gap: 8, marginTop: 4 },
  wallpaperChoices: { flexDirection: "row", flexWrap: "wrap", gap: 8 },
  wallpaperChoice: { width: 112, borderRadius: 12, padding: 6, gap: 5 },
  wallpaperPreview: { height: 58, borderRadius: 10, overflow: "hidden", position: "relative" },
  wallpaperLabel: { color: colors.text, fontSize: 10, fontWeight: "800", textAlign: "center" },
  wallpaperCheck: { position: "absolute", right: 6, top: 5, width: 20, height: 20, borderRadius: 10, backgroundColor: "rgba(30,30,30,0.72)", color: "#FFFFFF", textAlign: "center", lineHeight: 20, fontSize: 12, fontWeight: "900" },
  wallpaperPatternLayer: { position: "absolute", left: 0, right: 0, top: 0, bottom: 0, overflow: "hidden" },
  wallpaperStripe: { position: "absolute", top: -20, width: 12, height: 220, transform: [{ rotate: "18deg" }] },
  wallpaperHorizontal: { position: "absolute", left: 0, right: 0, height: 2 },
  wallpaperVertical: { position: "absolute", top: 0, bottom: 0, width: 2 },
  wallpaperMotif: { position: "absolute", fontSize: 13 },
  decorIcon: { fontSize: 25 },
  decorLabel: { color: colors.text, fontSize: 10, fontWeight: "900" },
  decorState: { color: colors.muted, fontSize: 9, fontWeight: "700" },
  heroMusic: { flex: 1.1, minWidth: 0, borderLeftWidth: 1, paddingLeft: 24 },
  heroMusicMobile: { flex: 1, paddingLeft: 12 },
  heroMusicCard: { padding: 0, borderWidth: 0, borderRadius: 0, backgroundColor: "transparent" },
  musicCard: { flexDirection: "row", alignItems: "center", gap: 14 },
  musicControl: { width: 42, height: 42, borderRadius: 21, alignItems: "center", justifyContent: "center" },
  musicControlText: { color: colors.surface, fontSize: 16, fontWeight: "900", marginLeft: 2 },
  musicCopy: { flex: 1, gap: 3 },
  musicLabel: { fontSize: 10, fontWeight: "900" },
  musicTitle: { color: colors.text, fontSize: 14, fontWeight: "800" },
  musicHelp: { color: colors.muted, fontSize: 11 },
  progressTrack: { height: 4, borderRadius: 2, backgroundColor: "rgba(255,255,255,0.75)", overflow: "hidden", marginTop: 5 },
  progressFill: { height: 4, borderRadius: 2 },
  musicTime: { color: colors.muted, fontSize: 10 },
  musicError: { color: colors.red, fontSize: 10 },
  pageColumns: { flexDirection: "row", alignItems: "flex-start", gap: 14 },
  pageColumnsMobile: { flexDirection: "column", alignItems: "stretch", width: "100%", gap: 20 },
  aboutPhotoPanel: { flex: 7, minWidth: 0, gap: 18 },
  guestbookPanel: { flex: 3, minWidth: 0, gap: 14 },
  mobilePanel: { flexGrow: 0, flexShrink: 0, flexBasis: "auto", width: "100%", alignSelf: "stretch", overflow: "hidden" },
  photoSection: { gap: 14 },
  panelSection: { gap: 14, borderTopWidth: 1, borderTopColor: colors.border, paddingTop: 18 },
  bio: { color: colors.text, fontSize: 14, lineHeight: 22 },
  photoComposer: { gap: 10, padding: 12, borderRadius: 6, backgroundColor: colors.background },
  photoHelp: { color: colors.muted, fontSize: 11, textAlign: "center" },
  photoGrid: { flexDirection: "row", flexWrap: "wrap", gap: 10 },
  photoTile: { width: "31%", maxWidth: 180, borderRadius: 6, overflow: "hidden", backgroundColor: colors.surface, borderWidth: 1, borderColor: colors.border },
  photoImageWrap: { position: "relative" },
  photoThumbnail: { width: "100%", aspectRatio: 1, backgroundColor: colors.background },
  photoGroupOverlay: { ...StyleSheet.absoluteFill, backgroundColor: "rgba(0,0,0,0.64)", alignItems: "center", justifyContent: "center" },
  photoGroupCount: { color: "#FFFFFF", fontSize: 28, fontWeight: "900", textShadowColor: "rgba(0,0,0,0.55)", textShadowOffset: { width: 0, height: 1 }, textShadowRadius: 3 },
  photoCaption: { color: colors.text, fontSize: 10, lineHeight: 14, fontWeight: "700", paddingHorizontal: 7, paddingTop: 6, minHeight: 28 },
  photoLikeButton: { paddingHorizontal: 7, paddingBottom: 7, paddingTop: 3 },
  photoLikeText: { color: colors.muted, fontSize: 12, fontWeight: "900" },
  photoLikeTextActive: { color: colors.red },
  photoModalBackdrop: { flex: 1, backgroundColor: "rgba(18,19,24,0.94)", justifyContent: "center" },
  photoModalContent: { flex: 1, padding: 18, justifyContent: "center", gap: 14 },
  photoModalHeader: { position: "absolute", top: 16, left: 18, right: 18, zIndex: 2, flexDirection: "row", justifyContent: "space-between" },
  photoModalButton: { minWidth: 60, height: 42, borderRadius: 6, paddingHorizontal: 14, backgroundColor: "rgba(255,255,255,0.16)", alignItems: "center", justifyContent: "center" },
  photoModalButtonText: { color: colors.surface, fontSize: 13, fontWeight: "900" },
  photoDeleteButton: { backgroundColor: "rgba(232,93,106,0.22)" },
  photoDeleteText: { color: "#FF9AA4", fontSize: 13, fontWeight: "900" },
  photoDetailScroller: { flex: 1, width: "100%" },
  photoDetail: { width: "100%", maxWidth: "100%", backgroundColor: "#0B0B0C" },
  photoGroupDetail: { flexGrow: 1, alignItems: "center" },
  photoDetailPage: { flex: 1, alignItems: "center", justifyContent: "center", gap: 14 },
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
