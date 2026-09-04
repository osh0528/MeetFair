import type { NativeStackScreenProps } from "@react-navigation/native-stack";
import { useState , useMemo} from "react";
import { Pressable, ScrollView, StyleSheet, Text, View } from "react-native";
import { SafeAreaView } from "react-native-safe-area-context";
import type { RootStackParamList } from "../../App";
import { Avatar, Button, Card, Pill, ScreenHeader } from "../components/ui";
import { useAppColors } from "../services/theme";


type Props = NativeStackScreenProps<RootStackParamList, "Recommendations">;

const places = [
  {
    id: "seongsu",
    rank: 1,
    name: "성수역 2번 출구",
    category: "2호선 · 카페 38곳",
    average: "평균 31분",
    gap: "최대 차이 4분",
    times: ["28분", "30분", "32분", "32분"],
    votes: 3,
  },
  {
    id: "wangsimni",
    rank: 2,
    name: "왕십리역 6번 출구",
    category: "2·5호선 · 식당 42곳",
    average: "평균 29분",
    gap: "최대 차이 8분",
    times: ["25분", "27분", "33분", "33분"],
    votes: 1,
  },
  {
    id: "konkuk",
    rank: 3,
    name: "건대입구역 3번 출구",
    category: "2·7호선 · 놀거리 25곳",
    average: "평균 33분",
    gap: "최대 차이 11분",
    times: ["27분", "31분", "35분", "38분"],
    votes: 0,
  },
];

export function RecommendationsScreen({ navigation }: Props) {
  const palette = useAppColors();
  const styles = useStyles();
  const [selected, setSelected] = useState("seongsu");

  return (
    <SafeAreaView style={styles.safeArea} edges={["top", "bottom"]}>
      <ScreenHeader title="장소 추천" subtitle="2 / 2" onBack={() => navigation.goBack()} />
      <View style={styles.progressTrack}><View style={styles.progressValue} /></View>

      <ScrollView contentContainerStyle={styles.content} showsVerticalScrollIndicator={false}>
        <View style={styles.introRow}>
          <View style={styles.introCopy}>
            <Text style={styles.eyebrow}>MeetFair 분석 완료</Text>
            <Text style={styles.title}>모두에게 공평한{`\n`}장소를 찾았어요</Text>
          </View>
          <View style={styles.fairScore}>
            <Text style={styles.fairScoreValue}>96</Text>
            <Text style={styles.fairScoreLabel}>공평 지수</Text>
          </View>
        </View>

        <Card style={styles.mapCard}>
          <View style={styles.mapRoadHorizontal} />
          <View style={styles.mapRoadVertical} />
          <View style={[styles.mapBlock, styles.blockOne]} />
          <View style={[styles.mapBlock, styles.blockTwo]} />
          <View style={[styles.mapBlock, styles.blockThree]} />
          <MapPerson label="나" color={palette.primary} positionStyle={styles.personOne} />
          <MapPerson label="민" color={palette.green} positionStyle={styles.personTwo} />
          <MapPerson label="도" color={palette.amber} positionStyle={styles.personThree} />
          <MapPerson label="유" color={palette.blue} positionStyle={styles.personFour} />
          <View style={styles.mapPinOuter}>
            <View style={styles.mapPin}><Text style={styles.mapPinText}>M</Text></View>
          </View>
          <View style={styles.mapLegend}>
            <Text style={styles.mapLegendText}>4명의 출발지 중심</Text>
          </View>
        </Card>

        <View style={styles.summaryRow}>
          <Text style={styles.summaryText}>추천 장소 3곳</Text>
          <Text style={styles.summarySubtext}>이동시간 편차가 적은 순</Text>
        </View>

        <View style={styles.placeList}>
          {places.map((place) => {
            const isSelected = selected === place.id;
            return (
              <Pressable key={place.id} onPress={() => setSelected(place.id)}>
                <Card style={[styles.placeCard, isSelected && styles.placeCardSelected]}>
                  <View style={styles.placeTop}>
                    <View style={[styles.rank, place.rank === 1 && styles.rankFirst]}>
                      <Text style={[styles.rankText, place.rank === 1 && styles.rankTextFirst]}>{place.rank}</Text>
                    </View>
                    <View style={styles.placeCopy}>
                      <View style={styles.nameRow}>
                        <Text style={styles.placeName}>{place.name}</Text>
                        {place.rank === 1 ? <Pill label="BEST" tone="purple" /> : null}
                      </View>
                      <Text style={styles.placeCategory}>{place.category}</Text>
                    </View>
                    <View style={[styles.radio, isSelected && styles.radioSelected]}>
                      {isSelected ? <View style={styles.radioDot} /> : null}
                    </View>
                  </View>

                  <View style={styles.metricRow}>
                    <View style={styles.metric}>
                      <Text style={styles.metricLabel}>이동시간</Text>
                      <Text style={styles.metricValue}>{place.average}</Text>
                    </View>
                    <View style={styles.metricDivider} />
                    <View style={styles.metric}>
                      <Text style={styles.metricLabel}>공평도</Text>
                      <Text style={[styles.metricValue, styles.fairMetric]}>{place.gap}</Text>
                    </View>
                    <View style={styles.metricDivider} />
                    <View style={styles.metric}>
                      <Text style={styles.metricLabel}>현재 투표</Text>
                      <Text style={styles.metricValue}>{place.votes}표</Text>
                    </View>
                  </View>

                  {isSelected ? (
                    <View style={styles.commuteRow}>
                      {["나", "민지", "도윤", "유진"].map((name, index) => (
                        <View key={name} style={styles.commuteItem}>
                          <Avatar
                            name={name}
                            size={28}
                            backgroundColor={["#DDDDDD", "#E5E5E5", "#D3D3D3", "#EAEAEA"][index]}
                          />
                          <Text style={styles.commuteTime}>{place.times[index]}</Text>
                        </View>
                      ))}
                    </View>
                  ) : null}
                </Card>
              </Pressable>
            );
          })}
        </View>

        <View style={styles.notice}>
          <Text style={styles.noticeMark}>i</Text>
          <Text style={styles.noticeText}>추천 결과는 대중교통 예상 이동시간을 기준으로 계산한 예시입니다.</Text>
        </View>
      </ScrollView>

      <View style={styles.footer}>
        <Button label="이 장소로 약속 만들기" onPress={() => navigation.replace("CreateMeeting")} />
      </View>
    </SafeAreaView>
  );
}

