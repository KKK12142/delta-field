import math
import os

import bpy
from mathutils import Vector
from math import cos, pi, radians, sin, sqrt


out = os.path.abspath(os.environ["OUT_GLB"])
folder = os.path.abspath(os.environ["OUT_DIR"])
os.makedirs(os.path.dirname(out), exist_ok=True)
os.makedirs(folder, exist_ok=True)

bpy.ops.object.select_all(action='SELECT')
bpy.ops.object.delete(use_global=False)
scene = bpy.context.scene


def linear(x):
    x /= 255.0
    return x / 12.92 if x < .04045 else ((x + .055) / 1.055) ** 2.4


def color(h):
    return tuple(linear(int(h[i:i + 2], 16)) for i in (0, 2, 4))


def material(name, rough, sheen=0, coat=0):
    m = bpy.data.materials.new(name)
    m.use_nodes = True
    nt = m.node_tree
    bs = next(n for n in nt.nodes if n.type == 'BSDF_PRINCIPLED')
    attr = nt.nodes.new('ShaderNodeVertexColor')
    attr.layer_name = "Pigment"
    nt.links.new(attr.outputs['Color'], bs.inputs['Base Color'])
    bs.inputs['Roughness'].default_value = rough
    for k, val in [('Sheen Weight', sheen), ('Coat Weight', coat)]:
        socket = bs.inputs.get(k)
        if socket is not None:
            socket.default_value = val
    return m


fur = material("Peached velvet", .87, .18)
gloss = material("Glass and candy", .20, 0, .2)
orange, cream, stripe = "F8A144", "FFE3BC", "C36529"
pink, cocoa = "FF9997", "382121"


def node(name, loc, parent=None):
    o = bpy.data.objects.new(name, None)
    scene.collection.objects.link(o)
    o.parent = parent
    o.location = loc
    o.empty_display_size = .025
    return o


# A batch holds disconnected colored surfaces in one rigidly animated part.
class Batch:
    def __init__(self):
        self.v, self.f, self.c, self.mi = [], [], [], []

    def point(self, p, h, light=1):
        self.v.append(tuple(p))
        self.c.append(tuple(min(1, x * light) for x in color(h)) + (1,))
        return len(self.v) - 1

    def face(self, f, m):
        self.f.append(f)
        self.mi.append(m)

    def lathe(self, fn, h, n, rows, m=0):
        rings = []
        for j in range(rows + 1):
            t = j / rows
            ring = []
            for i in range(1 if j in (0, rows) else n):
                a = 2 * pi * i / n
                ring.append(self.point(fn(t, a), h, .86 + .14 * t))
            rings.append(ring)

        for j in range(rows):
            lo, hi = rings[j:j + 2]
            for i in range(n):
                k = (i + 1) % n
                if j == 0:
                    f = [lo[0], hi[k], hi[i]]
                elif j == rows - 1:
                    f = [lo[i], lo[k], hi[0]]
                else:
                    f = [lo[i], lo[k], hi[k], hi[i]]
                self.face(f, m)

    def oval(self, c, r, h, n=12, rows=8, m=0, tilt=0, flat=False):
        def fn(t, a):
            u = pi * (t - .5)
            x, y, z = r[0] * cos(u) * cos(a), r[1] * cos(u) * sin(a), r[2] * sin(u)
            if flat:
                z = max(-.79 * r[2], z)
            return (c[0] + x * cos(tilt) + z * sin(tilt),
                    c[1] + y,
                    c[2] - x * sin(tilt) + z * cos(tilt))
        self.lathe(fn, h, n, rows, m)

    def build(self, name, loc, parent):
        me = bpy.data.meshes.new(name)
        me.from_pydata(self.v, [], self.f)
        me.update()
        me.materials.append(fur)
        if 1 in self.mi:
            me.materials.append(gloss)
        for p, i in zip(me.polygons, self.mi):
            p.use_smooth = True
            p.material_index = i
        ca = me.color_attributes.new(name="Pigment", type='BYTE_COLOR', domain='POINT')
        for v, c in zip(ca.data, self.c):
            v.color = c
        o = bpy.data.objects.new(name, me)
        scene.collection.objects.link(o)
        o.parent = parent
        o.location = loc
        return o


root = node("Tabby • origin", (0, 0, 0))
b = Batch()
b.oval((0, 0, .239), (.182, .153, .201), orange, 16, 8)
b.oval((0, -.099, .242), (.118, .066, .153), cream, 14, 8)
body = b.build("Peaches | torso", (0, 0, 0), root)


