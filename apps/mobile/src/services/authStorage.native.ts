import * as SecureStore from "expo-secure-store";

const ACCESS_TOKEN_KEY = "meetfair.access-token";

export function getStoredAccessToken() {
  return SecureStore.getItemAsync(ACCESS_TOKEN_KEY);
}

export function setStoredAccessToken(token: string) {
  return SecureStore.setItemAsync(ACCESS_TOKEN_KEY, token, {
    keychainAccessible: SecureStore.WHEN_UNLOCKED_THIS_DEVICE_ONLY,
  });
}

export function removeStoredAccessToken() {
  return SecureStore.deleteItemAsync(ACCESS_TOKEN_KEY);
}
