"""
Procedural build of the cartoon horned owl from the character sheet.

    python build_owl.py -- <outdir>        (with the `bpy` module installed)
    blender -b -P build_owl.py -- <outdir>

Creates <outdir>/Owl.blend with
  * Body (quad, sculpt-ready), facial discs, eyes, beak, eyelids + nictitating
    membranes, plumicorns (ear tufts) + brows, wings, tail, feathered feet/claws.
  * Procedural materials for every part (albedo, roughness, bump).
  * Armature "Owl_Rig":
      root > hips > chest > neck_01 > neck_02 > head  (3 x 90 deg twist = 270 deg)
      eye / lid / membrane / tuft / brow bones for expressions
      wing chain  wing_shoulder > wing_elbow > wing_wrist  + one bone per flight
      feather ("feather splines"), driven by a SPREAD control chain
      legs thigh > shin > foot with IK targets, knee poles and an IK/FK switch
  * Rig properties  wing_spread_L / wing_spread_R (0 folded .. 1 spread)
                    ik_fk_L / ik_fk_R (1 IK .. 0 FK)
  * Actions: Pose_WingsSpread, Expression_Alert, Expression_MadFlat,
             Nictitating_Membrane, Owl_Showcase (150 frame demo)
"""
import bpy, bmesh, math, os, sys, random
import numpy as np
from mathutils import Vector, Matrix
from mathutils.bvhtree import BVHTree

argv = sys.argv[sys.argv.index("--") + 1:] if "--" in sys.argv else []
OUT = argv[0] if argv else os.path.dirname(os.path.abspath(__file__))
os.makedirs(OUT, exist_ok=True)
random.seed(7)
V = Vector

def srgb(h):
    h = h.lstrip('#'); c = [int(h[i:i + 2], 16) / 255 for i in (0, 2, 4)]
    return (*[x / 12.92 if x <= 0.04045 else ((x + 0.055) / 1.055) ** 2.4 for x in c], 1.0)

bpy.ops.wm.read_factory_settings(use_empty=True)
scene = bpy.context.scene
COL = bpy.data.collections.new("Owl")
scene.collection.children.link(COL)

# =============================================================== mesh helpers
class MB:
    """Accumulates geometry pieces with per-vertex groups / attributes."""
    def __init__(self, vec_attrs=("rest",)):
        self.v, self.f, self.mat, self.grp = [], [], [], []
        self.attr = {}; self.vec_attr = set(vec_attrs)

    def _default(self, k):
        return (0.0, 0.0, 0.0) if k in self.vec_attr else 0.0

    def add(self, verts, faces, group=None, mat=0, attrs=None):
        o = len(self.v); n = len(verts)
        self.v += [V(p) for p in verts]
        self.f += [tuple(i + o for i in fc) for fc in faces]
        self.mat += [mat] * len(faces)
        self.grp += group if isinstance(group, list) else [group] * n
        attrs = attrs or {}
        for k in set(self.attr) | set(attrs):
            self.attr.setdefault(k, [self._default(k)] * o)
            val = attrs.get(k, self._default(k))
            if isinstance(val, (int, float)) or (k in self.vec_attr and isinstance(val, (tuple, Vector)) and len(val) == 3 and isinstance(val[0], (int, float))):
                val = [val] * n
            self.attr[k] += [tuple(x) if k in self.vec_attr else float(x) for x in val]
        return o

    def build(self, name, mats, smooth=True):
        me = bpy.data.meshes.new(name)
        me.from_pydata([tuple(p) for p in self.v], [], self.f); me.update()
        bm = bmesh.new(); bm.from_mesh(me)
        bmesh.ops.recalc_face_normals(bm, faces=bm.faces); bm.to_mesh(me); bm.free()
        for m in mats:
            me.materials.append(m)
        me.polygons.foreach_set("material_index", self.mat)
        for k, vals in self.attr.items():
            if k in self.vec_attr:
                me.attributes.new(k, 'FLOAT_VECTOR', 'POINT').data.foreach_set("vector", [c for p in vals for c in p])
            else:
                me.attributes.new(k, 'FLOAT', 'POINT').data.foreach_set("value", vals)
        if smooth:
            me.shade_smooth()
        ob = bpy.data.objects.new(name, me); COL.objects.link(ob)
        groups = {}
        for i, g in enumerate(self.grp):
            if g is None:
                continue
            for gn, w in ({g: 1.0} if isinstance(g, str) else g).items():
                if w <= 0:
                    continue
                if gn not in groups:
                    groups[gn] = ob.vertex_groups.new(name=gn)
                groups[gn].add([i], w, 'REPLACE')
        return ob


def tube(pts, radii, width=1.0, thick=1.0, segs=10, up=(0, 0, 1)):
    """Loft ellipse cross-sections along a polyline -> verts, faces, t (0..1 along), side (-1..1 across)."""
    pts = [V(p) for p in pts]; n = len(pts); up = V(up)
    verts, faces, tpar, side = [], [], [], []
    L = [0.0]
    for i in range(1, n):
        L.append(L[-1] + (pts[i] - pts[i - 1]).length)
    prev = None
    for i in range(n):
        t = (pts[min(i + 1, n - 1)] - pts[max(i - 1, 0)]).normalized()
        nrm = up - up.dot(t) * t
        if nrm.length < 1e-4:
            nrm = prev if prev is not None else t.orthogonal()
        nrm = (nrm - nrm.dot(t) * t).normalized(); prev = nrm
        b = t.cross(nrm)
        for k in range(segs):
            a = 2 * math.pi * k / segs
            verts.append(pts[i] + radii[i] * (width * math.cos(a) * b + thick * math.sin(a) * nrm))
            tpar.append(L[i] / L[-1]); side.append(math.cos(a))
    for i in range(n - 1):
        for k in range(segs):
            faces.append((i * segs + k, (i + 1) * segs + k, (i + 1) * segs + (k + 1) % segs, i * segs + (k + 1) % segs))
    verts.append(pts[0]); tpar.append(0.0); side.append(0.0); c0 = len(verts) - 1
    faces += [(c0, (k + 1) % segs, k) for k in range(segs)]
    verts.append(pts[-1]); tpar.append(1.0); side.append(0.0); c1 = len(verts) - 1
    faces += [(c1, (n - 1) * segs + k, (n - 1) * segs + (k + 1) % segs) for k in range(segs)]
    return verts, faces, tpar, side


def ellipsoid(center, radii, frame=None, segs=32, rings=16, cap_angle=math.pi):
    """UV ellipsoid, or a spherical cap (polar angle 0..cap_angle around local +Z)."""
    frame = frame or Matrix.Identity(3)
    full = cap_angle >= math.pi - 1e-6
    ring_list = list(range(1, rings)) if full else list(range(1, rings + 1))
    unit = [V((0, 0, 1))]
    for r in ring_list:
        th = cap_angle * r / rings
        for s in range(segs):
            ph = 2 * math.pi * s / segs
            unit.append(V((math.sin(th) * math.cos(ph), math.sin(th) * math.sin(ph), math.cos(th))))
    if full:
        unit.append(V((0, 0, -1)))
    faces = [(0, 1 + s, 1 + (s + 1) % segs) for s in range(segs)]
    nr = len(ring_list)
    for r in range(nr - 1):
        for s in range(segs):
            a = 1 + r * segs + s; b = 1 + r * segs + (s + 1) % segs
            faces.append((a, a + segs, b + segs, b))
    if full:
        last = len(unit) - 1; base = 1 + (nr - 1) * segs
        faces += [(last, base + (s + 1) % segs, base + s) for s in range(segs)]
    verts = [V(center) + frame @ V((p.x * radii[0], p.y * radii[1], p.z * radii[2])) for p in unit]
    return verts, faces, [tuple(p) for p in unit]


