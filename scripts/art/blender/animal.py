# 3D 동물 캐릭터를 bpy로 만들어 GLB로 내보낸다(docs/art.md "3D 동물 캐릭터 만들기").
# 동물마다 모양·색은 scripts/art/blender/animals/<이름>.json에 적는다(형식은 scripts/art/blender/README.md).
#
# 사용: blender -b --factory-startup --python scripts/art/blender/animal.py -- <animals/cat.json> [--out public/models/animals/cat.glb]
#         [--render <폴더>] [--samples 48] [--size 512]
#   --render를 주면 앞·3/4·옆 모습과 동작 4개(idle·walk·jump·wave)의 대표 장면을 Cycles로 렌더해 그 폴더에 PNG로 둔다.
#
# 만드는 방식
# - 뼈대(스키닝) 없이 부위별 물체를 부모-자식으로 묶는다: root(가만) > pivot(점프·찌그러짐) > 다리 2, body > head·팔 2·꼬리.
# - 부위 하나는 물체(메시) 하나, 재질 하나(꼭짓점 색 Color)라 three.js에서 부위마다 그리기 한 번이다. 눈·코·줄무늬는 얇은 타원체를 표면에 붙여 같은 메시에 합친다.
# - 동작은 물체 움직임 키프레임이다. 동작마다 NLA 트랙(이름이 곧 three.js 클립 이름)을 만들고, 모든 부위에 처음·끝을 같게 키를 넣어 반복해도 끊기지 않는다.
# - Blender 좌표(z 위, 앞 -y)로 만들고, glTF로 내보낼 때 y 위·앞 +z(three.js)로 바뀐다.
import bpy
import bmesh
import json
import math
import os
import sys
from mathutils import Matrix, Quaternion, Vector

argv = sys.argv[sys.argv.index('--') + 1:] if '--' in sys.argv else []


def arg(name, default=None):
    return argv[argv.index(name) + 1] if name in argv else default


spec_path = argv[0]
with open(spec_path, encoding='utf-8') as f:
    S = json.load(f)
root_dir = os.path.abspath(os.path.join(os.path.dirname(__file__), '..', '..', '..'))
out_path = arg('--out', os.path.join(root_dir, 'public', 'models', 'animals', f"{S['name']}.glb"))
render_dir = arg('--render')
FPS = 24

# ---------- 색 ----------


def linear(hexstr):
    """'#rrggbb'(sRGB)를 선형 RGBA로. glTF 꼭짓점 색(COLOR_0)은 선형이다."""
    h = hexstr.lstrip('#')
    out = []
    for i in (0, 2, 4):
        c = int(h[i:i + 2], 16) / 255
        out.append(c / 12.92 if c <= 0.04045 else ((c + 0.055) / 1.055) ** 2.4)
    return (*out, 1.0)


COLORS = {k: linear(v) for k, v in S['colors'].items()}
# 부위 아래쪽을 살짝 어둡게 칠해(꼭짓점 색 그라데이션) three.js에서도 부드러운 입체감이 나게 한다. 눈·반짝임은 빼고.
SHADE = S.get('shade', {'bottom': 0.82, 'skip': ['eye', 'shine']})
SHADE_SKIP = {tuple(round(x, 3) for x in COLORS[c]) for c in SHADE['skip'] if c in COLORS}


def lerp(a, b, t):
    return tuple(x + (y - x) * t for x, y in zip(a, b))


def smooth(e0, e1, x):
    t = max(0.0, min(1.0, (x - e0) / (e1 - e0)))
    return t * t * (3 - 2 * t)

# ---------- 메시 만들기 도우미 ----------


