# Meet World API 계약

기본 주소는 `http://localhost:4000/api`입니다. 날짜는 UTC ISO 8601 문자열, ID는 UUID 문자열을 사용합니다.

## 공통 응답

```json
{
  "success": true,
  "data": {}
}
```

```json
{
  "success": false,
  "error": {
    "code": "ERROR_CODE",
    "message": "오류 설명"
  }
}
```

## 현재 구현

### `GET /health`

서버 실행 상태를 확인합니다.

## 구현 예정 API

| Method | Path | 설명 |
| --- | --- | --- |
| POST | `/auth/register` | 회원가입 |
| POST | `/auth/login` | 로그인 |
| PUT | `/users/me/push-token` | Expo 푸시 토큰 저장 |
| POST | `/meetings` | 약속 생성 |
| GET | `/meetings` | 내 약속 목록 |
| GET | `/meetings/:meetingId` | 약속 상세 |
| POST | `/meetings/join` | 초대 코드로 참가 |
| PUT | `/meetings/:meetingId/origin` | 출발지 등록 |
| POST | `/meetings/:meetingId/recommendations` | 장소 추천 |
| POST | `/meetings/:meetingId/votes` | 장소 투표 |
| PATCH | `/meetings/:meetingId/confirm` | 장소 확정 |
| PATCH | `/meetings/:meetingId/location-consent` | 위치 공유 동의 |
| PATCH | `/meetings/:meetingId/readiness` | 준비 인증 상태 |
| POST | `/meetings/:meetingId/pokes` | 찌르기 전송 |
| POST | `/meetings/:meetingId/complete` | 약속 종료 |

## Socket.IO 이벤트

클라이언트 이벤트는 `meeting:join`, `location:update`, `sharing:status`입니다. 서버 이벤트는 `participant:location`, `participant:status`, `poke:received`, `meeting:error`입니다.

Payload는 `packages/shared/src/index.ts`를 단일 기준으로 사용합니다.