def frame_from(fwd, up):
    """3x3 frame: local Z = fwd, Y = up (orthogonalised), X = Y x Z."""
    z = V(fwd).normalized(); y = (V(up) - V(up).dot(z) * z).normalized()
    return Matrix((y.cross(z), y, z)).transposed()


def bone_frame(head, direction, dorsal):
    """4x4 bone matrix: Y along the bone, Z = dorsal side."""
    y = V(direction).normalized(); z = (V(dorsal) - V(dorsal).dot(y) * y).normalized()
    m = Matrix((y.cross(z), y, z)).transposed().to_4x4(); m.translation = V(head)
    return m


def catmull(pts, n):
    """Sample a Catmull-Rom spline through 2D/3D points, n samples."""
    P = [V(p) for p in pts]; P = [P[0] * 2 - P[1]] + P + [P[-1] * 2 - P[-2]]
    seg = len(P) - 3; out = []
    for i in range(n):
        u = i / (n - 1) * seg; k = min(int(u), seg - 1); t = u - k
        p0, p1, p2, p3 = P[k:k + 4]
        out.append(0.5 * ((2 * p1) + (-p0 + p2) * t + (2 * p0 - 5 * p1 + 4 * p2 - p3) * t * t + (-p0 + 3 * p1 - 3 * p2 + p3) * t ** 3))
    return out

# =============================================================== BODY (SDF -> mesh)
def sd_ellipsoid(px, py, pz, c, r):
    qx, qy, qz = (px - c[0]) / r[0], (py - c[1]) / r[1], (pz - c[2]) / r[2]
    k0 = np.sqrt(qx * qx + qy * qy + qz * qz)
    k1 = np.sqrt((qx / r[0]) ** 2 + (qy / r[1]) ** 2 + (qz / r[2]) ** 2)
    return k0 * (k0 - 1.0) / np.maximum(k1, 1e-6)

def smin(a, b, k):
    h = np.clip(0.5 + 0.5 * (b - a) / k, 0, 1)
    return b * (1 - h) + a * h - k * h * (1 - h)

def build_body():
    from skimage import measure
    step = 0.016
    xs = np.arange(-1.0, 1.0 + step, step); ys = np.arange(-0.9, 0.9 + step, step); zs = np.arange(-0.1, 2.3 + step, step)
    X, Y, Z = np.meshgrid(xs, ys, zs, indexing='ij')
    d = sd_ellipsoid(X, Y, Z, (0, 0.0, 1.50), (0.76, 0.66, 0.63))          # head
    d = smin(d, sd_ellipsoid(X, Y, Z, (0, 0.05, 0.78), (0.69, 0.62, 0.68)), 0.42)   # body
    d = smin(d, sd_ellipsoid(X, Y, Z, (0, -0.07, 0.62), (0.58, 0.52, 0.50)), 0.15)  # belly
    # gently flattened face (owl facial disc area)
    face = -(Y + 0.58) + 0.35 * X ** 2 - 2.0 * np.maximum(0, 1.25 - Z) - 2.0 * np.maximum(0, Z - 1.95)
    d = -smin(-d, -face, 0.10)
    # flat-ish sitting base
    d = -smin(-d, -(0.10 - Z), 0.06)
    verts, faces, _, _ = measure.marching_cubes(d, 0.0, spacing=(step, step, step))
    verts += np.array([xs[0], ys[0], zs[0]])
    me = bpy.data.meshes.new("tmp_body"); me.from_pydata(verts.tolist(), [], faces[:, ::-1].tolist()); me.update()
    ob = bpy.data.objects.new("tmp_body", me); COL.objects.link(ob)
    rm = ob.modifiers.new("Remesh", 'REMESH'); rm.mode = 'VOXEL'; rm.voxel_size = 0.02
    sm = ob.modifiers.new("Smooth", 'SMOOTH'); sm.factor = 0.5; sm.iterations = 4
    me2 = bpy.data.meshes.new_from_object(ob.evaluated_get(bpy.context.evaluated_depsgraph_get()))
    bpy.data.objects.remove(ob); bpy.data.meshes.remove(me)
    me2.name = "Owl_Body"
    return me2

body_me = build_body()
body_bvh = BVHTree.FromPolygons([v.co.copy() for v in body_me.vertices], [p.vertices[:] for p in body_me.polygons])

def surf(origin, direction):
    hit = body_bvh.ray_cast(V(origin), V(direction).normalized())
    if hit[0] is None:
        raise RuntimeError(f"no hit {origin} {direction}")
    return hit[0], hit[1]

# =============================================================== MATERIALS
class NB:
    """Tiny shader-node builder."""
    def __init__(self, name):
        self.mat = bpy.data.materials.new(name)
        if self.mat.node_tree is None:
            self.mat.use_nodes = True
        self.nt = self.mat.node_tree; self.N = self.nt.nodes; self.L = self.nt.links
        self.bsdf = self.N.get("Principled BSDF")
        if self.bsdf is None:
            self.N.clear()
            self.bsdf = self.N.new('ShaderNodeBsdfPrincipled'); out = self.N.new('ShaderNodeOutputMaterial')
            self.L.new(self.bsdf.outputs[0], out.inputs[0])

    def _in(self, sock, v):
        if isinstance(v, (int, float, tuple)):
            sock.default_value = v
        else:
            self.L.new(v, sock)
    def math(self, op, a, b=0.0, c=0.0):
        m = self.N.new('ShaderNodeMath'); m.operation = op
        self._in(m.inputs[0], a); self._in(m.inputs[1], b); self._in(m.inputs[2], c)
        return m.outputs[0]
    def add(s, a, b): return s.math('ADD', a, b)
    def sub(s, a, b): return s.math('SUBTRACT', a, b)
    def mul(s, a, b): return s.math('MULTIPLY', a, b)
    def abs(s, a): return s.math('ABSOLUTE', a)
    def sin(s, a): return s.math('SINE', a)
    def frac(s, a): return s.math('FRACT', a)
    def mx(s, a, b): return s.math('MAXIMUM', a, b)
    def length2(s, a, b): return s.math('SQRT', s.add(s.mul(a, a), s.mul(b, b)))
    def ss(self, e0, e1, x):
        m = self.N.new('ShaderNodeMapRange'); m.interpolation_type = 'SMOOTHSTEP'; m.clamp = True
        self._in(m.inputs['Value'], x)
        m.inputs['From Min'].default_value = e0; m.inputs['From Max'].default_value = e1
        return m.outputs['Result']
    def mix(self, fac, a, b):
        m = self.N.new('ShaderNodeMix'); m.data_type = 'RGBA'; m.clamp_factor = True
        self._in(m.inputs['Factor'], fac); self._in(m.inputs[6], a); self._in(m.inputs[7], b)
        return m.outputs[2]
    def attr(self, name, vec=False):
        a = self.N.new('ShaderNodeAttribute'); a.attribute_name = name; a.attribute_type = 'GEOMETRY'
        return a.outputs['Vector'] if vec else a.outputs['Fac']
    def xyz(self, vec):
        s = self.N.new('ShaderNodeSeparateXYZ'); self.L.new(vec, s.inputs[0])
        return s.outputs[0], s.outputs[1], s.outputs[2]
    def combine(self, x, y, z):
        c = self.N.new('ShaderNodeCombineXYZ')
        for i, v in enumerate((x, y, z)):
            self._in(c.inputs[i], v)
        return c.outputs[0]
    def noise(self, vec, scale, detail=3.0, rough=0.5):
        n = self.N.new('ShaderNodeTexNoise'); self.L.new(vec, n.inputs['Vector'])
        n.inputs['Scale'].default_value = scale; n.inputs['Detail'].default_value = detail
        n.inputs['Roughness'].default_value = rough
        return n.outputs['Fac']
    def voronoi(self, vec, scale, out='Distance', feature='F1'):
        n = self.N.new('ShaderNodeTexVoronoi'); n.feature = feature
        self.L.new(vec, n.inputs['Vector']); n.inputs['Scale'].default_value = scale
        return n.outputs[out]
    def set(self, name, v):
        self._in(self.bsdf.inputs[name], v)
    def bump(self, height, strength=0.3, dist=0.02):
        b = self.N.new('ShaderNodeBump'); self._in(b.inputs['Height'], height)
        b.inputs['Strength'].default_value = strength; b.inputs['Distance'].default_value = dist
        self.L.new(b.outputs['Normal'], self.bsdf.inputs['Normal'])
    def finish(self, rough=0.7, sheen=0.35):
        self.set('Roughness', rough); self.set('Sheen Weight', sheen); self.set('Sheen Roughness', 0.45)
        self.set('Sheen Tint', srgb('#FFE9C8'))
        return self.mat


