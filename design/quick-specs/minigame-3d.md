# Quick Spec: 미니게임 3D(보물찾기·공 피하기·줄다리기)

> 2026-11-22 교사 요청 "바로 미니게임 3D도 진행해." 미니게임 담당. 형식은 CCGS /quick-design.
> 규칙은 docs/design.md "미니게임(2026-11-12 …)", server/MiniGame.ts, shared/minigame.ts 그대로(서버·공 일정 계산은 고치지 않는다).

## 무엇을
기본 화면(3D)에서도 미니게임 세 가지를 2D(?view=2d)와 같은 흐름으로 한다.
- 선생님 3D 학교 맵: "미니게임 시작"(고르기 → 확인 → 3초 세기), 하는 중·결과 중에는 "미니게임 그만두기"(확인 창). 창은 2D와 같은 HTML(Dialog).
- 보물찾기: 보통·금 보물을 바닥 위에 떠서 돌고 반짝이는 작은 3D 물체로(종류마다 InstancedMesh 하나). 주우면 모두의 화면에서 사라짐.
  하는 중(세기 포함)에는 열린 부의 문을 모두 연다(3D 문 표시·충돌, rules.ts). 3D에는 미니맵이 없으니 미니맵 규칙은 그대로 지켜진다.
- 공 피하기: 서버 seed로 shared/minigame.ts ballSchedule·ballsAt·hitAt(2D·봇과 같은 코드)으로 공을 그린다. 공은 줄무늬 공(InstancedMesh)이 굴러가는 쪽으로 돈다.
  운동장 판(DODGE_ARENA) 둘레에 반투명 울타리를 세워 보이고, 이번 판 학생은 그 밖으로 못 나간다(3D 충돌).
  학생 화면이 자기 발로 맞음을 본다(miniHit). 맞으면 서버가 세운 구경 자리로 옮기고(view3d의 moveSeq 처리) 흐리게(alpha.outAvatar) 보이며 걷지 않는다.
- 줄다리기: 2D와 같은 HTML 창(TugPanel)을 띄우고, 스페이스바·Enter·단추로 당긴다. 하는 중에는 걷지 않는다.
- 끝: 결과 창(Dialog.result, 서버가 10초 뒤 닫음), 결과가 되면 시작 전 자리로 돌아가고 흐림을 푼다. 진행 칸(MiniHud)·세기 숫자도 2D와 같다.
  안내 칸 장소 이름 뒤에 " · 미니게임 중".

## 어떻게
- 새 파일 src/three/minigame3d.ts: MiniGame3D(흐름·그림·확인용 함수)와 선생님 시작·그만두기 창(askMiniStart·askMiniStop), treasureDoorsOpen(net).
- 함께 쓰는 파일에는 등록만:
  - mode.ts: ModeContext.me(내 자리 읽기·옮기기), MapMode.allows?(col,row)·frozen?()(선택).
  - view3d.ts: ctx.me를 넘기고, 걸을 때 mode.allows·mode.frozen을 본다.
  - school3d.ts: MiniGame3D를 만들고 update·decorate·devHooks·dispose에서 부르고, 선생님 미니게임 단추를 보인다.
  - rules.ts: 보물찾기 중 열린 부의 문은 'open'.
  - theme.ts: 맨 끝 근처에 mini3d 묶음(크기·색·빠르기).
- 시작 전 자리: view3d가 서버 옮김(공 피하기 시작)을 mode.update보다 먼저 받으므로, 미니게임이 없을 때의 자리를 프레임마다 기억해 두고 그 자리로 돌아간다.

## 완료 기준
1. pnpm build 통과.
2. pnpm playtest:mini3d(scripts/minigame3d.mjs): 선생님 3D + 학생 3D 2명 + 봇, DF_MINI_FAST=1로 세 게임 한 판씩.
   - 선생님 3D 단추로 고르기·확인·세기, "미니게임 그만두기"로 바뀜.
   - 보물찾기: 3D에 그린 보물 수 = 서버 보물 수(금 5개), 금 3점·보통 1점이 서버 점수와 같고 주운 보물이 두 학생 화면에서 사라짐, 문이 열림.
   - 공 피하기: 학생이 운동장 안으로 옮겨짐, 화면의 공 수 = 공 일정(ballsAt) 수, 울타리 밖으로 걸어 나가지 못함, 공에 맞으면 서버 miniOut·구경 자리·흐림.
   - 줄다리기: 3D 위에 창이 뜨고 당기기가 서버 점수에 셈, 결과·하트.
   - 결과 창(서버 결과와 같은 1등), 시작 전 자리로 돌아감, 결과 창이 닫히면 처음으로.
   - 캡처 production/qa/evidence/minigame-3d-*.png.
3. pnpm playtest(2D), pnpm playtest:gb3d, pnpm loadtest:3d 통과.
