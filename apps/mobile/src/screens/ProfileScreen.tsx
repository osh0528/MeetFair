import * as ImagePicker from "expo-image-picker";
import { manipulateAsync, SaveFormat } from "expo-image-manipulator";
import type { NativeStackScreenProps } from "@react-navigation/native-stack";
import { useState } from "react";
import { Image, Modal, Pressable, ScrollView, StyleSheet, Text, TextInput, View } from "react-native";
import { SafeAreaView } from "react-native-safe-area-context";
import type { RootStackParamList } from "../../App";
import { Avatar, Button, Card, ScreenHeader } from "../components/ui";
import { apiRequest } from "../services/api";
import { avatarUrl } from "../services/avatar";
import { useSession } from "../services/session";
import { colors } from "../theme/colors";

type Props = NativeStackScreenProps<RootStackParamList, "Profile">;
const cropFrameSize = 260;

type PendingAvatar = {
  uri: string;
  width: number;
  height: number;
};

export function ProfileScreen({ navigation }: Props) {
  const session = useSession();
  const [nickname, setNickname] = useState(session.user?.nickname ?? "");
  const [email, setEmail] = useState(session.user?.email ?? "");
  const [currentPassword, setCurrentPassword] = useState("");
  const [newPassword, setNewPassword] = useState("");
  const [submitting, setSubmitting] = useState(false);
  const [message, setMessage] = useState("");
  const [error, setError] = useState("");
  const [deleteAccountId, setDeleteAccountId] = useState("");
  const [deletePassword, setDeletePassword] = useState("");
  const [deleting, setDeleting] = useState(false);
  const [avatarBusy, setAvatarBusy] = useState(false);
  const [pendingAvatar, setPendingAvatar] = useState<PendingAvatar | null>(null);
  const [cropZoom, setCropZoom] = useState(1);
  const [cropOffsetX, setCropOffsetX] = useState(0);
  const [cropOffsetY, setCropOffsetY] = useState(0);

  async function save() {
    setSubmitting(true);
    setMessage("");
    setError("");
    try {
      await apiRequest("/users/me", {
        method: "PATCH",
        body: JSON.stringify({
          nickname: nickname.trim(),
          email: email.trim(),
          currentPassword: currentPassword || undefined,
          newPassword: newPassword || undefined,
        }),
      });
      await session.refreshUser();
      setCurrentPassword("");
      setNewPassword("");
      setMessage("개인정보를 수정했습니다.");
    } catch (caught) {
      setError(caught instanceof Error ? caught.message : "개인정보를 수정하지 못했습니다.");
    } finally {
      setSubmitting(false);
    }
  }
  async function deleteAccount() {
    setDeleting(true);
    setMessage("");
    setError("");
    try {
      await apiRequest("/users/me", {
        method: "DELETE",
        body: JSON.stringify({
          accountId: deleteAccountId.trim(),
          currentPassword: deletePassword || undefined,
        }),
      });
      await session.logout();
      navigation.reset({ index: 0, routes: [{ name: "Login" }] });
    } catch (caught) {
      setError(caught instanceof Error ? caught.message : "회원 탈퇴를 처리하지 못했습니다.");
    } finally {
      setDeleting(false);
    }
  }
  async function chooseAvatar() {
    setAvatarBusy(true);
    setMessage("");
    setError("");
    try {
      const permission = await ImagePicker.requestMediaLibraryPermissionsAsync();
      if (!permission.granted) {
        setError("프로필 사진을 선택하려면 사진 접근 권한이 필요합니다.");
        return;
      }
      const result = await ImagePicker.launchImageLibraryAsync({
        mediaTypes: ImagePicker.MediaTypeOptions.Images,
        allowsEditing: false,
        quality: 1,
      });
      if (result.canceled) return;
      const image = result.assets[0];
      if (!image?.uri || !image.width || !image.height) throw new Error("선택한 사진을 읽지 못했습니다.");
      setCropZoom(1);
      setCropOffsetX(0);
      setCropOffsetY(0);
      setPendingAvatar({ uri: image.uri, width: image.width, height: image.height });
      setMessage("사진을 확대하거나 위치를 조절한 뒤 적용해 주세요.");
    } catch (caught) {
      setError(caught instanceof Error ? caught.message : "프로필 사진을 변경하지 못했습니다.");
    } finally {
      setAvatarBusy(false);
    }
  }

  function cropMetrics(image: PendingAvatar, zoom = cropZoom) {
    const scale = Math.max(cropFrameSize / image.width, cropFrameSize / image.height) * zoom;
    const width = image.width * scale;
    const height = image.height * scale;
    return {
      scale,
      width,
      height,
      maxX: Math.max(0, (width - cropFrameSize) / 2),
      maxY: Math.max(0, (height - cropFrameSize) / 2),
    };
  }

  function moveCrop(deltaX: number, deltaY: number) {
    if (!pendingAvatar) return;
    const metrics = cropMetrics(pendingAvatar);
    setCropOffsetX((current) => Math.max(-metrics.maxX, Math.min(metrics.maxX, current + deltaX)));
    setCropOffsetY((current) => Math.max(-metrics.maxY, Math.min(metrics.maxY, current + deltaY)));
  }

  function changeCropZoom(delta: number) {
    if (!pendingAvatar) return;
    const nextZoom = Math.max(1, Math.min(3, Number((cropZoom + delta).toFixed(1))));
    const metrics = cropMetrics(pendingAvatar, nextZoom);
    setCropZoom(nextZoom);
    setCropOffsetX((current) => Math.max(-metrics.maxX, Math.min(metrics.maxX, current)));
    setCropOffsetY((current) => Math.max(-metrics.maxY, Math.min(metrics.maxY, current)));
  }

  async function applyAvatar() {
    if (!pendingAvatar || avatarBusy) return;
    setAvatarBusy(true);
    setMessage("");
    setError("");
    try {
      const metrics = cropMetrics(pendingAvatar);
      const size = Math.max(1, Math.min(
        pendingAvatar.width,
        pendingAvatar.height,
        Math.floor(cropFrameSize / metrics.scale),
      ));
      const originX = Math.max(0, Math.min(
        pendingAvatar.width - size,
        Math.round(((metrics.width - cropFrameSize) / 2 - cropOffsetX) / metrics.scale),
      ));
      const originY = Math.max(0, Math.min(
        pendingAvatar.height - size,
        Math.round(((metrics.height - cropFrameSize) / 2 - cropOffsetY) / metrics.scale),
      ));
      const edited = await manipulateAsync(
        pendingAvatar.uri,
        [
          { crop: { originX, originY, width: size, height: size } },
          { resize: { width: 800, height: 800 } },
        ],
        { base64: true, compress: 0.78, format: SaveFormat.JPEG },
      );
      if (!edited.base64) throw new Error("조절한 사진을 저장하지 못했습니다.");
      await apiRequest("/users/me/avatar", {
        method: "PUT",
        body: JSON.stringify({ imageBase64: edited.base64, mimeType: "image/jpeg" }),
      });
      setPendingAvatar(null);
      await session.refreshUser();
      setMessage("조절한 프로필 사진을 적용했습니다.");
    } catch (caught) {
      setError(caught instanceof Error ? caught.message : "프로필 사진을 적용하지 못했습니다.");
    } finally {
      setAvatarBusy(false);
    }
  }
  async function removeAvatar() {
    setAvatarBusy(true);
    setMessage("");
    setError("");
    try {
      await apiRequest("/users/me/avatar", { method: "DELETE" });
      await session.refreshUser();
      setMessage("프로필 사진을 삭제했습니다.");
    } catch (caught) {
      setError(caught instanceof Error ? caught.message : "프로필 사진을 삭제하지 못했습니다.");
    } finally {
      setAvatarBusy(false);
    }
  }

  return (
    <SafeAreaView style={styles.safeArea}>
      <ScreenHeader title="개인정보" onBack={() => navigation.goBack()} />
      <ScrollView contentContainerStyle={styles.content} keyboardShouldPersistTaps="handled">
        <Card style={styles.avatarCard}>
          <Avatar
            imageUrl={session.user ? avatarUrl(session.user.id, session.user.avatarUpdatedAt) : undefined}
            name={session.user?.nickname ?? "M"}
            size={96}
          />
          <Text style={styles.sectionTitle}>프로필 사진</Text>
          <Button disabled={avatarBusy} label={avatarBusy ? "처리 중..." : "사진 선택 및 조절"} onPress={chooseAvatar} variant="soft" />
          {session.user?.avatarUpdatedAt ? <Button disabled={avatarBusy} label="사진 삭제" onPress={removeAvatar} variant="secondary" /> : null}
          <Text style={styles.note}>사진 선택 후 확대·축소와 위치를 조절할 수 있습니다. 적용 이미지는 정사각형 JPEG로 저장됩니다.</Text>
        </Card>
        <Card style={styles.form}>
          <Field editable={false} label="계정 ID (수정 불가)" value={session.user?.accountId ?? ""} />
          <Field label="이름" onChangeText={setNickname} value={nickname} />
          <Field
            autoCapitalize="none"
            keyboardType="email-address"
            label="이메일"
            onChangeText={setEmail}
            value={email}
          />
        </Card>
        <Card style={styles.form}>
          <Text style={styles.sectionTitle}>비밀번호 변경</Text>
          <Text style={styles.note}>
            일반 계정은 현재 비밀번호가 필요합니다. Google 전용 계정은 현재 비밀번호 없이 새 비밀번호를 설정할 수 있습니다.
          </Text>
          <Field
            label="현재 비밀번호"
            onChangeText={setCurrentPassword}
            secureTextEntry
            value={currentPassword}
          />
          <Field
            label="새 비밀번호 (8자 이상)"
            onChangeText={setNewPassword}
            secureTextEntry
            value={newPassword}
          />
        </Card>
        {message ? <Text style={styles.success}>{message}</Text> : null}
        {error ? <Text style={styles.error}>{error}</Text> : null}
        <Button
          disabled={submitting || nickname.trim().length < 2 || !email.trim() || (newPassword.length > 0 && newPassword.length < 8)}
          label={submitting ? "저장 중..." : "저장"}
          onPress={save}
        />
        <Card style={styles.dangerCard}>
          <Text style={styles.dangerTitle}>회원 탈퇴</Text>
          <Text style={styles.note}>탈퇴하면 내가 만든 모임과 계정 데이터가 삭제되며 복구할 수 없습니다. 확인을 위해 계정 ID를 입력해 주세요.</Text>
          <Field
            autoCapitalize="none"
            label="계정 ID 확인"
            onChangeText={setDeleteAccountId}
            value={deleteAccountId}
          />
          <Field
            label="현재 비밀번호"
            onChangeText={setDeletePassword}
            secureTextEntry
            value={deletePassword}
          />
          <Button
            disabled={deleting || deleteAccountId.trim() !== session.user?.accountId}
            label={deleting ? "탈퇴 처리 중..." : "회원 탈퇴"}
            onPress={deleteAccount}
            variant="secondary"
          />
        </Card>
      </ScrollView>
      <Modal animationType="slide" onRequestClose={() => !avatarBusy && setPendingAvatar(null)} transparent visible={pendingAvatar !== null}>
        <View style={styles.modalBackdrop}>
          <SafeAreaView style={styles.editorSheet}>
            <Text style={styles.editorTitle}>프로필 사진 조절</Text>
            <Text style={styles.editorNote}>원 안에 보일 부분을 맞춰 주세요.</Text>
            {pendingAvatar ? (() => {
              const metrics = cropMetrics(pendingAvatar);
              return (
                <View style={styles.cropFrame}>
                  <Image
                    source={{ uri: pendingAvatar.uri }}
                    style={{
                      position: "absolute",
                      width: metrics.width,
                      height: metrics.height,
                      left: (cropFrameSize - metrics.width) / 2 + cropOffsetX,
                      top: (cropFrameSize - metrics.height) / 2 + cropOffsetY,
                    }}
                  />
                  <View pointerEvents="none" style={styles.cropGuideVertical} />
                  <View pointerEvents="none" style={styles.cropGuideHorizontal} />
                </View>
              );
            })() : null}
            <View style={styles.zoomRow}>
              <AdjustButton label="−" onPress={() => changeCropZoom(-0.2)} />
              <Text style={styles.zoomText}>확대 {Math.round(cropZoom * 100)}%</Text>
              <AdjustButton label="+" onPress={() => changeCropZoom(0.2)} />
            </View>
            <View style={styles.directionPad}>
              <AdjustButton label="↑" onPress={() => moveCrop(0, 18)} />
              <View style={styles.directionRow}>
                <AdjustButton label="←" onPress={() => moveCrop(18, 0)} />
                <Pressable onPress={() => { setCropZoom(1); setCropOffsetX(0); setCropOffsetY(0); }} style={styles.resetButton}>
                  <Text style={styles.resetText}>초기화</Text>
                </Pressable>
                <AdjustButton label="→" onPress={() => moveCrop(-18, 0)} />
              </View>
              <AdjustButton label="↓" onPress={() => moveCrop(0, -18)} />
            </View>
            <View style={styles.editorActions}>
              <Button disabled={avatarBusy} label="취소" onPress={() => setPendingAvatar(null)} variant="secondary" />
              <Button disabled={avatarBusy} label={avatarBusy ? "적용 중..." : "이대로 적용"} onPress={() => void applyAvatar()} />
            </View>
          </SafeAreaView>
        </View>
      </Modal>
    </SafeAreaView>
  );
}

