import { appConfig } from "../config/env";

export function avatarUrl(userId: string, avatarUpdatedAt?: string | null) {
  if (!avatarUpdatedAt) return undefined;
  return `${appConfig.apiUrl}/users/${userId}/avatar?v=${encodeURIComponent(avatarUpdatedAt)}`;
}