C = {k: srgb(v) for k, v in dict(
    brown='#87491C', brown2='#A2622C', dark='#3F220C', darker='#2A1606', tan='#CF9450',
    cream='#F4E5C4', belly='#E9CC98', disc='#F3E2BE', iris_in='#FFB812', iris_out='#E46F00',
    iris_rim='#5E2600', beak='#3A3536', claw='#211B1A', toe='#DDBE88', pale='#F0D9A6').items()}

def mat_body():
    nb = NB("M_Body_Feathers")
    P = nb.attr("rest", vec=True); x, y, z = nb.xyz(P); ax = nb.abs(x)
    nz = nb.noise(P, 6.0, 3.0)
    front = nb.mul(nb.ss(-0.12, -0.42, y), nb.ss(0.60, 0.36, ax))
    edge = nb.add(nb.sub(z, nb.mul(nb.mul(ax, ax), 0.9)), nb.mul(nb.abs(nb.sin(nb.mul(x, 16.0))), 0.05))
    bib = nb.mul(nb.mul(front, nb.ss(0.84, 0.90, edge)), nb.ss(1.28, 1.16, z))
    chin = nb.mul(nb.mul(nb.ss(-0.3, -0.5, y), nb.ss(0.34, 0.18, ax)), nb.mul(nb.ss(1.10, 1.18, z), nb.ss(1.40, 1.30, z)))
    belly = nb.mul(front, nb.ss(0.95, 0.85, z))
    # belly chevron bars (curving up at the sides)
    wz = nb.add(nb.sub(z, nb.mul(nb.mul(ax, ax), 0.55)), nb.mul(nz, 0.05))
    bars = nb.ss(0.45, 0.8, nb.sin(nb.mul(wz, 30.0)))
    bars = nb.mul(bars, nb.ss(0.36, 0.48, nb.noise(P, 8.0, 2.0)))
    bars = nb.mul(bars, nb.ss(0.16, 0.3, z))
    # back / flank: dark brown crescents
    cres_uv = nb.combine(nb.mul(x, 7.0), nb.add(nb.mul(z, 9.0), nb.mul(ax, 3.0)), nb.mul(y, 7.0))
    cell = nb.voronoi(cres_uv, 1.0, 'Distance')
    cres = nb.mul(nb.ss(0.32, 0.22, cell), nb.ss(0.38, 0.55, nb.noise(P, 5.0, 2.0)))
    streak = nb.mul(nb.ss(0.6, 0.95, nb.sin(nb.add(nb.mul(z, 24.0), nb.mul(nb.noise(P, 3.0, 2.0), 7.0)))),
                    nb.ss(0.45, 0.6, nb.noise(P, 6.0, 2.0)))
    head = nb.ss(1.30, 1.45, z)
    hstreak = nb.mul(nb.ss(0.55, 0.9, nb.sin(nb.add(nb.mul(z, 50.0), nb.mul(nb.noise(P, 4.0), 6.0)))),
                     nb.ss(0.45, 0.6, nb.noise(P, 10.0, 2.0)))
    marks = nb.mix(head, nb.mx(cres, streak), hstreak)
    col = nb.mix(nb.noise(P, 3.0), C['brown'], C['brown2'])
    col = nb.mix(nb.mul(nb.ss(0.5, 1.0, nz), 0.4), col, C['tan'])
    col = nb.mix(belly, col, C['belly'])
    col = nb.mix(nb.mul(nb.mul(bars, belly), 0.95), col, C['dark'])
    col = nb.mix(nb.mul(marks, nb.sub(1.0, belly)), col, C['dark'])
    col = nb.mix(nb.mx(bib, chin), col, C['cream'])
    nb.set('Base Color', col)
    sc = nb.combine(x, y, nb.mul(z, 1.7))
    nb.bump(nb.add(nb.voronoi(sc, 13.0), nb.mul(nb.noise(P, 45.0, 2.0), 0.35)), 0.4, 0.015)
    return nb.finish(0.75, 0.35)

def mat_disc():
    nb = NB("M_FacialDisc")
    P = nb.attr("rest", vec=True); x, y, z = nb.xyz(P)
    r = nb.length2(x, y); ang = nb.math('ARCTAN2', y, x)
    rays = nb.mul(nb.ss(0.2, 1.0, nb.sin(nb.mul(ang, 46.0))), nb.ss(0.45, 0.8, r))
    col = nb.mix(nb.ss(0.6, 0.86, r), C['disc'], C['belly'])
    col = nb.mix(nb.mul(rays, 0.3), col, C['tan'])
    col = nb.mix(nb.ss(0.86, 0.92, r), col, C['dark'])
    nb.set('Base Color', col)
    nb.bump(nb.mul(rays, 0.4), 0.2, 0.01)
    return nb.finish(0.75, 0.3)

def mat_eye():
    nb = NB("M_Eye")
    P = nb.attr("rest", vec=True); x, y, z = nb.xyz(P)
    r = nb.add(nb.length2(x, y), nb.mul(nb.ss(0.0, -0.1, z), 2.0))  # back half -> outside iris
    ang = nb.math('ARCTAN2', y, x)
    fib = nb.mul(nb.ss(-0.2, 1.0, nb.sin(nb.mul(ang, 38.0))), 0.22)
    iris = nb.mix(nb.add(nb.ss(0.40, 0.80, r), fib), C['iris_in'], C['iris_out'])
    col = nb.mix(nb.ss(0.405, 0.42, r), C['darker'], iris)
    col = nb.mix(nb.ss(0.78, 0.84, r), col, C['iris_rim'])
    col = nb.mix(nb.ss(0.93, 1.0, r), col, C['darker'])
    def spot(cx, cy, rad):
        return nb.ss(rad, rad * 0.8, nb.length2(nb.sub(x, cx), nb.sub(y, cy)))
    hl = nb.mx(spot(-0.26, 0.30, 0.15), spot(0.28, -0.26, 0.06))
    col = nb.mix(hl, col, (1, 1, 1, 1))
    nb.set('Base Color', col); nb.set('Roughness', 0.3)
    nb.set('Coat Weight', 1.0); nb.set('Coat Roughness', 0.02)
    nb.set('Emission Color', (1, 1, 1, 1)); nb._in(nb.bsdf.inputs['Emission Strength'], nb.mul(hl, 1.2))
    return nb.mat

def mat_simple(name, col, rough=0.5, coat=0.0, sheen=0.0, bump=0.0, alpha=1.0, grad=None):
    nb = NB(name)
    if grad:
        P = nb.attr("rest", vec=True); x, y, z = nb.xyz(P)
        nb.set('Base Color', nb.mix(nb.ss(grad[0], grad[1], (x, y, z)[grad[3] if len(grad) > 3 else 2]), col, grad[2]))
    else:
        nb.set('Base Color', col)
    nb.set('Roughness', rough); nb.set('Coat Weight', coat); nb.set('Sheen Weight', sheen)
    if bump:
        P = nb.attr("rest", vec=True)
        nb.bump(nb.add(nb.voronoi(P, 55.0), nb.mul(nb.noise(P, 90.0), 0.4)), bump, 0.006)
    if alpha < 1.0:
        nb.set('Alpha', alpha)
    return nb.mat

