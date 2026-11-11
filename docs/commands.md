# 명령 정리

Delta Field에서 쓰는 명령과 하는 일을 모았다. 명령은 저장소 폴더에서 터미널에 친다.

- 집 데스크탑: 우분투 터미널에서 `cd ~/projects/delta-field` 뒤에 친다.
- 수업용 맥: 저장소를 받은 폴더에서 친다.
- 켜 둔 서버를 끌 때는 그 터미널에서 `Ctrl+C`를 누른다.

## 맥에서 처음 준비(한 번)

맥의 터미널에서 한 줄씩 친다.

1. Node와 pnpm이 있는지 본다: `node -v`, `pnpm -v`
   - Node는 집 컴퓨터와 같은 24를 쓴다(`v24.`로 시작). 없으면 nodejs.org에서 Node 24를 받아 설치한다(nvm을 쓰면 `nvm install 24`).
   - pnpm이 없으면 `npm install -g pnpm@10.26.0`
2. 코드를 받을 폴더로 가서 받는다:
   ```
   cd ~/Documents
   git clone https://github.com/KKK12142/delta-field.git
   cd delta-field
   ```
3. 패키지를 받는다: `pnpm install`
4. 선생님 비밀번호 파일을 만든다: `nano .env`를 치고 `DF_TEACHER_PASSWORD=비밀번호` 한 줄을 쓴 뒤 `Ctrl+O`, `Enter`, `Ctrl+X`로 저장하고 나온다. 저장소에 올라가지 않는다.
5. 골든벨 문제 파일(.yaml)을 `goldenbell/` 폴더에 넣는다(저장소로 오지 않으므로 AirDrop, USB 등으로 옮긴다).
6. 켜 본다: `pnpm start`. 터미널에 학생 접속 주소가 찍히면 된다.
   맥 방화벽이 켜져 있으면 "node가 들어오는 연결을 받도록 허용할까요?" 창이 뜬다. 허용을 누른다.

다른 컴퓨터(집 데스크탑 등)에 처음 받을 때도 같다. 패키지가 바뀐 코드를 받은 뒤에는 `pnpm install`을 한 번 더 친다.

## 수업 때(교사의 맥)

| 명령 | 하는 일 |
|---|---|
| `cd ~/Documents/delta-field` | 받아 둔 폴더로 간다(받은 곳에 맞춘다) |
| `git pull` | GitHub에서 새 코드를 받는다. 받은 뒤 `pnpm install`을 한 번 친다 |
| `pnpm start` | 빌드한 뒤 서버를 켠다. 화면과 게임 서버가 한 주소(포트 2567)로 나온다. 터미널에 **학생 접속 주소**(예: `http://192.168.0.10:2567`)가 찍힌다. 학생은 그 주소로 들어와 선생님이 만든 방 코드를 넣는다. 수업 동안 맥이 잠들지 않게 하고, 학생과 같은 와이파이에 둔다 |

골든벨 문제 파일은 서버를 켠 컴퓨터의 `goldenbell/` 폴더에 `.yaml`로 넣는다.
형식은 `goldenbell/example.yaml`에 적어 두었다. 선생님 문제 파일은 정답이 있어 저장소에 올라가지 않으므로, 맥의 이 폴더에 직접 넣는다.

## 개발 중 확인(집 데스크탑)

| 명령 | 하는 일 |
|---|---|
| `pnpm share` | 화면 서버(5173)와 게임 서버(2567)를 켜고 Tailscale 망 안의 맥·태블릿에서 열 수 있게 공유한다. 맥·태블릿 주소는 명령이 알려 준다. 데스크탑의 윈도우 크롬은 `http://localhost:5173` |
| `pnpm share:off` | 공유를 거두고 두 서버를 끈다 |
| `pnpm share:status` | 화면 서버, 게임 서버, 공유가 켜져 있는지 본다 |
| `pnpm dev` | 화면 서버만 켠다(5173). 코드를 고치면 화면이 바로 바뀐다 |
| `pnpm dev:server` | 게임 서버만 켠다(2567). 서버 코드를 고치면 저절로 다시 켜진다(열려 있던 방은 닫힌다) |

`.env`의 비밀번호를 바꾸면 게임 서버를 다시 켜야 한다(`pnpm share:off` 뒤 `pnpm share`).

## 검사

| 명령 | 하는 일 |
|---|---|
| `pnpm check` | 화면 코드와 서버 코드의 타입 검사 |
| `pnpm build` | 타입 검사 뒤 `dist/`에 빌드한다 |
| `pnpm preview` | 빌드한 화면을 미리 본다(포트 4173). 게임 서버는 따로 켜야 한다 |

## 자동 확인과 학생 많을 때 시험

| 명령 | 하는 일 |
|---|---|
| `pnpm playtest [화면 주소]` | 헤드리스 크롬으로 선생님과 학생 몇 명이 방탈출, CCTV, 골든벨을 자동으로 해 보고 통과·실패를 찍는다. 결과와 캡처는 `.run/playtest/` |
| `pnpm loadtest [화면 주소] [게임 서버 주소] [학생 수]` | 학생 35명(가짜 학생 34명 + 크롬 1명)이 들어와 쉬지 않고 움직이고 골든벨을 한 판 한다. 서버 CPU·메모리, 기기 1대가 받는 데이터, 응답 시간, 화면 빠르기를 잰다. 결과는 `.run/loadtest/` |
| `pnpm bots <방 코드> [봇 수] [분] [게임 서버 주소]` | 선생님이 만든 방에 가짜 학생만 넣는다(기본 34명, 5분, `http://localhost:2567`). 학생으로 들어가므로 비밀번호가 필요 없다. 교실에서는 돌아다니고, 골든벨에서는 답 구역을 골라 걸어간다. 실제 컴퓨터·태블릿에서 화면이 끊기는지 볼 때 쓴다. 예: `pnpm bots 3121` |

`playtest`와 `loadtest`는 공유 중인 서버를 건드리지 않게, 확인용 서버를 다른 포트에 따로 켜고 돌린다.
골든벨 확인은 제한 시간이 짧은 `scripts/playtest-goldenbell/`의 문제를 쓴다. 비밀번호는 확인용으로 아무 글이나 쓴다.

```
# 터미널 1: 확인용 게임 서버
DF_PORT=2667 DF_TEACHER_PASSWORD=확인용비밀번호 DF_GOLDENBELL_DIR=scripts/playtest-goldenbell node server/main.ts

# 터미널 2: 확인용 화면 서버
DF_WEB_PORT=5273 DF_PORT=2667 pnpm dev

# 터미널 3: 확인
DF_TEACHER_PASSWORD=확인용비밀번호 pnpm playtest http://localhost:5273/
DF_TEACHER_PASSWORD=확인용비밀번호 pnpm loadtest http://localhost:5273/ http://localhost:2667
```

끝나면 터미널 1, 2에서 `Ctrl+C`로 끈다.

## 환경 변수

| 이름 | 뜻 | 기본값 |
|---|---|---|
| `DF_TEACHER_PASSWORD` | 선생님 비밀번호. 서버는 `.env`에서 읽는다. `playtest`·`loadtest`에는 확인용 서버의 비밀번호를 넘긴다 | 없음 |
| `DF_PORT` | 게임 서버 포트(화면 서버가 넘겨 줄 곳도 이것을 쓴다) | 2567 |
| `DF_WEB_PORT` | 화면 서버 포트 | 5173 |
| `DF_GOLDENBELL_DIR` | 골든벨 문제 파일 폴더 | `goldenbell/` |
