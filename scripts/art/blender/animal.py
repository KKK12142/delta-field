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

# ---------- 메시 만들기 도우미 ----------


class Part:
    """부위 하나(메시 하나). 도형을 모두 world 좌표로 더한 뒤 pivot을 원점으로 옮겨 물체를 만든다."""

    def __init__(self, name, pivot):
        self.name = name
        self.pivot = Vector(pivot)
        self.bm = bmesh.new()
        self.col = self.bm.loops.layers.float_color.new('Color')

    def add(self, geom_verts, color, matrix):
        """bmesh.ops로 막 만든 도형(geom_verts)을 matrix로 옮기고 color로 칠한다."""
        bmesh.ops.transform(self.bm, matrix=matrix, verts=geom_verts)
        faces = {f for v in geom_verts for f in v.link_faces}
        rgba = COLORS[color]
        for face in faces:
            face.smooth = True
            for loop in face.loops:
                loop[self.col] = rgba
        return faces

    def ellipsoid(self, center, radius, color, rot=None, seg=(20, 12)):
        r = bmesh.ops.create_uvsphere(self.bm, u_segments=seg[0], v_segments=seg[1], radius=1.0)
        m = Matrix.Translation(Vector(center)) @ (rot or Matrix.Identity(4)) @ Matrix.Diagonal((*radius, 1.0))
        return self.add(r['verts'], color, m)

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

    def build(self):
        bmesh.ops.translate(self.bm, vec=-self.pivot, verts=self.bm.verts)
        bmesh.ops.recalc_face_normals(self.bm, faces=self.bm.faces)
        mesh = bpy.data.meshes.new(self.name)
        self.bm.to_mesh(mesh)
        self.bm.free()
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
    bsdf.inputs['Roughness'].default_value = 0.72
    return mat


# ---------- 모델 ----------
for o in list(bpy.data.objects):
    bpy.data.objects.remove(o)
MATERIAL = make_material()


def mirror(v):
    return (-v[0], *v[1:])


head = Part('head', S['head']['center'])
head.ellipsoid(S['head']['center'], S['head']['radius'], S['head']['color'], seg=(24, 14))
head.ellipsoid(S['muzzle']['center'], S['muzzle']['radius'], S['muzzle']['color'], seg=(16, 10))
E = S['ears']
for side in (1, -1):
    base = Vector(E['base']) * Vector((side, 1, 1))
    axis = Vector(E['axis']) * Vector((side, 1, 1))
    head.cone(base, axis, E['radius'], E['height'], E['tip'], E['flat'], E['color'])
    inner = E['inner']
    ibase = base + Vector((0, -inner['forward'], -inner['down']))
    head.cone(ibase, axis, E['radius'] * inner['scale'], E['height'] * inner['scale'] * 1.05, E['tip'], E['flat'] * 0.7, inner['color'])

body = Part('body', S['body']['center'][:2] + [S['body']['center'][2] - S['body']['radius'][2]])
body.ellipsoid(S['body']['center'], S['body']['radius'], S['body']['color'], seg=(18, 10))
body.ellipsoid(S['belly']['center'], S['belly']['radius'], S['belly']['color'], seg=(14, 8))

parts = {'head': head, 'body': body}
for d in S['decals']:
    p, n = surface(d['on'], d['u'], d['v'])
    p = p + n * d.get('lift', 0.0)
    q = n.to_track_quat('Z', 'Y') @ Quaternion((0, 0, 1), math.radians(d.get('roll', 0)))
    w, h, t = d['size']
    # 눈처럼 둥글고 큰 것은 곱게, 반짝임처럼 작은 것은 거칠게
    seg = (14, 8) if min(w, h) >= 0.06 else (6, 4) if max(w, h) < 0.02 else (8, 5)
    parts[d['part']].ellipsoid(p, (w, h, t / 2), d['color'], rot=q.to_matrix().to_4x4(), seg=seg)

A = S['arms']
arms = []
for side, name in ((1, 'arm_l'), (-1, 'arm_r')):
    sh = Vector(A['shoulder']) * Vector((side, 1, 1))
    part = Part(name, sh)
    rot = Matrix.Rotation(math.radians(A['spread']) * side, 4, 'Y')
    part.ellipsoid(sh + Vector(A['offset']) * Vector((side, 1, 1)), A['radius'], A['color'], rot=rot, seg=(10, 6))
    arms.append(part)

L = S['legs']
legs = []
for side, name in ((1, 'leg_l'), (-1, 'leg_r')):
    hip = Vector(L['hip']) * Vector((side, 1, 1))
    part = Part(name, hip)
    part.ellipsoid(hip + Vector(L['offset']), L['radius'], L['color'], seg=(10, 6))
    part.ellipsoid(hip + Vector(L['foot']['offset']), L['foot']['radius'], L['foot']['color'], seg=(10, 6))
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
    bg.inputs['Color'].default_value = linear('#fbe7d2')
    bg.inputs['Strength'].default_value = 0.7
    # 바닥(그림자 받기)
    bpy.ops.mesh.primitive_plane_add(size=40)
    floor = bpy.context.object
    fm = bpy.data.materials.new('floor')
    fm.use_nodes = True
    fb = next(n for n in fm.node_tree.nodes if n.type == 'BSDF_PRINCIPLED')
    fb.inputs['Base Color'].default_value = linear('#f6dcc2')
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

    light('key', 'AREA', (-2.0, -2.2, 2.6), 90, (1.0, 0.93, 0.84), 2.0)
    light('rim', 'AREA', (2.2, 2.0, 1.8), 70, (0.78, 0.86, 1.0), 1.5)
    light('fill', 'AREA', (2.4, -1.8, 0.9), 20, (1.0, 0.96, 0.92), 2.5)
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
    shoot(cam, '1-front', 0)
    shoot(cam, '2-three-quarter', 35)
    shoot(cam, '3-side', 90)

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
    if render_dir:
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
