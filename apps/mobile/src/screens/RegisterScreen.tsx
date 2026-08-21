import type { NativeStackScreenProps } from "@react-navigation/native-stack";
import { useEffect, useState } from "react";
import {
  KeyboardAvoidingView,
  Platform,
  Pressable,
  ScrollView,
  StyleSheet,
  Text,
  TextInput,
  View,
} from "react-native";
import { SafeAreaView } from "react-native-safe-area-context";
import type { RootStackParamList } from "../../App";
import { Button, ScreenHeader } from "../components/ui";
import { colors } from "../theme/colors";
import type { AddressSelection } from "../types/location";

type Props = NativeStackScreenProps<RootStackParamList, "Register">;

export function RegisterScreen({ navigation, route }: Props) {
  const [nickname, setNickname] = useState("");
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [address, setAddress] = useState<AddressSelection | null>(
    route.params?.selectedAddress ?? null,
  );
  const [agreed, setAgreed] = useState(false);

  useEffect(() => {
    if (route.params?.selectedAddress) {
      setAddress(route.params.selectedAddress);
    }
  }, [route.params?.selectedAddress]);

  return (
    <SafeAreaView style={styles.safeArea} edges={["top", "bottom"]}>
      <ScreenHeader title="회원가입" onBack={() => navigation.goBack()} />
      <KeyboardAvoidingView
        behavior={Platform.OS === "ios" ? "padding" : undefined}
        style={styles.flex}
      >
        <ScrollView
          contentContainerStyle={styles.page}
          keyboardShouldPersistTaps="handled"
          showsVerticalScrollIndicator={false}
        >
          <View style={styles.container}>
            <View style={styles.intro}>
              <Text style={styles.eyebrow}>MeetFair 시작하기</Text>
              <Text style={styles.title}>기본 정보를 입력해주세요</Text>
              <Text style={styles.description}>
                집 주소는 공평한 약속 장소를 추천할 때 출발지로 사용돼요.
              </Text>
            </View>

            <View style={styles.form}>
              <FormField
                label="닉네임"
                onChangeText={setNickname}
                placeholder="친구들에게 보일 이름"
                value={nickname}
              />
              <FormField
                autoCapitalize="none"
                keyboardType="email-address"
                label="이메일"
                onChangeText={setEmail}
                placeholder="meetfair@example.com"
                value={email}
              />
              <FormField
                autoCapitalize="none"
                label="비밀번호"
                onChangeText={setPassword}
                placeholder="8자 이상 입력하세요"
                secureTextEntry
                value={password}
              />

              <View style={styles.addressSection}>
                <View style={styles.addressLabelRow}>
                  <Text style={styles.label}>집 주소</Text>
                  <Text style={styles.required}>필수</Text>
                </View>
                <Pressable
                  accessibilityRole="button"
                  onPress={() => navigation.navigate("AddressSearch")}
                  style={({ pressed }) => [styles.addressButton, pressed && styles.pressed]}
                >
                  <View style={styles.addressIcon}><Text style={styles.addressIconText}>N</Text></View>
                  <View style={styles.addressCopy}>
                    <Text style={[styles.addressText, !address && styles.addressPlaceholder]}>
                      {address?.address ?? "네이버 지도에서 주소 찾기"}
                    </Text>
                    {address ? (
                      <Text style={styles.coordinateText}>
                        {address.latitude.toFixed(5)}, {address.longitude.toFixed(5)}
                      </Text>
                    ) : null}
                  </View>
                  <Text style={styles.chevron}>›</Text>
                </Pressable>
                <View style={styles.privacyBox}>
                  <Text style={styles.privacyMark}>✓</Text>
                  <Text style={styles.privacyText}>
                    집 주소는 장소 추천에만 사용되며 다른 참가자에게 상세 주소가 공개되지 않아요.
                  </Text>
                </View>
              </View>

              <Pressable onPress={() => setAgreed((current) => !current)} style={styles.agreement}>
                <View style={[styles.checkbox, agreed && styles.checkboxChecked]}>
                  {agreed ? <Text style={styles.check}>✓</Text> : null}
                </View>
                <Text style={styles.agreementText}>이용약관 및 개인정보 처리방침에 동의합니다.</Text>
              </Pressable>

              <Button
                disabled={!nickname || !email || password.length < 8 || !address || !agreed}
                label="가입하고 시작하기"
                onPress={() => navigation.replace("Home")}
              />
              <Text style={styles.mockNotice}>현재는 화면 확인용이며 회원 정보가 서버에 저장되지 않습니다.</Text>
            </View>
          </View>
        </ScrollView>
      </KeyboardAvoidingView>
    </SafeAreaView>
  );
}