def hp(lat, az, lift=0):
    s, c = sin(lat), max(0, cos(lat))
    w = c ** .83 * (1 - .13 * s)
    return ((.336 + lift) * w * sin(az),
            -(.267 + lift) * c ** .89 * cos(az),
            .263 * math.copysign(abs(s) ** .94, s) + lift * s)


b = Batch()
b.lathe(lambda t, a: hp(pi * (t - .5), a), orange, 28, 12)


# Tapered pigment patches follow the curvature of the cheek and forehead.
def marking(path, width):
    rings = []
    for i in range(9):
        t = i / 8
        lat, az = path(t)
        dl, da = width
        w = sin(pi * t) ** .55 if 0 < i < 8 else .05
        rings.append([b.point(hp(lat + dl * w * k, az + da * w * k, .0018), stripe)
                      for k in (-1, 0, 1)])
    for lo, hi in zip(rings, rings[1:]):
        for k in (0, 1):
            f = [lo[k], hi[k], hi[k + 1], lo[k + 1]]
            p, q, r = (Vector(b.v[i]) for i in f[:3])
            if (q - p).cross(r - p).dot(p) < 0:
                f.reverse()
            b.face(f, 0)


for s in (-1, 0, 1):
    marking(lambda t, s=s: (.70 + .13 * abs(s) + .68 * t, s * (.40 + .10 * t)),
            (0, .118))
for s in (-1, 1):
    for j in range(2):
        marking(lambda t, s=s, j=j: (-.26 + .245 * j + .14 * sin(pi * t) - .06 * t,
                                      s * (.79 + 1.03 * t + .08 * j)), (.073, 0))

# Keep the original face budget, including the two separate glints in each eye.
b.oval((0, -.207, -.093), (.159, .085, .124), cream, 22, 12)
b.oval((0, -.286, -.105), (.046, .012, .046), "682D2A", 16, 9)
b.oval((0, -.296, -.122), (.030, .006, .020), "F28483", 12, 7)
for s in (-1, 1):
    b.oval((s * .039, -.283, -.075), (.044, .019, .029), cream, 12, 7)
b.oval((0, -.303, -.052), (.023, .014, .015), "EF8584", 12, 7, 1)
for s in (-1, 1):
    x = s * .132
    b.oval((x, -.243, .027), (.043, .027, .058), cocoa, 16, 10, 1, -s * .09)
    b.oval((x - .010, -.267, .048), (.012, .005, .014), "FFF9ED", 10, 6, 1)
    b.oval((x + .012, -.268, .017), (.005, .003, .006), "FFDBBB", 8, 5, 1)
head = b.build("Apricot | mask", (0, -.015, .653), body)

for s in (-1, 1):
    b = Batch()

    def ear(t, a, inner=False):
        z, r, d = ((.042 + .143 * t, .068, .024) if inner
                   else (.208 * t, .105, .061))
        shape = (1 - t) ** .62 * min(1, (t / .16) ** .65)
        return (s * (.060 * t + (.003 if inner else 0)) + r * shape * cos(a),
                (-.044 + .030 * t if inner else .002 + .010 * t) + d * shape * sin(a),
                z)

    for inner, h in [(False, orange), (True, pink)]:
        b.lathe(lambda t, a, ii=inner: ear(t, a, ii), h, 14, 7)
    b.build("Petal ear " + str(s), (s * .210, .004, .139), head)

arms, legs = [], []
for s in (-1, 1):
    b = Batch()
    b.oval((s * .029, 0, -.073), (.056, .064, .106), orange, 12, 7, tilt=-s * .39)
    b.oval((s * .061, -.007, -.147), (.051, .058, .051), cream, 12, 7)
    arms.append(b.build("Mitten " + str(s), (s * .161, -.018, .353), body))
    b = Batch()
    b.oval((0, 0, -.048), (.077, .083, .089), orange, 12, 7)
    leg = b.build("Haunch " + str(s), (s * .096, .002, .141), body)
    legs.append(leg)
    b = Batch()
    b.oval((0, -.019, 0), (.079, .096, .047), cream, 14, 8, flat=True)
    b.build("Slipper " + str(s), (0, -.009, .047 * .79 - .141), leg)

