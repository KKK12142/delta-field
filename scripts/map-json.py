#!/usr/bin/env python3
# 맵 데이터 JSON(src/data/*.json)을 사람이 읽기 좋은 꼴로 다시 쓴다: layout은 한 줄에 한 줄, areas·objects는 한 줄에 하나.
# 사용: python3 scripts/map-json.py src/data/school.json
import json
import sys

path = sys.argv[1]
data = json.load(open(path, encoding='utf-8'))


def one(v):
    return json.dumps(v, ensure_ascii=False, separators=(', ', ': '))


lines = ['{']
keys = list(data.keys())
for i, k in enumerate(keys):
    v = data[k]
    end = ',' if i < len(keys) - 1 else ''
    if k == 'layout' or (isinstance(v, list) and v and isinstance(v[0], dict)):
        lines.append(f'  {json.dumps(k)}: [')
        lines += [f'    {one(x)}{"," if j < len(v) - 1 else ""}' for j, x in enumerate(v)]
        lines.append(f'  ]{end}')
    else:
        lines.append(f'  {json.dumps(k)}: {one(v)}{end}')
lines.append('}')
open(path, 'w', encoding='utf-8').write('\n'.join(lines) + '\n')