function FormField({ label, ...inputProps }: { label: string } & React.ComponentProps<typeof TextInput>) {
  return (
    <View style={styles.field}>
      <Text style={styles.label}>{label}</Text>
      <TextInput
        placeholderTextColor={colors.subtle}
        style={styles.input}
        {...inputProps}
      />
    </View>
  );
}

const styles = StyleSheet.create({
  safeArea: { flex: 1, backgroundColor: colors.background },
  flex: { flex: 1 },
  page: { flexGrow: 1, alignItems: "center", paddingHorizontal: 20, paddingTop: 16, paddingBottom: 28 },
  container: { width: "100%", maxWidth: 520 },
  intro: { gap: 7, marginBottom: 25 },
  eyebrow: { color: colors.primary, fontSize: 13, fontWeight: "900" },
  title: { color: colors.text, fontSize: 27, lineHeight: 35, fontWeight: "900" },
  description: { color: colors.muted, fontSize: 13, lineHeight: 20 },
  form: { gap: 17 },
  field: { gap: 8 },
  label: { color: colors.text, fontSize: 13, fontWeight: "800" },
  input: { height: 54, borderRadius: 16, backgroundColor: colors.surface, borderWidth: 1, borderColor: colors.border, paddingHorizontal: 16, color: colors.text, fontSize: 15 },
  addressSection: { gap: 9 },
  addressLabelRow: { flexDirection: "row", alignItems: "center", gap: 6 },
  required: { color: colors.primary, fontSize: 10, fontWeight: "900" },
  addressButton: { minHeight: 64, borderRadius: 17, backgroundColor: colors.surface, borderWidth: 1, borderColor: colors.border, flexDirection: "row", alignItems: "center", padding: 11 },
  pressed: { opacity: 0.8 },
  addressIcon: { width: 40, height: 40, borderRadius: 13, backgroundColor: "#E3F7EA", alignItems: "center", justifyContent: "center" },
  addressIconText: { color: "#03A94D", fontSize: 17, fontWeight: "900" },
  addressCopy: { flex: 1, marginLeft: 11, gap: 4 },
  addressText: { color: colors.text, fontSize: 13, fontWeight: "800" },
  addressPlaceholder: { color: colors.muted, fontWeight: "600" },
  coordinateText: { color: colors.subtle, fontSize: 10 },
  chevron: { color: colors.muted, fontSize: 26 },
  privacyBox: { flexDirection: "row", alignItems: "flex-start", gap: 8, borderRadius: 13, backgroundColor: colors.blueSoft, padding: 11 },
  privacyMark: { color: colors.blue, fontSize: 12, fontWeight: "900" },
  privacyText: { flex: 1, color: "#5274A1", fontSize: 10, lineHeight: 16 },
  agreement: { flexDirection: "row", alignItems: "center", gap: 9 },
  checkbox: { width: 21, height: 21, borderRadius: 7, borderWidth: 1, borderColor: colors.border, backgroundColor: colors.surface, alignItems: "center", justifyContent: "center" },
  checkboxChecked: { backgroundColor: colors.primary, borderColor: colors.primary },
  check: { color: colors.surface, fontSize: 12, fontWeight: "900" },
  agreementText: { color: colors.muted, fontSize: 11 },
  mockNotice: { color: colors.subtle, fontSize: 10, textAlign: "center", marginTop: -5 },
});
