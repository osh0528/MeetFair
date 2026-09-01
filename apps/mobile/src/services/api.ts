import type { ApiResponse } from "@meetfair/shared";
import { appConfig } from "../config/env";

let accessToken: string | null = null;
const REQUEST_TIMEOUT_MS = 15_000;

export function setApiAccessToken(token: string | null) {
  accessToken = token;
}
export class ApiError extends Error {
  constructor(
    public readonly code: string,
    message: string,
    public readonly status: number,
    public readonly details?: Record<string, unknown>,
  ) {
    super(message);
  }
}

export async function apiRequest<T>(
  path: string,
  init: RequestInit = {},
  timeoutMs = REQUEST_TIMEOUT_MS,
): Promise<T> {
  let response: Response;
  const controller = new AbortController();
  let timedOut = false;
  const abortFromCaller = () => controller.abort();
  init.signal?.addEventListener("abort", abortFromCaller, { once: true });
  const timeout = setTimeout(() => {
    timedOut = true;
    controller.abort();
  }, timeoutMs);
  try {
    response = await fetch(`${appConfig.apiUrl}${path}`, {
      ...init,
      signal: controller.signal,
      headers: {
        "content-type": "application/json",
        ...(accessToken ? { authorization: `Bearer ${accessToken}` } : {}),
        ...init.headers,
      },
    });
  } catch {
    if (timedOut) {
      throw new ApiError(
        "SERVER_TIMEOUT",
        "서버 응답이 지연되고 있습니다. 잠시 후 다시 시도해 주세요.",
        0,
      );
    }
    throw new ApiError(
      "SERVER_UNREACHABLE",
      "서버에 연결할 수 없습니다. 서버 주소와 실행 상태를 확인해 주세요.",
      0,
    );
  } finally {
    clearTimeout(timeout);
    init.signal?.removeEventListener("abort", abortFromCaller);
  }
  if (response.status === 204) return undefined as T;
  let payload: ApiResponse<T> & {
    error?: { code: string; message: string; details?: Record<string, unknown> };
  };
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
    throw new ApiError(payload.error.code, payload.error.message, response.status, payload.error.details);
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
