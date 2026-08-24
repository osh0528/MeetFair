import type { NativeStackScreenProps } from "@react-navigation/native-stack";
import { useState } from "react";
import { StyleSheet, Switch, Text, View } from "react-native";
import { SafeAreaView } from "react-native-safe-area-context";
import type { RootStackParamList } from "../../App";
import { Button, Card, ScreenHeader } from "../components/ui";
import { apiRequest } from "../services/api";
import { useSession } from "../services/session";
import { colors } from "../theme/colors";

type Props = NativeStackScreenProps<RootStackParamList, "Settings">;

export function SettingsScreen({ navigation }: Props) {
  const session = useSession();
  const [location, setLocation] = useState(Boolean(session.user?.shareExactLocationWithFriends));
  const [pokes, setPokes] = useState(Boolean(session.user?.casualPokesEnabled));

  async function update(input: { shareExactLocationWithFriends?: boolean; casualPokesEnabled?: boolean }) {
    await apiRequest("/users/me/settings", { method: "PATCH", body: JSON.stringify(input) });
    await session.refreshUser();
  }

  return (
    <SafeAreaView style={styles.safeArea}>
      <ScreenHeader title="설정" onBack={() => navigation.goBack()} />
      <View style={styles.content}>
        <Button label="개인정보 관리" onPress={() => navigation.navigate("Profile")} variant="secondary" />
        <Card style={styles.card}>
          <Text style={styles.title}>정확한 위치를 친구에게 상시 공유</Text>
           <Switch value={location} onValueChange={(value) => { setLocation(value); void update({ shareExactLocationWithFriends: value }); }} />
        </Card>
        <Card style={styles.card}>
          <Text style={styles.title}>평상시 친구 찌르기 허용</Text>
          <Switch value={pokes} onValueChange={(value) => { setPokes(value); void update({ casualPokesEnabled: value }); }} />
        </Card>
        <Text style={styles.note}>방해 금지 기본 시간은 23:00~08:00으로 서버 설정 화면에서 확장할 수 있습니다.</Text>
        <Button label="로그아웃" onPress={async () => { await session.logout(); navigation.replace("Login"); }} variant="secondary" />
      </View>
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  safeArea: { flex: 1, backgroundColor: colors.background },
  content: { padding: 20, gap: 12 },
  card: { flexDirection: "row", alignItems: "center", justifyContent: "space-between" },
  title: { flex: 1, color: colors.text, fontWeight: "900", paddingRight: 10 },
  note: { color: colors.muted, fontSize: 11, lineHeight: 17 },
});
