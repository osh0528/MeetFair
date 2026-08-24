import { appConfig } from "../config/env";

export function profileMusicUrl(userId: string, updatedAt?: string | null) {
  const version = updatedAt ? "?v=" + encodeURIComponent(updatedAt) : "";
  return appConfig.apiUrl + "/users/" + userId + "/page-music" + version;
}