class Part:
    """부위 하나(메시 하나). 도형을 모두 world 좌표로 더한 뒤 pivot을 원점으로 옮겨 물체를 만든다."""

    def __init__(self, name, pivot):
        self.name = name
        self.pivot = Vector(pivot)
        self.bm = bmesh.new()
        self.col = self.bm.loops.layers.float_color.new('Color')
        self.normals = {}  # 꼭짓점 → 따로 정한 법선(무늬를 표면에 칠한 것처럼 보이게)

    def add(self, geom_verts, color, matrix, colorfn=None):
        """bmesh.ops로 막 만든 도형(geom_verts)을 matrix로 옮기고 color로 칠한다.
        colorfn(옮기기 전 좌표)를 주면 꼭짓점마다 그 색을 쓴다(가장자리를 부드럽게, 손끝만 다른 색 등)."""
        local = {v: v.co.copy() for v in geom_verts}
        bmesh.ops.transform(self.bm, matrix=matrix, verts=geom_verts)
        faces = {f for v in geom_verts for f in v.link_faces}
        rgba = COLORS[color]
        for face in faces:
            face.smooth = True
            for loop in face.loops:
                loop[self.col] = colorfn(local[loop.vert]) if colorfn else rgba
        return faces

    def ellipsoid(self, center, radius, color, rot=None, seg=(20, 12), colorfn=None, paint_on=None):
        """paint_on=(중심, 반지름): 이 타원체(얇은 무늬)의 법선을 아래 표면 타원체의 법선으로 바꿔, 튀어나온 띠가 아니라 칠한 무늬처럼 보이게 한다."""
        r = bmesh.ops.create_uvsphere(self.bm, u_segments=seg[0], v_segments=seg[1], radius=1.0)
        m = Matrix.Translation(Vector(center)) @ (rot or Matrix.Identity(4)) @ Matrix.Diagonal((*radius, 1.0))
        faces = self.add(r['verts'], color, m, colorfn)
        if paint_on:
            c, rr = Vector(paint_on[0]), Vector(paint_on[1])
            for v in r['verts']:
                d = v.co - c
                self.normals[v] = Vector((d.x / rr.x ** 2, d.y / rr.y ** 2, d.z / rr.z ** 2)).normalized()
        return faces

    def cone(self, base, axis, radius, height, tip, flat, color, seg=10):
        r = bmesh.ops.create_cone(self.bm, cap_ends=True, cap_tris=False, segments=seg, radius1=radius, radius2=tip, depth=height)
        # 지역 z는 axis, 지역 y는 앞뒤(world y)에 가깝게 잡아 flat으로 앞뒤만 납작하게 한다.
        z = Vector(axis).normalized()
        x = Vector((0, 1, 0)).cross(z).normalized()
        frame = Matrix((x, z.cross(x), z)).transposed().to_4x4()
        # create_cone은 가운데가 원점이라 밑면이 base에 오게 높이 절반만큼 올린다.
        m = Matrix.Translation(Vector(base)) @ frame @ Matrix.Translation((0, 0, height / 2)) @ Matrix.Diagonal((1, flat, 1, 1))
        return self.add(r['verts'], color, m)

    def tube(self, points, radius, rings, sides, color, bands):
        """points(베지어 조절점 4개)를 따라 굵기가 radius[0]→radius[1]인 관을 만들고 끝을 둥글게 막는다. bands는 길이 비율 구간마다 색."""
        p0, p1, p2, p3 = (Vector(p) for p in points)

        def at(t):
            a = 1 - t
            return a ** 3 * p0 + 3 * a * a * t * p1 + 3 * a * t * t * p2 + t ** 3 * p3

        def color_at(t):
            for b in bands:
                if b['from'] <= t < b['to']:
                    return b['color']
            return color

        centers = [at(i / rings) for i in range(rings + 1)]
        prev_n = None
        ring_verts = []
        for i, c in enumerate(centers):
            tang = (centers[min(i + 1, rings)] - centers[max(i - 1, 0)]).normalized()
            n = (prev_n - tang * prev_n.dot(tang)).normalized() if prev_n else tang.orthogonal().normalized()
            prev_n = n
            b = tang.cross(n)
            rr = radius[0] + (radius[1] - radius[0]) * i / rings
            ring_verts.append([self.bm.verts.new(c + rr * (math.cos(a) * n + math.sin(a) * b))
                               for a in (2 * math.pi * k / sides for k in range(sides))])
        for i in range(rings):
            col = COLORS[color_at((i + 0.5) / rings)]
            for k in range(sides):
                f = self.bm.faces.new((ring_verts[i][k], ring_verts[i][(k + 1) % sides], ring_verts[i + 1][(k + 1) % sides], ring_verts[i + 1][k]))
                f.smooth = True
                for loop in f.loops:
                    loop[self.col] = col
        # 끝은 반구로 막고, 밑동은 몸 속에 묻히므로 막지 않는다.
        tang = (centers[-1] - centers[-2]).normalized()
        self.ellipsoid(centers[-1], (radius[1],) * 3, color_at(0.999), rot=tang.to_track_quat('Z', 'Y').to_matrix().to_4x4(), seg=(sides, 6))

    def paint_mask(self, mask):
        """mask(얼굴 크림 무늬 등): 앞(-y)에서 본 타원 안의 base 색 꼭짓점을 color로 바꾼다. 가장자리는 soft만큼 부드럽게."""
        base, to = COLORS[mask['base']], COLORS[mask['color']]
        key = tuple(round(x, 3) for x in base)
        (cx, cz), (rx, rz) = mask['center'], mask['radius']
        for face in self.bm.faces:
            for loop in face.loops:
                if tuple(round(x, 3) for x in loop[self.col]) != key:
                    continue
                co = loop.vert.co
                if co.y > mask.get('front', 0.0):
                    continue
                d = math.hypot((co.x - cx) / rx, (co.z - cz) / rz)
                loop[self.col] = lerp(to, base, smooth(1 - mask['soft'], 1 + mask['soft'], d))

    def build(self):
        for mask in S.get('masks', []):
            if mask['part'] == self.name:
                self.paint_mask(mask)
        bmesh.ops.translate(self.bm, vec=-self.pivot, verts=self.bm.verts)
        bmesh.ops.recalc_face_normals(self.bm, faces=self.bm.faces)
        self.bm.normal_update()
        self.bm.verts.index_update()
        custom = {v.index: n for v, n in self.normals.items()}
        lo = SHADE['bottom']
        for face in self.bm.faces:
            for loop in face.loops:
                c = tuple(loop[self.col])
                if tuple(round(x, 3) for x in c) in SHADE_SKIP:
                    continue
                k = lo + (1 - lo) * (0.5 + 0.5 * loop.vert.normal.z)
                loop[self.col] = (c[0] * k, c[1] * k, c[2] * k, 1.0)
        mesh = bpy.data.meshes.new(self.name)
        self.bm.to_mesh(mesh)
        self.bm.free()
        if custom:
            mesh.normals_split_custom_set_from_vertices([custom.get(i, mesh.vertex_normals[i].vector) for i in range(len(mesh.vertices))])
        obj = bpy.data.objects.new(self.name, mesh)
        bpy.context.collection.objects.link(obj)
        obj.data.materials.append(MATERIAL)
        return obj


