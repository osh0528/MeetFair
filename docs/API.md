# Meet World API (2026-08-24 계약 반영)

모든 응답은 `ApiResponse<T> { success, data?, error? }` 형태. 인증은 `Authorization: Bearer <accessToken>`.

## Auth

- POST /api/auth/register — {email,password,nickname,accountId(lowercase+숫자 4-20)} → 409 ACCOUNT_ID_TAKEN
- POST /api/auth/login
- GET /api/auth/me

## Users

- GET /api/users/account-id/availability?accountId=xxx → {accountId, available}
- PATCH /api/users/me/account-id {accountId} → 403 ACCOUNT_ID_ALREADY_CHANGED, 409 ACCOUNT_ID_TAKEN
- PATCH /api/users/me {nickname}
- PUT /api/users/me/home {address,latitude,longitude}
- DELETE /api/users/me/home
- PATCH /api/users/me/settings {shareExactLocationWithFriends?, casualPokesEnabled?, pokeQuietStartMinutes?, pokeQuietEndMinutes?, timezone?}
- PUT /api/users/me/location {latitude,longitude,accuracy} — 403 FRIEND_LOCATION_SHARING_DISABLED if shareExactLocationWithFriends=false
- PUT /api/users/me/push-token {expoPushToken}

## Friends

- GET /api/friends → FriendSummary[] {sharedLatitude,sharedLongitude,sharedLocationAt}
- POST /api/friends/friend-requests {recipientAccountId} → 404 USER_NOT_FOUND, 400 CANNOT_FRIEND_SELF, 409 ALREADY_FRIENDS/FRIEND_REQUEST_ALREADY_EXISTS — 생성 시 Notification+friend:request
- GET /api/friends/friend-requests → {received,sent}
- PATCH /api/friends/friend-requests/:id {action: accept|reject} — 수락 시 Notification+friend:accepted
- DELETE /api/friends/friends/:friendUserId
- PATCH /api/friends/:friendshipId/poke-permission {allowed}

## Pokes

- POST /api/pokes {targetUserId, clientRequestId?} → 404 USER_NOT_FOUND, 403 NOT_FRIENDS/CASUAL_POKE_DISABLED/POKE_BLOCKED — quiet면 push 생략, socket은 항상 발송, summarizedAt=null
- POST /api/pokes/friends/:friendUserId {clientRequestId} — 호환 유지
- PATCH /api/pokes/friends/:friendUserId/permission {allowed} — 호환 유지 (권장은 /friends/:id/poke-permission)
- quiet 요약: 스케줄러가 종료 후 1건 요약 알림(CASUAL_POKE_SUMMARY, important) + summarizedAt 갱신

## Meetings

- POST /api/meetings {title,scheduledAt,inviteeUserIds?,inviteeAccountIds?,visibility,categories,travelMetric,locationShareMode,shareMinutesBefore,originType: HOME|CUSTOM,customOriginAddress?,customOriginLatitude?,customOriginLongitude?} — 생성 시 초대 Notification+meeting:invitation
- GET /api/meetings, GET /api/meetings/:meetingId (타인 origin 비노출), POST /api/meetings/join {inviteCode}
- PUT /api/meetings/:meetingId/origin {originType,address,latitude,longitude}
- PATCH /api/meetings/:meetingId/location-consent, /readiness, /confirm, /complete
- POST /api/meetings/:meetingId/pokes {targetId,clientRequestId}

## Recommendations & Votes

- GET /api/recommendations?meetingId=xxx → MeetingRecommendation[] — Naver 검색 미설정 시 503 PLACE_SEARCH_NOT_CONFIGURED, 409 MEETING_ORIGINS_INCOMPLETE
- POST /api/meetings/:meetingId/votes {placeCandidateId} — vote 후 evaluateMeetingVote(과반 즉시 확정)
- POST /api/meetings/:meetingId/votes/finalize — 호스트 전용, 409 VOTE_ALREADY_FINALIZED

## Meeting Social

- GET /api/meetings/activity/friends
- POST /api/meetings/:meetingId/join-requests, GET, PATCH /api/meetings/:meetingId/join-requests/:requestId {accept|reject}
- PATCH /api/meetings/:meetingId/permissions
- POST /api/meetings/:meetingId/arrive — share-window 게이팅(403 MEETING_LOCATION_SHARE_OFF/SHARING_TOO_EARLY)
- GET /api/meetings/:meetingId/locations — share-window 게이팅
- POST /api/meetings/:meetingId/candidates {providerPlaceId,name,address,latitude,longitude,category}

## Meeting Invitations / Calls / Notifications

- GET /api/meeting-invitations, PATCH /api/meeting-invitations/:id {accept|reject} — 응답 시 host에 Notification+meeting:invitation-responded
- GET /api/meeting-calls/pending, POST /api/meeting-calls/:callId/token, PATCH /api/meeting-calls/:callId {accept|decline|leave} — decline 시 JOINED 없으면 즉시 ENDED
- GET /api/notifications

## Socket.IO

- Auth: handshake.auth.token (Bearer)
- Client→Server: meeting:join, location:update {meetingId,latitude,longitude,accuracy,sentAt}, sharing:status
- Server→Client: participant:location, participant:status, poke:received, friend:request, friend:accepted, meeting:invitation, meeting:invitation-responded, meeting:call-incoming, notification:created, meeting:updated, meeting:error {MEETING_LOCATION_SHARE_OFF|SHARING_TOO_EARLY…}