function MapPerson({ label, color, positionStyle }: {
  label: string;
  color: string;
  positionStyle: object;
}) {
  const palette = useAppColors();
  const styles = useStyles();
  return (
    <View style={[styles.mapPerson, { backgroundColor: color }, positionStyle]}>
      <Text style={styles.mapPersonText}>{label}</Text>
    </View>
  );
}

function useStyles() {
  const palette = useAppColors();
  return useMemo(
    () =>
      StyleSheet.create({
  safeArea: { flex: 1, backgroundColor: palette.background },
  progressTrack: { height: 3, backgroundColor: palette.border },
  progressValue: { width: "100%", height: 3, backgroundColor: palette.primary },
  content: { paddingHorizontal: 20, paddingTop: 24, paddingBottom: 24 },
  introRow: { flexDirection: "row", alignItems: "center", marginBottom: 22 },
  introCopy: { flex: 1, gap: 6 },
  eyebrow: { color: palette.green, fontSize: 13, fontWeight: "900" },
  title: { color: palette.text, fontSize: 26, lineHeight: 34, fontWeight: "900" },
  fairScore: { width: 74, height: 74, borderRadius: 24, backgroundColor: palette.mint, alignItems: "center", justifyContent: "center" },
  fairScoreValue: { color: palette.green, fontSize: 25, fontWeight: "900" },
  fairScoreLabel: { color: palette.green, fontSize: 9, fontWeight: "800" },
  mapCard: { height: 190, padding: 0, overflow: "hidden", backgroundColor: "#EEF1F4" },
  mapRoadHorizontal: { position: "absolute", top: 80, left: -20, right: -20, height: 36, backgroundColor: palette.surface, transform: [{ rotate: "-7deg" }] },
  mapRoadVertical: { position: "absolute", top: -30, bottom: -30, left: "45%", width: 28, backgroundColor: palette.surface, transform: [{ rotate: "12deg" }] },
  mapBlock: { position: "absolute", backgroundColor: "#DCE3E7", borderRadius: 8 },
  blockOne: { width: 80, height: 40, left: 13, top: 15 },
  blockTwo: { width: 62, height: 48, right: 14, top: 25 },
  blockThree: { width: 92, height: 38, right: 22, bottom: 12 },
  mapPerson: { position: "absolute", width: 28, height: 28, borderRadius: 14, borderWidth: 3, borderColor: palette.surface, alignItems: "center", justifyContent: "center" },
  mapPersonText: { color: palette.surface, fontSize: 9, fontWeight: "900" },
  personOne: { left: 22, bottom: 25 },
  personTwo: { left: 70, top: 33 },
  personThree: { right: 28, top: 25 },
  personFour: { right: 54, bottom: 22 },
  mapPinOuter: { position: "absolute", alignSelf: "center", top: 60, width: 58, height: 58, borderRadius: 29, backgroundColor: "rgba(48,48,48,0.16)", alignItems: "center", justifyContent: "center" },
  mapPin: { width: 40, height: 40, borderRadius: 15, backgroundColor: palette.primary, alignItems: "center", justifyContent: "center" },
  mapPinText: { color: palette.surface, fontSize: 16, fontWeight: "900" },
  mapLegend: { position: "absolute", alignSelf: "center", bottom: 10, backgroundColor: palette.surface, paddingHorizontal: 11, paddingVertical: 6, borderRadius: 999 },
  mapLegendText: { color: palette.muted, fontSize: 10, fontWeight: "800" },
  summaryRow: { flexDirection: "row", justifyContent: "space-between", alignItems: "center", marginTop: 28, marginBottom: 12 },
  summaryText: { color: palette.text, fontSize: 18, fontWeight: "900" },
  summarySubtext: { color: palette.muted, fontSize: 11 },
  placeList: { gap: 12 },
  placeCard: { padding: 16 },
  placeCardSelected: { borderColor: palette.primary, borderWidth: 2, padding: 15 },
  placeTop: { flexDirection: "row", alignItems: "center" },
  rank: { width: 34, height: 34, borderRadius: 12, backgroundColor: palette.background, alignItems: "center", justifyContent: "center" },
  rankFirst: { backgroundColor: palette.primarySoft },
  rankText: { color: palette.muted, fontSize: 14, fontWeight: "900" },
  rankTextFirst: { color: palette.primary },
  placeCopy: { flex: 1, marginLeft: 11 },
  nameRow: { flexDirection: "row", alignItems: "center", gap: 7 },
  placeName: { color: palette.text, fontSize: 15, fontWeight: "900" },
  placeCategory: { color: palette.muted, fontSize: 11, marginTop: 4 },
  radio: { width: 21, height: 21, borderRadius: 11, borderWidth: 2, borderColor: palette.border, alignItems: "center", justifyContent: "center" },
  radioSelected: { borderColor: palette.primary },
  radioDot: { width: 11, height: 11, borderRadius: 6, backgroundColor: palette.primary },
  metricRow: { flexDirection: "row", marginTop: 16, backgroundColor: palette.background, borderRadius: 14, paddingVertical: 11 },
  metric: { flex: 1, alignItems: "center", gap: 4 },
  metricLabel: { color: palette.subtle, fontSize: 9, fontWeight: "700" },
  metricValue: { color: palette.text, fontSize: 11, fontWeight: "900" },
  fairMetric: { color: palette.green },
  metricDivider: { width: 1, backgroundColor: palette.border },
  commuteRow: { flexDirection: "row", justifyContent: "space-between", marginTop: 14, paddingHorizontal: 2 },
  commuteItem: { flexDirection: "row", alignItems: "center", gap: 4 },
  commuteTime: { color: palette.muted, fontSize: 10, fontWeight: "800" },
  notice: { flexDirection: "row", alignItems: "center", gap: 8, marginTop: 18, paddingHorizontal: 5 },
  noticeMark: { color: palette.subtle, borderWidth: 1, borderColor: palette.subtle, width: 16, height: 16, borderRadius: 8, textAlign: "center", fontSize: 10, lineHeight: 14, fontWeight: "900" },
  noticeText: { flex: 1, color: palette.subtle, fontSize: 10, lineHeight: 15 },
  footer: { paddingHorizontal: 20, paddingTop: 12, paddingBottom: 8, backgroundColor: palette.background, borderTopWidth: 1, borderTopColor: palette.border },

      }),
    [palette],
  );
}
