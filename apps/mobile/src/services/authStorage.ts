import AsyncStorage from "@react-native-async-storage/async-storage";

const ACCESS_TOKEN_KEY = "meetfair.access-token";

export function getStoredAccessToken() {
  return AsyncStorage.getItem(ACCESS_TOKEN_KEY);
}

export function setStoredAccessToken(token: string) {
  return AsyncStorage.setItem(ACCESS_TOKEN_KEY, token);
}

export function removeStoredAccessToken() {
  return AsyncStorage.removeItem(ACCESS_TOKEN_KEY);
}
