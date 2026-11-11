# Delta Field

수업에서 쓰는 2D 탑다운 화면의 웹 공간이다. 학생이 캐릭터를 움직여 장소를 돌아다닌다.
보편적인 장르의 프로그램을 새로 만든다. 교사(고등학교 물리)와 직접 대화하며 기획, 개발, 확인을 한다.
이름을 함께 쓰는 Delta Science(deltascience.kr)는 맥의 다른 세션이 맡는다.

## 환경
- 집 데스크탑 WSL2 Ubuntu의 ~/projects/delta-field. 교사는 맥의 Orca 앱으로 원격 접속하고, 이 컴퓨터를 원격으로 켜고 끈다.
- Phaser 4.2.1, Vite 8.3.7, TypeScript 7.0.2(엄격 모드), pnpm 10.26.0, Node 24(nvm, .nvmrc)
- 구조: src/main.ts(시작), src/scenes/RoomScene.ts(방·움직임·살펴보기·CCTV 모드), src/data/(방 데이터 JSON과 형식),
  src/game/(state.ts 한 판의 상태, cctv.ts CCTV에 보일 글), src/ui/(첫 화면·대화상자·안내·조이스틱·CCTV 창, HTML), src/net/connection.ts(서버 연결), src/theme.ts(색·크기·글꼴. CSS도 여기서 넣는 --df-* 변수만 쓴다),
  server/(Colyseus 게임 서버: main.ts, ClassRoom.ts), shared/(서버와 화면이 함께 쓰는 약속·상태)
- 서버 코드는 Node가 TypeScript를 그대로 실행한다(타입 지우기). 상대 경로 import에 .ts를 붙이고, 타입만 가져올 때는 import type을 쓰고, enum·namespace는 쓰지 않는다.
  서버 타입 검사 설정은 server/tsconfig.json. express는 타입 정의를 내려받지 않고 server/express.d.ts에 쓰는 부분만 적어 두었다.
- 명령: pnpm dev(화면 개발 서버), pnpm dev:server(게임 서버, 2567), pnpm check(화면과 서버 타입 검사), pnpm build(타입 검사 뒤 빌드),
  pnpm start(수업용: 빌드한 뒤 게임 서버가 화면까지 한 주소로 내어 줌. 교사의 맥에서 쓴다),
  pnpm playtest(화면·게임 서버를 켠 채로 DF_TEACHER_PASSWORD를 넘겨, 헤드리스 크롬에서 선생님 1명·학생 2명으로 한 판을 자동으로 해 본다.
  방 데이터를 바꾸면 scripts/playtest.mjs도 맞춘다. 확인용 게임 서버는 확인용 비밀번호로 따로 켜고, 끝나면 끈다.
  공유 중인 서버가 5173, 2567을 쓰고 있으면 DF_WEB_PORT, DF_PORT로 다른 포트에 켠다(README))
- 선생님 비밀번호: 저장소 맨 위 .env의 DF_TEACHER_PASSWORD. 교사가 직접 만든다. 저장소에 올리지 않고 내용을 출력하지 않는다.
- 공유: pnpm share / pnpm share:off / pnpm share:status. 화면·게임 서버를 켜고 윈도우 Tailscale serve로 Tailscale 망(교사의 맥·태블릿)에만 내어 준다.
  교사가 요청하면 언제든 켜고 끈다(교사 허락). 스크립트는 scripts/share.sh, 서버 기록은 .run/.
- 기획: docs/design.md에 정한 내용을 적는다. 새로 정한 것이 있으면 고쳐 둔다.
- 동시 접속 서버: Colyseus, 실제 수업 때는 교사의 맥에서 돌린다(docs/design.md의 2단계 결정).

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