def mat_feather():
    nb = NB("M_Flight_Feathers")
    t = nb.attr("fcoord"); s = nb.attr("fside"); fid = nb.attr("fid"); ft = nb.attr("ftype")
    sab = nb.abs(s)
    # alternating dark brown / tan bars, slightly chevroned toward the shaft
    R = nb.attr("rest", vec=True); rx, ry, rz = nb.xyz(R)
    along = nb.sub(nb.mul(ry, 0.75), nb.mul(rz, 0.66))
    phase = nb.add(nb.add(nb.mul(along, 30.0), nb.mul(sab, 0.8)), nb.mul(nb.noise(R, 3.0), 1.5))
    bars = nb.ss(0.1, 0.5, nb.sin(phase))
    bars = nb.mul(bars, nb.ss(0.05, 0.15, t))
    base = nb.mix(nb.ss(2.5, 1.5, ft), C['tan'], C['pale'])          # primaries paler
    col = nb.mix(bars, base, C['dark'])
    col = nb.mix(nb.mul(nb.ss(0.88, 0.97, t), 0.85), col, C['cream'])
    col = nb.mix(nb.mul(nb.ss(0.5, 0.95, sab), 0.35), col, C['dark'])   # darker vane edges
    col = nb.mix(nb.mul(nb.ss(0.07, 0.03, sab), nb.ss(0.02, 0.1, t)), col, C['darker'])  # rachis
    nb.set('Base Color', col)
    barb = nb.sin(nb.add(nb.mul(sab, 70.0), nb.mul(t, 30.0)))
    nb.bump(nb.mul(barb, 0.5), 0.12, 0.004)
    return nb.finish(0.7, 0.4)

def mat_coverts():
    nb = NB("M_Wing_Coverts")
    u = nb.attr("wu"); v = nb.attr("wv"); P = nb.attr("rest", vec=True)
    # rows of scalloped covert feathers: rows along v, scallops along u
    rows = nb.add(nb.mul(v, 4.5), nb.mul(nb.abs(nb.sin(nb.mul(u, 34.0))), 0.35))
    fr = nb.frac(rows)
    rim = nb.ss(0.70, 0.92, fr)
    shaft = nb.mul(nb.ss(0.75, 0.97, nb.abs(nb.sin(nb.mul(u, 34.0 / 2)))), nb.ss(0.15, 0.6, fr))
    col = nb.mix(nb.noise(P, 4.0), C['brown'], C['brown2'])
    col = nb.mix(nb.mul(rim, 0.55), col, C['dark'])
    col = nb.mix(nb.mul(nb.ss(0.92, 0.99, fr), 0.7), col, C['tan'])
    col = nb.mix(nb.mul(nb.mul(shaft, nb.ss(0.4, 0.6, nb.noise(P, 6.0))), 0.8), col, C['dark'])
    # leading-edge band slightly paler, hand-coverts barred
    col = nb.mix(nb.mul(nb.ss(0.08, 0.0, v), 0.5), col, C['tan'])
    nb.set('Base Color', col)
    nb.bump(nb.add(nb.mul(fr, 0.6), nb.mul(nb.noise(P, 60.0), 0.2)), 0.35, 0.01)
    return nb.finish(0.75, 0.4)

def mat_tuft():
    nb = NB("M_Plumicorn")
    t = nb.attr("fcoord"); s = nb.attr("fside")
    col = nb.mix(nb.ss(0.15, 0.6, nb.abs(s)), C['brown2'], C['dark'])
    col = nb.mix(nb.ss(0.55, 1.0, t), col, C['darker'])
    nb.set('Base Color', col)
    nb.bump(nb.sin(nb.mul(nb.add(nb.abs(s), nb.mul(t, 0.4)), 50.0)), 0.15, 0.004)
    return nb.finish(0.7, 0.4)

M_BODY, M_DISC, M_EYE = mat_body(), mat_disc(), mat_eye()
M_FEATHER, M_COVERT, M_TUFT = mat_feather(), mat_coverts(), mat_tuft()
M_BEAK = mat_simple("M_Beak", C['beak'], 0.3, coat=0.6, grad=(0.5, 0.15, srgb('#6E6767')))
M_CLAW = mat_simple("M_Claw", C['claw'], 0.25, coat=0.8)
M_TOE = mat_simple("M_Toes_Feathered", C['toe'], 0.85, sheen=0.7, bump=0.35)
M_LID = mat_simple("M_Eyelid", C['brown2'], 0.7, sheen=0.3, grad=(0.2, 0.0, C['dark']))
M_MEMB = mat_simple("M_Nictitating", srgb('#CBD3DE'), 0.2, coat=0.6, alpha=0.6)

body_me.attributes.new("rest", 'FLOAT_VECTOR', 'POINT').data.foreach_set("vector", [c for v in body_me.vertices for c in v.co])
body_me.shade_smooth(); body_me.materials.append(M_BODY)
BODY = bpy.data.objects.new("Owl_Body", body_me); COL.objects.link(BODY)

# =============================================================== FACE
face, eyes, lids, beak, tufts = MB(), MB(), MB(), MB(), MB(())
EYE_R, DISC_R = 0.19, 0.32
EYE_INFO = {}
for side, sx in (("L", 1), ("R", -1)):
    p, n = surf((0.31 * sx, -2.0, 1.56), (0, 1, 0))
    fwd = (n * 0.4 + V((0.12 * sx, -1.0, 0.0))).normalized()
    fr = frame_from(fwd, (0, 0, 1))
    v, f, loc = ellipsoid(p - fwd * 0.012, (DISC_R, DISC_R * 1.03, 0.055), fr, 48, 18)
    face.add(v, f, "head", 0, {"rest": loc})
    ec = p - fwd * 0.035
    v, f, loc = ellipsoid(ec, (EYE_R,) * 3, fr, 40, 20)
    eyes.add(v, f, f"eye_{side}", 0, {"rest": loc})
    EYE_INFO[side] = (ec, fwd, fr)
    # upper lid: hemisphere shell facing backwards at rest (hidden inside the head)
    lid_fr = fr @ Matrix.Rotation(math.pi, 3, 'X')
    v, f, loc = ellipsoid(ec, (EYE_R * 1.07,) * 3, lid_fr, 40, 10, cap_angle=math.pi / 2)
    lids.add(v, f, f"lid_{side}", 0, {"rest": loc})
    mem_fr = fr @ Matrix.Rotation(math.pi, 3, 'Y')
    v, f, loc = ellipsoid(ec, (EYE_R * 1.035,) * 3, mem_fr, 40, 10, cap_angle=math.pi / 2)
    lids.add(v, f, f"membrane_{side}", 1, {"rest": loc})

# hooked beak
bp, bn = surf((0, -2.0, 1.40), (0, 1, 0))
b0 = bp + V((0, 0.07, 0.05))
pts = [b0, b0 + V((0, -0.10, -0.02)), b0 + V((0, -0.155, -0.07)), b0 + V((0, -0.17, -0.13)), b0 + V((0, -0.15, -0.21))]
v, f, t, s = tube(pts, [0.075, 0.068, 0.052, 0.032, 0.0], width=0.9, thick=0.8, segs=16, up=(0, -1, -1))
beak.add(v, f, "head", 0, {"rest": [V((0, 0, (p - b0).length / 0.3)) for p in v]})

