import type { ApiResponse } from "@meetfair/shared";
import { appConfig } from "../config/env";

interface HealthData {
  service: string;
  status: string;
  checkedAt: string;
}

export async function checkServerHealth(): Promise<ApiResponse<HealthData>> {
  try {
    const response = await fetch(`${appConfig.apiUrl}/health`);
    return (await response.json()) as ApiResponse<HealthData>;
  } catch {
    return {
      success: false,
      error: {
        code: "NETWORK_ERROR",
        message: "서버에 연결할 수 없습니다.",
      },
    };
  }
}