def surface(on, u, v):
    """타원체 on 위, 앞(-y)에서 u도(오른쪽 +x로), 위로 v도인 점과 바깥 법선."""
    c, r = Vector(S[on]['center']), Vector(S[on]['radius'])
    u, v = math.radians(u), math.radians(v)
    d = Vector((math.sin(u) * math.cos(v), -math.cos(u) * math.cos(v), math.sin(v)))
    p = c + Vector((r.x * d.x, r.y * d.y, r.z * d.z))
    n = Vector((d.x / r.x, d.y / r.y, d.z / r.z)).normalized()
    return p, n


def make_material():
    mat = bpy.data.materials.new('soft')
    mat.use_nodes = True
    nt = mat.node_tree
    bsdf = next(n for n in nt.nodes if n.type == 'BSDF_PRINCIPLED')
    attr = nt.nodes.new('ShaderNodeVertexColor')
    attr.layer_name = 'Color'
    nt.links.new(attr.outputs['Color'], bsdf.inputs['Base Color'])
    # 짧은 털 느낌: 거친 표면 + 가장자리가 밝아지는 시트(glTF KHR_materials_sheen, three.js MeshPhysicalMaterial.sheen)
    M = S.get('material', {})
    bsdf.inputs['Roughness'].default_value = M.get('roughness', 0.85)
    if M.get('sheen', 0) > 0:
        bsdf.inputs['Sheen Weight'].default_value = M['sheen']
        bsdf.inputs['Sheen Roughness'].default_value = M.get('sheenRoughness', 0.5)
        bsdf.inputs['Sheen Tint'].default_value = linear(M.get('sheenColor', '#ffffff'))
    return mat


# ---------- 모델 ----------
for o in list(bpy.data.objects):
    bpy.data.objects.remove(o)
MATERIAL = make_material()


def mirror(v):
    return (-v[0], *v[1:])


