# Systems Index: Delta Field 3D

> **Status**: Draft
> **Created**: 2026-11-22
> **Last Updated**: 2026-11-22(밤 작업 반영)
> **Source Concept**: docs/design.md("3D로 바꾸기", 2026-11-21 교사 결정)

---

## Overview

수업용 웹 게임 공간을 2D에서 three.js 3D로 옮긴다. 범위는 우선 골든벨과 미니게임(교사 결정). 서버 규칙(Colyseus)은 그대로 두고 화면만 바꾼다.
틀을 먼저 다 잡고, 캐릭터 최종 모델은 마지막에 Tripo + Blender 리깅으로 만든다.

---

## Systems Enumeration

| # | System Name | Category | Priority | Status | Design Doc | Depends On |
|---|-------------|----------|----------|--------|------------|------------|
| 1 | 3D 화면 바탕(맵·카메라·걷기·다른 학생) | Core | MVP | Implemented(시제품) | docs/design.md "3D로 바꾸기" | 서버 연결 |
| 2 | 3D 캐릭터(임시 고양이, 최종은 동물 8종) | Core | MVP | In Design | docs/design.md 동물 캐릭터 결정, docs/art.md | 1 |
| 3 | 3D 골든벨(넓은 운동장) | Gameplay | Vertical Slice | Implemented | design/gdd/goldenbell-3d.md | 1, 2, 서버 골든벨 규칙 |
| 4 | 3D 미니게임(보물찾기·공 피하기·줄다리기) | Gameplay | Alpha | Implemented | design/quick-specs/minigame-3d.md | 1, 2 |
| 5 | 동작(이모트) | Gameplay | Alpha | Implemented | design/quick-specs/emote-sfx-quick-questions-2026-11-22.md | 2 |
| 6 | 효과음 | Audio | Alpha | Implemented | design/quick-specs/emote-sfx-quick-questions-2026-11-22.md | 3, 4 |
| 7 | 선생님 창에서 바로 문제 내기 | UI | Alpha | Implemented | design/quick-specs/emote-sfx-quick-questions-2026-11-22.md | 3 |
