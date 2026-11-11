# Delta Field

수업에서 쓰는 2D·아이소메트릭 화면의 웹 공간이다. 학생이 캐릭터를 움직여 장소를 돌아다니는 프로그램을 목표로 한다.

## 환경

- 집 데스크탑 WSL2(Ubuntu)의 `~/projects/delta-field`에서 개발한다.
- Node 24(`.nvmrc`), pnpm(`package.json`의 `packageManager`), TypeScript 엄격 모드, Vite, Phaser 4.
- 색은 `src/theme.ts`에서만 정한다.

## 명령

- `pnpm dev` 개발 서버. 윈도우 크롬에서 `http://localhost:5173`으로 연다.
- `pnpm check` 타입 검사.
- `pnpm build` 타입 검사 뒤 `dist/`로 빌드.
- `pnpm preview` 빌드 결과 보기.

## 정할 것

- 동시 접속 서버(나중에 정한다).