# Swept, banded tail with cross-sections perpendicular to its centerline.
b = Batch()
rings = []
for j in range(19):
    t = j / 18
    a = -1.42 - 3.22 * t
    p = Vector((-.146 + .171 * cos(a), .014 + .078 * t, .159 + .153 * sin(a)))
    tangent = Vector((.171 * 3.22 * sin(a), .078, -.153 * 3.22 * cos(a))).normalized()
    u = tangent.cross(Vector((0, 1, 0))).normalized()
    v = tangent.cross(u)
    rad = .062 * (.75 + .25 * t) * sqrt(max(0, 1 - (max(0, t - .85) / .15) ** 2))
    if j == 18:
        rad = .001
    ring = []
    for k in range(10):
        ang = 2 * pi * k / 10
        ring.append(b.point(p + rad * (cos(ang) * u + sin(ang) * v),
                            stripe if j in (4, 5, 9, 10, 14, 15) else orange))
    rings.append(ring)
for lo, hi in zip(rings, rings[1:]):
    for k in range(10):
        n = (k + 1) % 10
        b.face([lo[k], lo[n], hi[n], hi[k]], 0)
b.face(rings[0][::-1], 0)
b.face(rings[-1], 0)
tail = b.build("Cinnamon curl", (0, .100, .130), body)

parts = [body, head, tail] + arms + legs
base = {o: o.location.copy() for o in parts}
clips = {"idle": 48, "walk": 24, "jump": 30, "wave": 32}
scene.render.fps = 24
scene.frame_start = 1
scene.frame_end = 49


def reset():
    for o in parts:
        o.location = base[o]
        o.rotation_euler = (0, 0, 0)
        o.scale = (1, 1, 1)


# Tracks with the same name across objects form a single glTF animation.
for clip, length in clips.items():
    channels = {}

    def key(o, prop, value):
        setattr(o, prop, value)
        o.keyframe_insert(data_path=prop, frame=frame, group=clip)
        channels[o] = True

    def rot(o, x=0, y=0, z=0):
        key(o, "rotation_euler", tuple(map(radians, (x, y, z))))

    def pos(o, x=0, y=0, z=0):
        key(o, "location", base[o] + Vector((x, y, z)))

    for i in range(9):
        frame = 1 + length * i / 8
        phase = 2 * pi * (i % 8) / 8
        a, h = sin(phase), cos(phase)
        if clip == "idle":
            key(body, "scale", (1 - .009 * a, 1 + .009 * a, 1 + .018 * a))
            rot(head, y=2.5 * a, z=1.8 * a)
            rot(tail, x=4 * a, z=5 * a)
        elif clip == "walk":
            pos(body, .014 * h, 0, .024 * a * a)
            rot(body, y=-4 * h)
            rot(head, y=2.8 * h, z=3 * a)
            for j, s in enumerate((-1, 1)):
                rot(legs[j], x=s * 31 * a)
                rot(arms[j], x=-s * 28 * a, y=-s * 5)
            rot(tail, y=6 * h)
        elif clip == "jump":
            z = [0, 0, 0, .127, .225, .130, 0, 0, 0][i]
            k = [1, .93, .82, 1.06, 1.02, 1.06, .84, .95, 1][i]
            lift = [0, 4, 9, 27, 43, 28, 12, 4, 0][i]
            pos(body, z=z)
            key(body, "scale", (1 + (1 - k) * .42, 1 + (1 - k) * .3, k))
            for j, s in enumerate((-1, 1)):
                rot(arms[j], y=-s * lift)
                rot(legs[j], x=lift * .44)
        else:
            w = [0, 32, 93, 114, 94, 116, 90, 34, 0][i]
            rot(arms[1], x=-18 * w / 116, y=-w, z=-12 * w / 116)
            rot(head, y=-5 * w / 116, z=3 * w / 116)
            rot(arms[0], x=6 * a)

    for o in channels:
        ad = o.animation_data
        action = ad.action
        action.name = clip + " | " + o.name
        slot = getattr(ad, "action_slot", None)
        ad.action = None
        track = ad.nla_tracks.new()
        track.name = clip
        strip = track.strips.new(clip, 1, action)
        if slot is not None and hasattr(strip, "action_slot"):
            strip.action_slot = slot
        strip.extrapolation = 'NOTHING'
        track.mute = True
    reset()


def tracks():
    for o in parts:
        if o.animation_data:
            yield from o.animation_data.nla_tracks


