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
  const response = await fetch(`${appConfig.apiUrl}${path}`, {
    ...init,
    headers: {
      "content-type": "application/json",
      ...(accessToken ? { authorization: `Bearer ${accessToken}` } : {}),
      ...init.headers,
    },
  });
  if (response.status === 204) return undefined as T;
  const payload = await response.json() as ApiResponse<T>;
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
