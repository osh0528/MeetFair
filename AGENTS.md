# Repository Guidelines

## 프로젝트 구조 및 모듈 구성

이 디렉터리는 MeetFair 모노레포의 Expo/React Native 프론트엔드 워크스페이스이며 Android·iOS와 웹을 함께 지원합니다. `App.tsx`에서 내비게이션 스택을 정의합니다. 전체 화면은 `src/screens/`, 재사용 UI는 `src/components/`, API 및 Socket.IO 클라이언트는 `src/services/`, 환경 설정은 `src/config/`, 공통 색상과 디자인 토큰은 `src/theme/`에 배치합니다. 프론트엔드와 백엔드가 공유하는 계약은 모노레포의 `packages/shared/`에서 관리합니다. 현재 자동화 테스트 및 에셋 전용 디렉터리는 없습니다.

## 빌드, 검사 및 개발 명령어

- `npm start`: Expo 개발 서버를 실행합니다.
- `npm start -- --web`: 웹 미리보기를 실행합니다.
- `npm run android`: Android용 Expo 앱을 실행합니다.
- `npm run typecheck`: 파일을 생성하지 않고 엄격한 TypeScript 검사를 수행합니다.
- 모노레포 루트에서 `npm run dev:mobile`: 공유 타입을 빌드한 뒤 모바일 앱을 실행합니다.
- 모노레포 루트에서 `npm run typecheck`: 전체 워크스페이스를 검사합니다.

Node.js 22 이상을 사용합니다. 공통 패키지를 수정할 명확한 이유가 없다면 의존성 변경은 프론트엔드 워크스페이스에 한정합니다.

## 코딩 스타일 및 이름 규칙

TypeScript, 공백 2칸 들여쓰기, 큰따옴표, 세미콜론을 사용합니다. 컴포넌트와 파일 이름은 PascalCase로 작성하며 화면 파일은 `MeetingScreen.tsx`처럼 `Screen`으로 끝냅니다. 함수, 훅, props, 상태 이름에는 camelCase를 사용합니다. UI 요소는 `src/components/ui.ts`, 색상은 `src/theme/colors.ts`의 기존 항목을 우선 재사용합니다. 네이티브 전용 모듈을 사용할 때는 웹 대체 UI 또는 플랫폼별 파일을 함께 제공해 웹 번들이 깨지지 않게 합니다. 포매터와 린터는 아직 설정되지 않았으므로 주변 코드 스타일을 따르고 TypeScript 검사를 실행합니다.

## 테스트 지침

현재 테스트 프레임워크와 커버리지 기준은 없습니다. 제출 전에 `npm run typecheck`를 실행하고 영향을 받는 흐름을 Expo에서 직접 확인합니다. UI 변경은 모바일 뷰포트와 웹에서 모두 검사하며, 웹 번들에 네이티브 전용 모듈 오류가 없는지 확인합니다. 테스트를 추가할 때는 대상 코드 옆에 `*.test.ts` 또는 `*.test.tsx` 형식으로 배치합니다.

## 커밋 및 Pull Request 지침

커밋은 한 가지 목적에 집중하고 `feat:`, `fix:`, `docs:`, `refactor:`, `chore:` 접두사를 사용합니다. Pull Request에는 변경 목적, 검증 결과, 관련 이슈를 작성하고 UI 변경에는 전후 스크린샷을 첨부합니다. `packages/shared`, API payload, 인증, Socket.IO 이벤트를 변경해야 한다면 구현 전에 백엔드 담당자와 협의할 수 있도록 사용자에게 먼저 확인합니다.

## 보안 및 설정

`.env`, 인증 정보, 푸시 토큰, 실제 사용자 위치정보를 커밋하지 않습니다. 예시 설정은 `.env.example`에 작성합니다. 별도의 연동 합의가 있기 전까지 현재 화면 데이터는 모두 목업 데이터로 취급합니다.
