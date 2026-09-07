import * as Location from "expo-location";
import type { CurrentCoordinates } from "./current-location.web";

export async function getCurrentCoordinates(): Promise<CurrentCoordinates> {
  const permission = await Location.requestForegroundPermissionsAsync();
  if (!permission.granted) throw new Error("현재 위치를 확인하려면 위치 권한이 필요합니다.");
  const position = await Location.getCurrentPositionAsync({ accuracy: Location.Accuracy.High });
  return {
    latitude: position.coords.latitude,
    longitude: position.coords.longitude,
  };
}
