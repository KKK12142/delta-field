# Delta Field

수업에서 쓰는 2D 탑다운 화면의 웹 공간이다. 학생이 캐릭터를 움직여 장소를 돌아다니는 프로그램을 목표로 한다.

## 환경

- 집 데스크탑 WSL2(Ubuntu)의 `~/projects/delta-field`에서 개발한다.
- Node 24(`.nvmrc`), pnpm(`package.json`의 `packageManager`), TypeScript 엄격 모드, Vite, Phaser 4.
- 색은 `src/theme.ts`에서만 정한다.
- 여럿이 함께 쓰는 게임 서버는 Colyseus(`server/`)다.

## 명령

쓰는 방법과 예시는 `docs/commands.md`에 모아 두었다.

- `pnpm dev` 화면 개발 서버. 윈도우 크롬에서 `http://localhost:5173`으로 연다.
- `pnpm dev:server` 게임 서버(포트 2567). 화면 개발 서버가 `/colyseus`로 넘겨 준다.
- `pnpm start` 수업용. 빌드한 뒤 게임 서버가 화면까지 한 주소(포트 2567)로 내어 주고, 학생 접속 주소를 보여 준다.
- `pnpm check` 화면과 서버 코드 타입 검사.
- `pnpm build` 타입 검사 뒤 `dist/`로 빌드.
- `pnpm preview` 빌드 결과 보기.
- `pnpm playtest` 화면·게임 서버를 켠 채로(`DF_TEACHER_PASSWORD`를 넘겨) 헤드리스 크롬에서 선생님 1명, 학생 2명으로 한 판을 자동으로 해 본다.
- `pnpm loadtest` 화면·게임 서버를 켠 채로(`DF_TEACHER_PASSWORD`를 넘겨) 학생 35명(봇 34 + 크롬 1)이 들어와 움직이고 골든벨을 할 때 서버 CPU, 데이터 양, 응답 시간을 잰다. 결과는 `.run/loadtest/`.
- `pnpm bots <방 코드> [봇 수] [분]` 선생님이 만든 방에 봇(기본 34명)만 넣어 정한 시간(기본 5분) 동안 돌아다니게 한다. 실제 컴퓨터·태블릿에서 화면이 끊기는지 볼 때 쓴다.
- `pnpm share` / `pnpm share:off` / `pnpm share:status` 화면·게임 서버를 켜고 Tailscale 망(맥·태블릿)에 내어 주고 거둔다.

공유 중인 서버를 그대로 둔 채 확인용 서버를 따로 켤 때는 포트를 바꾼다. 게임 서버는 `DF_PORT`, 화면 서버는 `DF_WEB_PORT`(넘겨 줄 게임 서버는 `DF_PORT`)를 쓴다.

`pnpm playtest`의 골든벨 확인은 제한 시간이 짧은 `scripts/playtest-goldenbell/`의 문제를, 방탈출 확인은 `scripts/playtest-escape/`의 자료(예시 자료와 형식이 틀린 자료)를 쓰므로,
확인용 게임 서버를 `DF_GOLDENBELL_DIR`, `DF_ESCAPE_DIR`로 그 폴더를 가리키게 켠다.

```
DF_PORT=2667 DF_TEACHER_PASSWORD=확인용 DF_GOLDENBELL_DIR=scripts/playtest-goldenbell DF_ESCAPE_DIR=scripts/playtest-escape node server/main.ts
DF_WEB_PORT=5273 DF_PORT=2667 pnpm dev
DF_TEACHER_PASSWORD=확인용 pnpm playtest http://localhost:5273/
DF_TEACHER_PASSWORD=확인용 pnpm loadtest http://localhost:5273/ http://localhost:2667
```

## 골든벨 문제 파일

저장소 맨 위 `goldenbell/` 폴더에 `.yaml` 파일로 넣는다. 형식은 `goldenbell/example.yaml`에 적어 두었다.
서버를 켠 컴퓨터(수업 때는 맥)의 이 폴더를 읽는다. 정답이 들어 있으므로 예시 말고는 저장소에 올라가지 않는다(`.gitignore`).

## 방탈출 자료 파일

저장소 맨 위 `escape/` 폴더에 `.yaml` 파일로 넣는다. 형식은 `escape/example.yaml`에 적어 두었다(미션의 문제·정답·단서·아이템·힌트 카드).
맵(`src/data/school.json`)에는 사물 자리와 미션 id만 있다. 선생님이 방을 만들면 자료 파일을 고르는 창이 뜨고, 나중에 "방탈출 자료" 단추로 바꿀 수 있다.
정답과 힌트 글이 들어 있으므로 예시 말고는 저장소에 올라가지 않는다(`.gitignore`).

## 선생님 비밀번호

저장소 맨 위에 `.env` 파일을 만들고 한 줄을 넣는다. `.env`는 저장소에 올라가지 않는다.

```
DF_TEACHER_PASSWORD=비밀번호
```
