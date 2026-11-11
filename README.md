# Delta Field

수업에서 쓰는 2D 탑다운 화면의 웹 공간이다. 학생이 캐릭터를 움직여 장소를 돌아다니는 프로그램을 목표로 한다.

## 환경

- 집 데스크탑 WSL2(Ubuntu)의 `~/projects/delta-field`에서 개발한다.
- Node 24(`.nvmrc`), pnpm(`package.json`의 `packageManager`), TypeScript 엄격 모드, Vite, Phaser 4.
- 색은 `src/theme.ts`에서만 정한다.
- 여럿이 함께 쓰는 게임 서버는 Colyseus(`server/`)다.

## 명령

- `pnpm dev` 화면 개발 서버. 윈도우 크롬에서 `http://localhost:5173`으로 연다.
- `pnpm dev:server` 게임 서버(포트 2567). 화면 개발 서버가 `/colyseus`로 넘겨 준다.
- `pnpm start` 수업용. 빌드한 뒤 게임 서버가 화면까지 한 주소(포트 2567)로 내어 주고, 학생 접속 주소를 보여 준다.
- `pnpm check` 타입 검사.
- `pnpm build` 타입 검사 뒤 `dist/`로 빌드.
- `pnpm preview` 빌드 결과 보기.
- `pnpm playtest` 화면·게임 서버를 켠 채로(`DF_TEACHER_PASSWORD`를 넘겨) 헤드리스 크롬에서 선생님 1명, 학생 2명으로 한 판을 자동으로 해 본다.
- `pnpm share` / `pnpm share:off` / `pnpm share:status` 화면·게임 서버를 켜고 Tailscale 망(맥·태블릿)에 내어 주고 거둔다.

## 선생님 비밀번호

저장소 맨 위에 `.env` 파일을 만들고 한 줄을 넣는다. `.env`는 저장소에 올라가지 않는다.

```
DF_TEACHER_PASSWORD=비밀번호
```
