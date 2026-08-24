import type { NativeStackScreenProps } from "@react-navigation/native-stack";
import { useState } from "react";
import { ScrollView, StyleSheet, Text, TextInput } from "react-native";
import { SafeAreaView } from "react-native-safe-area-context";
import type { RootStackParamList } from "../../App";
import { Button, Card, ScreenHeader } from "../components/ui";
import { apiRequest } from "../services/api";
import { useSession } from "../services/session";
import { colors } from "../theme/colors";

type Props = NativeStackScreenProps<RootStackParamList, "Profile">;

export function ProfileScreen({ navigation }: Props) {
  const session = useSession();
  const [nickname, setNickname] = useState(session.user?.nickname ?? "");
  const [email, setEmail] = useState(session.user?.email ?? "");
  const [currentPassword, setCurrentPassword] = useState("");
  const [newPassword, setNewPassword] = useState("");
  const [submitting, setSubmitting] = useState(false);
  const [message, setMessage] = useState("");
  const [error, setError] = useState("");

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

  return (
    <SafeAreaView style={styles.safeArea}>
      <ScreenHeader title="개인정보" onBack={() => navigation.goBack()} />
      <ScrollView contentContainerStyle={styles.content} keyboardShouldPersistTaps="handled">
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
      </ScrollView>
    </SafeAreaView>
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
});
