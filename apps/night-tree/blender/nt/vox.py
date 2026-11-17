"""Voxel sculpting: every asset in the library is sculpted as a block of coloured voxels, then
skinned smooth and painted.

A `V` is a block of voxels you fill with simple solids and then recolour (moss on tops, speckle,
bands). `done()` skins it with a smooth surface (surface nets, relaxed), thins the mesh, and paints
each vertex: the voxel colours blended where they meet, brushy tone variation, soft shadow in the
creases cooled toward the night's blue, and moonlight on what faces the sky. The same sculpt, skin
and paint for every asset is what holds the look together.

Axes: X right, Z up; the game camera sits on -Y looking at +Y. Positions are metres.
"""
import math

import bpy
import numpy as np

from .core import MATS, mat

VPM = 16  # voxels per metre unless an asset asks for finer or coarser
SUPER = 2  # every sculpt is worked at twice the asked resolution, so the skin comes out clean
SUPER_CAP = 14_000_000  # unless the block would be larger than this many voxels
STATS = {}  # asset mesh name -> triangles, for the budget report
GLOW = 6.0  # the strongest glow; a colour's own emission is a fraction of it

NAMES = list(MATS)
PIDX = {n: i + 1 for i, n in enumerate(NAMES)}
_srgb = np.zeros((len(NAMES) + 1, 3), np.float32)
_emit = np.zeros(len(NAMES) + 1, np.float32)
_clear = np.zeros(len(NAMES) + 1, bool)
for _n, (_hx, _r, _e, _a) in MATS.items():
    _h = _hx.lstrip("#")
    _srgb[PIDX[_n]] = [int(_h[i : i + 2], 16) / 255 for i in (0, 2, 4)]
    _emit[PIDX[_n]] = min(_e / GLOW, 1.0)
    _clear[PIDX[_n]] = _a < 1


def register_colour(name, hexcode, emission=0.0, alpha=1.0):
    """Adds a palette colour from an asset pack. Call before any V is built."""
    global _srgb, _emit, _clear
    if name in PIDX:
        return
    MATS[name] = (hexcode, 0.9, emission, alpha)
    NAMES.append(name)
    PIDX[name] = len(NAMES)
    h = hexcode.lstrip("#")
    _srgb = np.vstack([_srgb, [[int(h[i : i + 2], 16) / 255 for i in (0, 2, 4)]]]).astype(np.float32)
    _emit = np.append(_emit, min(emission / GLOW, 1.0)).astype(np.float32)
    _clear = np.append(_clear, alpha < 1)


FONT = {  # 5 wide, 7 tall, rows top to bottom
    "A": "01110 10001 10001 11111 10001 10001 10001", "B": "11110 10001 10001 11110 10001 10001 11110",
    "C": "01110 10001 10000 10000 10000 10001 01110", "D": "11110 10001 10001 10001 10001 10001 11110",
    "E": "11111 10000 10000 11110 10000 10000 11111", "F": "11111 10000 10000 11110 10000 10000 10000",
    "G": "01110 10001 10000 10111 10001 10001 01111", "H": "10001 10001 10001 11111 10001 10001 10001",
    "I": "01110 00100 00100 00100 00100 00100 01110", "J": "00111 00010 00010 00010 00010 10010 01100",
    "K": "10001 10010 10100 11000 10100 10010 10001", "L": "10000 10000 10000 10000 10000 10000 11111",
    "M": "10001 11011 10101 10101 10001 10001 10001", "N": "10001 11001 10101 10011 10001 10001 10001",
    "O": "01110 10001 10001 10001 10001 10001 01110", "P": "11110 10001 10001 11110 10000 10000 10000",
    "Q": "01110 10001 10001 10001 10101 10010 01101", "R": "11110 10001 10001 11110 10100 10010 10001",
    "S": "01111 10000 10000 01110 00001 00001 11110", "T": "11111 00100 00100 00100 00100 00100 00100",
    "U": "10001 10001 10001 10001 10001 10001 01110", "V": "10001 10001 10001 10001 10001 01010 00100",
    "W": "10001 10001 10001 10101 10101 11011 10001", "X": "10001 10001 01010 00100 01010 10001 10001",
    "Y": "10001 10001 01010 00100 00100 00100 00100", "Z": "11111 00001 00010 00100 01000 10000 11111",
    " ": "00000 00000 00000 00000 00000 00000 00000", "&": "01100 10010 10100 01000 10101 10010 01101",
    "!": "00100 00100 00100 00100 00100 00000 00100", "'": "00100 00100 00000 00000 00000 00000 00000",
}


