import { Camera } from "expo-camera";
import { Platform } from "react-native";

export async function requestCameraAccess() {
  if (Platform.OS === "web") {
    if (!navigator.mediaDevices?.getUserMedia) return false;
    try {
      const stream = await navigator.mediaDevices.getUserMedia({ video: true, audio: false });
      stream.getTracks().forEach((track) => track.stop());
      return true;
    } catch {
      return false;
    }
  }
  const permission = await Camera.requestCameraPermissionsAsync();
  return permission.granted;
}