# plumicorns: three broad curved feathers per side, flame shaped
TUFT_BASE = {}
for side, sx in (("L", 1), ("R", -1)):
    base, nrm = surf((0.47 * sx, -0.12, 2.6), (0, 0, -1))
    TUFT_BASE[side] = base
    for k, (ang, ln, w, dy) in enumerate(((30, 0.50, 0.22, 0.0), (12, 0.42, 0.19, 0.06), (46, 0.38, 0.18, -0.05))):
        a = math.radians(ang)
        d = V((math.sin(a) * sx, 0.10 + dy * 1.2, math.cos(a)))
        b = base + V((-0.05 * sx * k, dy, -0.10))
        out = V((sx, 0, -0.2))
        pts = [b + d * ln * u + out * (0.16 * ln * u * u) for u in (0, 0.2, 0.4, 0.6, 0.8, 1.0)]
        rad = [w * 0.42, w * 0.52, w * 0.5, w * 0.42, w * 0.27, 0.0]
        v, f, tp, sd = tube(pts, rad, width=1.0, thick=0.55, segs=12, up=(0, -1, 0.3))
        tufts.add(v, f, f"tuft_{side}", 0, {"fcoord": tp, "fside": sd})
    # brow: dark arc over the inner/top of each disc, meeting in a V above the beak
    ec, fwd, fr = EYE_INFO[side]
    proj = []
    for u in np.linspace(0, 1, 8):
        ang = math.radians(200 - 150 * u)
        q = ec + fr.col[0] * (math.cos(ang) * 0.335 * sx) + fr.col[1] * (math.sin(ang) * 0.335 + 0.01)
        hp, hn = surf(q - fwd * 0.6, fwd)
        proj.append(hp + hn * 0.03)
    rad = [0.025, 0.05, 0.065, 0.07, 0.07, 0.065, 0.055, 0.035]
    v, f, tp, sd = tube(proj, rad, width=1.0, thick=0.5, segs=10, up=tuple(fwd))
    tufts.add(v, f, f"brow_{side}", 0, {"fcoord": [0.55 + 0.3 * x for x in tp], "fside": sd})

# =============================================================== WINGS
WING_BONES = {}   # name -> dict(parent, fold, spread, length)

def feather_geom(L, W, sag=0.04, n=10, thick=0.12, kind=0):
    """Feather in bone space: Y along shaft, X across vane, Z dorsal (bowed by `sag`)."""
    pts, rad = [], []
    for i in range(n):
        t = i / (n - 1)
        pts.append(V((0, t * L, 4 * sag * t * (1 - t))))
        w = W * (0.4 + 0.6 * math.sin(math.pi * min(t / 0.45, 1) * 0.5))
        if t > 0.7:
            w *= math.sqrt(max(0, 1 - ((t - 0.7) / 0.3) ** 2))
        rad.append(w * 0.5)
    rad[-1] = 0.0
    return tube(pts, rad, width=1.0, thick=thick, segs=8, up=(0, 0, 1))


def side_point(s, z, off, sx):
    """Point on the flank: s = arc distance around the body (+ = toward the back), z = height, off = outward offset."""
    z = max(z, 0.14); zc = min(max(z, 0.22), 1.32)
    p, _ = surf((3.0 * sx, 0.05, zc), (-sx, 0, 0))
    R = abs(p.x) + off
    phi = s / R; phimax = math.radians(56)
    if phi > phimax:
        base = V((R * math.cos(phimax) * sx, 0.05 + R * math.sin(phimax), z))
        tang = V((-math.sin(phimax) * sx, math.cos(phimax), 0))
        pos = base + tang * (s - phimax * R)
        nrm = V((math.cos(phimax) * sx, math.sin(phimax), 0))
    else:
        pos = V((R * math.cos(phi) * sx, 0.05 + R * math.sin(phi), z))
        nrm = V((math.cos(phi) * sx, math.sin(phi), 0))
    nrm.z = (z - 0.8) * 0.7
    return pos, nrm.normalized()


def make_wing(side, sx):
    feathers = MB(); shell = MB(("rest",))
    # ---- arm chain along the leading edge of the folded wing (2D side coords s,z)
    J2 = [V((-0.02, 1.15)), V((-0.25, 0.86)), V((-0.16, 0.48)), V((0.26, 0.37))]
    J3 = [side_point(j.x, j.y, 0.05, sx)[0] for j in J2]
    lens = [(J3[i + 1] - J3[i]).length for i in range(3)]
    keys = ["hum", "fore", "hand"]
    names = {"hum": f"wing_shoulder_{side}", "fore": f"wing_elbow_{side}", "hand": f"wing_wrist_{side}"}
    parents = {"hum": "chest", "fore": names["hum"], "hand": names["fore"]}
    fold, spread = {}, {}
    for i, k in enumerate(keys):
        mid = (J2[i] + J2[i + 1]) * 0.5
        fold[k] = bone_frame(J3[i], J3[i + 1] - J3[i], side_point(mid.x, mid.y, 0, sx)[1])
    sdirs = {"hum": V((sx, 0.10, 0.80)), "fore": V((sx, 0.05, 0.38)), "hand": V((sx, 0.0, 0.22))}
    cur = J3[0].copy(); SJ = [cur.copy()]
    for i, k in enumerate(keys):
        dd = sdirs[k].normalized()
        spread[k] = bone_frame(cur, dd, V((0, 1, 0.05)))
        cur = cur + dd * lens[i]; SJ.append(cur.copy())
    for i, k in enumerate(keys):
        WING_BONES[names[k]] = dict(parent=parents[k], fold=fold[k], spread=spread[k], length=lens[i])

    def on_bone(k, t, layer, cfg):
        m = cfg[k]; ln = lens[keys.index(k)]
        return m @ V((0, ln * t, layer))

    def bone2d(k, t):
        i = keys.index(k); return J2[i].lerp(J2[i + 1], t)

    # ---- flight feathers: (bone, t, layer, fold tip (s,z), spread angle, width, ftype)
    specs = []
    for i in range(7):     # primaries, i=0 outermost at the hand tip
        specs.append(("hand", 1.0 - i * 0.15, 0.010 + 0.005 * i, (1.10 - 0.06 * i, 0.20 + 0.035 * i), 12 - 13 * i, 0.20, 0))
    for j in range(6):     # secondaries wrist -> elbow
        specs.append(("fore", 0.97 - j * 0.17, 0.045 + 0.004 * j, (0.92 - 0.03 * j, 0.42 + 0.10 * j), -84 - 4 * j, 0.21, 1))
    for k in range(3):     # tertials on the humerus
        specs.append(("hum", 0.80 - k * 0.3, 0.072 + 0.004 * k, (0.80 - 0.06 * k, 1.02 + 0.06 * k), -105 - 7 * k, 0.21, 2))
    for idx, (k, t, layer, tip2, sang, width, ftype) in enumerate(specs):
        hf = on_bone(k, t, layer, fold)
        h2 = bone2d(k, t)
        tip, _ = side_point(tip2[0], tip2[1], layer + 0.02, sx)
        L = (tip - hf).length
        mid2 = (h2 + V(tip2)) * 0.5
        midp, midn = side_point(mid2.x, mid2.y, layer + 0.03, sx)
        Mf = bone_frame(hf, tip - hf, midn)
        sag = max(0.02, (midp - (hf + tip) * 0.5).dot(Mf.col[2].to_3d()) + 0.01)
        hs = on_bone(k, t, layer, spread)
        a = math.radians(sang)
        Ms = bone_frame(hs, V((math.cos(a) * sx, 0.10, math.sin(a))), V((0, 1, 0.12)))
        if ftype == 0:
            L *= 1.0
        bname = f"feather_{['primary', 'secondary', 'tertial'][ftype]}_{idx:02d}_{side}"
        WING_BONES[bname] = dict(parent=names[k], fold=Mf, spread=Ms, length=L)
        v, f, tp, sd = feather_geom(L, width, sag=sag, thick=0.11)
        vw = [Mf @ p for p in v]
        feathers.add(vw, f, bname, 0, {"fcoord": tp, "fside": sd, "fid": random.random(), "ftype": float(ftype), "rest": vw})

    # ---- covert shell: one smooth thick patch (u along the arm, v toward the trailing edge)
    NU, NV = 28, 12
    cen = V((0.22, 0.80))
    le_ctrl = [J2[0], (J2[0] + J2[1]) * 0.5 + V((-0.04, 0)), J2[1], (J2[1] + J2[2]) * 0.5 + V((-0.03, 0)), J2[2], (J2[2] + J2[3]) * 0.5 + V((0, -0.03)), J2[3]]
    LE2 = catmull([p + (p - cen).normalized() * 0.09 for p in le_ctrl], NU)
    TE2 = catmull([V((0.36, 1.24)), V((0.58, 1.10)), V((0.68, 0.90)), V((0.70, 0.70)), V((0.64, 0.54)), V((0.50, 0.43)), V((0.34, 0.37))], NU)
    SLE = catmull([SJ[0], (SJ[0] + SJ[1]) * 0.5, SJ[1], (SJ[1] + SJ[2]) * 0.5, SJ[2], (SJ[2] + SJ[3]) * 0.5, SJ[3]], NU)
    seg_of = lambda u: min(int(u * 3), 2)
    def weights(u):
        # smooth hand-off between shoulder / elbow / wrist bones
        w = {}
        for i, k in enumerate(keys):
            c0, c1 = i / 3, (i + 1) / 3
            lo = 1 if i == 0 else min(1, max(0, (u - c0 + 0.05) / 0.10))
            hi = 1 if i == 2 else min(1, max(0, (c1 + 0.05 - u) / 0.10))
            w[names[k]] = lo * hi
        tot = sum(w.values()); return {k: x / tot for k, x in w.items()}
    top_f, bot_f, top_s, bot_s, grp, uvw = [], [], [], [], [], []
    for iu in range(NU):
        u = iu / (NU - 1)
        for iv in range(NV):
            v = iv / (NV - 1)
            p2 = LE2[iu].lerp(TE2[iu], v)
            bulge = math.sin(math.pi * v) ** 0.7 * math.sin(math.pi * min(1, u * 1.3 + 0.08)) ** 0.5
            # airfoil-like section: rounded leading edge blending into the body, thin trailing edge
            taper = min(1.0, (u + 0.03) / 0.22) ** 0.7 * min(1.0, (1.04 - u) / 0.2) ** 0.5
            bot = 0.10 * v ** 0.6 * (0.5 + 0.5 * taper)
            th = (0.25 + 0.06 * bulge) * math.sqrt(v) * (1 - v) ** 1.2 * taper + 0.006
            pt, pn = side_point(p2.x, p2.y, bot + th, sx)
            pb_, _ = side_point(p2.x, p2.y, bot, sx)
            top_f.append(pt); bot_f.append(pb_)
            # spread: band hanging below the arm, dorsal facing +Y
            depth = 0.62 - 0.30 * u
            down = V((0.18 * sx * u - 0.05 * sx, 0.0, -1.0)).normalized()
            q = SLE[iu] + down * depth * v + V((0, 0.20 + 0.03 * bulge, 0))
            top_s.append(q + V((0, th * 0.5, 0))); bot_s.append(q - V((0, th * 0.5, 0)))
            grp.append(weights(u)); uvw.append((u, v))
    def idx(side_, iu, iv): return side_ * NU * NV + iu * NV + iv
    faces = []
    for iu in range(NU - 1):
        for iv in range(NV - 1):
            faces.append((idx(0, iu, iv), idx(0, iu + 1, iv), idx(0, iu + 1, iv + 1), idx(0, iu, iv + 1)))
            faces.append((idx(1, iu, iv), idx(1, iu, iv + 1), idx(1, iu + 1, iv + 1), idx(1, iu + 1, iv)))
    for iu in range(NU - 1):   # stitch the rim
        for iv in (0, NV - 1):
            faces.append((idx(0, iu, iv), idx(1, iu, iv), idx(1, iu + 1, iv), idx(0, iu + 1, iv)))
    for iu in (0, NU - 1):
        for iv in range(NV - 1):
            faces.append((idx(0, iu, iv), idx(0, iu, iv + 1), idx(1, iu, iv + 1), idx(1, iu, iv)))
    folded = top_f + bot_f; spreadp = top_s + bot_s
    shell.add(folded, faces, grp + grp, 0, {"wu": [a for a, b in uvw] * 2, "wv": [b for a, b in uvw] * 2, "rest": folded})
    return feathers, shell, spreadp