class V:
    def __init__(self, lo, hi, vpm=VPM, open=""):
        """A block from lo to hi (metres). `open` names sides the sculpt runs off without a skin, so
        pieces tile: any of "x", "y", "z" for both ends of an axis, or "+y" style for one end."""
        n1 = [math.ceil(b * vpm - 1e-6) - math.floor(a * vpm + 1e-6) for a, b in zip(lo, hi)]
        self.q = SUPER if n1[0] * n1[1] * n1[2] * SUPER**3 <= SUPER_CAP else 1
        self.asked = vpm
        vpm = vpm * self.q
        self.vpm = vpm
        self.u = 1.0 / self.asked  # one voxel of the asked resolution, for packs that measure in voxels
        self.open = open
        U = 1.0 / vpm
        self.o = np.array([math.floor(a * self.asked + 1e-6) * self.q for a in lo])
        n = [k * self.q for k in n1]
        self.g = np.zeros(n, np.uint8)
        ax = [(np.arange(n[i]) + self.o[i] + 0.5) * U for i in range(3)]
        self.X = ax[0][:, None, None]
        self.Y = ax[1][None, :, None]
        self.Z = ax[2][None, None, :]

    # ---- filling ----------------------------------------------------------------------------------

    def _only(self, only):
        if only is None:
            return None
        if only == "solid":
            return self.g > 0
        if only == "air":
            return self.g == 0
        names = [only] if isinstance(only, str) else only
        return np.isin(self.g, [PIDX[n] for n in names])

    def fill(self, c, mask, only=None):
        """Sets every voxel in a mask (an array over X, Y, Z) to a colour; c of None carves."""
        m = np.broadcast_to(mask, self.g.shape)
        o = self._only(only)
        if o is not None:
            m = m & o
        self.g[m] = 0 if c is None else PIDX[c]
        return self

    def paint(self, c, mask, only="solid"):
        """Recolours voxels that are already there."""
        return self.fill(c, mask, only)

    def box(self, c, lo, hi, only=None):
        X, Y, Z = self.X, self.Y, self.Z
        return self.fill(c, (X > lo[0]) & (X < hi[0]) & (Y > lo[1]) & (Y < hi[1]) & (Z > lo[2]) & (Z < hi[2]), only)

    def ball(self, c, at, r, only=None):
        r = (r, r, r) if isinstance(r, (int, float)) else r
        d = ((self.X - at[0]) / r[0]) ** 2 + ((self.Y - at[1]) / r[1]) ** 2 + ((self.Z - at[2]) / r[2]) ** 2
        return self.fill(c, d <= 1, only)

    def rod(self, c, p0, p1, r0, r1=None, only=None, flat=True):
        """A round bar from p0 to p1; a cone when the radii differ; rounded ends when flat is False."""
        r1 = r0 if r1 is None else r1
        d = [p1[i] - p0[i] for i in range(3)]
        L2 = sum(k * k for k in d) or 1e-9
        t = ((self.X - p0[0]) * d[0] + (self.Y - p0[1]) * d[1] + (self.Z - p0[2]) * d[2]) / L2
        tc = np.clip(t, 0, 1)
        dist2 = (self.X - p0[0] - tc * d[0]) ** 2 + (self.Y - p0[1] - tc * d[1]) ** 2 + (self.Z - p0[2] - tc * d[2]) ** 2
        m = dist2 <= (r0 + (r1 - r0) * tc) ** 2
        if flat:
            m = m & (t >= 0) & (t <= 1)
        return self.fill(c, m, only)

    def path(self, c, pts, r0, r1=None, only=None):
        """Rounded rods through a list of points, the radius easing from r0 to r1."""
        r1 = r0 if r1 is None else r1
        n = len(pts) - 1
        for i in range(n):
            self.rod(c, pts[i], pts[i + 1], r0 + (r1 - r0) * i / n, r0 + (r1 - r0) * (i + 1) / n, only, flat=False)
        return self

    def poly(self, c, pts, y0, y1, only=None):
        """An outline of (x, z) points given depth from y0 to y1."""
        X = np.broadcast_to(self.X, (self.g.shape[0], 1, self.g.shape[2]))
        Z = np.broadcast_to(self.Z, (self.g.shape[0], 1, self.g.shape[2]))
        inside = np.zeros(X.shape, bool)
        n = len(pts)
        for i in range(n):
            x0, z0 = pts[i]
            x1, z1 = pts[(i + 1) % n]
            if z0 == z1:
                continue
            cross = ((z0 > Z) != (z1 > Z)) & (X < (x1 - x0) * (Z - z0) / (z1 - z0) + x0)
            inside ^= cross
        return self.fill(c, inside & (self.Y > y0) & (self.Y < y1), only)

    def text(self, c, s, x, z, y0, y1, px=1, only=None, align="center"):
        """Writes capitals in the 5 by 7 font; px is the size of one font dot in voxels. z is the baseline."""
        s = s.upper()
        U = self.u
        w = (len(s) * 6 - 1) * px * U
        cx = x - w / 2 if align == "center" else x
        for ch in s:
            rows = FONT.get(ch, FONT[" "]).split()
            for ri, row in enumerate(rows):
                for ci, bit in enumerate(row):
                    if bit == "1":
                        self.box(c, (cx + ci * px * U, y0, z + (6 - ri) * px * U), (cx + (ci + 1) * px * U, y1, z + (7 - ri) * px * U), only)
            cx += 6 * px * U
        return self

    # ---- recolouring ------------------------------------------------------------------------------

    def exposed(self, axis=2, sign=1, depth=1):
        """Solid voxels with air within `depth` voxels along one direction (default: open to the sky)."""
        solid = self.g > 0
        out = np.zeros_like(solid)
        for k in range(1, depth * self.q + 1):
            sh = np.zeros_like(solid)
            src = [slice(None)] * 3
            dst = [slice(None)] * 3
            if sign > 0:
                src[axis] = slice(k, None)
                dst[axis] = slice(None, -k)
            else:
                src[axis] = slice(None, -k)
                dst[axis] = slice(k, None)
            sh[tuple(dst)] = solid[tuple(src)]
            edge = np.zeros_like(solid)
            e = [slice(None)] * 3
            e[axis] = slice(-k, None) if sign > 0 else slice(None, k)
            edge[tuple(e)] = True
            out |= solid & (~sh | edge) if k == 1 else solid & ~sh & ~edge | (solid & edge)
        return out

    def top(self, c, depth=1, only="solid"):
        """Recolours what lies open to the sky: moss on a branch, snow on a roof."""
        return self.fill(c, self.exposed(2, 1, depth), only)

    def surface(self):
        solid = self.g > 0
        p = np.pad(solid, 1)
        inner = p[2:, 1:-1, 1:-1] & p[:-2, 1:-1, 1:-1] & p[1:-1, 2:, 1:-1] & p[1:-1, :-2, 1:-1] & p[1:-1, 1:-1, 2:] & p[1:-1, 1:-1, :-2]
        return solid & ~inner

    def speckle(self, c, amount, seed=1, only="solid"):
        """Recolours a random share of the voxels: flecks, lichen, stars."""
        r = np.random.default_rng(seed).random([k // self.q for k in self.g.shape])
        for ax in range(3):
            r = np.repeat(r, self.q, axis=ax)  # flecks stay the size of an asked voxel
        return self.fill(c, r < amount, only)

    def noise(self, scale, seed=1):
        """Smooth noise over the block, 0 to 1; `scale` is the size of a blob in metres."""
        rng = np.random.default_rng(seed)
        out = None
        coords = [(np.arange(n) + o + 0.5) / self.vpm / scale for n, o in zip(self.g.shape, self.o)]
        idx = [np.floor(cd).astype(int) for cd in coords]
        fr = [cd - np.floor(cd) for cd in coords]
        fr = [f * f * (3 - 2 * f) for f in fr]
        base = [i.min() for i in idx]
        dims = [i.max() - b + 2 for i, b in zip(idx, base)]
        lat = rng.random(dims)
        ix = [i - b for i, b in zip(idx, base)]
        out = 0
        for dx in (0, 1):
            for dy in (0, 1):
                for dz in (0, 1):
                    wx = fr[0] if dx else 1 - fr[0]
                    wy = fr[1] if dy else 1 - fr[1]
                    wz = fr[2] if dz else 1 - fr[2]
                    out = out + lat[np.ix_(ix[0] + dx, ix[1] + dy, ix[2] + dz)] * wx[:, None, None] * wy[None, :, None] * wz[None, None, :]
        return out

    def mirror(self):
        """Copies the -X half onto the +X half (the block must be centred on x = 0)."""
        self.g = np.where(self.g > 0, self.g, self.g[::-1])
        return self

    # ---- skinning ---------------------------------------------------------------------------------

    def done(self, name, loc=(0, 0, 0), keep=0.5, relax=2, seed=None):
        """Skins and paints the sculpt. `keep` is the share of triangles left after thinning."""
        me = build_mesh(name, self, keep, relax, seed)
        ob = bpy.data.objects.new(name, me)
        ob.location = loc
        return ob


def paint_material(name="nt_paint"):
    """The one material every opaque surface shares: vertex colour is the paint, vertex alpha the glow."""
    m = bpy.data.materials.get(name)
    if m:
        return m
    m = bpy.data.materials.new(name)
    m.use_nodes = True
    nt = m.node_tree
    p = nt.nodes["Principled BSDF"]
    a = nt.nodes.new("ShaderNodeVertexColor")
    a.layer_name = "Col"
    k = nt.nodes.new("ShaderNodeMath")
    k.operation = "MULTIPLY"
    k.inputs[1].default_value = GLOW
    nt.links.new(a.outputs["Color"], p.inputs["Base Color"])
    nt.links.new(a.outputs["Color"], p.inputs["Emission Color"])
    nt.links.new(a.outputs["Alpha"], k.inputs[0])
    nt.links.new(k.outputs[0], p.inputs["Emission Strength"])
    p.inputs["Roughness"].default_value = 0.85
    return m


def _blur(f, r):
    """A box blur of radius r voxels along each axis, twice (near enough a soft round brush)."""
    for _ in range(2):
        for ax in range(3):
            c = np.cumsum(np.pad(f, [(r + 1, r) if a == ax else (0, 0) for a in range(3)], mode="edge"), axis=ax)
            hi = [slice(None)] * 3
            lo = [slice(None)] * 3
            hi[ax] = slice(2 * r + 1, None)
            lo[ax] = slice(None, -(2 * r + 1))
            f = (c[tuple(hi)] - c[tuple(lo)]) / (2 * r + 1)
    return f


def _cells(f):
    """The mean of a field over each cell's eight corners."""
    return (f[:-1, :-1, :-1] + f[1:, :-1, :-1] + f[:-1, 1:, :-1] + f[1:, 1:, :-1] + f[:-1, :-1, 1:] + f[1:, :-1, 1:] + f[:-1, 1:, 1:] + f[1:, 1:, 1:]) / 8.0


def build_mesh(name, v, keep=0.5, relax=2, seed=None):
    g = v.g
    U = 1.0 / v.vpm
    sq = v.q
    if sq > 1:
        keep = min(1.0, keep * 1.7 / (sq * sq))  # the same sculpt at about 1.7 times the triangles
        relax = relax * sq - (sq - 1)
    seed = (sum(ord(ch) * (i + 7) for i, ch in enumerate(name)) % 100000) if seed is None else seed
    # pad by one: air where the skin should close, a copy of the edge where the sculpt runs on
    pads = []
    for i, axn in enumerate("xyz"):
        lo_open = axn in v.open.replace("+" + axn, "").replace("-" + axn, "") or ("-" + axn) in v.open
        hi_open = axn in v.open.replace("+" + axn, "").replace("-" + axn, "") or ("+" + axn) in v.open
        pads.append((lo_open, hi_open))
    gp = np.pad(g, 1)
    for ax, (lo_open, hi_open) in enumerate(pads):
        sl = [slice(None)] * 3
        src = [slice(None)] * 3
        if lo_open:
            sl[ax], src[ax] = 0, 1
            gp[tuple(sl)] = gp[tuple(src)]
        if hi_open:
            sl[ax], src[ax] = -1, -2
            gp[tuple(sl)] = gp[tuple(src)]
    s = gp > 0
    n = np.array(s.shape) - 1  # cells per axis

    # one vertex in every cell the surface passes through, at the mean of its edge crossings
    corners = [s[dx : dx + n[0], dy : dy + n[1], dz : dz + n[2]] for dx in (0, 1) for dy in (0, 1) for dz in (0, 1)]
    count = sum(c.astype(np.int8) for c in corners)
    active = (count > 0) & (count < 8)
    pos = np.zeros(tuple(n) + (3,), np.float32)
    cnt = np.zeros(tuple(n), np.float32)

    def corner(dx, dy, dz):
        return corners[dx * 4 + dy * 2 + dz]

    for ax in range(3):
        o1, o2 = (ax + 1) % 3, (ax + 2) % 3
        for e1 in (0, 1):
            for e2 in (0, 1):
                a = [0, 0, 0]
                b = [0, 0, 0]
                a[o1] = b[o1] = e1
                a[o2] = b[o2] = e2
                b[ax] = 1
                x = corner(*a) != corner(*b)
                off = [0.0, 0.0, 0.0]
                off[o1] = e1 - 0.5
                off[o2] = e2 - 0.5
                for k in range(3):
                    if off[k]:
                        pos[..., k] += x * off[k]
                cnt += x
    cnt[cnt == 0] = 1
    pos /= cnt[..., None]
    idx = np.full(tuple(n), -1, np.int64)
    nv = int(active.sum())
    idx[active] = np.arange(nv)
    ci = np.argwhere(active)
    P = (ci + pos[active] + v.o) * U  # cell (i, j, k) is centred on voxel corner (i, j, k) + origin

    # colour: the blend of the solid voxels round each vertex
    srgb = _srgb[gp]
    wsum = np.zeros(tuple(n) + (3,), np.float32)
    esum = np.zeros(tuple(n), np.float32)
    for dx in (0, 1):
        for dy in (0, 1):
            for dz in (0, 1):
                sl = (slice(dx, dx + n[0]), slice(dy, dy + n[1]), slice(dz, dz + n[2]))
                wsum += srgb[sl] * s[sl][..., None]
                esum += (_emit[gp[sl]] > 0) * s[sl]
    C = (wsum / np.maximum(count, 1)[..., None])[active]
    glow_v = (esum / np.maximum(count, 1))[active]
    ksum = np.zeros(tuple(n), np.float32)
    for dx in (0, 1):
        for dy in (0, 1):
            for dz in (0, 1):
                sl = (slice(dx, dx + n[0]), slice(dy, dy + n[1]), slice(dz, dz + n[2]))
                ksum = np.maximum(ksum, _emit[gp[sl]])
    glow_k = ksum[active]

    # faces: a quad round every voxel edge that crosses the surface
    quads = []
    owner = []
    for d in range(3):
        perm = (d, (d + 1) % 3, (d + 2) % 3)
        sT = np.transpose(s, perm)
        gT = np.transpose(gp, perm)
        iT = np.transpose(idx, perm)
        lo = sT[:-1, 1:-1, 1:-1]
        hi = sT[1:, 1:-1, 1:-1]
        x = lo != hi
        if not x.any():
            continue
        q = np.stack([iT[:, :-1, :-1], iT[:, 1:, :-1], iT[:, 1:, 1:], iT[:, :-1, 1:]], axis=-1)
        qa = q[x]
        inside_lo = lo[x]
        qa = np.where(inside_lo[:, None], qa, qa[:, ::-1])
        own = np.where(inside_lo, gT[:-1, 1:-1, 1:-1][x], gT[1:, 1:-1, 1:-1][x])
        ok = (qa >= 0).all(axis=1)
        quads.append(qa[ok])
        owner.append(own[ok])
    if not quads:
        raise ValueError(f"{name}: nothing sculpted")
    Q = np.concatenate(quads)
    OW = np.concatenate(owner)

    # vertices on an open side stay put so tiles meet
    pinned = np.zeros(nv, bool)
    for ax, (lo_open, hi_open) in enumerate(pads):
        if lo_open:
            pinned |= ci[:, ax] == 0
        if hi_open:
            pinned |= ci[:, ax] == n[ax] - 1
    # relax the skin (shrink then swell, so it smooths without losing volume)
    e0 = np.concatenate([Q[:, 0], Q[:, 1], Q[:, 2], Q[:, 3]])
    e1 = np.concatenate([Q[:, 1], Q[:, 2], Q[:, 3], Q[:, 0]])
    both0 = np.concatenate([e0, e1])
    both1 = np.concatenate([e1, e0])
    deg = np.maximum(np.bincount(both0, minlength=nv), 1)[:, None]
    P = P.astype(np.float64)
    for _ in range(relax):
        for lam in (0.62, -0.64):
            avg = np.stack([np.bincount(both0, weights=P[both1, k], minlength=nv) for k in range(3)], axis=1) / deg
            step = lam * (avg - P)
            step[pinned] = 0
            P = P + step

    # paint
    pad = 4 * sq
    occ = _blur(np.pad(s, pad, mode="edge").astype(np.float32), 2 * sq)[pad:-pad, pad:-pad, pad:-pad]
    oc = _cells(occ)[active]
    gz = _cells(np.gradient(occ, axis=2))[active] * sq
    gy = _cells(np.gradient(occ, axis=1))[active] * sq
    rng = np.random.default_rng(seed)
    lat = rng.random((12, 12, 12)).astype(np.float32)

    def brush(scale):
        q = P / scale
        i0 = np.floor(q).astype(int)
        f = q - i0
        f = f * f * (3 - 2 * f)
        out = 0
        for dx in (0, 1):
            for dy in (0, 1):
                for dz in (0, 1):
                    w = (f[:, 0] if dx else 1 - f[:, 0]) * (f[:, 1] if dy else 1 - f[:, 1]) * (f[:, 2] if dz else 1 - f[:, 2])
                    out = out + w * lat[(i0[:, 0] + dx) % 12, (i0[:, 1] + dy) % 12, (i0[:, 2] + dz) % 12]
        return out

    b_big = brush(1.1)
    b_mid = brush(0.31)
    tone = 1 + 0.2 * (b_big - 0.5) + 0.14 * (b_mid - 0.5) + 0.05 * (rng.random(nv) - 0.5)
    crease = np.clip((oc - 0.5) * 2.2, -0.35, 1.0)  # above 0 in hollows, below on proud edges
    shade = 1 - 0.55 * np.clip(crease, 0, 1) + 0.3 * np.clip(-crease, 0, 1)
    sky = np.clip(-gz * 9, -1, 1)  # +1 facing the sky
    front = np.clip(gy * 9, -1, 1)  # +1 facing the camera
    lit = shade * (1 + 0.16 * sky + 0.05 * front) * tone
    if not v.open:
        # a darker, damper foot grounds a thing; tiles are left even so they meet
        zlo, zhi = P[:, 2].min(), P[:, 2].max()
        if zhi - zlo > 0.6:
            hgt = np.clip((P[:, 2] - zlo) / (zhi - zlo) / 0.3, 0, 1)
            lit = lit * (0.84 + 0.16 * hgt * hgt * (3 - 2 * hgt))
    C = C * lit[:, None]
    # brushed hue, not only value: the paint drifts warm and cool across a surface
    drift = (brush(0.8) - 0.5)[:, None]
    C = C * (1 + drift * np.array([0.14, 0.02, -0.16]))
    # shadows lean to the night's blue, sky-facing paint to the moon's cream, proud edges catch light
    dark = np.clip(1 - shade, 0, 1)[:, None]
    C = C * (1 - dark * np.array([0.3, 0.16, -0.08]))
    C = C + np.clip(sky, 0, 1)[:, None] * np.array([0.02, 0.03, 0.05])
    C = C + np.clip(-crease, 0, 0.35)[:, None] * np.array([0.05, 0.045, 0.03])
    # where voxels glow, the paint gives way to their own clean colour, and alpha carries the strength
    gk = np.clip(glow_k * np.clip(glow_v * 2.2, 0, 1), 0, 1)
    pure = (wsum / np.maximum(count, 1)[..., None])[active] * (0.94 + 0.12 * brush(0.4)[:, None])
    mix = np.clip(glow_v * 2.2, 0, 1)[:, None]
    C = np.clip(C * (1 - mix) + pure * mix, 0, 1)
    lin = np.where(C <= 0.04045, C / 12.92, ((C + 0.055) / 1.055) ** 2.4)
    rgba = np.concatenate([lin, gk[:, None]], axis=1).astype(np.float32)

    me = bpy.data.meshes.new(name)
    me.from_pydata(P.tolist(), [], Q.tolist())
    col = me.color_attributes.new("Col", "FLOAT_COLOR", "POINT")
    col.data.foreach_set("color", rgba.ravel())
    slots = ["nt_paint"]
    mi = np.zeros(len(Q), np.int32)
    for cidx in np.unique(OW[_clear[OW]]):
        slots.append(NAMES[cidx - 1])
        mi[OW == cidx] = len(slots) - 1
    for nm in slots:
        me.materials.append(paint_material(nm) if nm.startswith("nt_") else mat(nm))
    me.polygons.foreach_set("material_index", mi)
    me.polygons.foreach_set("use_smooth", np.ones(len(Q), bool))
    me.update()

    if keep < 1 and len(Q) > 60:
        ob = bpy.data.objects.new(name + ".tmp", me)
        bpy.context.scene.collection.objects.link(ob)
        # thin flat, evenly painted skin first: vertices where the paint or the glow changes are held
        diff = np.abs(rgba[e0] - rgba[e1]).sum(axis=1)
        edge = np.zeros(nv)
        np.maximum.at(edge, e0, diff)
        np.maximum.at(edge, e1, diff)
        # ... and so are ridges, rims and thin parts, where thinning would crumple the form
        wgt = 1.0 - 0.94 * np.clip(edge * 8.0 + np.abs(crease) * 1.5, 0, 1)
        wgt[pinned] = 0.0
        vg = ob.vertex_groups.new(name="thin")
        for lvl in range(11):
            pick = np.flatnonzero(np.round(wgt * 10) == lvl)
            if len(pick) and lvl > 0:
                vg.add(pick.tolist(), lvl / 10.0, "REPLACE")
        md = ob.modifiers.new("thin", "DECIMATE")
        md.ratio = keep
        md.vertex_group = "thin"
        md.use_collapse_triangulate = True
        dg = bpy.context.evaluated_depsgraph_get()
        thin = bpy.data.meshes.new_from_object(ob.evaluated_get(dg), depsgraph=dg)
        bpy.data.objects.remove(ob)
        bpy.data.meshes.remove(me)
        thin.name = name
        me = thin
    me["nt_voxels"] = int((g > 0).sum())
    me.calc_loop_triangles()
    STATS[name] = len(me.loop_triangles)
    return me
