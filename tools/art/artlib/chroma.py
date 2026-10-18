"""Chroma key for pieces, overlays and the owl master, generic for any flat key colour.

Steps (all deterministic): estimate the real backdrop from the border ring (a uniform border of
another shade of the key is keyed on as it is, with a warning); distance matte with a smoothstep
between t0 and t1; hue-assisted rejection of a textured or vignetted backdrop; rim refinement by
projecting each soft pixel onto the line from the backdrop to the subject colour extended from
the confident core (pixels no core can reach keep the distance matte); alpha un-mixing (the exact
inverse of ``alpha * F + (1 - alpha) * B``); speck removal and tiny-hole filling with connected
components (a component touching the frame edge is never a speck, and the speck threshold is a
fraction of the subject, not of the frame); an edge-band despill that removes only chroma along
the backdrop's direction AND in excess of the subject's own local colour (so moss stays green
against magenta, neon stays magenta against green, and a pure red body on a magenta backdrop is
not dulled); optional feather; straight-alpha RGBA with zeroed transparent RGB.

Limits the art director should know: translucent effects (glow, mist, rain) become partially
opaque colour, so glows belong in the scene's ambience code, not in a piece; hair-thin edges
harden at t1; subject detail in the backdrop hue is cut out; JPEG ringing leaves a 1-2 px halo
that t0 and the despill band absorb; a painted floor or cast shadow must be prompted away or
cropped with --floor-cut.
"""

from __future__ import annotations

import sys
from dataclasses import asdict, dataclass

import numpy as np
from PIL import Image, ImageFilter

from . import ArtError, hex_of, parse_hex
from .labels import dilate, fill_holes, masked_mean_fill, remove_specks


class ChromaError(ArtError):
    pass


@dataclass
class ChromaParams:
    key: str | None = None  # "#RRGGBB" or None/"auto" for border estimation only
    t0: float = 40.0
    t1: float = 110.0
    despill_band: int = 6
    min_area: float = 0.002  # speck threshold as a fraction of the largest component (never below 16 px)
    max_hole: int = 64  # pixels
    feather: float = 0.0
    trust_key: bool = False
    hue_reject: bool = True
    backdrop_tolerance: float = 60.0
    #: A border whose per-channel median deviation is at most this is "uniform": another shade of backdrop.
    uniform_ring_spread: float = 12.0
    #: ...and its hue must be within this many degrees of the requested key to count as a shade of it.
    shade_hue_window: float = 35.0
    #: Removed components at least this large are listed in a warning so real detail is noticed.
    warn_speck_px: int = 200

    def as_dict(self) -> dict:
        return asdict(self)


def _warn(msg: str) -> None:
    print(f"warning: {msg}", file=sys.stderr)


def _hsv_of(rgb) -> tuple[int, int, int]:
    px = np.asarray(Image.new("RGB", (1, 1), tuple(int(v) for v in np.round(rgb))).convert("HSV"))[0, 0]
    return int(px[0]), int(px[1]), int(px[2])


def _hue_delta_deg(a: np.ndarray | tuple, b: np.ndarray | tuple) -> float:
    ha, hb = _hsv_of(a)[0], _hsv_of(b)[0]
    d = abs(ha - hb) % 256
    return min(d, 256 - d) * (360.0 / 256.0)


def smoothstep(x: np.ndarray) -> np.ndarray:
    x = np.clip(x, 0.0, 1.0)
    return x * x * (3.0 - 2.0 * x)


