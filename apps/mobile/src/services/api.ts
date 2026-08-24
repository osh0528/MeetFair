import type { ApiResponse } from "@meetfair/shared";
import { appConfig } from "../config/env";

let accessToken: string | null = null;

export function setApiAccessToken(token: string | null) {
  accessToken = token;
}
export class ApiError extends Error {
  constructor(
    public readonly code: string,
    message: string,
    public readonly status: number,
  ) {
    super(message);
  }
}

export async function apiRequest<T>(
  path: string,
  init: RequestInit = {},
): Promise<T> {
  let response: Response;
  try {
    response = await fetch(`${appConfig.apiUrl}${path}`, {
      ...init,
      headers: {
        "content-type": "application/json",
        ...(accessToken ? { authorization: `Bearer ${accessToken}` } : {}),
        ...init.headers,
      },
    });
  } catch {
    throw new ApiError(
      "SERVER_UNREACHABLE",
      "서버에 연결할 수 없습니다. 서버 주소와 실행 상태를 확인해 주세요.",
      0,
    );
  }
  if (response.status === 204) return undefined as T;
  let payload: ApiResponse<T>;
  try {
    payload = await response.json() as ApiResponse<T>;
  } catch {
    throw new ApiError(
      "INVALID_SERVER_RESPONSE",
      "서버 응답을 처리하지 못했습니다. 잠시 후 다시 시도해 주세요.",
      response.status,
    );
  }
  if (!payload.success) {
    throw new ApiError(payload.error.code, payload.error.message, response.status);
  }
  return payload.data;
}

export async function checkServerHealth() {
  return apiRequest<{ service: string; status: string; checkedAt: string }>("/health");
}

export function createClientRequestId() {
  const chunk = () => Math.floor(Math.random() * 0x10000).toString(16).padStart(4, "0");
  return `${chunk()}${chunk()}-${chunk()}-4${chunk().slice(1)}-a${chunk().slice(1)}-${chunk()}${chunk()}${chunk()}`;
}