head = Part('head', S['head']['center'])
head.ellipsoid(S['head']['center'], S['head']['radius'], S['head']['color'], seg=(32, 20))
head.ellipsoid(S['muzzle']['center'], S['muzzle']['radius'], S['muzzle']['color'], seg=(18, 10))
E = S['ears']
for side in (1, -1):
    base = Vector(E['base']) * Vector((side, 1, 1))
    axis = Vector(E['axis']) * Vector((side, 1, 1))
    head.cone(base, axis, E['radius'], E['height'], E['tip'], E['flat'], E['color'])
    inner = E['inner']
    ibase = base + Vector((0, -inner['forward'], -inner['down']))
    head.cone(ibase, axis, E['radius'] * inner['scale'], E['height'] * inner['scale'] * inner.get('tall', 1.05), E['tip'], E['flat'] * inner.get('flat', 0.7), inner['color'])

body = Part('body', S['body']['center'][:2] + [S['body']['center'][2] - S['body']['radius'][2]])
body.ellipsoid(S['body']['center'], S['body']['radius'], S['body']['color'], seg=(18, 10))
body.ellipsoid(S['belly']['center'], S['belly']['radius'], S['belly']['color'], seg=(14, 8))

parts = {'head': head, 'body': body}
# 덧붙이는 덩어리(볼살 등). mirror면 x를 뒤집어 하나 더.
for x in S.get('extras', []):
    for side in ((1, -1) if x.get('mirror') else (1,)):
        c = Vector(x['center']) * Vector((side, 1, 1))
        parts[x['part']].ellipsoid(c, x['radius'], x['color'], seg=tuple(x.get('seg', (14, 8))))


def soft_edge(color, under, start=0.55):
    """얇은 타원체 무늬의 가장자리 색을 아래 표면 색(under)으로 부드럽게 바꾼다."""
    a, b = COLORS[color], COLORS[under]
    return lambda co: lerp(a, b, smooth(start, 0.97, math.hypot(co.x, co.y)))


for d in S['decals']:
    for side in ((1, -1) if d.get('mirror') else (1,)):
        p, n = surface(d['on'], d['u'] * side, d['v'])
        # face: 법선을 정면(-y) 쪽으로 돌려 눈처럼 앞을 보게 한다(0~1).
        f = d.get('face', 0)
        n2 = (n * (1 - f) + Vector((0, -1, 0)) * f).normalized()
        p = p + n * d.get('lift', 0.0)
        # tilt: 지역 x축으로 기울여 윗부분을 표면 속에 묻는다(입 윗선을 곧게)
        q = n2.to_track_quat('Z', 'Y') @ Quaternion((0, 0, 1), math.radians(d.get('roll', 0) * side)) @ Quaternion((1, 0, 0), math.radians(d.get('tilt', 0)))
        w, h, t = d['size']
        # 눈처럼 둥글고 큰 것은 곱게, 반짝임처럼 작은 것은 거칠게
        seg = (14, 9) if min(w, h) >= 0.06 else (6, 4) if max(w, h) < 0.02 else (12, 6) if max(w, h) > 0.07 else (8, 5)
        fn = soft_edge(d['color'], d['under']) if 'under' in d else None
        rot = q.to_matrix().to_4x4()
        paint = (S[d['on']]['center'], S[d['on']]['radius']) if d.get('paint') else None
        parts[d['part']].ellipsoid(p, (w, h, t / 2), d['color'], rot=rot, seg=seg, colorfn=fn, paint_on=paint)
        # 눈 위 반짝임: 무늬 안의 비율 좌표(at: 가로, 세로)에 작은 흰 점을 얹는다.
        for sh in d.get('shine', []):
            dx, dy = sh['at']
            top = (t / 2) * math.sqrt(max(0.0, 1 - dx * dx - dy * dy))
            c = p + rot.to_3x3() @ Vector((dx * w / 1, dy * h / 1, top))
            r = sh['size']
            parts[d['part']].ellipsoid(c, (r, r, r * 0.45), sh.get('color', 'shine'), rot=rot, seg=(8, 5) if r > 0.02 else (6, 4))

