# Quick Design Spec: 골든벨을 넓은 운동장에서

**Type**: Tweak
**System**: 3D 골든벨
**GDD Reference**: `design/gdd/goldenbell-3d.md`
**Date**: 2026-11-22

## Change Summary

골든벨 맵을 19×16 강당에서 44×28칸 잔디 운동장으로 넓히고(OXplayground처럼 큰 O칸·X칸, 가운데 출발 자리), 답 구역 판과 O·X·1~4 글자를 캐릭터보다 아래(바닥 바로 위)에 깐다.

## Motivation

교사 요청(2026-11-22 밤): "운동장에서 진행하자. 맵도 넓게 쓰고, OX나 숫자 발판에 캐릭터가 가리니까 안 가리게 레이어 한 단계 아래로 깔아."
35명이 몰려도 답 칸이 넓어 서로 덜 겹치고, 글자 판이 캐릭터를 가리지 않게 한다.

## Design Delta

지금 기획서(Detailed Design 7): "경기장: src/data/goldenbell.json의 칸 좌표를 그대로 3D 바닥으로 옮긴다 … 구역 글자는 캐릭터에 가려지지 않게 위에 그린다(2D와 같은 원칙)."

바뀐 것:
- 맵(src/data/goldenbell.json, 서버도 같은 파일): 44×28칸. 둘레 울타리(`%`), 그 안 2칸 트랙(`"`), 가운데 38×22칸 잔디(`+`).
- 구역(칸 좌표, [col, col+w) × [row, row+h)):
  - OX: O = (4, 4, 14×20), X = (26, 4, 14×20). 가운데 18~26열 8칸은 어느 구역도 아닌 통로이고 출발 자리다.
  - 객관식(OX와 같은 넓이를 2×2로 나눔): 1 = (4, 4, 14×9), 2 = (26, 4, 14×9), 3 = (4, 15, 14×9), 4 = (26, 15, 14×9). 13~15행 2칸은 통로.
  - 잔디 가장자리와 구역 사이에 1칸, 구역과 트랙 사이에 1칸을 둔다.
- 출발 자리(spawn): (20.5, 5) 3×18칸(통로 가운데). 출발 자리에서 가장 먼 구역 구석까지 약 25칸 = 걷기 4.4칸/초로 약 6초. 가장 가까운 구역 가장자리는 2.5칸.
- 구역 이름 판(pad-*)은 2D 그림 크기대로 2×2칸 사물로 두고(2D는 그대로 그림), 3D는 그 가운데에 theme 배율(2배)로 키워 눕힌다.
- 꾸밈 사물: 위쪽 트랙 가운데 사회자 단상·골든벨(2D 그림이 있는 것만). 무대·커튼·현수막·스피커는 뺀다.
- 3D 운동장 모습(src/three/playground3d.ts, 새 파일): 잔디 줄무늬·흰 선·트랙을 캔버스 텍스처 판 하나, 울타리 밖 바깥 땅 판 하나, 나무(줄기·잎 InstancedMesh 둘), 학교 건물 뒷배경(상자 InstancedMesh 하나). 그리기 +5번 안팎.
- 레이어(Detailed Design 7 고침): 구역 판·글자·보기 글은 바닥 바로 위에 깔고 깊이 검사를 켠다. 캐릭터(불투명, 먼저 그림)가 가린다. 그리는 순서: 바닥 → 구역 판 → 글자 → 마감 테두리 → 발밑 그림자 → (흐린 캐릭터) → 이름표·하트(늘 위).
- 카메라: 학생은 지금처럼 나를 따라가되 카드 아래 짧은 쪽에 14칸(전에는 10칸), 선생님은 운동장 전체(울타리까지).

## New Rules / Values

| 값 | 전 | 새 | 자리 |
|---|---|---|---|
| 맵 크기 | 19×16 | 44×28 | src/data/goldenbell.json |
| 학생 화면 보이는 칸 | 10 | 14 | theme.three.gbStudentTiles |
| 구역 글자 그림 배율 | 1(판 크기) | 2 | theme.playground.labelScale |

서버 규칙(채점·목숨·이동 검사)은 그대로다. 이동 검사는 맵 크기(layout)를, 스폰·채점은 spawn·zones를 같은 파일에서 읽는다.

## Affected Systems

- 서버 골든벨(server/ClassRoom.ts): 코드 그대로, 데이터만 바뀜(맵 크기·spawn·zones).
- 2D 골든벨(?view=2d): 같은 맵을 잔디·트랙·울타리 타일로 그린다. scripts/playtest.mjs의 골든벨 좌표를 새 맵에 맞춘다.
- 봇(scripts/lib/bots.mjs): zones를 파일에서 읽어 그대로 맞음.
- 3D(src/three/goldenbell3d.ts, playground3d.ts 새, view3d.ts 등록 없음).

## Acceptance Criteria

- [ ] 골든벨 맵이 44×28칸, O·X는 각 14×20칸, 객관식은 14×9칸 넷, 가운데 8칸 통로에 출발 자리.
- [ ] 서버가 새 맵에서 학생을 출발 자리에 세우고, OX·객관식을 구역으로 채점(pnpm playtest:gb3d 3D·2D 학생 채점 같음, pnpm playtest 2D 통과).
- [ ] 3D에서 구역 판·글자가 캐릭터 아래에 보인다(캐릭터가 글자 위에 선 캡처).
- [ ] 3D 운동장: 잔디 줄무늬·흰 선·트랙·울타리·나무·건물 뒷배경(캡처), 꾸밈 그리기 수 +6번 이하.
- [ ] 선생님 3D 화면에 운동장 전체가 들어온다. 학생은 나를 따라간다.
- [ ] pnpm build, pnpm playtest(?view=2d), pnpm playtest:gb3d, pnpm loadtest:3d 통과.

## GDD Update Required?

예: design/gdd/goldenbell-3d.md Detailed Design 7(운동장, 글자는 캐릭터 아래), Visual Requirements, Tuning Knobs.