function AdjustButton({ label, onPress }: { label: string; onPress: () => void }) {
  return (
    <Pressable onPress={onPress} style={({ pressed }) => [styles.adjustButton, pressed && styles.adjustPressed]}>
      <Text style={styles.adjustText}>{label}</Text>
    </Pressable>
  );
}

function Field({ label, ...props }: React.ComponentProps<typeof TextInput> & { label: string }) {
  return (
    <>
      <Text style={styles.label}>{label}</Text>
      <TextInput
        {...props}
        placeholderTextColor={colors.subtle}
        style={[styles.input, props.editable === false && styles.readOnly]}
      />
    </>
  );
}

const styles = StyleSheet.create({
  safeArea: { flex: 1, backgroundColor: colors.background },
  content: { padding: 20, gap: 14 },
  form: { gap: 10 },
  sectionTitle: { color: colors.text, fontSize: 17, fontWeight: "900" },
  label: { color: colors.text, fontSize: 13, fontWeight: "800", marginTop: 4 },
  input: {
    height: 52,
    borderRadius: 15,
    borderWidth: 1,
    borderColor: colors.border,
    backgroundColor: colors.surface,
    paddingHorizontal: 15,
    color: colors.text,
  },
  readOnly: { backgroundColor: colors.background, color: colors.muted },
  note: { color: colors.muted, fontSize: 12, lineHeight: 18 },
  success: { color: colors.green, fontSize: 13, fontWeight: "700" },
  error: { color: colors.red, fontSize: 13 },
  dangerCard: { gap: 10, borderColor: colors.red },
  dangerTitle: { color: colors.red, fontSize: 17, fontWeight: "900" },
  avatarCard: { alignItems: "center", gap: 10 },
  modalBackdrop: { flex: 1, backgroundColor: "rgba(25,26,32,0.55)", justifyContent: "flex-end" },
  editorSheet: { backgroundColor: colors.surface, borderTopLeftRadius: 28, borderTopRightRadius: 28, padding: 22, alignItems: "center", gap: 12 },
  editorTitle: { color: colors.text, fontSize: 20, fontWeight: "900" },
  editorNote: { color: colors.muted, fontSize: 12 },
  cropFrame: { width: cropFrameSize, height: cropFrameSize, borderRadius: cropFrameSize / 2, overflow: "hidden", backgroundColor: colors.charcoal, borderWidth: 4, borderColor: colors.primary },
  cropGuideVertical: { position: "absolute", top: 0, bottom: 0, left: "50%", width: 1, backgroundColor: "rgba(255,255,255,0.45)" },
  cropGuideHorizontal: { position: "absolute", left: 0, right: 0, top: "50%", height: 1, backgroundColor: "rgba(255,255,255,0.45)" },
  zoomRow: { flexDirection: "row", alignItems: "center", gap: 14 },
  zoomText: { minWidth: 92, textAlign: "center", color: colors.text, fontSize: 13, fontWeight: "800" },
  directionPad: { alignItems: "center", gap: 6 },
  directionRow: { flexDirection: "row", alignItems: "center", gap: 6 },
  adjustButton: { width: 44, height: 40, borderRadius: 13, backgroundColor: colors.primarySoft, alignItems: "center", justifyContent: "center" },
  adjustPressed: { opacity: 0.7 },
  adjustText: { color: colors.primary, fontSize: 22, fontWeight: "900" },
  resetButton: { width: 72, height: 40, borderRadius: 13, backgroundColor: colors.background, alignItems: "center", justifyContent: "center" },
  resetText: { color: colors.text, fontSize: 12, fontWeight: "800" },
  editorActions: { alignSelf: "stretch", gap: 8, marginTop: 2 },
});
