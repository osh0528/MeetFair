import type { NativeStackScreenProps } from "@react-navigation/native-stack";
import { useEffect, useState } from "react";
import { ScrollView, StyleSheet, Text, TextInput, View } from "react-native";
import { SafeAreaView } from "react-native-safe-area-context";
import type { RootStackParamList } from "../../App";
import { Button, ScreenHeader } from "../components/ui";
import { GoogleAuthButton } from "../components/GoogleAuthButton";
import { apiRequest } from "../services/api";
import { useSession } from "../services/session";
import { colors } from "../theme/colors";
import type { AddressSelection } from "../types/location";

type Props = NativeStackScreenProps<RootStackParamList, "Register">;

export function RegisterScreen({ navigation, route }: Props) {
  const session = useSession();
  const [nickname, setNickname] = useState("");
  const [accountId, setAccountId] = useState("");
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [address, setAddress] = useState<AddressSelection | null>(route.params?.selectedAddress ?? null);
  const [available, setAvailable] = useState<boolean | null>(null);
  const [checkingAccountId, setCheckingAccountId] = useState(false);
  const [availabilityError, setAvailabilityError] = useState("");
  const [error, setError] = useState("");
  const [submitting, setSubmitting] = useState(false);

  useEffect(() => {
    if (route.params?.selectedAddress) setAddress(route.params.selectedAddress);
  }, [route.params?.selectedAddress]);

  useEffect(() => {
    setAvailable(null);
    setAvailabilityError("");
    setCheckingAccountId(false);
    if (!/^[a-z0-9]{4,20}$/.test(accountId)) return;
    let cancelled = false;
    const timer = setTimeout(() => {
      setCheckingAccountId(true);
      void apiRequest<{ accountId: string; available: boolean }>(
        `/users/account-id/availability?accountId=${encodeURIComponent(accountId)}`,
      ).then((data) => {
        if (!cancelled) setAvailable(data.available);
      }).catch((caught) => {
        if (!cancelled) {
          setAvailable(null);
          setAvailabilityError(caught instanceof Error ? caught.message : "계정 ID를 확인하지 못했습니다.");
        }
      }).finally(() => {
        if (!cancelled) setCheckingAccountId(false);
      });
    }, 350);
    return () => {
      cancelled = true;
      clearTimeout(timer);
    };
  }, [accountId]);

  async function submit() {
    setSubmitting(true);
    setError("");
    try {
      await session.register({ email: email.trim(), password, nickname: nickname.trim(), accountId });
      if (address) {
        await apiRequest("/users/me/home", {
          method: "PUT",
          body: JSON.stringify(address),
        });
        await session.refreshUser();
      }
      navigation.replace("Home");
    } catch (caught) {
      setError(caught instanceof Error ? caught.message : "가입하지 못했습니다.");
    } finally {
      setSubmitting(false);
    }
  }

  return (
    <SafeAreaView style={styles.safeArea}>
      <ScreenHeader title="회원가입" onBack={() => navigation.goBack()} />
      <ScrollView contentContainerStyle={styles.content} keyboardShouldPersistTaps="handled">
        <Text style={styles.title}>친구가 찾을 수 있는 ID를 정하세요</Text>
        <Field label="계정 ID" value={accountId} onChangeText={(value) => setAccountId(value.toLowerCase().replace(/[^a-z0-9]/g, ""))} autoCapitalize="none" placeholder="영문·숫자 4~20자" />
        {checkingAccountId ? <Text style={styles.hint}>계정 ID 확인 중...</Text> : null}
        {!checkingAccountId && available !== null ? <Text style={[styles.hint, !available && styles.error]}>{available ? "사용 가능한 ID입니다." : "이미 사용 중인 ID입니다."}</Text> : null}
        {availabilityError ? <Text style={styles.error}>{availabilityError}</Text> : null}
        <Field label="닉네임" value={nickname} onChangeText={setNickname} placeholder="친구에게 보일 이름" />
        <Field label="이메일" value={email} onChangeText={setEmail} autoCapitalize="none" keyboardType="email-address" placeholder="meetfair@example.com" />
        <Field label="비밀번호" value={password} onChangeText={setPassword} secureTextEntry placeholder="8자 이상" />
        <Button label={address ? address.address : "집 위치 설정 (선택)"} onPress={() => navigation.navigate("AddressSearch")} variant="secondary" />
        <Text style={styles.hint}>선택 사항이며, 나중에 설정할 수 있습니다. 설정한 위치는 장소 추천 계산에만 사용됩니다.</Text>
        {error ? <Text style={styles.error}>{error}</Text> : null}
        <Button
          disabled={submitting || checkingAccountId || available !== true || nickname.trim().length < 2 || !email || password.length < 8}
          label={submitting ? "가입 중..." : "가입하기"}
          onPress={submit}
        />
        <GoogleAuthButton
          disabled={checkingAccountId || available !== true || nickname.trim().length < 2}
          label="Google로 가입"
          onError={(caught) => setError(caught.message)}
          onIdToken={async (idToken) => {
            setError("");
            await session.googleLogin(idToken, {
              accountId,
              nickname: nickname.trim(),
            });
            navigation.replace("Home");
          }}
        />
      </ScrollView>
    </SafeAreaView>
  );
}

function Field(props: React.ComponentProps<typeof TextInput> & { label: string }) {
  const { label, ...inputProps } = props;
  return <View style={styles.field}><Text style={styles.label}>{label}</Text><TextInput {...inputProps} placeholderTextColor={colors.subtle} style={styles.input} /></View>;
}

const styles = StyleSheet.create({
  safeArea: { flex: 1, backgroundColor: colors.background },
  content: { padding: 20, gap: 14 },
  title: { color: colors.text, fontSize: 24, lineHeight: 32, fontWeight: "900", marginBottom: 8 },
  field: { gap: 7 },
  label: { color: colors.text, fontSize: 13, fontWeight: "800" },
  input: { height: 52, borderRadius: 15, borderWidth: 1, borderColor: colors.border, backgroundColor: colors.surface, paddingHorizontal: 15, color: colors.text },
  hint: { color: colors.muted, fontSize: 11 },
  error: { color: colors.red, fontSize: 12 },
});