A = S['arms']
arms = []
for side, name in ((1, 'arm_l'), (-1, 'arm_r')):
    sh = Vector(A['shoulder']) * Vector((side, 1, 1))
    part = Part(name, sh)
    rot = Matrix.Rotation(math.radians(A['spread']) * side, 4, 'Y')
    tip = A.get('tip')  # 손끝 색: 팔 아래쪽(지역 z < below)을 부드럽게 바꾼다
    fn = (lambda co, a=COLORS[A['color']], b=COLORS[tip['color']], lo=tip['below']: lerp(a, b, smooth(lo + 0.2, lo - 0.1, co.z))) if tip else None
    part.ellipsoid(sh + Vector(A['offset']) * Vector((side, 1, 1)), A['radius'], A['color'], rot=rot, seg=(12, 8), colorfn=fn)
    arms.append(part)

L = S['legs']
legs = []
for side, name in ((1, 'leg_l'), (-1, 'leg_r')):
    hip = Vector(L['hip']) * Vector((side, 1, 1))
    part = Part(name, hip)
    part.ellipsoid(hip + Vector(L['offset']), L['radius'], L['color'], seg=(12, 8))
    part.ellipsoid(hip + Vector(L['foot']['offset']), L['foot']['radius'], L['foot']['color'], seg=(12, 7))
    legs.append(part)

T = S['tail']
tail = Part('tail', T['base'])
tail.tube(T['points'], T['radius'], T['rings'], T['sides'], T['color'], T['bands'])

root = bpy.data.objects.new(S['name'], None)
pivot = bpy.data.objects.new('pivot', None)
for o in (root, pivot):
    bpy.context.collection.objects.link(o)
pivot.parent = root
OBJ = {'root': root, 'pivot': pivot}
OBJ['body'] = body.build()
OBJ['body'].parent = pivot
OBJ['body'].location = body.pivot
for part, parent in [(head, 'body'), (arms[0], 'body'), (arms[1], 'body'), (tail, 'body'), (legs[0], 'pivot'), (legs[1], 'pivot')]:
    o = part.build()
    o.parent = OBJ[parent]
    o.location = part.pivot - (body.pivot if parent == 'body' else Vector())
    OBJ[part.name] = o
REST = {k: o.location.copy() for k, o in OBJ.items()}
ANIMATED = ['pivot', 'body', 'head', 'arm_l', 'arm_r', 'leg_l', 'leg_r', 'tail']

# ---------- 동작 ----------
# 키 하나: {물체: {'loc': (dx,dy,dz) 쉼 위치에 더함, 'rot': (x,y,z)도, 'scale': (x,y,z)}}. 빠진 값은 쉼 자세.


def pose(frame, keys):
    for name in ANIMATED:
        o = OBJ[name]
        k = keys.get(name, {})
        o.location = REST[name] + Vector(k.get('loc', (0, 0, 0)))
        o.rotation_euler = [math.radians(a) for a in k.get('rot', (0, 0, 0))]
        o.scale = k.get('scale', (1, 1, 1))
        for path in ('location', 'rotation_euler', 'scale'):
            o.keyframe_insert(path, frame=frame)


def cyc(i, n, amp, phase=0.0, harmonic=1):
    return amp * math.sin(2 * math.pi * harmonic * i / n + phase)


def clip_idle():
    n = 48
    for i in range(0, n + 1, 4):
        b = cyc(i, n, 1)
        yield i, {
            'body': {'scale': (1 - 0.012 * b, 1 - 0.012 * b, 1 + 0.03 * b)},
            'head': {'loc': (0, 0, 0.008 * b), 'rot': (0, cyc(i, n, 4, 0.6), 0)},
            'arm_l': {'rot': (0, cyc(i, n, 3, 0.3), 0)},
            'arm_r': {'rot': (0, cyc(i, n, -3, 0.3), 0)},
            'tail': {'rot': (0, cyc(i, n, 4), cyc(i, n, 12, 1.0))},
        }