FEATH_L, SHELL_L, SPREAD_L = make_wing("L", 1)
FEATH_R, SHELL_R, SPREAD_R = make_wing("R", -1)

# tail fan
tail = MB()
tb, tn = surf((0, 2.0, 0.36), (0, -1, 0))
for i in range(7):
    a = math.radians(-36 + 12 * i)
    d = V((math.sin(a) * 0.9, math.cos(a) * 0.85, -0.40)).normalized()
    h = tb + V((math.sin(a) * 0.12, -0.14, 0.02 - 0.01 * abs(i - 3)))
    m = bone_frame(h, d, V((0, 0.35, 1)))
    v, f, tp, sd = feather_geom(0.52 - 0.025 * abs(i - 3), 0.18, sag=0.03, thick=0.13)
    vw = [m @ p for p in v]
    tail.add(vw, f, "tail", 0, {"fcoord": tp, "fside": sd, "fid": random.random(), "ftype": 1.0, "rest": vw})

# feet: feathered tarsus + 3 front toes, 1 hind toe, claws
legs = MB(); FEET = {}
for side, sx in (("L", 1), ("R", -1)):
    F = V((0.28 * sx, -0.24, 0.07)); FEET[side] = F
    v, f, loc = ellipsoid(F + V((0, 0.07, 0.14)), (0.16, 0.16, 0.19), None, 24, 12)
    legs.add(v, f, f"shin_{side}", 0, {"rest": v})
    for k, yaw in enumerate((-30, 0, 28, 180)):
        a = math.radians(yaw + 5 * sx)
        d = V((math.sin(a) * sx, -math.cos(a), 0)).normalized()
        if yaw == 180:
            d = V((0.25 * sx, 1, 0)).normalized()
        ln = 0.22 if yaw != 180 else 0.11
        s0 = F + d * 0.05
        pts = [s0 + d * ln * u + V((0, 0, 0.035 * math.sin(math.pi * u) - 0.03 * u)) for u in (0, 0.33, 0.66, 1.0)]
        v, f, tp, sd = tube(pts, [0.068, 0.062, 0.056, 0.048], width=1.0, thick=0.85, segs=12)
        legs.add(v, f, f"foot_{side}", 0, {"rest": v})
        e = pts[-1]
        cpts = [e - d * 0.01, e + d * 0.045, e + d * 0.085 - V((0, 0, 0.03)), e + d * 0.095 - V((0, 0, 0.075))]
        v, f, tp, sd = tube(cpts, [0.042, 0.033, 0.018, 0.0], width=1.0, thick=1.1, segs=10)
        legs.add(v, f, f"foot_{side}", 1, {"rest": v})

# =============================================================== OBJECTS
FACE = face.build("Owl_FacialDiscs", [M_DISC])
EYES = eyes.build("Owl_Eyes", [M_EYE])
LIDS = lids.build("Owl_Lids_Membranes", [M_LID, M_MEMB])
BEAK = beak.build("Owl_Beak", [M_BEAK])
TUFTS = tufts.build("Owl_Plumicorns_Brows", [M_TUFT])
WING_L = FEATH_L.build("Owl_WingFeathers_L", [M_FEATHER])
WING_R = FEATH_R.build("Owl_WingFeathers_R", [M_FEATHER])
COV_L = SHELL_L.build("Owl_WingCoverts_L", [M_COVERT])
COV_R = SHELL_R.build("Owl_WingCoverts_R", [M_COVERT])
TAIL = tail.build("Owl_Tail", [M_FEATHER])
LEGS = legs.build("Owl_Feet", [M_TOE, M_CLAW])
for ob in (COV_L, COV_R):
    sub = ob.modifiers.new("Subdivision", 'SUBSURF'); sub.levels = 1; sub.render_levels = 2

