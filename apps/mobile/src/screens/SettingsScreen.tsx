import type { NativeStackScreenProps } from "@react-navigation/native-stack";
import { useEffect, useState , useMemo} from "react";
import { Pressable, ScrollView, StyleSheet, Switch, Text, TextInput, View } from "react-native";
import { SafeAreaView } from "react-native-safe-area-context";
import type { RootStackParamList } from "../../App";
import { Button, Card, ScreenHeader } from "../components/ui";
import { apiRequest } from "../services/api";
import { useSession } from "../services/session";
import { isPokeSoundEnabled, setPokeSoundEnabled } from "../services/poke-sound";

import { useAppTheme, useAppColors } from "../services/theme";

type Props = NativeStackScreenProps<RootStackParamList, "Settings">;

export function SettingsScreen({ navigation }: Props) {
  const palette = useAppColors();
  const styles = useStyles();
  const session = useSession();
  const { mode, setMode } = useAppTheme();
  const [location, setLocation] = useState(Boolean(session.user?.shareExactLocationWithFriends));
  const [pokes, setPokes] = useState(Boolean(session.user?.casualPokesEnabled));
  const [sound, setSound] = useState(true);
  const [quietStart, setQuietStart] = useState(minutesToTime(session.user?.pokeQuietStartMinutes ?? 23 * 60));
  const [quietEnd, setQuietEnd] = useState(minutesToTime(session.user?.pokeQuietEndMinutes ?? 8 * 60));
  const [saving, setSaving] = useState(false);
  const [message, setMessage] = useState("");

  useEffect(() => {
    void isPokeSoundEnabled().then(setSound);
  }, []);

  async function update(input: { shareExactLocationWithFriends?: boolean; casualPokesEnabled?: boolean }) {
    setSaving(true);
    setMessage("");
    try {
      await apiRequest("/users/me/settings", { method: "PATCH", body: JSON.stringify(input) });
      await session.refreshUser();
    } catch (caught) {
      setMessage(caught instanceof Error ? caught.message : "설정을 저장하지 못했습니다.");
    } finally {
      setSaving(false);
    }
  }

  async function saveQuietTime() {
    const start = timeToMinutes(quietStart);
    const end = timeToMinutes(quietEnd);
    if (start === null || end === null) {
      setMessage("시간을 HH:MM 형식으로 입력해 주세요.");
      return;
    }
    setSaving(true);
    setMessage("");
    try {
      await apiRequest("/users/me/settings", {
        method: "PATCH",
        body: JSON.stringify({ pokeQuietStartMinutes: start, pokeQuietEndMinutes: end, timezone: "Asia/Seoul" }),
      });
      await session.refreshUser();
      setMessage("방해 금지 시간을 저장했습니다.");
    } catch (caught) {
      setMessage(caught instanceof Error ? caught.message : "방해 금지 시간을 저장하지 못했습니다.");
    } finally {
      setSaving(false);
    }
  }

  return (
    <SafeAreaView style={styles.safeArea}>
      <ScreenHeader title="설정" onBack={() => navigation.goBack()} />
      <ScrollView contentContainerStyle={styles.content} keyboardShouldPersistTaps="handled">
        <Card style={styles.themeCard}>
          <Text style={styles.title}>화면 테마</Text>
          <View style={styles.themeOptions}>
            {(["LIGHT", "DARK"] as const).map((item) => (
              <Pressable
                key={item}
                accessibilityRole="button"
                accessibilityState={{ selected: mode === item }}
                onPress={() => void setMode(item)}
                style={[styles.themeOption, mode === item && styles.themeOptionSelected]}
              >
                <Text style={[styles.themeOptionText, mode === item && styles.themeOptionTextSelected]}>
                  {item === "LIGHT" ? "화이트 모드" : "다크 모드"}
                </Text>
              </Pressable>
            ))}
          </View>
        </Card>
        <Button label="개인정보 관리" onPress={() => navigation.navigate("Profile")} variant="secondary" />
        <Card style={styles.card}>
          <Text style={styles.title}>정확한 위치를 친구에게 상시 공유</Text>
           <Switch value={location} onValueChange={(value) => { setLocation(value); void update({ shareExactLocationWithFriends: value }); }} />
        </Card>
        <Card style={styles.card}>
          <Text style={styles.title}>평상시 친구 찌르기 허용</Text>
          <Switch value={pokes} onValueChange={(value) => { setPokes(value); void update({ casualPokesEnabled: value }); }} />
        </Card>
        <Card style={styles.card}>
          <Text style={styles.title}>찌르기 효과음</Text>
          <Switch value={sound} onValueChange={(value) => { setSound(value); void setPokeSoundEnabled(value); }} />
        </Card>
        <Card style={styles.formCard}>
          <Text style={styles.title}>찌르기 방해 금지 시간</Text>
          <Text style={styles.note}>이 시간에는 일반 찌르기 푸시를 모아서 나중에 알려줍니다.</Text>
          <TextInput onChangeText={setQuietStart} placeholder="23:00" placeholderTextColor={palette.subtle} style={styles.input} value={quietStart} />
          <TextInput onChangeText={setQuietEnd} placeholder="08:00" placeholderTextColor={palette.subtle} style={styles.input} value={quietEnd} />
          <Button disabled={saving} label={saving ? "저장 중..." : "방해 금지 시간 저장"} onPress={saveQuietTime} variant="soft" />
        </Card>
        {message ? <Text style={styles.message}>{message}</Text> : null}
        <Button label="로그아웃" onPress={async () => { await session.logout(); navigation.replace("Login"); }} variant="secondary" />
      </ScrollView>
    </SafeAreaView>
  );
}

function useStyles() {
  const palette = useAppColors();
  return useMemo(
    () =>
      StyleSheet.create({
  safeArea: { flex: 1, backgroundColor: palette.background },
  content: { padding: 20, gap: 12 },
  card: { flexDirection: "row", alignItems: "center", justifyContent: "space-between" },
  themeCard: { gap: 12 },
  themeOptions: { flexDirection: "row", gap: 8 },
  themeOption: {
    flex: 1,
    minHeight: 46,
    borderRadius: 14,
    borderWidth: 1,
    borderColor: palette.border,
    alignItems: "center",
    justifyContent: "center",
    backgroundColor: palette.background,
  },
  themeOptionSelected: { backgroundColor: palette.primary, borderColor: palette.primary },
  themeOptionText: { color: palette.muted, fontSize: 12, fontWeight: "800" },
  themeOptionTextSelected: { color: palette.surface },
  formCard: { gap: 9 },
  input: { height: 48, borderWidth: 1, borderColor: palette.border, borderRadius: 14, paddingHorizontal: 14, color: palette.text },
  title: { flex: 1, color: palette.text, fontWeight: "900", paddingRight: 10 },
  note: { color: palette.muted, fontSize: 11, lineHeight: 17 },
  message: { color: palette.primary, fontSize: 12, fontWeight: "700" },

      }),
    [palette],
  );
}

function minutesToTime(minutes: number) {
  return `${String(Math.floor(minutes / 60)).padStart(2, "0")}:${String(minutes % 60).padStart(2, "0")}`;
}

function timeToMinutes(value: string) {
  const match = /^(\d{1,2}):(\d{2})$/.exec(value.trim());
  if (!match) return null;
  const hours = Number(match[1]);
  const minutes = Number(match[2]);
  if (hours > 23 || minutes > 59) return null;
  return hours * 60 + minutes;
}
