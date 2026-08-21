import type { NativeStackScreenProps } from "@react-navigation/native-stack";
import { ScrollView, StyleSheet, Text, View } from "react-native";
import { SafeAreaView } from "react-native-safe-area-context";
import type { RootStackParamList } from "../../App";
import { Avatar, Button, Card, Pill, ScreenHeader, SectionHeading } from "../components/ui";
import { colors } from "../theme/colors";

type Props = NativeStackScreenProps<RootStackParamList, "Meeting">;

const members = [
  { name: "수혁", place: "서울대입구역", time: "28분", color: "#DCD7FF" },
  { name: "민지", place: "왕십리역", time: "30분", color: "#FFE7CC" },
  { name: "도윤", place: "합정역", time: "32분", color: "#D9F3EE" },
  { name: "유진", place: "강남역", time: "32분", color: "#DCEAFF" },
];

export function MeetingScreen({ navigation }: Props) {
  return (
    <SafeAreaView style={styles.safeArea} edges={["top", "bottom"]}>
      <ScreenHeader title="약속 상세" onBack={() => navigation.goBack()} />
      <ScrollView contentContainerStyle={styles.content} showsVerticalScrollIndicator={false}>
        <View style={styles.heroTop}><Pill label="D-3" tone="green" /><Text style={styles.confirmed}>● 장소 확정</Text></View>
        <Text style={styles.title}>성수에서 여름 모임</Text>
        <Card style={styles.dateCard}>
          <View style={styles.dateBox}><Text style={styles.month}>AUG</Text><Text style={styles.day}>22</Text></View>
          <View><Text style={styles.dateTitle}>토요일 오후 2:00</Text><Text style={styles.dateSub}>알림은 오후 1:30에 시작돼요</Text></View>
        </Card>

        <View style={styles.section}>
          <SectionHeading title="만날 장소" action="지도 보기" />
          <Card style={styles.placeCard}>
            <View style={styles.mapPreview}><View style={styles.road} /><View style={styles.pin}><Text style={styles.pinText}>M</Text></View></View>
            <View style={styles.placeCopy}><Text style={styles.placeName}>성수역 2번 출구</Text><Text style={styles.placeAddress}>서울 성동구 아차산로 100</Text></View>
            <View style={styles.fairRow}><Pill label="공평 지수 96" /><Text style={styles.fairText}>최대 차이 4분</Text></View>
          </Card>
        </View>

        <View style={styles.section}>
          <SectionHeading title="참가자 이동시간" action="4명" />
          <Card style={styles.memberCard}>
            {members.map((member, index) => (
              <View key={member.name}>
                <View style={styles.memberRow}>
                  <Avatar name={member.name} size={42} backgroundColor={member.color} />
                  <View style={styles.memberCopy}><Text style={styles.memberName}>{member.name}{index === 0 ? " (나)" : ""}</Text><Text style={styles.memberPlace}>{member.place} 출발</Text></View>
                  <Text style={styles.memberTime}>{member.time}</Text>
                </View>
                {index < members.length - 1 ? <View style={styles.divider} /> : null}
              </View>
            ))}
          </Card>
        </View>

        <Card style={styles.trackingCard}>
          <View style={styles.trackingIcon}><Text style={styles.trackingIconText}>⌖</Text></View>
          <View style={styles.trackingCopy}><Text style={styles.trackingTitle}>실시간 출발 확인</Text><Text style={styles.trackingSub}>30분 전부터 동의한 친구끼리 위치와 도착 예정 시간을 공유해요.</Text></View>
          <Pill label="1:30 시작" tone="amber" />
        </Card>
        <Text style={styles.privacy}>✓ 위치정보는 약속 종료 후 자동 삭제됩니다.</Text>
      </ScrollView>
      <View style={styles.footer}><Button label="출발 확인 화면 미리보기" onPress={() => navigation.navigate("Tracking")} /></View>
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  safeArea: { flex: 1, backgroundColor: colors.background },
  content: { paddingHorizontal: 20, paddingTop: 12, paddingBottom: 24 },
  heroTop: { flexDirection: "row", alignItems: "center", gap: 9 },
  confirmed: { color: colors.green, fontSize: 11, fontWeight: "800" },
  title: { color: colors.text, fontSize: 28, fontWeight: "900", marginTop: 14, marginBottom: 18 },
  dateCard: { flexDirection: "row", alignItems: "center", gap: 14 },
  dateBox: { width: 58, height: 60, borderRadius: 18, backgroundColor: colors.primarySoft, alignItems: "center", justifyContent: "center" },
  month: { color: colors.primary, fontSize: 9, fontWeight: "900" },
  day: { color: colors.primary, fontSize: 23, fontWeight: "900" },
  dateTitle: { color: colors.text, fontSize: 16, fontWeight: "900" },
  dateSub: { color: colors.muted, fontSize: 12, marginTop: 5 },
  section: { marginTop: 28, gap: 12 },
  placeCard: { padding: 0, overflow: "hidden" },
  mapPreview: { height: 105, backgroundColor: "#E9EEF0", alignItems: "center", justifyContent: "center", overflow: "hidden" },
  road: { position: "absolute", left: -20, right: -20, height: 28, backgroundColor: colors.surface, transform: [{ rotate: "-6deg" }] },
  pin: { width: 44, height: 44, borderRadius: 15, backgroundColor: colors.primary, alignItems: "center", justifyContent: "center" },
  pinText: { color: colors.surface, fontSize: 17, fontWeight: "900" },
  placeCopy: { paddingHorizontal: 16, paddingTop: 14 },
  placeName: { color: colors.text, fontSize: 16, fontWeight: "900" },
  placeAddress: { color: colors.muted, fontSize: 11, marginTop: 4 },
  fairRow: { flexDirection: "row", alignItems: "center", gap: 9, padding: 16 },
  fairText: { color: colors.green, fontSize: 11, fontWeight: "800" },
  memberCard: { paddingVertical: 4, paddingHorizontal: 15 },
  memberRow: { minHeight: 66, flexDirection: "row", alignItems: "center" },
  memberCopy: { flex: 1, marginLeft: 11 },
  memberName: { color: colors.text, fontSize: 14, fontWeight: "800" },
  memberPlace: { color: colors.muted, fontSize: 11, marginTop: 4 },
  memberTime: { color: colors.text, fontSize: 14, fontWeight: "900" },
  divider: { height: 1, backgroundColor: colors.border, marginLeft: 53 },
  trackingCard: { marginTop: 28, flexDirection: "row", alignItems: "center", padding: 14 },
  trackingIcon: { width: 42, height: 42, borderRadius: 14, backgroundColor: colors.amberSoft, alignItems: "center", justifyContent: "center" },
  trackingIconText: { color: colors.amber, fontSize: 19, fontWeight: "900" },
  trackingCopy: { flex: 1, marginHorizontal: 10 },
  trackingTitle: { color: colors.text, fontSize: 14, fontWeight: "900" },
  trackingSub: { color: colors.muted, fontSize: 10, lineHeight: 15, marginTop: 4 },
  privacy: { color: colors.subtle, fontSize: 10, textAlign: "center", marginTop: 16 },
  footer: { paddingHorizontal: 20, paddingTop: 12, paddingBottom: 8, borderTopWidth: 1, borderTopColor: colors.border },
});
