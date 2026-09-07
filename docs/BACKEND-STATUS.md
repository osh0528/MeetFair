# Meet World 백엔드 개발 진행 현황

> 기준일: 2026-08-24 / 기준 커밋: `f41b078` + 계약 구현 (미커밋)
> 대상: `apps/server` (@meetfair/server) · `packages/shared`

## 한 줄 요약

계약을 기반으로 한 파운데이션 + 정책을 구현했습니다. 소켓 이벤트 5개 개명, 계정 ID 1회 변경 정책, 찌르기 quiet 요약, 서버 주도 추천·투표, 위치공유 윈도우, 도착 판정 통일, 통화 hardening을 완료했고 `npm run typecheck`와 정책 테스트가 통과합니다. 마이그레이션은 오프라인 생성 후 DB 복구 시 적용 대기입니다.

---

## 1. 마이그레이션

- `apps/server/prisma/migrations/20260824120000_init/migration.sql` — 전체 스키마 init (364줄)
- `migration_lock.toml` — provider postgresql
- **스키마 변경 3건**: `User.shareExactLocationWithFriends`로 개명, `MeetingCall.meetingId String @unique`, `Poke.summarizedAt DateTime?`
- **적용 상태**: 로컬 PostgreSQL 18이 57P03(startup)으로 접속 거부 → `Restart-Service postgresql-x64-18` 관리자 권한 필요. 현재는 오프라인 diff로만 생성, `npx prisma migrate deploy` 대기.

## 2. 공유 계약 (`packages/shared`)

| 변경 | 전 | 후 |
| --- | --- | --- |
| 이벤트 5개 | `friend-request:received` 등 | `friend:request`, `friend:accepted`, `meeting:invitation`, `meeting:invitation-responded`, `meeting:call-incoming` |
| FriendSummary | latitude/longitude/accuracy/locationUpdatedAt | sharedLatitude/sharedLongitude/sharedLocationAt |
| PublicUser | shareLocationWithFriends | shareExactLocationWithFriends |
| 신규 타입 | - | MeetingRecommendation { recommendationRank, average/max/timeGap, participantTravelTimes } |

## 3. HTTP API 변경 (프론트 적용점)

### Breaking

- `GET /api/users/account-id/:accountId/availability` → `GET /api/users/account-id/availability?accountId=xxx`
- `PATCH /api/users/me`에서 accountId 분리 → 신규 `PATCH /api/users/me/account-id {accountId}` (1회 제한, 403 ACCOUNT_ID_ALREADY_CHANGED, 409 ACCOUNT_ID_TAKEN)
- 에러코드 개명: `ACCOUNT_ID_ALREADY_USED` → `ACCOUNT_ID_TAKEN`, `ACCOUNT_NOT_FOUND` → `USER_NOT_FOUND`
- `PATCH /api/users/me/settings` 필드 `shareExactLocationWithFriends`
- `POST /api/pokes` → 신규 `POST /api/pokes {targetUserId, clientRequestId?}` (기존 `POST /api/pokes/friends/:friendUserId`는 호환 유지), 에러코드 세분화 `NOT_FRIENDS`/`CASUAL_POKE_DISABLED`/`POKE_BLOCKED`
- `PATCH /api/pokes/friends/:friendUserId/permission` → `PATCH /api/friends/:friendshipId/poke-permission {allowed}`
- `POST /api/meetings/:meetingId/recommendations` 클라이언트 제공 방식 폐기 → `GET /api/recommendations?meetingId=xxx` 서버 주도 (Naver 장소검색+길찾기). 미설정 시 503 PLACE_SEARCH_NOT_CONFIGURED
- `POST /api/meetings/:meetingId/votes` 투표 후 자동 `evaluateMeetingVote` 호출 (과반 즉시 확정 버그 수정)
- 신규 `POST /api/meetings/:meetingId/votes/finalize` 호스트 전용 즉시 확정
- `GET /api/meetings/:meetingId` 응답에서 타인 origin 좌표 비노출

### 호환 유지

- 기존 poke/friend 경로는 당분간 병행 유지해 점진 이전 지원

## 4. 실시간

- 이벤트 키 5개 개명 (위 표)
- `location:update`에 share-window 게이팅: DAY_OF는 KST 당일 00:00부터, BEFORE_START는 scheduledAt-shareMinutesBefore부터 허용, OFF는 MEETING_LOCATION_SHARE_OFF
- 100m 2회 연속 도착 판정 로직을 `services/arrivals.ts`로 통일 (소켓·REST 공유)

## 5. 스케줄러 (`server.ts` 15초)

- `processDueMeetingCalls` — P2002 unique 충돌 스킵, 지각 알림 important:true
- `processMeetingLifecycle` — 기존 유지
- `processQuietSummaries` — quiet 종료 후 CASUAL poke 요약 알림 1건(important) + summarizedAt 일괄 갱신

## 6. 순수 정책 라이브러리

- `lib/geo.ts` — haversine, proximity 카운터
- `lib/share-window.ts` — KST 자정·shareMinutesBefore 윈도우, canStartSharing
- `lib/quiet-time.ts` — zonedMinuteToUtc, lastEndedQuietWindow, isQuietTime
- `services/vote-policy.ts` — hasMajority, allParticipantsVoted, pickWinner(득표→rank→id)

## 7. 푸시

- `EXPO_PUSH_ACCESS_TOKEN` 헤더 지원 (`.env.example` 갱신)
- `createNotification({important:true})`는 quiet hours 우회해 즉시 푸시

## 8. 검증

- `npm run build --workspace @meetfair/shared` — 통과
- `npx prisma generate` — 통과
- `npm run typecheck` — 전체 워크스페이스 통과 (server, mobile, shared)
- `npm run test --workspace @meetfair/server` — 4파일 24테스트 통과 (geo, share-window, quiet-time, vote-policy)

## 9. 남은 수동 검증 (DB 복구 후)

```powershell
Restart-Service postgresql-x64-18  # 관리자 PowerShell
npx prisma migrate deploy --schema apps/server/prisma/schema.prisma
npx prisma generate
npm run typecheck
npm run test --workspace @meetfair/server
# curl로 availability?accountId=, poke quiet, 추천 503, 투표 과반, 위치공유 윈도우 확인
```
