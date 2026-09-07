import { ApiError } from "./api";

const authErrorMessages: Record<string, string> = {
  INVALID_CREDENTIALS: "이메일 또는 비밀번호가 올바르지 않습니다.",
  EMAIL_ALREADY_USED: "이미 가입된 이메일입니다.",
  ACCOUNT_ID_ALREADY_USED: "이미 사용 중인 계정 ID입니다.",
  ACCOUNT_ID_TAKEN: "이미 사용 중인 계정 ID입니다.",
  GOOGLE_AUTH_NOT_CONFIGURED: "Google 로그인이 아직 설정되지 않았습니다.",
  INVALID_GOOGLE_TOKEN: "Google 인증에 실패했습니다. 다시 시도해 주세요.",
  INVALID_GOOGLE_ACCOUNT: "인증된 Google 이메일 계정이 필요합니다.",
  GOOGLE_ACCOUNT_CONFLICT: "다른 계정에 연결된 Google 계정입니다.",
  GOOGLE_REGISTRATION_REQUIRED: "먼저 회원가입 정보를 입력해 주세요.",
  SERVER_TIMEOUT: "서버 응답이 지연되고 있습니다. 잠시 후 다시 시도해 주세요.",
  SERVER_UNREACHABLE: "서버에 연결할 수 없습니다. 네트워크 상태를 확인해 주세요.",
};

export function authErrorMessage(error: unknown, fallback: string): string {
  if (error instanceof ApiError) return authErrorMessages[error.code] ?? error.message;
  return error instanceof Error ? error.message : fallback;
}