reset()
scene.frame_set(0)
tris = 0
for o in scene.objects:
    if o.type == 'MESH':
        o.data.calc_loop_triangles()
        tris += len(o.data.loop_triangles)
assert tris <= 6000, f"Character exceeds triangle budget: {tris}"

# Export only the character; the studio is built afterwards.
op = bpy.ops.export_scene.gltf
props = op.get_rna_type().properties
opts = dict(filepath=out)


def option(k, v):
    p = props.get(k)
    if p is not None and (p.type != 'ENUM' or v in {it.identifier for it in p.enum_items}):
        opts[k] = v
        return True
    return False


option("export_format", "GLB")
option("export_animations", True)
option("export_materials", "EXPORT")
option("export_yup", True)
option("export_vertex_color", "MATERIAL")
option("export_texcoords", False)
option("export_force_sampling", True)
option("export_frame_step", 1)
option("export_optimize_animation_size", True)
option("export_anim_slide_to_zero", True)
option("export_current_frame", True)
if not option("export_animation_mode", "NLA_TRACKS"):
    option("export_nla_strips", True)

for tr in tracks():
    tr.mute = False
scene.frame_set(0)
if 'FINISHED' not in op(**opts):
    raise RuntimeError("GLB export did not finish")

for tr in tracks():
    tr.mute = True
reset()
scene.frame_set(1)

for engine in ('BLENDER_EEVEE_NEXT', 'BLENDER_EEVEE', 'CYCLES'):
    try:
        scene.render.engine = engine
    except TypeError:
        continue
    if engine == 'CYCLES':
        scene.cycles.samples = 16
    break
else:
    raise RuntimeError("Neither EEVEE nor Cycles is available")

scene.render.resolution_x = scene.render.resolution_y = 640
scene.render.resolution_percentage = 100
scene.render.image_settings.file_format = 'PNG'
scene.render.film_transparent = False

world = bpy.data.worlds.new("Cream paper daylight")
scene.world = world
world.use_nodes = True
bg = next(n for n in world.node_tree.nodes if n.type == 'BACKGROUND')
bg.inputs[0].default_value = (.96, .82, .71, 1)
bg.inputs[1].default_value = .6

bpy.ops.mesh.primitive_plane_add(size=200, location=(0, 0, -.001))
floor = bpy.context.object
paper = bpy.data.materials.new("Warm seamless")
paper.diffuse_color = (.88, .72, .57, 1)
floor.data.materials.append(paper)


def aim(o, target):
    o.rotation_euler = (Vector(target) - o.location).to_track_quat('-Z', 'Y').to_euler()


def softbox(name, loc, power, size, tint):
    data = bpy.data.lights.new(name, 'AREA')
    data.energy, data.shape, data.size, data.color = power, 'DISK', size, tint
    o = bpy.data.objects.new(name, data)
    scene.collection.objects.link(o)
    o.location = loc
    aim(o, (0, 0, .48))


softbox("Apricot key", (-2, -3, 3), 170, 2.4, (1, .86, .74))
softbox("Milk fill", (2, -2, 1.8), 100, 2, (.87, .91, 1))
softbox("Butter rim", (0, 2, 2.5), 160, 1.7, (1, .81, .60))

camdata = bpy.data.cameras.new("Portrait")
cam = bpy.data.objects.new("Portrait", camdata)
scene.collection.objects.link(cam)
scene.camera = cam
camdata.type = 'ORTHO'


def render(name, angle, mid=.50, span=1.22):
    a = radians(angle)
    cam.location = (3 * sin(a), -3 * cos(a), mid + .28)
    aim(cam, (0, 0, mid))
    camdata.ortho_scale = span
    scene.render.filepath = os.path.join(folder, name + ".png")
    bpy.ops.render.render(write_still=True)


for name, angle in [('front', 0), ('threequarter', -34), ('side', -90)]:
    render(name, angle)

for name, f in [('idle', 13), ('walk', 7), ('jump', 16), ('wave', 13)]:
    for tr in tracks():
        tr.mute = True
    reset()
    for tr in tracks():
        tr.mute = tr.name != name
    scene.frame_set(f)
    render(name, -12 if name != 'wave' else 4,
           .61 if name == 'jump' else .50, 1.43 if name == 'jump' else 1.24)

print("GLB bytes:", os.path.getsize(out))
print("Final character triangle count:", tris)
