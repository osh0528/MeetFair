export const appConfig = {
  apiUrl: process.env.EXPO_PUBLIC_API_URL ?? "http://localhost:4000/api",
  socketUrl: process.env.EXPO_PUBLIC_SOCKET_URL ?? "http://localhost:4000",
  naverMapNcpKeyId: process.env.EXPO_PUBLIC_NAVER_MAP_NCP_KEY_ID ?? "",
  googleWebClientId: process.env.EXPO_PUBLIC_GOOGLE_WEB_CLIENT_ID ?? "",
  googleAndroidClientId: process.env.EXPO_PUBLIC_GOOGLE_ANDROID_CLIENT_ID ?? "",
  googleIosClientId: process.env.EXPO_PUBLIC_GOOGLE_IOS_CLIENT_ID ?? "",
};