# body skin weights (smooth vertical blend hips -> chest -> neck -> head)
CHAIN = [("hips", 0.55), ("chest", 0.98), ("neck_01", 1.20), ("neck_02", 1.33), ("head", 1.52)]
vg = {n: BODY.vertex_groups.new(name=n) for n, _ in CHAIN}
for v in body_me.vertices:
    z = v.co.z
    if z <= CHAIN[0][1]:
        vg["hips"].add([v.index], 1.0, 'REPLACE'); continue
    if z >= CHAIN[-1][1]:
        vg["head"].add([v.index], 1.0, 'REPLACE'); continue
    for (n0, z0), (n1, z1) in zip(CHAIN, CHAIN[1:]):
        if z0 <= z <= z1:
            w = (z - z0) / (z1 - z0); w = w * w * (3 - 2 * w)
            vg[n0].add([v.index], 1 - w, 'REPLACE'); vg[n1].add([v.index], w, 'REPLACE'); break

# =============================================================== ARMATURE
arm = bpy.data.armatures.new("Owl_Rig"); arm.display_type = 'OCTAHEDRAL'
RIG = bpy.data.objects.new("Owl_Rig", arm); COL.objects.link(RIG); RIG.show_in_front = True
bpy.context.view_layer.objects.active = RIG; RIG.select_set(True)
bpy.ops.object.mode_set(mode='EDIT')
eb = arm.edit_bones

def mkbone(name, head, tail, parent=None, roll_z=None, deform=True, connect=False):
    b = eb.new(name); b.head = V(head); b.tail = V(tail)
    if roll_z is not None:
        b.align_roll(V(roll_z))
    if parent:
        b.parent = eb[parent]; b.use_connect = connect
    b.use_deform = deform
    return b

mkbone("root", (0, 0, 0), (0, 0.6, 0), deform=False)
mkbone("hips", (0, 0.05, 0.45), (0, 0.05, 0.85), "root", (0, -1, 0))
mkbone("chest", (0, 0.05, 0.85), (0, 0.03, 1.12), "hips", (0, -1, 0), connect=True)
mkbone("neck_01", (0, 0.03, 1.12), (0, 0.02, 1.27), "chest", (0, -1, 0), connect=True)
mkbone("neck_02", (0, 0.02, 1.27), (0, 0.01, 1.40), "neck_01", (0, -1, 0), connect=True)
mkbone("head", (0, 0.01, 1.40), (0, 0.01, 2.05), "neck_02", (0, -1, 0), connect=True)
for side, sx in (("L", 1), ("R", -1)):
    ec, fwd, fr = EYE_INFO[side]
    mkbone(f"eye_{side}", ec, ec + fwd * 0.3, "head", (0, 0, 1))
    mkbone(f"lid_{side}", ec, ec + fwd * 0.24, "head", (0, 0, 1))
    mkbone(f"membrane_{side}", ec, ec + fwd * 0.2, "head", (0, 0, 1))
    tb_ = TUFT_BASE[side]
    mkbone(f"tuft_{side}", tb_ - V((0, 0, 0.08)), tb_ + V((0.15 * sx, 0, 0.4)), "head", (0, -1, 0))
    mkbone(f"brow_{side}", ec + fr.col[1] * 0.3 - fwd * 0.05, ec + fr.col[1] * 0.3 + fwd * 0.2, "head", (0, 0, 1))
    F = FEET[side]
    hip = V((0.26 * sx, 0.06, 0.50)); knee = V((0.28 * sx, -0.10, 0.30)); ankle = F + V((0, 0.05, 0.06))
    toe = F + V((0, -0.26, 0.0))
    mkbone(f"thigh_{side}", hip, knee, "hips", (0, -1, 0))
    mkbone(f"shin_{side}", knee, ankle, f"thigh_{side}", (0, -1, 0), connect=True)
    mkbone(f"foot_{side}", ankle, toe, f"shin_{side}", (0, 0, 1), connect=True)
    mkbone(f"foot_ik_{side}", ankle, toe, "root", (0, 0, 1), deform=False)
    mkbone(f"knee_pole_{side}", knee + V((0, -0.8, 0)), knee + V((0, -0.8, 0.12)), "root", deform=False)
mkbone("tail", tb + V((0, -0.16, 0.04)), tb + V((0, 0.36, -0.2)), "hips", (0, 0, 1))
# wings: deform chain (folded rest) + SPREAD control chain (spread rest)
for name, d in WING_BONES.items():
    for prefix, M in (("", d["fold"]), ("SPR_", d["spread"])):
        h = M.translation; y = M.col[1].to_3d(); z = M.col[2].to_3d()
        par = d["parent"] if d["parent"] == "chest" else prefix + d["parent"]
        mkbone(prefix + name, h, h + y * d["length"], par, z, deform=(prefix == ""))
bpy.ops.object.mode_set(mode='OBJECT')

def bcoll(name, fn, theme, visible=True):
    bc = arm.collections.new(name); bc.is_visible = visible
    for b in arm.bones:
        if fn(b.name):
            bc.assign(b); b.color.palette = theme
    return bc
bcoll("Body", lambda n: n in ("root", "hips", "chest", "neck_01", "neck_02", "head", "tail"), 'THEME09')
bcoll("Face", lambda n: n.split("_")[0] in ("eye", "lid", "membrane", "tuft", "brow"), 'THEME03')
bcoll("Wing FK", lambda n: n.startswith("wing_"), 'THEME01')
bcoll("Wing Spread Controls", lambda n: n.startswith("SPR_wing_"), 'THEME02')
bcoll("Wing Feather Splines", lambda n: n.startswith("feather_"), 'THEME04', visible=False)
bcoll("Spread Feather Targets", lambda n: n.startswith("SPR_feather_"), 'THEME05', visible=False)
bcoll("Legs IK-FK", lambda n: n.split("_")[0] in ("thigh", "shin", "foot", "knee"), 'THEME07')

def add_prop(name, val, desc):
    RIG[name] = val; RIG.id_properties_ui(name).update(min=0.0, max=1.0, soft_min=0.0, soft_max=1.0, description=desc)
def drive(owner, path, prop, index=-1):
    fc = owner.driver_add(path, index) if index >= 0 else owner.driver_add(path)
    d = fc.driver; d.type = 'AVERAGE'
    var = d.variables.new(); var.name = "v"; var.type = 'SINGLE_PROP'
    var.targets[0].id_type = 'OBJECT'; var.targets[0].id = RIG; var.targets[0].data_path = f'["{prop}"]'

for side in ("L", "R"):
    add_prop(f"ik_fk_{side}", 1.0, "Leg: 1 = IK, 0 = FK")
    add_prop(f"wing_spread_{side}", 0.0, "Wing: 0 = folded, 1 = spread (follows the SPR_wing_* controls)")
    pb = RIG.pose.bones[f"shin_{side}"]
    ik = pb.constraints.new('IK'); ik.target = RIG; ik.subtarget = f"foot_ik_{side}"
    ik.pole_target = RIG; ik.pole_subtarget = f"knee_pole_{side}"; ik.chain_count = 2
    drive(ik, "influence", f"ik_fk_{side}")
    cr = RIG.pose.bones[f"foot_{side}"].constraints.new('COPY_ROTATION')
    cr.target = RIG; cr.subtarget = f"foot_ik_{side}"
    drive(cr, "influence", f"ik_fk_{side}")
for name in WING_BONES:
    side = name[-1]
    ct = RIG.pose.bones[name].constraints.new('COPY_TRANSFORMS')
    ct.name = "Spread"; ct.target = RIG; ct.subtarget = "SPR_" + name
    drive(ct, "influence", f"wing_spread_{side}")

