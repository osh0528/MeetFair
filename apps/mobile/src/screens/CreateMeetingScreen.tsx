import type { NativeStackScreenProps } from "@react-navigation/native-stack";
import { useState } from "react";
import { Pressable, ScrollView, StyleSheet, Text, TextInput, View } from "react-native";
import { SafeAreaView } from "react-native-safe-area-context";
import type { RootStackParamList } from "../../App";
import { Avatar, Button, Card, ScreenHeader, SectionHeading } from "../components/ui";
import { colors } from "../theme/colors";

type Props = NativeStackScreenProps<RootStackParamList, "CreateMeeting">;

const days = [
  { day: "금", date: "21" },
  { day: "토", date: "22" },
  { day: "일", date: "23" },
  { day: "월", date: "24" },
  { day: "화", date: "25" },
];

const times = ["오후 1:00", "오후 2:00", "오후 3:00"];

export function CreateMeetingScreen({ navigation }: Props) {
  const [title, setTitle] = useState("성수에서 여름 모임");
  const [selectedDay, setSelectedDay] = useState("22");
  const [selectedTime, setSelectedTime] = useState("오후 2:00");
  const [departure, setDeparture] = useState("서울대입구역");

  return (
    <SafeAreaView style={styles.safeArea} edges={["top", "bottom"]}>
      <ScreenHeader title="새 약속" subtitle="1 / 2" onBack={() => navigation.goBack()} />
      <View style={styles.progressTrack}>
        <View style={styles.progressValue} />
      </View>

      <ScrollView contentContainerStyle={styles.content} showsVerticalScrollIndicator={false}>
        <View style={styles.intro}>
          <Text style={styles.eyebrow}>약속 정보</Text>
          <Text style={styles.title}>언제, 누구와 만날까요?</Text>
          <Text style={styles.description}>약속 정보를 입력하면 모두에게 공평한 장소를 찾아드려요.</Text>
        </View>

        <View style={styles.formSection}>
          <Text style={styles.label}>약속 이름</Text>
          <TextInput
            onChangeText={setTitle}
            placeholder="예: 주말 점심 모임"
            placeholderTextColor={colors.subtle}
            style={styles.input}
            value={title}
          />
        </View>

        <View style={styles.formSection}>
          <View style={styles.inlineLabel}>
            <Text style={styles.label}>날짜</Text>
            <Text style={styles.month}>2026년 8월</Text>
          </View>
          <View style={styles.dayRow}>
            {days.map((item) => {
              const selected = item.date === selectedDay;
              return (
                <Pressable
                  key={item.date}
                  onPress={() => setSelectedDay(item.date)}
                  style={[styles.dayButton, selected && styles.dayButtonSelected]}
                >
                  <Text style={[styles.dayName, selected && styles.dayTextSelected]}>{item.day}</Text>
                  <Text style={[styles.dayDate, selected && styles.dayTextSelected]}>{item.date}</Text>
                </Pressable>
              );
            })}
          </View>
        </View>

        <View style={styles.formSection}>
          <Text style={styles.label}>시간</Text>
          <View style={styles.timeRow}>
            {times.map((time) => {
              const selected = time === selectedTime;
              return (
                <Pressable
                  key={time}
                  onPress={() => setSelectedTime(time)}
                  style={[styles.timeButton, selected && styles.timeButtonSelected]}
                >
                  <Text style={[styles.timeText, selected && styles.timeTextSelected]}>{time}</Text>
                </Pressable>
              );
            })}
          </View>
        </View>

        <View style={styles.formSection}>
          <SectionHeading title="함께할 친구" action="친구 추가" />
          <Card style={styles.peopleCard}>
            <Person name="나" detail="서울대입구역" color="#DCD7FF" owner />
            <View style={styles.personDivider} />
            <Person name="민지" detail="왕십리역" color="#FFE7CC" />
            <View style={styles.personDivider} />
            <Person name="도윤" detail="합정역" color="#D9F3EE" />
          </Card>
        </View>

        <View style={styles.formSection}>
          <Text style={styles.label}>내 출발지</Text>
          <View style={styles.locationInput}>
            <View style={styles.pinBox}><Text style={styles.pin}>⌖</Text></View>
            <TextInput
              onChangeText={setDeparture}
              placeholder="출발지를 검색하세요"
              placeholderTextColor={colors.subtle}
              style={styles.locationTextInput}
              value={departure}
            />
            <Text style={styles.currentLocation}>현재 위치</Text>
          </View>
          <View style={styles.infoBox}>
            <Text style={styles.infoMark}>i</Text>
            <Text style={styles.infoText}>출발지는 장소 추천에만 사용되며 약속 종료 후 자동 삭제돼요.</Text>
          </View>
        </View>
      </ScrollView>

      <View style={styles.footer}>
        <Button
          label="공평한 장소 추천받기"
          leftLabel="M"
          onPress={() => navigation.navigate("Recommendations")}
        />
      </View>
    </SafeAreaView>
  );
}

