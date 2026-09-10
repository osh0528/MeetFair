import { useEffect, useState } from "react";
import { Platform, Text } from "react-native";
import { automaticLocationEnabled, setAutomaticLocation } from "../services/automatic-location";
import { automaticLocationStart, type AutomaticLocationMeeting } from "../services/automatic-location-policy";
import { Button, Card } from "./ui";

export function AutomaticLocationConsent({ meeting, userId }: { meeting: AutomaticLocationMeeting; userId: string }) {
  const [enabled, setEnabled] = useState(false);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");
  useEffect(() => {
    let active = true;
    const refresh = () => void automaticLocationEnabled(meeting.id, userId).then((value) => { if (active) setEnabled(value); }).catch(() => undefined);
    refresh();
    const timer = setInterval(refresh, 5000);
    return () => { active = false; clearInterval(timer); };
  }, [meeting.id, userId]);
  const mine = meeting.participants.find((participant) => participant.userId === userId);
  if (meeting.locationShareMode === "OFF" || mine?.arrivedAt || ["COMPLETED", "CANCELLED"].includes(meeting.status)) return null;
  const startAt = automaticLocationStart(meeting);
  return <Card>
    <Text style={{ fontWeight: "800" }}>자동 위치 공유</Text>
    <Text>동의하면 {new Date(startAt).toLocaleString("ko-KR")}부터 참여자에게 위치가 자동으로 공유됩니다. 도착·모임 종료 시 중단되며 언제든 해제할 수 있습니다.</Text>
    <Text>{Platform.OS === "web" ? "웹에서는 이 페이지를 열어 두어야 합니다." : "항상 허용 위치 권한이 필요하며, 대기 중에도 위치 서비스를 유지합니다. 상단 알림에서 대기·공유 상태를 확인할 수 있습니다."}</Text>
    {error ? <Text accessibilityRole="alert">{error}</Text> : null}
    <Button disabled={busy} label={busy ? "설정 중..." : enabled ? "자동 위치 공유 해제" : "동의하고 자동 위치 공유 켜기"} onPress={async () => {
      if (busy) return;
      setBusy(true);
      setError("");
      try {
        await setAutomaticLocation(meeting.id, userId, !enabled);
        setEnabled(!enabled);
      } catch (caught) { setError(caught instanceof Error ? caught.message : "자동 공유 설정에 실패했습니다."); }
      finally { setBusy(false); }
    }} />
  </Card>;
}
