# MeetFair 2인 GitHub 협업 방법

## 담당 영역

- `suhyeok`: `apps/mobile` 프론트엔드 중심
- `friend`: `apps/server` 백엔드 중심
- 공동: `packages/shared`, `docs`

공동 폴더를 수정할 때는 상대방에게 먼저 알려 같은 파일을 동시에 수정하지 않습니다.

## 최초 업로드: 수혁

GitHub에서 빈 저장소를 만든 뒤 Collaborators에 친구 계정을 추가합니다.

```powershell
git init -b main
git add .
git commit -m "chore: initialize MeetFair project"
git remote add origin 저장소주소
git push -u origin main

git checkout -b suhyeok
git push -u origin suhyeok
```

## 최초 설정: 친구

```powershell
git clone 저장소주소
cd MeetFair
git checkout -b friend origin/main
git push -u origin friend
```

## 매일 작업 시작 전

수혁은 다음 순서로 최신 `main`을 받습니다.

```powershell
git checkout main
git pull origin main
git checkout suhyeok
git merge main
```

친구는 마지막 두 줄에서 브랜치 이름만 바꿉니다.

```powershell
git checkout friend
git merge main
```

## 작업 저장과 업로드

수혁:

```powershell
git add .
git commit -m "feat: 모바일 약속 화면 추가"
git push origin suhyeok
```

친구:

```powershell
git add .
git commit -m "feat: 약속 생성 API 추가"
git push origin friend
```

GitHub에서 각자 `suhyeok → main`, `friend → main` Pull Request를 만들고 상대방이 확인한 다음 합칩니다.

## Pull Request 전 확인

저장소 루트에서 실행합니다 (npm 단일 매니저, `package-lock.json` 사용).

```powershell
npm run typecheck   # 내부: npm run build -w @meetfair/shared && npm run typecheck --workspaces --if-present
```

- 실행되지 않는 코드가 없는지 확인합니다.
- `.env`, API 키, 비밀번호를 올리지 않습니다.
- API를 변경했다면 `packages/shared`와 `docs/API.md`도 수정합니다.
- Pull Request 한 개에는 가능한 한 한 가지 기능만 넣습니다.

## 추천 커밋 이름

- `feat:` 기능 추가
- `fix:` 오류 수정
- `docs:` 문서 수정
- `refactor:` 기능 변화 없는 코드 정리
- `chore:` 설정과 패키지 작업

## 충돌이 발생했을 때

둘이 같은 파일을 동시에 수정했다면 자동으로 덮어쓰지 말고 어떤 코드가 필요한지 함께 확인합니다. 충돌 해결 후 앱과 서버 타입 검사를 다시 실행합니다.
