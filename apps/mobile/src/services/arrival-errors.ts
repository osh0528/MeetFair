import { ApiError } from "./api";

export function arrivalErrorMessage(error: unknown): string {
  if (!(error instanceof ApiError)) {
    return error instanceof Error ? error.message : "도착 처리에 실패했습니다.";
  }
  if (error.code === "PLACE_NOT_CONFIRMED") return "확정 장소를 먼저 정해 주세요.";
  if (error.code === "ALREADY_ARRIVED") return "이미 도착 처리됐습니다.";
  if (error.code === "TOO_FAR") {
    const distance = error.details?.distanceMeters;
    const threshold = error.details?.thresholdMeters;
    const distanceText = typeof distance === "number" ? ` 현재 약 ${Math.round(distance)}m 떨어져 있습니다.` : "";
    const thresholdText = typeof threshold === "number" ? ` ${Math.round(threshold)}m 이내에서 다시 시도해 주세요.` : " 장소 근처에서 다시 시도해 주세요.";
    return `확정 장소에서 너무 멀리 있습니다.${distanceText}${thresholdText}`;
  }
  return error.message;
}
