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
  const controller = new AbortController();
  let timedOut = false;
  const abortFromCaller = () => controller.abort(init.signal?.reason);
  if (init.signal?.aborted) abortFromCaller();
  else init.signal?.addEventListener("abort", abortFromCaller, { once: true });
  const timeout = setTimeout(() => {
    timedOut = true;
    controller.abort();
  }, timeoutMs);
  try {
    if (controller.signal.aborted) throw controller.signal.reason;
    const headers = new Headers(init.headers);
    if (!headers.has("content-type")) headers.set("content-type", "application/json");
    if (accessToken && !headers.has("authorization")) headers.set("authorization", `Bearer ${accessToken}`);
    const response = await fetch(`${appConfig.apiUrl}${path}`, {
      ...init,
      signal: controller.signal,
      headers,
    });
    if (response.status === 204) return undefined as T;
    let payload: ApiResponse<T>;
    try {
      payload = await response.json() as ApiResponse<T>;
    } catch (error) {
      if (controller.signal.aborted) throw error;
      throw new ApiError("INVALID_SERVER_RESPONSE", "서버 응답을 처리하지 못했습니다. 잠시 후 다시 시도해 주세요.", response.status);
    }
    if (!payload || typeof payload !== "object" || typeof payload.success !== "boolean") {
      throw new ApiError("INVALID_SERVER_RESPONSE", "서버 응답을 처리하지 못했습니다. 잠시 후 다시 시도해 주세요.", response.status);
    }
    if (!payload.success) {
      if (!payload.error || typeof payload.error.code !== "string" || typeof payload.error.message !== "string") {
        throw new ApiError("INVALID_SERVER_RESPONSE", "서버 응답을 처리하지 못했습니다. 잠시 후 다시 시도해 주세요.", response.status);
      }
      const details = "details" in payload.error && payload.error.details && typeof payload.error.details === "object"
        ? payload.error.details as Record<string, unknown>
        : undefined;
      throw new ApiError(payload.error.code, payload.error.message, response.status, details);
    }
    if (!response.ok || !("data" in payload)) {
      throw new ApiError("INVALID_SERVER_RESPONSE", "서버 응답을 처리하지 못했습니다. 잠시 후 다시 시도해 주세요.", response.status);
    }
    return payload.data;
  } catch (error) {
    if (error instanceof ApiError) throw error;
    if (timedOut) {
      throw new ApiError(
        "SERVER_TIMEOUT",
        "서버 응답이 지연되고 있습니다. 잠시 후 다시 시도해 주세요.",
        0,
      );
    }
    if (init.signal?.aborted) throw init.signal.reason ?? error;
    throw new ApiError(
      "SERVER_UNREACHABLE",
      "서버에 연결할 수 없습니다. 서버 주소와 실행 상태를 확인해 주세요.",
      0,
    );
  } finally {
    clearTimeout(timeout);
    init.signal?.removeEventListener("abort", abortFromCaller);
  }
}

export async function checkServerHealth() {
  return apiRequest<{ service: string; status: string; checkedAt: string }>("/health");
}

export function createClientRequestId() {
  const chunk = () => Math.floor(Math.random() * 0x10000).toString(16).padStart(4, "0");
  return `${chunk()}${chunk()}-${chunk()}-4${chunk().slice(1)}-a${chunk().slice(1)}-${chunk()}${chunk()}${chunk()}`;
}