def border_ring(rgb: np.ndarray) -> tuple[np.ndarray, int]:
    """Pixels of a border ring 1 % of the shorter side wide (at least 6 px), as (N, 3)."""
    H, W = rgb.shape[:2]
    r = max(6, int(round(0.01 * min(H, W))))
    r = min(r, H // 2, W // 2) or 1
    ring = np.concatenate([
        rgb[:r, :, :].reshape(-1, 3), rgb[-r:, :, :].reshape(-1, 3),
        rgb[r:-r, :r, :].reshape(-1, 3), rgb[r:-r, -r:, :].reshape(-1, 3),
    ])
    return ring.astype(np.float64), r


def estimate_backdrop(rgb: np.ndarray, key: np.ndarray | None = None, tolerance: float = 60.0) -> tuple[np.ndarray, int, float]:
    """The real backdrop colour: the per-channel median of the border ring.

    With a requested key only ring pixels within ``tolerance`` of it vote, because overlay
    elements (posts, roots, foliage) legitimately touch the frame; the returned fraction says how
    much of the ring was key-like (0 when no key is given).
    """
    ring, r = border_ring(rgb)
    if key is None:
        return np.median(ring, axis=0), r, 0.0
    near = np.sqrt(((ring - key) ** 2).sum(axis=1)) <= tolerance
    frac = float(near.mean()) if ring.size else 0.0
    if frac < 0.1:
        return np.median(ring, axis=0), r, frac
    return np.median(ring[near], axis=0), r, frac


def _hue_bytes(img_rgb: Image.Image) -> np.ndarray:
    return np.asarray(img_rgb.convert("HSV"))


def key_out(img: Image.Image, params: ChromaParams | None = None) -> tuple[Image.Image, dict]:
    """Matte ``img`` against its flat backdrop; returns (RGBA image, info dict)."""
    p = params or ChromaParams()
    src = img.convert("RGB")
    rgb_u8 = np.asarray(src)
    H, W = rgb_u8.shape[:2]
    rgb = rgb_u8.astype(np.float32)

    K = np.array(parse_hex(p.key), np.float64) if (p.key and p.key.lower() != "auto") else None
    B, ring, frac = estimate_backdrop(rgb_u8, K, p.backdrop_tolerance)
    info: dict = {"ring_px": ring, "backdrop_estimated": hex_of(B)}
    if K is not None:
        dist = float(np.linalg.norm(B - K))
        info["backdrop_distance"] = round(dist, 1)
        info["border_key_fraction"] = round(frac, 3)
        if dist > p.backdrop_tolerance:
            if p.trust_key:
                B = K
                info["backdrop_override"] = "trust-key"
            else:
                # Is the border one flat colour (the model painted another shade of the key, e.g.
                # #00B140 for #00FF00), or does the subject cover it (varied colours)? Only a
                # uniform ring of a nearby hue is keyed on as it stands.
                ringpx, _ = border_ring(rgb_u8)
                spread = float(np.median(np.abs(ringpx - B), axis=0).max())
                hue_d = _hue_delta_deg(B, K)
                sat = _hsv_of(B)[1]
                info["border_spread"] = round(spread, 1)
                if frac < 0.1 and spread <= p.uniform_ring_spread and hue_d <= p.shade_hue_window and sat >= 102:
                    _warn(f"backdrop is {hex_of(B)}, not the requested key {p.key} ({dist:.0f} apart): the border is a uniform other shade of it, keying on {hex_of(B)}")
                    info["backdrop_override"] = p.key
                else:
                    raise ChromaError(
                        f"backdrop is not the key colour: border median {hex_of(B)} is {dist:.0f} from {p.key} "
                        f"(tolerance {p.backdrop_tolerance:.0f}, {frac * 100:.0f} % of the border is key-like, border spread {spread:.0f}); "
                        f"pass --key-colour auto (or --key-colour {hex_of(B)}) when the backdrop is simply another shade; "
                        f"pass --trust-key only when the subject covers the border and the backdrop really is {p.key}"
                    )
    info["backdrop"] = hex_of(B)
    Bf = B.astype(np.float32)

    d = np.sqrt(((rgb - Bf) ** 2).sum(axis=-1))
    alpha = smoothstep((d - p.t0) / max(1e-6, (p.t1 - p.t0))).astype(np.float32)

    # Hue-assisted rejection: saturated pixels of the backdrop hue near the backdrop are backdrop.
    hsvB = np.asarray(Image.new("RGB", (1, 1), tuple(int(v) for v in np.round(B))).convert("HSV"))[0, 0]
    # Anti-aliased edge pixels of a neutral subject are also hue-close to the key at low coverage,
    # so pixels within 2 px of a confident subject core are exempt: a vignette far from the subject
    # is caught, the subject's own rim survives (the despill band neutralises any residue).
    if p.hue_reject and hsvB[1] > 77:  # backdrop saturated enough to have a hue
        hsv = _hue_bytes(src)
        dh = np.abs(hsv[..., 0].astype(np.int16) - int(hsvB[0]))
        dh = np.minimum(dh, 256 - dh)
        core = dilate(alpha >= 0.999, 2)
        reject = (dh <= 8.5) & (hsv[..., 1] > 191) & (hsv[..., 2] > 128) & (d < 2 * p.t1) & ~core
        alpha[reject] = 0.0
        info["hue_rejected_px"] = int(reject.sum())

    # Refine the rim: the distance matte only gates which pixels are mixed; their true coverage
    # is the projection of (rgb - B) onto (F_local - B), F_local being the confident subject colour
    # extended from the core (exact for a two-colour mix). Soft pixels are always refined; core
    # pixels next to the rim only when the projection stays >= 0.5, so dark outlines are never cut.
    # A soft pixel no core can reach (a cast shadow, a glow, an uneven patch of backdrop far from
    # the subject) has no subject colour to project onto and keeps its distance-matte alpha:
    # the fill leaves unreached pixels at their own colour, which would project to exactly 1.0.
    soft = (alpha > 0.0) & (alpha < 1.0)
    core = alpha >= 0.999
    band = dilate(soft, 2) & (alpha > 0.0)
    if band.any() and core.any():
        f_loc, reached = masked_mean_fill(rgb, core & ~band, band, r=3, iterations=6, return_reached=True)
        f_loc = f_loc.astype(np.float32)
        fb = f_loc[band] - Bf
        denom = (fb * fb).sum(axis=-1)
        proj = ((rgb[band] - Bf) * fb).sum(axis=-1) / np.maximum(denom, 1e-6)
        proj = np.clip(proj, 0.0, 1.0).astype(np.float32)
        valid = (denom > p.t0 * p.t0) & reached[band]
        cur = alpha[band]
        is_soft = soft[band]
        new = np.where(valid & (is_soft | (proj >= 0.5)), proj, cur)
        new = np.where(is_soft, np.minimum(new, 1.0), new)
        alpha[band] = new
        info["rim_refined_px"] = int((new != cur).sum())
        info["rim_unreached_px"] = int((~reached[band] & is_soft).sum())

    # Un-mix the partially covered pixels.
    mix = (alpha > 0.05) & (alpha < 1.0)
    if mix.any():
        a = alpha[mix][:, None]
        rgb[mix] = np.clip((rgb[mix] - (1.0 - a) * Bf) / a, 0.0, 255.0)

    # Specks and holes on the hard mask, after the refinement so any island it made opaque is
    # subject to the same rule. The threshold is relative to the largest component (the subject),
    # never to the frame, and a component touching the frame edge is a frame element, not a speck.
    hard = alpha > 0.5
    removed: list[int] = []
    kept, specks = remove_specks(hard, 16, keep_border_touching=True, largest_frac=p.min_area, removed_areas=removed) if hard.any() else (hard, 0)
    alpha[hard & ~kept] = 0.0
    info["specks_removed"] = specks
    big_removed = sorted((a for a in removed if a >= p.warn_speck_px), reverse=True)
    info["specks_removed_large_px"] = big_removed[:16]
    if big_removed:
        _warn(f"chroma key dropped {len(big_removed)} component(s) of {p.warn_speck_px}+ px not connected to the subject ({', '.join(str(a) for a in big_removed[:8])} px); if that was real detail, pass a smaller --min-area")
    filled_mask, filled = fill_holes(kept, p.max_hole)
    info["holes_filled_px"] = int(filled.sum())
    if filled.any():
        alpha[filled] = 1.0
        rgb = masked_mean_fill(rgb, kept & ~filled, filled, r=3, iterations=8).astype(np.float32)

    # Edge-band despill along the backdrop's chroma direction. Two bounds, the smaller wins:
    # the pixel's chroma relative to neutral grey (the most that could possibly be spill) and
    # its chroma in excess of the subject's own colour extended from the confident core (so a
    # pure red body on a magenta backdrop, or pure blue, is left alone while real spill goes).
    soft = (alpha > 0.0) & (alpha < 1.0)
    band = dilate(soft, max(0, int(p.despill_band))) & (alpha > 0.0)
    bvec = Bf - Bf.mean()
    nb = float(np.linalg.norm(bvec))
    info["despill_band_px"] = int(band.sum())
    if nb > 1.0 and band.any():
        bhat = (bvec / nb).astype(np.float32)
        px = rgb[band]
        grey_excess = np.maximum(0.0, (px - px.mean(axis=-1, keepdims=True)) @ bhat)
        core = alpha >= 0.999
        known = core & ~band
        if known.any():
            f_loc, reached = masked_mean_fill(rgb, known, band, r=3, iterations=max(6, int(p.despill_band) // 3 + 3), return_reached=True)
            subj_excess = np.maximum(0.0, (px - f_loc[band].astype(np.float32)) @ bhat)
            proj = np.where(reached[band], np.minimum(grey_excess, subj_excess), grey_excess)
        else:
            proj = grey_excess
        rgb[band] = np.clip(px - proj[:, None] * bhat, 0.0, 255.0)
        info["despilled_px"] = int((proj > 0.5).sum())

    if p.feather and p.feather > 0:
        a8 = Image.fromarray(np.round(alpha * 255).astype(np.uint8), "L").filter(ImageFilter.GaussianBlur(p.feather))
        new_alpha = np.asarray(a8).astype(np.float32) / 255.0
        grown = (new_alpha > 0) & (alpha <= 0)
        if grown.any():
            rgb = masked_mean_fill(rgb, alpha > 0, grown, r=max(2, int(p.feather) + 1), iterations=8).astype(np.float32)
        alpha = new_alpha

    out = np.zeros((H, W, 4), np.uint8)
    a8 = np.round(alpha * 255).astype(np.uint8)
    out[..., :3] = np.round(rgb).astype(np.uint8)
    out[..., 3] = a8
    out[a8 == 0, :3] = 0
    info["opaque_px"] = int((a8 == 255).sum())
    info["params"] = p.as_dict()
    return Image.fromarray(out, "RGBA"), info