def clip_walk():
    n = 24  # 두 걸음
    for i in range(0, n + 1, 2):
        s = cyc(i, n, 1)                       # 왼발 앞(-) / 오른발 앞(+)
        bob = abs(math.sin(2 * math.pi * i / n))  # 한 걸음마다 한 번 들림
        yield i, {
            'pivot': {'loc': (0, 0, 0.035 * bob)},
            'body': {'rot': (4, 7 * s, 0), 'scale': (1 + 0.03 * (1 - bob), 1 + 0.03 * (1 - bob), 1 - 0.05 * (1 - bob))},
            'head': {'rot': (0, -4 * s, cyc(i, n, 3))},
            'leg_l': {'rot': (-32 * s, 0, 0)},
            'leg_r': {'rot': (32 * s, 0, 0)},
            'arm_l': {'rot': (35 * s, 0, 0)},
            'arm_r': {'rot': (-35 * s, 0, 0)},
            'tail': {'rot': (0, 0, cyc(i, n, 15, 0.5))},
        }


def clip_jump():
    # (프레임, 높이, 몸 x·y 크기, 몸 z 크기, 팔 들기, 다리 접기)
    keys = [(0, 0, 1, 1, 0, 0), (5, 0, 1.12, 0.82, -10, 0), (8, 0.06, 0.92, 1.12, 90, 10), (13, 0.32, 0.97, 1.04, 110, 30),
            (16, 0.34, 1, 1, 110, 30), (20, 0.18, 0.98, 1.04, 80, 15), (23, 0, 1.12, 0.84, 30, 0), (27, 0, 0.98, 1.03, 0, 0), (30, 0, 1, 1, 0, 0)]
    for f, h, sxy, sz, arm, leg in keys:
        yield f, {
            'pivot': {'loc': (0, 0, h), 'scale': (sxy, sxy, sz)},
            'head': {'rot': (-6 if h > 0.1 else 0, 0, 0)},
            'arm_l': {'rot': (0, -arm, 0)},
            'arm_r': {'rot': (0, arm, 0)},
            'leg_l': {'rot': (-leg, 0, 0)},
            'leg_r': {'rot': (-leg, 0, 0)},
            'tail': {'rot': (leg * 0.6, 0, 0)},
        }


def clip_wave():
    n = 32  # 팔은 들고 있고 손만 두 번 흔든다
    for i in range(0, n + 1, 2):
        w = cyc(i, n, 1, harmonic=2)
        yield i, {
            'body': {'rot': (0, -4, 0)},
            'head': {'rot': (0, 6 + cyc(i, n, 3), 0)},
            'arm_l': {'rot': (0, -125 + 22 * w, 0)},
            'arm_r': {'rot': (0, 4, 0)},
            'tail': {'rot': (0, 0, cyc(i, n, 10))},
        }


CLIPS = {'idle': clip_idle, 'walk': clip_walk, 'jump': clip_jump, 'wave': clip_wave}
# 확인 그림에 쓸 대표 프레임
SHOW = {'idle': 0, 'walk': 6, 'jump': 14, 'wave': 4}

scene = bpy.context.scene
scene.render.fps = FPS


def rest_pose():
    for name in ANIMATED:
        o = OBJ[name]
        o.location, o.rotation_euler, o.scale = REST[name], (0, 0, 0), (1, 1, 1)


# ---------- 확인 렌더 ----------
def setup_render():
    scene.render.engine = 'CYCLES'
    scene.cycles.samples = int(arg('--samples', '48'))
    scene.cycles.use_denoising = True
    size = int(arg('--size', '512'))
    scene.render.resolution_x = scene.render.resolution_y = size
    try:
        scene.view_settings.view_transform = 'Standard'
    except TypeError:
        pass
    world = bpy.data.worlds.new('w')
    scene.world = world
    world.use_nodes = True
    bg = next(n for n in world.node_tree.nodes if n.type == 'BACKGROUND')
    bg.inputs['Color'].default_value = linear('#fde9d6')
    bg.inputs['Strength'].default_value = 0.85
    # 바닥(그림자 받기)
    bpy.ops.mesh.primitive_plane_add(size=40)
    floor = bpy.context.object
    fm = bpy.data.materials.new('floor')
    fm.use_nodes = True
    fb = next(n for n in fm.node_tree.nodes if n.type == 'BSDF_PRINCIPLED')
    fb.inputs['Base Color'].default_value = linear('#f8e0c8')
    fb.inputs['Roughness'].default_value = 1
    floor.data.materials.append(fm)

    def light(name, kind, loc, energy, color, size):
        d = bpy.data.lights.new(name, kind)
        d.energy, d.color = energy, color
        if kind == 'AREA':
            d.size = size
        o = bpy.data.objects.new(name, d)
        scene.collection.objects.link(o)
        o.location = loc
        o.rotation_euler = (Vector((0, 0, 0.5)) - Vector(loc)).to_track_quat('-Z', 'Y').to_euler()

    # 시안처럼 크고 부드러운 따뜻한 주광, 차가운 테두리 빛, 약한 채움 빛
    light('key', 'AREA', (-2.2, -2.4, 2.6), 120, (1.0, 0.9, 0.78), 4.0)
    light('rim', 'AREA', (2.0, 2.2, 1.9), 70, (0.8, 0.87, 1.0), 2.0)
    light('fill', 'AREA', (2.6, -2.0, 1.0), 35, (1.0, 0.94, 0.88), 4.0)
    cam = bpy.data.objects.new('cam', bpy.data.cameras.new('cam'))
    scene.collection.objects.link(cam)
    cam.data.lens = 85
    scene.camera = cam
    return cam


