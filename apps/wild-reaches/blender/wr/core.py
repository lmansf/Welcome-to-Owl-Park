"""Mesh and material helpers for the asset library.

Axes: X is right, Z is up, and the game camera sits on -Y looking at +Y. The play plane is y = 0.
One unit is one metre; the owl stands one metre tall.
"""
import math

import bmesh
import bpy
from mathutils import Euler, Matrix, Vector


def _lin(c):
    c = c / 255.0
    return c / 12.92 if c <= 0.04045 else ((c + 0.055) / 1.055) ** 2.4


def hex_rgba(h, a=1.0):
    h = h.lstrip("#")
    return (_lin(int(h[0:2], 16)), _lin(int(h[2:4], 16)), _lin(int(h[4:6], 16)), a)


# name: (hex, roughness, emission strength, alpha)
MATS = {
    # the night and the tree
    "navy": ("#0C1E36", 0.9, 0, 1), "navy_deep": ("#07122A", 0.95, 0, 1), "dusk": ("#2E4C7A", 0.9, 0, 1),
    "bark_dark": ("#2B1C12", 0.95, 0, 1), "bark": ("#4A3322", 0.95, 0, 1),
    "wood": ("#5C4632", 0.9, 0, 1), "wood_light": ("#8F8068", 0.85, 0, 1),
    "moss": ("#3E5A3A", 1, 0, 1), "moss_light": ("#6E8B4E", 1, 0, 1), "leaf_dark": ("#1F3A2E", 1, 0, 1),
    "stone": ("#56607A", 0.95, 0, 1), "stone_dark": ("#2C3550", 0.95, 0, 1),
    "water": ("#1B3F6E", 0.2, 0.3, 0.8),
    # light
    "gold": ("#C9A227", 0.45, 0, 1), "gold_glow": ("#FFD36A", 0.5, 5, 1), "gold_soft": ("#FFD36A", 0.5, 1.2, 1),
    "cream": ("#F6F1E3", 0.8, 0, 1), "moon_glow": ("#F6F1E3", 0.6, 3, 1),
    "amber": ("#F2B24A", 0.8, 0, 1), "amber_glow": ("#F2B24A", 0.5, 4, 1),
    # neon street
    "neon_dark": ("#0B0B16", 0.6, 0, 1), "chrome": ("#C7CEDA", 0.25, 0, 1),
    "magenta_glow": ("#FF2AA1", 0.4, 6, 1), "cyan_glow": ("#00E5FF", 0.4, 6, 1), "violet_glow": ("#6E3AFF", 0.4, 6, 1),
    "violet": ("#3A2A7A", 0.7, 0, 1),
    # ink garden
    "ink": ("#111111", 0.7, 0, 1), "ink_grey": ("#6B6B6B", 0.9, 0, 1), "paper": ("#EFE8D6", 0.95, 0, 1),
    "paper_glow": ("#F6F1E3", 0.9, 1.5, 1), "seal_red": ("#B3261E", 0.7, 0.6, 1), "ink_wash": ("#3A3F4A", 0.95, 0, 0.85),
    # stained glass
    "ruby": ("#A3202F", 0.3, 0.8, 1), "emerald": ("#1E6B4C", 0.3, 0.8, 1),
    "sapphire": ("#1F4A9C", 0.3, 0.8, 1), "amber_glass": ("#E6A530", 0.3, 1.2, 1),
    "glass_blue": ("#9FD0FF", 0.2, 0.5, 1), "rose": ("#FF8AD0", 0.3, 0.8, 1),
    "mint": ("#7BE0C8", 0.3, 0.8, 1), "lilac": ("#CDB0FF", 0.3, 0.8, 1), "lead": ("#2A3B63", 0.6, 0, 1),
    "frail": ("#9FD0FF", 0.05, 0.6, 0.45), "cloud": ("#DDE8F6", 1, 0.5, 1),
    # hazards and bits
    "thorn": ("#5A1F3A", 0.8, 0, 1), "thorn_tip": ("#FF5A7A", 0.5, 1.5, 1), "moth": ("#D8C9A8", 0.9, 0.4, 1),
    "red": ("#B3261E", 0.8, 0, 1), "straw": ("#D9B866", 0.95, 0, 1), "heron": ("#B9C4CE", 0.9, 0, 1),
    # owls: body, belly and accent are tinted per owl at run time
    "owl_body": ("#8A6A45", 0.95, 0, 1), "owl_belly": ("#E9D9B8", 0.95, 0, 1), "owl_accent": ("#5A4028", 0.95, 0, 1),
    "owl_face": ("#F3E6C8", 0.9, 0, 1), "eye": ("#FFC530", 0.3, 0, 1), "pupil": ("#0A0A0A", 0.2, 0, 1),
    "beak": ("#3B2F25", 0.5, 0, 1), "snow": ("#F2F4F7", 0.95, 0, 1), "barn": ("#E8B878", 0.95, 0, 1),
    "grey_owl": ("#8C8478", 0.95, 0, 1), "sand_owl": ("#B59868", 0.95, 0, 1),
    "mouse_gold": ("#FFD36A", 0.3, 2.5, 1),
}


