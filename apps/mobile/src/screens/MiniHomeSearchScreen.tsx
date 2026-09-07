import type { PublicProfileSearchResult } from "@meetfair/shared";
import type { NativeStackScreenProps } from "@react-navigation/native-stack";
import { useEffect, useState } from "react";
import { ActivityIndicator, Pressable, ScrollView, StyleSheet, Text, TextInput, View } from "react-native";
import type { RootStackParamList } from "../../App";
import { Avatar, Card, ScreenHeader } from "../components/ui";
import { apiRequest } from "../services/api";
import { colors } from "../theme/colors";

type Props = NativeStackScreenProps<RootStackParamList, "MiniHomeSearch">;

export function MiniHomeSearchScreen({ navigation }: Props) {
  const [query, setQuery] = useState("");
  const [results, setResults] = useState<PublicProfileSearchResult[]>([]);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState("");

  useEffect(() => {
    const normalized = query.trim();
    if (!normalized) {
      setResults([]);
      setError("");
      return;
    }
    const timer = setTimeout(() => {
      setLoading(true);
      void apiRequest<{ users: PublicProfileSearchResult[] }>("/users/search?q=" + encodeURIComponent(normalized))
        .then((data) => {
          setResults(data.users);
          setError("");
        })
        .catch((caught) => setError(caught instanceof Error ? caught.message : "사용자 검색에 실패했습니다."))
        .finally(() => setLoading(false));
    }, 250);
    return () => clearTimeout(timer);
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
        <Text style={styles.notice}>친구가 아니어도 공개 미니홈피를 검색해서 볼 수 있어요.</Text>
        <Text style={styles.resultTitle}>{query ? "검색 결과" : "추천 미니홈피"} <Text style={styles.count}>{results.length}명</Text></Text>
        {loading ? <ActivityIndicator color={colors.primary} /> : null}
        {error ? <Text style={styles.error}>{error}</Text> : null}
        {results.map((user) => (
          <Pressable key={user.id} onPress={() => navigation.navigate("UserPage", { userId: user.id })}>
            <Card style={styles.resultCard}>
              <Avatar name={user.nickname} size={54} status={user.online ? "online" : undefined} />
              <View style={styles.copy}>
                <View style={styles.nameRow}><Text style={styles.nickname}>{user.nickname}</Text><Text style={styles.accountId}>@{user.accountId}</Text></View>
                <Text numberOfLines={1} style={styles.bio}>{user.profileBio || "아직 소개글이 없습니다."}</Text>
                <Text style={styles.link}>미니홈피 보기 〉</Text>
              </View>
            </Card>
          </Pressable>
        ))}
        {!loading && query.trim() && !results.length && !error ? <Text style={styles.empty}>검색 결과가 없습니다.</Text> : null}
        {!query.trim() ? <Text style={styles.empty}>닉네임 또는 ID를 입력해 주세요.</Text> : null}
      </ScrollView>
    </View>
  );
}

const styles = StyleSheet.create({
  safeArea: { flex: 1, backgroundColor: colors.background },
  content: { padding: 20, gap: 14 },
  searchBox: { minHeight: 52, flexDirection: "row", alignItems: "center", gap: 9, paddingHorizontal: 14, borderRadius: 6, borderWidth: 1, borderColor: colors.border, backgroundColor: colors.surface },
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
  error: { color: colors.red, fontSize: 12 },
});
