const apiUrl = process.env.EXPO_PUBLIC_API_URL ?? "http://localhost:4000/api";

export const appConfig = {
  apiUrl,
  socketUrl: process.env.EXPO_PUBLIC_SOCKET_URL ?? apiUrl.replace(/\/api\/?$/, ""),
  kakaoMapJsKey: process.env.EXPO_PUBLIC_KAKAO_MAP_JS_KEY ?? "",
  googleWebClientId: process.env.EXPO_PUBLIC_GOOGLE_WEB_CLIENT_ID ?? "",
  googleAndroidClientId: process.env.EXPO_PUBLIC_GOOGLE_ANDROID_CLIENT_ID ?? "",
  googleIosClientId: process.env.EXPO_PUBLIC_GOOGLE_IOS_CLIENT_ID ?? "",
};
