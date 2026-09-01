import type { NativeStackScreenProps } from "@react-navigation/native-stack";
import { useEffect, useState } from "react";
import { ActivityIndicator, Pressable, StyleSheet, Text, TextInput, View } from "react-native";
import { SafeAreaView } from "react-native-safe-area-context";
import type { RootStackParamList } from "../../App";
import { Button, LogoMark } from "../components/ui";
import { GoogleAuthButton } from "../components/GoogleAuthButton";
import { useSession } from "../services/session";
import { colors } from "../theme/colors";

type Props = NativeStackScreenProps<RootStackParamList, "Login">;

export function LoginScreen({ navigation }: Props) {
  const session = useSession();
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [error, setError] = useState("");
  const [submitting, setSubmitting] = useState(false);
  const [rememberLogin, setRememberLogin] = useState(true);

  useEffect(() => {
    if (session.loading) return;
    setRememberLogin(session.rememberLogin);
    if (session.savedEmail) setEmail(session.savedEmail);
  }, [session.loading, session.rememberLogin, session.savedEmail]);

  async function submit() {
    setSubmitting(true);
    setError("");
    try {
      await session.login(email.trim(), password, rememberLogin);
      navigation.replace("Home");
    } catch (caught) {
      setError(caught instanceof Error ? caught.message : "로그인하지 못했습니다.");
    } finally {
      setSubmitting(false);
    }
  }

  async function reconnectStoredSession() {
    setSubmitting(true);
    setError("");
    try {
      await session.refreshUser();
      navigation.replace("Home");
    } catch (caught) {
      setError(caught instanceof Error ? caught.message : "서버에 다시 연결하지 못했습니다.");
    } finally {
      setSubmitting(false);
    }
  }

  if (session.loading) {
    return <SafeAreaView style={styles.center}><ActivityIndicator color={colors.primary} /></SafeAreaView>;
  }
  if (session.user) {
    navigation.replace("Home");
    return null;
  }
  if (session.accessToken) {
    return (
      <SafeAreaView style={styles.safeArea}>
        <View style={styles.container}>
          <LogoMark />
          <Text style={styles.brand}>MeetFair</Text>
          <Text style={styles.title}>서버 연결이 지연되고 있어요</Text>
          <Text style={styles.recoveryText}>로그인 정보는 안전하게 유지했습니다. 네트워크를 확인한 뒤 다시 연결해 주세요.</Text>
          {error ? <Text style={styles.error}>{error}</Text> : null}
          <Button disabled={submitting} label={submitting ? "연결 중..." : "다시 연결"} onPress={reconnectStoredSession} />
          <Button label="다른 계정으로 로그인" onPress={() => void session.logout()} variant="secondary" />
        </View>
      </SafeAreaView>
    );
  }

  return (
    <SafeAreaView style={styles.safeArea}>
      <View style={styles.container}>
        <LogoMark />
        <Text style={styles.brand}>MeetFair</Text>
        <Text style={styles.title}>친구들과 공평하게 만나요</Text>
        <TextInput
          autoCapitalize="none"
          keyboardType="email-address"
          onChangeText={setEmail}
          placeholder="이메일"
          placeholderTextColor={colors.subtle}
          style={styles.input}
          value={email}
        />
        <TextInput
          autoCapitalize="none"
          onChangeText={setPassword}
          placeholder="비밀번호"
          placeholderTextColor={colors.subtle}
          secureTextEntry
          style={styles.input}
          value={password}
        />
        <Pressable
          accessibilityRole="checkbox"
          accessibilityState={{ checked: rememberLogin }}
          onPress={() => setRememberLogin((current) => !current)}
          style={styles.rememberRow}
        >
          <View style={[styles.checkbox, rememberLogin && styles.checkboxChecked]}>
            {rememberLogin ? <Text style={styles.checkmark}>✓</Text> : null}
          </View>
          <View style={styles.rememberCopy}>
            <Text style={styles.rememberLabel}>로그인 정보 저장</Text>
            <Text style={styles.rememberHelp}>이메일과 로그인 상태만 저장하며 비밀번호는 저장하지 않습니다.</Text>
          </View>
        </Pressable>
        {error ? <Text style={styles.error}>{error}</Text> : null}
        <Button disabled={submitting || !email || password.length < 8} label={submitting ? "로그인 중..." : "로그인"} onPress={submit} />
        <GoogleAuthButton
          label="Google로 로그인"
          onError={(caught) => setError(caught.message)}
          onIdToken={async (idToken) => {
            setError("");
            await session.googleLogin(idToken);
            navigation.replace("Home");
          }}
        />
        <Button label="계정 만들기" onPress={() => navigation.navigate("Register")} variant="secondary" />
      </View>
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  safeArea: { flex: 1, backgroundColor: colors.background, justifyContent: "center" },
  center: { flex: 1, alignItems: "center", justifyContent: "center", backgroundColor: colors.background },
  container: { padding: 24, gap: 14 },
  brand: { color: colors.primary, fontSize: 17, fontWeight: "900" },
  title: { color: colors.text, fontSize: 28, fontWeight: "900", marginBottom: 12 },
  input: { height: 54, borderRadius: 6, backgroundColor: colors.surface, borderWidth: 1, borderColor: colors.border, paddingHorizontal: 16, color: colors.text },
  rememberRow: { flexDirection: "row", alignItems: "center", gap: 10, paddingVertical: 2 },
  checkbox: { width: 22, height: 22, borderRadius: 7, borderWidth: 1, borderColor: colors.border, backgroundColor: colors.surface, alignItems: "center", justifyContent: "center" },
  checkboxChecked: { borderColor: colors.primary, backgroundColor: colors.primary },
  checkmark: { color: colors.surface, fontSize: 14, fontWeight: "900" },
  rememberCopy: { flex: 1, gap: 2 },
  rememberLabel: { color: colors.text, fontSize: 13, fontWeight: "800" },
  rememberHelp: { color: colors.muted, fontSize: 10, lineHeight: 14 },
  recoveryText: { color: colors.muted, fontSize: 14, lineHeight: 22, marginBottom: 8 },
  error: { color: colors.red, fontSize: 12 },
});
