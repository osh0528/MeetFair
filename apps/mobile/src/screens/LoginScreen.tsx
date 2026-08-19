import type { NativeStackScreenProps } from "@react-navigation/native-stack";
import { useState } from "react";
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
import { Button, LogoMark } from "../components/ui";
import { colors } from "../theme/colors";

type Props = NativeStackScreenProps<RootStackParamList, "Login">;

export function LoginScreen({ navigation }: Props) {
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [showPassword, setShowPassword] = useState(false);

  return (
    <SafeAreaView style={styles.safeArea} edges={["top", "bottom"]}>
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
            <View style={styles.hero}>
              <LogoMark />
              <View style={styles.heroCopy}>
                <Text style={styles.brand}>MeetFair</Text>
                <Text style={styles.title}>다시 만나서 반가워요</Text>
                <Text style={styles.description}>
                  로그인하고 모두에게 공평한 약속 장소를 찾아보세요.
                </Text>
              </View>
              <View style={styles.routeVisual}>
                <View style={styles.routeLine} />
                <View style={[styles.routePoint, styles.routePointStart]} />
                <View style={[styles.routePoint, styles.routePointEnd]} />
                <View style={styles.routeCenter}>
                  <Text style={styles.routeCenterText}>M</Text>
                </View>
                <Text style={styles.routeCaption}>우리 사이, 가장 공평한 곳</Text>
              </View>
            </View>

            <View style={styles.form}>
              <View style={styles.field}>
                <Text style={styles.label}>이메일</Text>
                <TextInput
                  autoCapitalize="none"
                  autoComplete="email"
                  keyboardType="email-address"
                  onChangeText={setEmail}
                  placeholder="meetfair@example.com"
                  placeholderTextColor={colors.subtle}
                  style={styles.input}
                  value={email}
                />
              </View>

              <View style={styles.field}>
                <View style={styles.labelRow}>
                  <Text style={styles.label}>비밀번호</Text>
                  <Pressable><Text style={styles.forgot}>비밀번호 찾기</Text></Pressable>
                </View>
                <View style={styles.passwordField}>
                  <TextInput
                    autoCapitalize="none"
                    autoComplete="current-password"
                    onChangeText={setPassword}
                    placeholder="8자 이상 입력하세요"
                    placeholderTextColor={colors.subtle}
                    secureTextEntry={!showPassword}
                    style={styles.passwordInput}
                    value={password}
                  />
                  <Pressable
                    accessibilityLabel={showPassword ? "비밀번호 숨기기" : "비밀번호 보기"}
                    hitSlop={8}
                    onPress={() => setShowPassword((current) => !current)}
                  >
                    <Text style={styles.showPassword}>{showPassword ? "숨김" : "보기"}</Text>
                  </Pressable>
                </View>
              </View>

              <Button label="로그인" onPress={() => navigation.replace("Home")} />

              <View style={styles.dividerRow}>
                <View style={styles.divider} />
                <Text style={styles.dividerText}>또는</Text>
                <View style={styles.divider} />
              </View>

              <Button
                label="회원가입"
                onPress={() => navigation.navigate("Register")}
                variant="secondary"
              />
              <Pressable onPress={() => navigation.replace("Home")}>
                <Text style={styles.previewLink}>계정 없이 화면 둘러보기</Text>
              </Pressable>
            </View>
          </View>
        </ScrollView>
      </KeyboardAvoidingView>
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  safeArea: { flex: 1, backgroundColor: colors.background },
  flex: { flex: 1 },
  page: { flexGrow: 1, padding: 22, alignItems: "center", justifyContent: "center" },
  container: { width: "100%", maxWidth: 460 },
  hero: { gap: 18 },
  heroCopy: { gap: 7 },
  brand: { color: colors.primary, fontSize: 14, fontWeight: "900" },
  title: { color: colors.text, fontSize: 29, fontWeight: "900", lineHeight: 38 },
  description: { color: colors.muted, fontSize: 14, lineHeight: 21 },
  routeVisual: { height: 112, borderRadius: 24, backgroundColor: colors.primarySoft, overflow: "hidden", justifyContent: "center" },
  routeLine: { position: "absolute", left: 52, right: 52, top: 46, height: 3, borderRadius: 2, backgroundColor: "#C8C1F7" },
  routePoint: { position: "absolute", top: 38, width: 19, height: 19, borderRadius: 10, backgroundColor: colors.surface, borderWidth: 5 },
  routePointStart: { left: 43, borderColor: colors.primary },
  routePointEnd: { right: 43, borderColor: colors.green },
  routeCenter: { position: "absolute", top: 24, alignSelf: "center", width: 48, height: 48, borderRadius: 17, backgroundColor: colors.primary, alignItems: "center", justifyContent: "center", borderWidth: 4, borderColor: "#D9D4FF" },
  routeCenterText: { color: colors.surface, fontSize: 17, fontWeight: "900" },
  routeCaption: { color: colors.primary, fontSize: 11, fontWeight: "900", textAlign: "center", marginTop: 66 },
  form: { gap: 14, marginTop: 25 },
  field: { gap: 8 },
  labelRow: { flexDirection: "row", alignItems: "center", justifyContent: "space-between" },
  label: { color: colors.text, fontSize: 13, fontWeight: "800" },
  forgot: { color: colors.primary, fontSize: 11, fontWeight: "800" },
  input: { height: 54, borderRadius: 16, backgroundColor: colors.surface, borderWidth: 1, borderColor: colors.border, color: colors.text, fontSize: 15, paddingHorizontal: 16 },
  passwordField: { height: 54, borderRadius: 16, backgroundColor: colors.surface, borderWidth: 1, borderColor: colors.border, flexDirection: "row", alignItems: "center", paddingHorizontal: 16 },
  passwordInput: { flex: 1, color: colors.text, fontSize: 15, paddingVertical: 0 },
  showPassword: { color: colors.primary, fontSize: 11, fontWeight: "800" },
  dividerRow: { flexDirection: "row", alignItems: "center", gap: 10, marginVertical: 2 },
  divider: { flex: 1, height: 1, backgroundColor: colors.border },
  dividerText: { color: colors.subtle, fontSize: 11 },
  previewLink: { color: colors.muted, textAlign: "center", fontSize: 12, fontWeight: "700", paddingVertical: 6 },
});
