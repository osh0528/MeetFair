import { useCameraPermissions } from "expo-camera";
import { Platform } from "react-native";

async function requestWebCameraAccess() {
  if (!navigator.mediaDevices?.getUserMedia) return false;
  try {
    const stream = await navigator.mediaDevices.getUserMedia({ video: true, audio: false });
    stream.getTracks().forEach((track) => track.stop());
    return true;
  } catch {
    return false;
  }
}

export function useRequestCameraAccess() {
  const [, requestNativePermission] = useCameraPermissions();
  return async function requestCameraAccess(): Promise<boolean> {
    if (Platform.OS === "web") return requestWebCameraAccess();
    try {
      const result = await requestNativePermission();
      return result.granted;
    } catch {
      return false;
    }
  };
}
