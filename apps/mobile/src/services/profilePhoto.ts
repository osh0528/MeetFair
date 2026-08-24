import { appConfig } from "../config/env";

export function profilePhotoUrl(ownerId: string, photoId: string) {
  return appConfig.apiUrl + "/users/" + ownerId + "/page-photos/" + photoId + "/image";
}
