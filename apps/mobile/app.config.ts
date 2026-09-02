import type { ExpoConfig } from "expo/config";

const naverMapClientId = process.env.NAVER_MAP_CLIENT_ID ?? "";

export default ({ config }: { config: ExpoConfig }): ExpoConfig => ({
  ...config,
  name: "MeetFair",
  slug: "meetfair",
  scheme: "meetfair",
  version: "0.1.0",
  orientation: "portrait",
  userInterfaceStyle: "light",
  android: {
    ...config.android,
    package: "com.meetfair.app",
  },
  ios: {
    ...config.ios,
    bundleIdentifier: "com.meetfair.app",
    infoPlist: {
      ...config.ios?.infoPlist,
      NMFClientId: naverMapClientId,
    },
  },
  plugins: [
    [
      "expo-location",
      {
        locationWhenInUsePermission: "Location access is required to show the meeting point and your movement status.",
      },
    ],
    [
      "expo-camera",
      {
        cameraPermission: "Camera access is required to take and share photos.",
        microphonePermission: "영상 통화의 음성 연결을 위해 마이크 접근을 허용해 주세요.",
        recordAudioAndroid: true,
      },
    ],
    [
      "expo-notifications",
      {
        defaultChannel: "meeting-reminders",
      },
    ],
    [
      "expo-image-picker",
      {
        photosPermission: "프로필 사진을 선택하려면 사진 접근을 허용해 주세요.",
        cameraPermission: false,
      },
    ],
    "expo-status-bar",
    [
      "expo-audio",
      {
        microphonePermission: "영상 통화의 음성 연결을 위해 마이크 접근을 허용해 주세요.",
        recordAudioAndroid: true,
        enableBackgroundRecording: false,
        enableBackgroundPlayback: true,
      },
    ],
    "expo-web-browser",
    "expo-secure-store",
    [
      "expo-build-properties",
      {
        android: {
          extraMavenRepos: ["https://repository.map.naver.com/archive/maven"],
        },
      },
    ],
    [
      "@mj-studio/react-native-naver-map",
      {
        client_id: naverMapClientId,
        android: {
          ACCESS_FINE_LOCATION: true,
          ACCESS_COARSE_LOCATION: true,
          ACCESS_BACKGROUND_LOCATION: true,
        },
        ios: {
          NSLocationAlwaysUsageDescription:
            "Location access is required to show the meeting point and your movement status.",
          NSLocationWhenInUseUsageDescription:
            "Location access is required to show the meeting point and your movement status.",
        },
      },
    ],
    "@livekit/react-native-expo-plugin",
    "./plugins/with-video-only-webrtc",
  ],
});
