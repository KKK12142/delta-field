# gpt-6.2-astra가 쓴 Blender 스크립트(2026-11-21 교사 요청, 대장 시험)

- BAZE 게이트웨이 chat/completions의 gpt-6.2-astra(LLM)에게 시안 그림(art/raw/animal3d-a, 저장소 밖)과 cat-prompt.txt를 주고 bpy 스크립트를 받았다.
  첫 답은 삼각형 6,736개로 스스로 넣은 검사에 걸려, 오류를 돌려주어 한 번 고치게 했다(cat.py, 삼각형 5,784개).
- 쓴 토큰: 입력 9,713, 출력 9,503(두 번 합). 값은 입력 100만 토큰 8달러, 출력 40달러 기준 약 0.46달러.
- 실행: `OUT_GLB=<glb 경로> OUT_DIR=<확인 그림 폴더> blender -b --python scripts/art/blender/astra/cat.py`
- 받기: `node --env-file=$HOME/.config/delta-field/baze.env scripts/art/blender/astra/ask.mjs <프롬프트> <출력.py> [그림.png ...]`(키는 출력하지 않는다)
- 결과: public/models/animals/cat-astra.glb(159 KB, 메시 11개, 동작 idle·walk·jump·wave), 확인 그림 art/concepts/animal3d-cat-astra.png.
