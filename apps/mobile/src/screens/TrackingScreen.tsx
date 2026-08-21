import type { NativeStackScreenProps } from "@react-navigation/native-stack";
import { Pressable, StyleSheet, Text, View } from "react-native";
import { SafeAreaView } from "react-native-safe-area-context";
import type { RootStackParamList } from "../../App";
import { Avatar, Button, Pill, ScreenHeader } from "../components/ui";
import { colors } from "../theme/colors";

type Props = NativeStackScreenProps<RootStackParamList, "Tracking">;

export function TrackingScreen({ navigation }: Props) {
  return (
    <SafeAreaView style={styles.safeArea} edges={["top", "bottom"]}>
      <ScreenHeader title="출발 확인" subtitle="성수에서 여름 모임" onBack={() => navigation.goBack()} />

      <View style={styles.map}>
        <View style={[styles.block, styles.blockOne]} />
        <View style={[styles.block, styles.blockTwo]} />
        <View style={[styles.block, styles.blockThree]} />
        <View style={styles.roadHorizontal} />
        <View style={styles.roadVertical} />
        <View style={styles.destinationHalo}>
          <View style={styles.destination}><Text style={styles.destinationText}>M</Text></View>
        </View>
        <MapAvatar label="나" color={colors.primary} style={styles.mePin} />
        <MapAvatar label="민" color={colors.green} style={styles.minjiPin} />
        <MapAvatar label="도" color={colors.amber} style={styles.doyoonPin} />
        <View style={styles.timeBadge}><Text style={styles.timeBadgeText}>약속까지 24분</Text></View>
      </View>

      <View style={styles.panel}>
        <View style={styles.handle} />
        <View style={styles.panelHeader}>
          <View>
            <Text style={styles.panelTitle}>친구들이 오고 있어요</Text>
            <Text style={styles.panelSubtitle}>위치는 약속 종료 후 자동 삭제돼요</Text>
          </View>
          <Pill label="3명 공유 중" tone="green" />
        </View>

        <View style={styles.peopleRow}>
          <Person name="수혁" status="이동 중" eta="13:56" color="#DCD7FF" />
          <Person name="민지" status="이동 중" eta="13:58" color="#D9F3EE" />
          <Person name="도윤" status="출발 전" eta="14:07" color="#FFE7CC" late />
        </View>

        <View style={styles.notice}>
          <View style={styles.noticeIcon}><Text style={styles.noticeIconText}>!</Text></View>
          <View style={styles.noticeCopy}>
            <Text style={styles.noticeTitle}>도윤님이 아직 출발 전이에요</Text>
            <Text style={styles.noticeText}>예상 도착 시간이 약속보다 7분 늦어요.</Text>
          </View>
          <Pressable style={styles.pokeButton}><Text style={styles.pokeText}>찌르기</Text></Pressable>
        </View>

        <Button label="내 위치 공유 중" leftLabel="✓" variant="soft" />
      </View>
    </SafeAreaView>
  );
}

function MapAvatar({ label, color, style }: { label: string; color: string; style: object }) {
  return <View style={[styles.mapAvatar, { backgroundColor: color }, style]}><Text style={styles.mapAvatarText}>{label}</Text></View>;
}

function Person({ name, status, eta, color, late = false }: { name: string; status: string; eta: string; color: string; late?: boolean }) {
  return (
    <View style={styles.person}>
      <Avatar name={name} size={44} backgroundColor={color} status={late ? "waiting" : "moving"} />
      <Text style={styles.personName}>{name}</Text>
      <Text style={[styles.personStatus, late && styles.personLate]}>{status}</Text>
      <Text style={styles.personEta}>{eta} 도착</Text>
    </View>
  );
}

const styles = StyleSheet.create({
  safeArea: { flex: 1, backgroundColor: colors.background },
  map: { flex: 1, minHeight: 260, backgroundColor: "#E9EEF0", overflow: "hidden" },
  block: { position: "absolute", borderRadius: 8, backgroundColor: "#D9E0E3" },
  blockOne: { left: 18, top: 22, width: 95, height: 55 },
  blockTwo: { right: 20, top: 38, width: 88, height: 48 },
  blockThree: { right: 35, bottom: 28, width: 110, height: 50 },
  roadHorizontal: { position: "absolute", left: -20, right: -20, top: "48%", height: 42, backgroundColor: colors.surface, transform: [{ rotate: "-7deg" }] },
  roadVertical: { position: "absolute", top: -30, bottom: -30, left: "44%", width: 34, backgroundColor: colors.surface, transform: [{ rotate: "12deg" }] },
  destinationHalo: { position: "absolute", left: "45%", top: "38%", width: 66, height: 66, borderRadius: 33, backgroundColor: "rgba(102,87,232,0.18)", alignItems: "center", justifyContent: "center" },
  destination: { width: 44, height: 44, borderRadius: 16, backgroundColor: colors.primary, alignItems: "center", justifyContent: "center" },
  destinationText: { color: colors.surface, fontSize: 17, fontWeight: "900" },
  mapAvatar: { position: "absolute", width: 34, height: 34, borderRadius: 17, borderWidth: 3, borderColor: colors.surface, alignItems: "center", justifyContent: "center" },
  mapAvatarText: { color: colors.surface, fontSize: 10, fontWeight: "900" },
  mePin: { left: "16%", bottom: "20%" },
  minjiPin: { right: "19%", top: "18%" },
  doyoonPin: { left: "23%", top: "17%" },
  timeBadge: { position: "absolute", top: 15, alignSelf: "center", backgroundColor: colors.charcoal, borderRadius: 999, paddingHorizontal: 14, paddingVertical: 8 },
  timeBadgeText: { color: colors.surface, fontSize: 11, fontWeight: "800" },
  panel: { backgroundColor: colors.surface, borderTopLeftRadius: 28, borderTopRightRadius: 28, marginTop: -20, paddingHorizontal: 20, paddingTop: 10, paddingBottom: 10 },
  handle: { width: 40, height: 4, borderRadius: 2, backgroundColor: colors.border, alignSelf: "center", marginBottom: 15 },
  panelHeader: { flexDirection: "row", justifyContent: "space-between", alignItems: "center" },
  panelTitle: { color: colors.text, fontSize: 19, fontWeight: "900" },
  panelSubtitle: { color: colors.muted, fontSize: 10, marginTop: 4 },
  peopleRow: { flexDirection: "row", justifyContent: "space-around", marginTop: 20 },
  person: { alignItems: "center" },
  personName: { color: colors.text, fontSize: 12, fontWeight: "800", marginTop: 7 },
  personStatus: { color: colors.green, fontSize: 10, fontWeight: "800", marginTop: 3 },
  personLate: { color: colors.red },
  personEta: { color: colors.subtle, fontSize: 9, marginTop: 3 },
  notice: { flexDirection: "row", alignItems: "center", backgroundColor: colors.redSoft, borderRadius: 16, padding: 12, marginVertical: 17 },
  noticeIcon: { width: 32, height: 32, borderRadius: 12, backgroundColor: colors.surface, alignItems: "center", justifyContent: "center" },
  noticeIconText: { color: colors.red, fontSize: 15, fontWeight: "900" },
  noticeCopy: { flex: 1, marginLeft: 9 },
  noticeTitle: { color: colors.text, fontSize: 12, fontWeight: "900" },
  noticeText: { color: colors.muted, fontSize: 9, marginTop: 3 },
  pokeButton: { backgroundColor: colors.red, borderRadius: 12, paddingHorizontal: 12, paddingVertical: 9 },
  pokeText: { color: colors.surface, fontSize: 11, fontWeight: "900" },
});