def mat(name):
    m = bpy.data.materials.get(name)
    if m:
        return m
    hx, rough, emit, alpha = MATS[name]
    m = bpy.data.materials.new(name)
    m.use_nodes = True
    p = m.node_tree.nodes["Principled BSDF"]
    col = hex_rgba(hx)
    p.inputs["Base Color"].default_value = col
    p.inputs["Roughness"].default_value = rough
    p.inputs["Emission Color"].default_value = col
    p.inputs["Emission Strength"].default_value = emit
    p.inputs["Alpha"].default_value = alpha
    if alpha < 1:
        m.surface_render_method = "BLENDED"
    m.diffuse_color = hex_rgba(hx, alpha)
    return m


def xf(loc=(0, 0, 0), rot=(0, 0, 0), scale=(1, 1, 1)):
    """A matrix from a place, a rotation in degrees and a scale."""
    if isinstance(scale, (int, float)):
        scale = (scale, scale, scale)
    r = Euler([math.radians(a) for a in rot], "XYZ").to_matrix().to_4x4()
    s = Matrix.Diagonal((*scale, 1))
    return Matrix.Translation(loc) @ r @ s


class B:
    """Builds one mesh object out of simple solids, each with a palette material."""

    def __init__(self):
        self.bm = bmesh.new()
        self.mats = []

    def _mi(self, name):
        if name not in self.mats:
            self.mats.append(name)
        return self.mats.index(name)

    def _paint(self, verts, name):
        mi = self._mi(name)
        for f in {f for v in verts for f in v.link_faces}:
            if all(v in verts for v in f.verts):
                f.material_index = mi

    def box(self, m, size, loc=(0, 0, 0), rot=(0, 0, 0)):
        r = bmesh.ops.create_cube(self.bm, size=1, matrix=xf(loc, rot, size))
        self._paint(set(r["verts"]), m)
        return self

    def cyl(self, m, r, h, loc=(0, 0, 0), rot=(0, 0, 0), segs=10, r2=None, scale=(1, 1, 1)):
        """A cylinder standing on loc (its base is at loc), or a cone when r2 differs."""
        r2 = r if r2 is None else r2
        M = xf(loc, rot, scale) @ Matrix.Translation((0, 0, h / 2))
        out = bmesh.ops.create_cone(self.bm, cap_ends=True, segments=segs, radius1=r, radius2=max(r2, 1e-4), depth=h, matrix=M)
        self._paint(set(out["verts"]), m)
        return self

    def ball(self, m, r, loc=(0, 0, 0), scale=(1, 1, 1), rot=(0, 0, 0), sub=2):
        out = bmesh.ops.create_icosphere(self.bm, subdivisions=sub, radius=r, matrix=xf(loc, rot, scale))
        self._paint(set(out["verts"]), m)
        return self

    def lathe(self, m, profile, loc=(0, 0, 0), segs=12, rot=(0, 0, 0), scale=(1, 1, 1)):
        """Spin a profile of (radius, height) pairs round the Z axis."""
        M = xf(loc, rot, scale)
        rings = []
        for r, z in profile:
            rings.append([self.bm.verts.new(M @ Vector((r * math.cos(2 * math.pi * i / segs), r * math.sin(2 * math.pi * i / segs), z))) for i in range(segs)])
        vs = set()
        for a, b in zip(rings, rings[1:]):
            for i in range(segs):
                j = (i + 1) % segs
                self.bm.faces.new((a[i], a[j], b[j], b[i]))
        for ring, flip in ((rings[0], True), (rings[-1], False)):
            self.bm.faces.new(ring[::-1] if flip else ring)
        for ring in rings:
            vs.update(ring)
        self._paint(vs, m)
        return self

    def prism(self, m, pts, depth, loc=(0, 0, 0), rot=(0, 0, 0), scale=(1, 1, 1)):
        """An outline of (x, z) points, counter-clockwise seen from the camera, given depth along Y."""
        M = xf(loc, rot, scale)
        front = [self.bm.verts.new(M @ Vector((x, -depth / 2, z))) for x, z in pts]
        back = [self.bm.verts.new(M @ Vector((x, depth / 2, z))) for x, z in pts]
        n = len(pts)
        self.bm.faces.new(front)
        self.bm.faces.new(back[::-1])
        for i in range(n):
            j = (i + 1) % n
            self.bm.faces.new((front[j], front[i], back[i], back[j]))
        self._paint(set(front + back), m)
        return self

    def tube(self, m, pts, r, segs=6):
        """A tube through 3D points; r is one radius or one per point."""
        pts = [Vector(p) for p in pts]
        rs = r if isinstance(r, (list, tuple)) else [r] * len(pts)
        rings = []
        for i, p in enumerate(pts):
            d = (pts[min(i + 1, len(pts) - 1)] - pts[max(i - 1, 0)]).normalized()
            up = Vector((0, 1, 0)) if abs(d.y) < 0.9 else Vector((1, 0, 0))
            a = d.cross(up).normalized()
            b = d.cross(a).normalized()
            rings.append([self.bm.verts.new(p + rs[i] * (math.cos(2 * math.pi * k / segs) * a + math.sin(2 * math.pi * k / segs) * b)) for k in range(segs)])
        vs = set()
        for ra, rb in zip(rings, rings[1:]):
            for i in range(segs):
                j = (i + 1) % segs
                self.bm.faces.new((ra[i], ra[j], rb[j], rb[i]))
        self.bm.faces.new(rings[0][::-1])
        self.bm.faces.new(rings[-1])
        for ring in rings:
            vs.update(ring)
        self._paint(vs, m)
        return self

    def done(self, name, smooth=False, loc=(0, 0, 0)):
        bmesh.ops.recalc_face_normals(self.bm, faces=self.bm.faces)
        me = bpy.data.meshes.new(name)
        self.bm.to_mesh(me)
        self.bm.free()
        for n in self.mats:
            me.materials.append(mat(n))
        if smooth:
            for p in me.polygons:
                p.use_smooth = True
        ob = bpy.data.objects.new(name, me)
        ob.location = loc
        return ob


# ---- the registry -------------------------------------------------------------------------------

ASSETS = {}  # name -> (category, builder, note)


def asset(name, cat, note=""):
    """Register a builder. It returns one object, or a list whose first object is the root."""

    def deco(fn):
        ASSETS[name] = (cat, fn, note)
        return fn

    return deco


def child(ob, parent):
    ob.parent = parent
    return ob


def rng(seed):
    import random

    return random.Random(seed)