def shoot(cam, name, yaw, pitch=16, dist=3.4, target_z=0.5):
    yaw_r, pitch_r = math.radians(yaw), math.radians(pitch)
    tgt = Vector((0, 0, target_z))
    cam.location = tgt + dist * Vector((math.sin(yaw_r) * math.cos(pitch_r), -math.cos(yaw_r) * math.cos(pitch_r), math.sin(pitch_r)))
    cam.rotation_euler = (tgt - cam.location).to_track_quat('-Z', 'Y').to_euler()
    scene.render.filepath = os.path.join(render_dir, f'{name}.png')
    bpy.ops.render.render(write_still=True)


cam = setup_render() if render_dir else None
if render_dir:
    os.makedirs(render_dir, exist_ok=True)
    rest_pose()
    shoot(cam, '1-front', 0, pitch=6)
    shoot(cam, '2-three-quarter', 35)
    shoot(cam, '3-side', 90, pitch=6)

# 동작마다 부위별 동작(action)을 만들어 같은 이름의 NLA 트랙에 넣는다.
for ci, (clip, gen) in enumerate(CLIPS.items()):
    for name in ANIMATED:
        OBJ[name].animation_data_create().action = None
    keys = list(gen())
    for f, k in keys:
        pose(f, k)
    for name in ANIMATED:
        o = OBJ[name]
        act = o.animation_data.action
        act.name = f'{clip}_{name}'
    if render_dir and '--quick' not in argv:  # --quick: 모양만 빨리 볼 때는 동작 장면을 렌더하지 않는다
        scene.frame_set(SHOW[clip])
        shoot(cam, f'{4 + ci}-{clip}', 30, target_z=0.68 if clip == 'jump' else 0.5)
    for name in ANIMATED:
        o = OBJ[name]
        act = o.animation_data.action
        slot = o.animation_data.action_slot if hasattr(o.animation_data, 'action_slot') else None
        track = o.animation_data.nla_tracks.new()
        track.name = clip
        strip = track.strips.new(clip, int(act.frame_range[0]), act)
        if slot is not None and hasattr(strip, 'action_slot'):
            strip.action_slot = slot
        o.animation_data.action = None
    rest_pose()

# ---------- 내보내기 ----------
if render_dir:
    for o in list(bpy.data.objects):
        if o.type in ('CAMERA', 'LIGHT') or o.name.startswith('Plane'):
            bpy.data.objects.remove(o)
for o in bpy.data.objects:
    o.select_set(True)
os.makedirs(os.path.dirname(out_path), exist_ok=True)
bpy.ops.export_scene.gltf(
    filepath=out_path, export_format='GLB', use_selection=True, export_yup=True,
    export_texcoords=False, export_normals=True, export_materials='EXPORT', export_vertex_color='MATERIAL',
    export_cameras=False, export_lights=False, export_extras=False,
    export_animations=True, export_animation_mode='NLA_TRACKS', export_force_sampling=True, export_frame_step=1,
    export_anim_slide_to_zero=True, export_optimize_animation_size=False, export_optimize_animation_keep_anim_object=True,
)
tris = sum(sum(len(p.vertices) - 2 for p in o.data.polygons) for o in bpy.data.objects if o.type == 'MESH')
print(f'ANIMAL {S["name"]}: {out_path} {os.path.getsize(out_path)} bytes, {tris} triangles')
