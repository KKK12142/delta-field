# Delta Field

수업에서 쓰는 2D 탑다운 화면의 웹 공간이다. 학생이 캐릭터를 움직여 장소를 돌아다닌다.
보편적인 장르의 프로그램을 새로 만든다. 교사(고등학교 물리)와 직접 대화하며 기획, 개발, 확인을 한다.
이름을 함께 쓰는 Delta Science(deltascience.kr)는 맥의 다른 세션이 맡는다.

## 환경
- 집 데스크탑 WSL2 Ubuntu의 ~/projects/delta-field. 교사는 맥의 Orca 앱으로 원격 접속하고, 이 컴퓨터를 원격으로 켜고 끈다.
- Phaser 4.2.1, Vite 8.3.7, TypeScript 7.0.2(엄격 모드), pnpm 10.26.0, Node 24(nvm, .nvmrc)
- 구조: src/main.ts(시작), src/scenes/(MapScene.ts 맵·움직임 바탕, RoomScene.ts 교실·살펴보기·CCTV 모드, GoldenBellScene.ts 골든벨),
  src/data/(맵 데이터 JSON과 형식: classroom.json, goldenbell.json), src/game/(state.ts 한 판의 상태, cctv.ts·goldenbell.ts 화면에 보일 글),
  src/ui/(첫 화면·대화상자·안내·조이스틱·CCTV 창·골든벨 안내, HTML), src/net/connection.ts(서버 연결), src/theme.ts(색·크기·글꼴. CSS도 여기서 넣는 --df-* 변수만 쓴다),
  server/(Colyseus 게임 서버: main.ts, ClassRoom.ts, questions.ts 골든벨 문제 읽기), shared/(서버와 화면이 함께 쓰는 약속·상태·골든벨 규칙),
  goldenbell/(골든벨 문제 YAML. 정답이 있어 example.yaml 말고는 저장소에 올리지 않는다)
- 서버 코드는 Node가 TypeScript를 그대로 실행한다(타입 지우기). 상대 경로 import에 .ts를 붙이고, 타입만 가져올 때는 import type을 쓰고, enum·namespace는 쓰지 않는다.
  서버 타입 검사 설정은 server/tsconfig.json. express는 타입 정의를 내려받지 않고 server/express.d.ts에 쓰는 부분만 적어 두었다.
- 명령: pnpm dev(화면 개발 서버), pnpm dev:server(게임 서버, 2567), pnpm check(화면과 서버 타입 검사), pnpm build(타입 검사 뒤 빌드),
  pnpm start(수업용: 빌드한 뒤 게임 서버가 화면까지 한 주소로 내어 줌. 교사의 맥에서 쓴다),
  pnpm playtest(화면·게임 서버를 켠 채로 DF_TEACHER_PASSWORD를 넘겨, 헤드리스 크롬에서 선생님 1명·학생 2명으로 한 판을 자동으로 해 본다.
  방 데이터를 바꾸면 scripts/playtest.mjs도 맞춘다. 확인용 게임 서버는 확인용 비밀번호로 따로 켜고, 끝나면 끈다.
  공유 중인 서버가 5173, 2567을 쓰고 있으면 DF_WEB_PORT, DF_PORT로 다른 포트에 켠다. 골든벨 확인용 문제는 DF_GOLDENBELL_DIR=scripts/playtest-goldenbell(README)),
  pnpm loadtest(같은 준비로 학생 35명 접속 시험), pnpm bots <방 코드>(선생님 방에 봇만 넣기. 교사가 요청할 때 공유 중인 서버에도 쓴다)
- 선생님 비밀번호: 저장소 맨 위 .env의 DF_TEACHER_PASSWORD. 교사가 직접 만든다. 저장소에 올리지 않고 내용을 출력하지 않는다.
- 공유: pnpm share / pnpm share:off / pnpm share:status. 화면·게임 서버를 켜고 윈도우 Tailscale serve로 Tailscale 망(교사의 맥·태블릿)에만 내어 준다.
  교사가 요청하면 언제든 켜고 끈다(교사 허락). 스크립트는 scripts/share.sh, 서버 기록은 .run/.
- 기획: docs/design.md에 정한 내용을 적는다. 새로 정한 것이 있으면 고쳐 둔다.
- 동시 접속 서버: Colyseus, 실제 수업 때는 교사의 맥에서 돌린다(docs/design.md의 2단계 결정).

## 여러 세션으로 일할 때(2026-11-11 교사 결정)
- 교사는 대장 세션하고만 대화한다. 대장이 일을 나눠 담당 세션(또는 대장이 띄운 에이전트)에게 맡기고, 결과를 확인해 main에 합친다.
  교사는 담당 세션의 기록을 보고 직접 끼어들 수 있다.