function Person({ name, detail, color, owner = false }: {
  name: string;
  detail: string;
  color: string;
  owner?: boolean;
}) {
  return (
    <View style={styles.personRow}>
      <Avatar name={name} size={42} backgroundColor={color} />
      <View style={styles.personCopy}>
        <Text style={styles.personName}>{name}{owner ? " (나)" : ""}</Text>
        <Text style={styles.personDetail}>{detail}</Text>
      </View>
      <View style={styles.readyDot} />
      <Text style={styles.readyText}>입력 완료</Text>
    </View>
  );
}

const styles = StyleSheet.create({
  safeArea: { flex: 1, backgroundColor: colors.background },
  progressTrack: { height: 3, backgroundColor: colors.border },
  progressValue: { width: "50%", height: 3, backgroundColor: colors.primary },
  content: { paddingHorizontal: 20, paddingTop: 24, paddingBottom: 28 },
  intro: { gap: 7, marginBottom: 28 },
  eyebrow: { color: colors.primary, fontSize: 13, fontWeight: "900" },
  title: { color: colors.text, fontSize: 26, lineHeight: 34, fontWeight: "900" },
  description: { color: colors.muted, fontSize: 14, lineHeight: 21 },
  formSection: { marginBottom: 26, gap: 11 },
  label: { color: colors.text, fontSize: 15, fontWeight: "900" },
  input: { height: 55, borderRadius: 16, backgroundColor: colors.surface, borderWidth: 1, borderColor: colors.border, paddingHorizontal: 16, color: colors.text, fontSize: 15, fontWeight: "600" },
  inlineLabel: { flexDirection: "row", justifyContent: "space-between", alignItems: "center" },
  month: { color: colors.muted, fontSize: 13, fontWeight: "700" },
  dayRow: { flexDirection: "row", gap: 8 },
  dayButton: { flex: 1, minHeight: 68, borderRadius: 18, backgroundColor: colors.surface, borderWidth: 1, borderColor: colors.border, alignItems: "center", justifyContent: "center", gap: 5 },
  dayButtonSelected: { backgroundColor: colors.primary, borderColor: colors.primary },
  dayName: { color: colors.muted, fontSize: 11, fontWeight: "700" },
  dayDate: { color: colors.text, fontSize: 18, fontWeight: "900" },
  dayTextSelected: { color: colors.surface },
  timeRow: { flexDirection: "row", gap: 8 },
  timeButton: { flex: 1, minHeight: 44, borderRadius: 14, backgroundColor: colors.surface, borderWidth: 1, borderColor: colors.border, alignItems: "center", justifyContent: "center" },
  timeButtonSelected: { backgroundColor: colors.primarySoft, borderColor: "#C7C0F7" },
  timeText: { color: colors.muted, fontSize: 12, fontWeight: "800" },
  timeTextSelected: { color: colors.primary },
  peopleCard: { paddingVertical: 7, paddingHorizontal: 15 },
  personRow: { minHeight: 65, flexDirection: "row", alignItems: "center" },
  personCopy: { flex: 1, marginLeft: 12 },
  personName: { color: colors.text, fontSize: 14, fontWeight: "800" },
  personDetail: { color: colors.muted, fontSize: 12, marginTop: 4 },
  readyDot: { width: 7, height: 7, borderRadius: 4, backgroundColor: colors.green, marginRight: 6 },
  readyText: { color: colors.green, fontSize: 11, fontWeight: "800" },
  personDivider: { height: 1, backgroundColor: colors.border, marginLeft: 54 },
  locationInput: { minHeight: 58, borderRadius: 17, backgroundColor: colors.surface, borderWidth: 1, borderColor: colors.border, flexDirection: "row", alignItems: "center", paddingHorizontal: 10 },
  pinBox: { width: 36, height: 36, borderRadius: 12, backgroundColor: colors.primarySoft, alignItems: "center", justifyContent: "center" },
  pin: { color: colors.primary, fontSize: 18, fontWeight: "900" },
  locationTextInput: { flex: 1, color: colors.text, fontSize: 14, fontWeight: "700", paddingHorizontal: 11 },
  currentLocation: { color: colors.primary, fontSize: 11, fontWeight: "800" },
  infoBox: { flexDirection: "row", backgroundColor: colors.blueSoft, borderRadius: 14, padding: 12, gap: 9, alignItems: "flex-start" },
  infoMark: { width: 18, height: 18, borderRadius: 9, backgroundColor: colors.blue, color: colors.surface, textAlign: "center", fontSize: 12, fontWeight: "900", lineHeight: 18 },
  infoText: { flex: 1, color: "#4771AA", fontSize: 11, lineHeight: 17 },
  footer: { paddingHorizontal: 20, paddingTop: 12, paddingBottom: 8, backgroundColor: colors.background, borderTopWidth: 1, borderTopColor: colors.border },
});