# neck: 3 bones x 90 deg of twist = 270 deg head turn
for nm in ("neck_01", "neck_02", "head"):
    pb = RIG.pose.bones[nm]; pb.rotation_mode = 'XYZ'
    lim = pb.constraints.new('LIMIT_ROTATION'); lim.use_limit_y = True; lim.owner_space = 'LOCAL'
    lim.min_y, lim.max_y = math.radians(-45), math.radians(45)

# IK pole angle that keeps the rest pose
bpy.context.view_layer.update()
for side in ("L", "R"):
    con = RIG.pose.bones[f"shin_{side}"].constraints[0]; rest = RIG.data.bones[f"shin_{side}"].matrix_local
    def err():
        bpy.context.view_layer.update(); m = RIG.pose.bones[f"shin_{side}"].matrix
        return (m.col[0] - rest.col[0]).length + (m.col[1] - rest.col[1]).length
    best = min(((setattr(con, "pole_angle", math.radians(dg)) or err()), dg) for dg in range(-180, 180, 2))
    lo = best[1]
    best = min(((setattr(con, "pole_angle", math.radians(lo + dg / 10)) or err()), lo + dg / 10) for dg in range(-20, 21))
    con.pole_angle = math.radians(best[1]); print("IK pole", side, best)

# parent everything to the rig
for ob in (BODY, FACE, EYES, LIDS, BEAK, TUFTS, WING_L, WING_R, COV_L, COV_R, TAIL, LEGS):
    ob.parent = RIG
    mod = ob.modifiers.new("Armature", 'ARMATURE'); mod.object = RIG
    ob.modifiers.move(len(ob.modifiers) - 1, 0)   # armature first
sub = BODY.modifiers.new("Subdivision", 'SUBSURF'); sub.levels = 0; sub.render_levels = 1

# covert shells: corrective "Spread" shape key (exact inverse of the linear-blend skin)
bpy.context.view_layer.update()
for ob, target, side in ((COV_L, SPREAD_L, "L"), (COV_R, SPREAD_R, "R")):
    P = {}
    for name, d in WING_BONES.items():
        if name.startswith("wing_") and name.endswith(side):
            P[name] = d["spread"] @ d["fold"].inverted()
    ob.shape_key_add(name="Basis")
    sk = ob.shape_key_add(name="Spread", from_mix=False)
    gidx = {g.index: g.name for g in ob.vertex_groups}
    for v in ob.data.vertices:
        M = Matrix(((0, 0, 0, 0),) * 4)
        for g in v.groups:
            M = M + P[gidx[g.group]] * g.weight
        sk.data[v.index].co = M.inverted() @ target[v.index]
    drive(sk, "value", f"wing_spread_{side}")

# =============================================================== ACTIONS
LID_MAD, LID_CLOSED, MEMB_ACROSS = -70, -178, 112

def reset_pose():
    for pb in RIG.pose.bones:
        pb.location = (0, 0, 0); pb.rotation_quaternion = (1, 0, 0, 0); pb.rotation_euler = (0, 0, 0); pb.scale = (1, 1, 1)
    RIG["wing_spread_L"] = RIG["wing_spread_R"] = 0.0
    bpy.context.view_layer.update()

def set_face(lid=0.0, memb=0.0, tuft=0.0, brow=0.0):
    for side, sx in (("L", 1), ("R", -1)):
        for nm, rot in ((f"lid_{side}", (math.radians(lid), 0, 0)), (f"membrane_{side}", (0, 0, math.radians(-memb))),
                        (f"tuft_{side}", (math.radians(tuft), 0, math.radians(tuft * 0.6 * sx))),
                        (f"brow_{side}", (0, math.radians(-brow * sx), 0))):
            pb = RIG.pose.bones[nm]; pb.rotation_mode = 'XYZ'; pb.rotation_euler = rot

FACE_BONES = [f"{p}_{s}" for p in ("lid", "membrane", "tuft", "brow", "eye") for s in "LR"]
def key(names, frame):
    for nm in names:
        pb = RIG.pose.bones[nm]
        pb.keyframe_insert("rotation_euler" if pb.rotation_mode == 'XYZ' else "rotation_quaternion", frame=frame)

def new_action(name, fn):
    RIG.animation_data_create(); RIG.animation_data.action = None
    reset_pose(); fn()
    act = RIG.animation_data.action; act.name = name; act.use_fake_user = True
    RIG.animation_data.action = None
    return act

def pose_spread():
    RIG["wing_spread_L"] = RIG["wing_spread_R"] = 1.0
    RIG.keyframe_insert('["wing_spread_L"]', frame=1); RIG.keyframe_insert('["wing_spread_R"]', frame=1)
    key([f"SPR_wing_shoulder_{x}" for x in "LR"] + [f"wing_shoulder_{x}" for x in "LR"], 1)   # bone keys so exporters keep the action
new_action("Pose_WingsSpread", pose_spread)
new_action("Expression_Alert", lambda: (set_face(tuft=-14, brow=6), key(FACE_BONES, 1)))
new_action("Expression_MadFlat", lambda: (set_face(lid=LID_MAD, tuft=20, brow=-16), key(FACE_BONES, 1)))
new_action("Nictitating_Membrane", lambda: (set_face(memb=MEMB_ACROSS), key(FACE_BONES, 1)))

def showcase():
    for fr_, amt in ((1, 0), (24, 1), (100, 1), (125, 0)):
        RIG["wing_spread_L"] = RIG["wing_spread_R"] = float(amt)
        RIG.keyframe_insert('["wing_spread_L"]', frame=fr_); RIG.keyframe_insert('["wing_spread_R"]', frame=fr_)
    for fr_, ang in ((24, 0), (36, -28), (48, 18), (60, -28), (72, 18), (84, -28), (100, 0)):   # flaps
        for side, sx in (("L", 1), ("R", -1)):
            pb = RIG.pose.bones[f"SPR_wing_shoulder_{side}"]; pb.rotation_mode = 'XYZ'
            pb.rotation_euler = (0, 0, math.radians(ang * sx)); pb.keyframe_insert("rotation_euler", frame=fr_)
    for fr_, ang in ((1, 0), (24, 0), (40, 120), (60, 120), (80, -120), (100, -120), (115, 0)):  # head turn
        for nm in ("neck_01", "neck_02", "head"):
            pb = RIG.pose.bones[nm]; pb.rotation_euler = (0, math.radians(ang / 3), 0); pb.keyframe_insert("rotation_euler", frame=fr_)
    for fr_, lid in ((125, 0), (130, LID_CLOSED), (135, 0), (140, LID_MAD), (150, LID_MAD)):
        for s in "LR":
            pb = RIG.pose.bones[f"lid_{s}"]; pb.rotation_mode = 'XYZ'; pb.rotation_euler = (math.radians(lid), 0, 0)
            pb.keyframe_insert("rotation_euler", frame=fr_)
new_action("Owl_Showcase", showcase)
scene.frame_start, scene.frame_end = 1, 150
reset_pose()

# =============================================================== UVs + save
for ob in COL.objects:
    if ob.type != 'MESH':
        continue
    bpy.ops.object.select_all(action='DESELECT')
    bpy.context.view_layer.objects.active = ob; ob.select_set(True)
    try:
        bpy.ops.object.mode_set(mode='EDIT'); bpy.ops.mesh.select_all(action='SELECT')
        bpy.ops.uv.smart_project(angle_limit=math.radians(66), island_margin=0.004)
    except Exception as ex:
        print("UV unwrap failed", ob.name, ex)
    finally:
        bpy.ops.object.mode_set(mode='OBJECT')
bpy.ops.object.select_all(action='DESELECT')
bpy.context.view_layer.objects.active = RIG
bpy.ops.wm.save_as_mainfile(filepath=os.path.join(OUT, "Owl.blend"))
print("SAVED", os.path.join(OUT, "Owl.blend"))