- 역할
  - 대장: 교사와 대화, 기획 문서 정리, 일 나누기, 결과 확인·합치기, GitHub 푸시, 공유 폴더(~/projects/delta-field) 갱신,
    pnpm share와 공유 서버, .env 다루기, 작은 수정.
  - 맵 담당: 맵·장소·카메라·움직임·입력(조이스틱), 방탈출 흐름, CCTV·골든벨 같은 게임 기능과 서버의 게임 규칙.
  - 그림 담당: 도트 캐릭터·타일·사물·아이콘, 그림 생성(BAZE 게이트웨이로 GPT)과 다듬기, 캐릭터 고르기와 아바타 그리기 연결.
- 담당 세션은 일을 처음 받으면 EnterWorktree(name: 역할 이름, 예 map·art)로 자기 worktree(.claude/worktrees/<이름>)를 만들어 옮기고,
  그 안에서만 고친다. 패키지는 `pnpm install --offline --frozen-lockfile`로 잇고 새로 받지 않는다(받아야 하면 대장에게 알린다).
- 담당 세션은 토큰을 아끼려고 자기 화면에 길게 답하지 않는다. 한 일을 정리해 대장 세션에 SendMessage로 보낸다:
  브랜치·커밋, 고친 파일, 돌린 확인과 결과, 정한 것(교사가 정하지 않은 부분), 교사에게 물을 것, 확인하지 못한 것.
- 담당 세션은 확인을 통과하면 자기 브랜치에 커밋하고 푸시하지 않는다. 공유 폴더, pnpm share, .env, 교사와의 대화는 대장만 한다.
  교사에게 물어야 할 것은 정하지 말고 대장에게 보낸다. 다른 담당과 같은 파일을 크게 고쳐야 하면 먼저 대장에게 알린다.
- 확인용 포트(DF_PORT·DF_WEB_PORT·DF_CHROME_PORT): 대장 2667·5273·9334, 맵 2767·5373·9434, 그림 2867·5473·9534. 새 담당은 100씩 올린다.
  확인용 서버는 끝나면 끈다. `setsid ... &`의 `$!`는 실제 PID가 아닐 수 있으니 포트로 PID를 찾아(`ss -ltnpH "sport = :포트"`) 그 묶음을 끈다.

## 일하는 방식
- 교사에게는 한국어 "~습니다"체로, 15줄 안팎으로 보고한다. 고친 파일, 돌린 확인과 결과, 확인하지 못한 것을 적는다.
- 모르는 것은 추정해서 채우지 않고 묻는다. 교사가 말하지 않은 의도를 넘겨짚어 단서를 달지 않는다.
- 고칠 곳은 모아서 한 번에 고친다.
- 화면 문구(안내, 단추, 오류)는 "~습니다"체로 쓴다. AI 말투와 경구처럼 끝맺는 문장을 쓰지 않는다.
- 색과 크기는 src/theme.ts에서만 정한다. 다른 코드에 색 값을 직접 쓰지 않는다.
- 학생 실명, 학번, 얼굴 사진은 저장소에 넣지 않는다. 예시 데이터에는 가명만 쓴다.
- 그림(타일, 캐릭터)을 어떻게 만들지는 교사와 정한다. 코드로만 그린 그림보다 생성 그림을 바탕으로 쓰는 쪽을 기본으로 한다.

## 확인
- 고친 뒤 pnpm build(타입 검사 포함)를 돌린다.
- 화면은 헤드리스 크롬(google-chrome)으로 확인한다. 확인할 때마다 개발 서버(pnpm dev)를 띄워도 된다(교사 허락). WSL에는 한글 글꼴이 없어 캡처의 한글이 네모로 나온다.
  실제 모양과 속도는 교사가 윈도우 크롬(http://localhost:5173)에서 본다.

## 하지 않는 것
- 패키지·파일 내려받기와 프로그램 설치는 먼저 교사에게 묻는다. "묻지 말고 해"도 설치 허락으로 보지 않는다.
- 파일을 영구 삭제하지 않는다. 지울 것은 ~/trash/<날짜>/로 옮긴다.
- sudo 비밀번호, API 키, 계정 비밀번호를 입력하지 않는다. .env 같은 키 파일의 내용을 출력하지 않는다.
- 윈도우·WSL의 시스템 설정과 보안 설정을 바꾸지 않는다.
- ~/projects/ax-science와 ~/projects/teaching은 건드리지 않는다. 맥의 ax-science 세션이 이 컴퓨터에서 검사를 돌릴 때 쓴다.
- GitHub 저장소 만들기, 푸시, 배포, 서버 띄우기는 교사가 하라고 할 때만 한다.
- 오래 걸리는 일(10분 넘게)은 시작하기 전에 교사에게 알린다.

## git
- 커밋 이름 "최스님", 메일 rottenapplea@gmail.com (이 저장소에만 설정)
- 커밋 시점: 확인(빌드·화면)을 통과하면 바로 커밋하고 GitHub에 푸시한다.
- GitHub 저장소: KKK12142/delta-field(공개). 공개이므로 학생 정보와 키 파일이 들어가지 않았는지 커밋 전에 본다.
