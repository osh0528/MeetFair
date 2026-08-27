# Meet World

여러 사람의 출발지를 비교해 공평한 약속 장소를 추천하고, 약속 전 이동 상태를 확인하는 2인 팀 프로젝트입니다.

## 기술 구성

- 프론트엔드: React Native, Expo, TypeScript
- 백엔드: Node.js, Express, TypeScript
- 데이터베이스: PostgreSQL, Prisma
- 실시간 통신: Socket.IO
- 알림: Expo Push Service

## 폴더 구조

```text
apps/
  mobile/       수혁 담당 모바일 앱
  server/       친구 담당 API·Socket.IO 서버
packages/
  shared/       함께 관리하는 API·실시간 이벤트 타입
docs/           프로젝트와 API 문서
```

`packages/shared`를 프론트와 백엔드가 함께 사용하므로 필드명과 이벤트명이 서로 어긋나는 것을 방지합니다.

## 시작하기

Node.js 22 이상과 npm 10 이상이 필요합니다. pnpm은 사용하지 않습니다 (`package-lock.json` 단일 소스).

```powershell
# 저장소 루트에서 실행
npm install
Copy-Item apps/server/.env.example apps/server/.env
Copy-Item apps/mobile/.env.example apps/mobile/.env
npm run dev:server   # packages/shared 빌드 -> apps/server/src/server.ts 실행 (tsx watch)
```

다른 터미널에서 모바일 앱을 실행합니다.

```powershell
# 저장소 루트에서 실행
npm run dev:mobile   # packages/shared 빌드 -> apps/mobile (expo start)
```

실제 휴대폰에서 실행할 때는 `apps/mobile/.env`의 주소를 개발 PC의 내부 IP로 바꿉니다. Android 에뮬레이터에서는 일반적으로 `localhost` 대신 `10.0.2.2`를 사용합니다.

## 데이터베이스 준비

PostgreSQL을 준비하고 `apps/server/.env`의 `DATABASE_URL`을 수정한 뒤 **저장소 루트**에서 실행합니다.

```powershell
npm run prisma:generate   # = npm run prisma:generate -w @meetfair/server  -> apps/server/src/generated/prisma 생성
npm run prisma:migrate    # = npm run prisma:migrate -w @meetfair/server
```

> 직접 워크스페이스를 지정하려면 `npm run prisma:generate -w @meetfair/server` 형태도 동일하게 동작합니다.

## 현재 포함된 기능

- React Native 기본 화면과 지도 샘플
- 사용자 동의 후 현재 위치 표시
- 백엔드 연결 확인 버튼
- Express 상태 확인 API
- Socket.IO 공통 이벤트 타입
- PostgreSQL용 Prisma 데이터 모델
- GitHub Actions 타입 검사

인증, 실제 장소 추천, 실시간 위치 권한 검증, 찌르기 푸시 발송은 다음 구현 단계입니다.

자세한 협업 순서는 `CONTRIBUTING.md`, API 계약은 `docs/API.md`에서 확인합니다.
