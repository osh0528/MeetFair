import type { NativeStackScreenProps } from "@react-navigation/native-stack";
import { useMemo, useState } from "react";
import { Pressable, ScrollView, StyleSheet, Text, TextInput, View } from "react-native";
import type { RootStackParamList } from "../../App";
import { Avatar, Card, ScreenHeader } from "../components/ui";
import { colors } from "../theme/colors";

type Props = NativeStackScreenProps<RootStackParamList, "MiniHomeSearch">;

const mockUsers = [
  { id: "mock-jisu", nickname: "지수", accountId: "jisu", bio: "주말에는 새로운 카페를 찾아요.", online: true },
  { id: "mock-minho", nickname: "민호", accountId: "minho", bio: "MeetFair에서 약속을 관리하고 있어요.", online: false },
  { id: "mock-sora", nickname: "소라", accountId: "sora", bio: "오늘도 좋은 하루 보내세요.", online: true },
];

export function MiniHomeSearchScreen({ navigation }: Props) {
  const [query, setQuery] = useState("");
  const results = useMemo(() => {
    const normalized = query.trim().toLowerCase();
    if (!normalized) return mockUsers;
    return mockUsers.filter((user) => user.nickname.toLowerCase().includes(normalized) || user.accountId.includes(normalized));
  }, [query]);

  return (
    <View style={styles.safeArea}>
      <ScreenHeader title="미니홈피 검색" subtitle="닉네임 또는 ID로 찾아보세요" onBack={() => navigation.goBack()} />
      <ScrollView contentContainerStyle={styles.content} keyboardShouldPersistTaps="handled">
        <View style={styles.searchBox}>
          <Text style={styles.searchIcon}>⌕</Text>
          <TextInput autoCapitalize="none" autoFocus onChangeText={setQuery} placeholder="닉네임 또는 ID 검색" placeholderTextColor={colors.subtle} style={styles.input} value={query} />
          {query ? <Pressable onPress={() => setQuery("")}><Text style={styles.clear}>×</Text></Pressable> : null}
        </View>
        <Text style={styles.notice}>닉네임·ID 검색 화면 목업입니다. 실제 검색 연결은 백엔드 작업 후 적용됩니다.</Text>
        <Text style={styles.resultTitle}>{query ? "검색 결과" : "추천 미니홈피"} <Text style={styles.count}>{results.length}명</Text></Text>
        {results.map((user) => (
          <Pressable key={user.id} onPress={() => navigation.navigate("UserPage", { userId: user.id })}>
            <Card style={styles.resultCard}>
              <Avatar name={user.nickname} size={54} status={user.online ? "online" : undefined} />
              <View style={styles.copy}>
                <View style={styles.nameRow}><Text style={styles.nickname}>{user.nickname}</Text><Text style={styles.accountId}>@{user.accountId}</Text></View>
                <Text numberOfLines={1} style={styles.bio}>{user.bio}</Text>
                <Text style={styles.link}>미니홈피 보기 〉</Text>
              </View>
            </Card>
          </Pressable>
        ))}
        {!results.length ? <Text style={styles.empty}>검색 결과가 없습니다.</Text> : null}
      </ScrollView>
    </View>
  );
}

const styles = StyleSheet.create({
  safeArea: { flex: 1, backgroundColor: colors.background },
  content: { padding: 20, gap: 14 },
  searchBox: { minHeight: 52, flexDirection: "row", alignItems: "center", gap: 9, paddingHorizontal: 14, borderRadius: 16, borderWidth: 1, borderColor: colors.border, backgroundColor: colors.surface },
  searchIcon: { color: colors.muted, fontSize: 24, lineHeight: 24 },
  input: { flex: 1, color: colors.text, fontSize: 14 },
  clear: { color: colors.muted, fontSize: 24, lineHeight: 24 },
  notice: { color: colors.muted, fontSize: 11, lineHeight: 17 },
  resultTitle: { color: colors.text, fontSize: 16, fontWeight: "900" },
  count: { color: colors.muted, fontSize: 12, fontWeight: "700" },
  resultCard: { flexDirection: "row", alignItems: "center", gap: 12 },
  copy: { flex: 1, gap: 4 },
  nameRow: { flexDirection: "row", alignItems: "center", gap: 7 },
  nickname: { color: colors.text, fontSize: 15, fontWeight: "900" },
  accountId: { color: colors.muted, fontSize: 11 },
  bio: { color: colors.muted, fontSize: 12 },
  link: { color: colors.primary, fontSize: 11, fontWeight: "900", marginTop: 2 },
  empty: { color: colors.muted, textAlign: "center", paddingVertical: 40 },
});
