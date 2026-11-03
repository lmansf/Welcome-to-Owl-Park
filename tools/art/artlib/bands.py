"""Value bands (OP-250): where each backdrop layer's lightness, local contrast and saturation sit.

The owner saw the kit's backdrop layers compete with the walkable floor (PR 86). The three approved
art targets (``tools/art/targets/``, OP-249) are painted as one picture under one light with the
backdrop darker and softer than the floor, and the bands in ``docs/TREE_STYLE.md`` are measured on
them with ``measure_target``: the sky band (the top 30 % of the screen), the backdrop band (30 % to
70 % down) and the floor band (y 740 to 900). A published layer is measured over its opaque pixels
with ``stats``, and ``grade_to_band`` pulls it into its layer's band: a linear remap of L toward
the band's mean and ceiling, a blend toward a blurred copy and a gain under 1 for contrast, a chroma
scale for saturation, and for far and middle layers a little blur and a haze toward the area's sky
colour. Deterministic (numpy only, no randomness), and the alpha is never touched.

Statistics (CIE Lab, D65, L 0 to 100; ``artlib.grade`` does the conversion):

- ``L_mean``: the mean L of the opaque pixels (alpha at or over ``OPAQUE``; every pixel of a sky).
- ``L_p95``: the 95th percentile of L over the same pixels, the layer's brightest rim light.
- ``contrast``: the mean, over the 32 px blocks of the screen grid (16 px in a half-size middle layer,
  so a block covers the same screen area) that are at least half opaque, of the standard deviation
  of L inside the block: how hard the layer's edges and texture read at a glance.
- ``sat``: the mean HSV saturation (0 to 1) of the opaque pixels.
"""

from __future__ import annotations

import numpy as np
from PIL import Image

from .grade import srgb_to_lab

#: The screen the bands are measured on (the targets' size), and the block of the contrast grid at that size.
SCREEN_W = 1600
BLOCK = 32
#: A pixel counts as opaque from this alpha (of 255).
OPAQUE = 128
#: The targets' bands: fractions of the height (sky, backdrop) and rows (floor).
TARGET_BANDS = {"sky": (0.0, 0.3), "backdrop": (0.3, 0.7), "floor": (740 / 900, 1.0)}

#: The value bands of docs/TREE_STYLE.md, section 2b: L_mean as (low, high); the rest are ceilings.
BANDS: dict[str, dict] = {
    "sky": {"L_mean": (8.0, 20.0), "L_p95": 55.0, "contrast": 7.5, "sat": 0.66},
    "far": {"L_mean": (12.0, 26.0), "L_p95": 60.0, "contrast": 8.0, "sat": 0.60},
    "mid": {"L_mean": (12.0, 32.0), "L_p95": 78.0, "contrast": 11.0, "sat": 0.63},
    "walk": {"L_mean": (33.0, 65.0), "L_p95": 96.0, "contrast": 14.0, "sat": 0.70},
    "front": {"L_mean": (6.0, 30.0), "L_p95": 70.0, "contrast": 10.0, "sat": 0.60},
}
#: An area whose distance fades the other way: the ink-wash realm is washed onto paper cream, so its
#: backdrop goes paler and fainter toward the paper, not darker toward the night. Its bands keep the
#: same order of contrast (the floor holds the most) with the lightness read upward from its floor.
AREA_BANDS: dict[str, dict[str, dict]] = {
    "ink": {
        "sky": {"L_mean": (75.0, 96.0), "L_p95": 99.0, "contrast": 5.0, "sat": 0.20},
        "far": {"L_mean": (60.0, 85.0), "L_p95": 97.0, "contrast": 8.0, "sat": 0.20},
        "mid": {"L_mean": (40.0, 70.0), "L_p95": 97.0, "contrast": 11.0, "sat": 0.30},
    },
}
#: The haze toward the sky colour and the blur (px at screen scale) of the two backdrop layers.
SOFTEN = {"far": {"haze": 0.14, "blur": 1.6}, "mid": {"haze": 0.07, "blur": 1.0}}
#: The grade aims this far inside a band, so the WebP encoding and 8-bit rounding leave the layer inside it.
MARGIN = {"L_mean": 0.5, "L_p95": 1.0, "contrast": 0.96, "sat": 0.97}


def layer_band(key: str) -> str:
    """``sky``, ``far`` or ``mid`` for a kit backdrop layer key (``kit-<area>-sky-a`` ...)."""
    parts = key.split("-")
    if len(parts) >= 4 and parts[0] == "kit" and parts[-2] in ("sky", "far", "mid"):
        return parts[-2]
    raise ValueError(f"{key!r} is not a backdrop layer key (kit-<area>-sky|far|mid-<x>)")


def layer_area(key: str) -> str:
    return "-".join(key.split("-")[1:-2])


def band_of(key: str) -> tuple[str, dict]:
    """A layer key's band name and limits: the area's own when it has them, else the park's."""
    band = layer_band(key)
    return band, AREA_BANDS.get(layer_area(key), {}).get(band, BANDS[band])


def _split(img: Image.Image) -> tuple[np.ndarray, np.ndarray]:
    """(rgb float 0..1 of shape (H, W, 3), opaque mask (H, W))."""
    if "A" in img.getbands():
        arr = np.asarray(img.convert("RGBA"))
        return arr[..., :3].astype(np.float64) / 255.0, arr[..., 3] >= OPAQUE
    arr = np.asarray(img.convert("RGB"))
    return arr.astype(np.float64) / 255.0, np.ones(arr.shape[:2], bool)


def block_contrast(L: np.ndarray, mask: np.ndarray, block: int) -> float:
    """The mean, over the grid's blocks that are at least half opaque, of the standard deviation of L
    inside the block over its opaque pixels."""
    H, W = L.shape
    by, bx = H // block, W // block
    if by == 0 or bx == 0:
        return 0.0
    Lc = L[:by * block, :bx * block].reshape(by, block, bx, block)
    Mc = mask[:by * block, :bx * block].reshape(by, block, bx, block).astype(np.float64)
    n = Mc.sum(axis=(1, 3))
    ok = n * 2 >= block * block
    if not ok.any():
        return 0.0
    s1 = (Lc * Mc).sum(axis=(1, 3))
    s2 = (Lc * Lc * Mc).sum(axis=(1, 3))
    n_ok = np.maximum(n, 1.0)
    var = s2 / n_ok - (s1 / n_ok) ** 2
    return float(np.sqrt(np.maximum(var, 0.0))[ok].mean())


def stats_of(rgb: np.ndarray, mask: np.ndarray, block: int) -> dict:
    if not mask.any():
        return {"L_mean": 0.0, "L_p95": 0.0, "contrast": 0.0, "sat": 0.0, "opaque": 0.0}
    L = srgb_to_lab(rgb)[..., 0]
    hi = rgb.max(axis=-1)
    lo = rgb.min(axis=-1)
    sat = np.where(hi > 0, (hi - lo) / np.maximum(hi, 1e-9), 0.0)
    return {
        "L_mean": round(float(L[mask].mean()), 2),
        "L_p95": round(float(np.percentile(L[mask], 95)), 2),
        "contrast": round(block_contrast(L, mask, block), 2),
        "sat": round(float(sat[mask].mean()), 3),
        "opaque": round(float(mask.mean()), 3),
    }


def block_for(width: int) -> int:
    return max(4, int(round(BLOCK * width / SCREEN_W)))


def stats(img: Image.Image) -> dict:
    """The band statistics of a layer (or any image) over its opaque pixels."""
    rgb, mask = _split(img)
    return stats_of(rgb, mask, block_for(img.width))


def measure_target(img: Image.Image) -> dict[str, dict]:
    """The three bands of a 1600 x 900 target screen, each measured as a layer would be."""
    rgb, mask = _split(img)
    H = rgb.shape[0]
    out = {}
    for name, (y0, y1) in TARGET_BANDS.items():
        r0, r1 = int(round(y0 * H)), int(round(y1 * H))
        out[name] = stats_of(rgb[r0:r1], mask[r0:r1], block_for(img.width))
    return out


def sky_colour(sky: Image.Image) -> tuple[int, int, int]:
    """The colour of the air a far or middle layer hazes toward: the median of the sky plate's lower
    half, where the backdrop layers overlap it."""
    arr = np.asarray(sky.convert("RGB"))
    low = arr[arr.shape[0] // 2:].reshape(-1, 3)
    return tuple(int(v) for v in np.median(low, axis=0))


def problems(st: dict, band: str | dict) -> list[str]:
    """Why a layer's statistics are outside its band (a name from BANDS, or the limits); empty when inside."""
    b = BANDS[band] if isinstance(band, str) else band
    lo, hi = b["L_mean"]
    out = []
    if not lo <= st["L_mean"] <= hi:
        out.append(f"L mean {st['L_mean']} outside {lo} to {hi}")
    for k, label in (("L_p95", "L p95"), ("contrast", "contrast"), ("sat", "saturation")):
        if st[k] > b[k]:
            out.append(f"{label} {st[k]} over {b[k]}")
    return out


def _gauss(arr: np.ndarray, sigma: float) -> np.ndarray:
    """A separable Gaussian blur (reflect padding) of an (H, W) or (H, W, C) array; the identity at sigma 0."""
    if sigma <= 0:
        return arr
    r = max(1, int(3 * sigma + 0.5))
    x = np.arange(-r, r + 1, dtype=np.float64)
    k = np.exp(-x * x / (2 * sigma * sigma))
    k /= k.sum()
    out = arr.astype(np.float64)
    for axis in (0, 1):
        pad = [(0, 0)] * out.ndim
        pad[axis] = (r, r)
        padded = np.pad(out, pad, mode="reflect")
        acc = np.zeros_like(out)
        n = out.shape[axis]
        for i, w in enumerate(k):
            sl = [slice(None)] * out.ndim
            sl[axis] = slice(i, i + n)
            acc += w * padded[tuple(sl)]
        out = acc
    return out


def _blur_masked(arr: np.ndarray, weight: np.ndarray | None, sigma: float) -> np.ndarray:
    """A blur of ``arr`` weighted by ``weight`` (the alpha), so clear pixels lend nothing to their neighbours."""
    if sigma <= 0:
        return arr
    if weight is None:
        return _gauss(arr, sigma)
    w = weight if arr.ndim == 2 else weight[..., None]
    num = _gauss(arr * w, sigma)
    den = _gauss(w, sigma)
    return np.where(den > 1e-4, num / np.maximum(den, 1e-4), arr)


def _to_linear(c: np.ndarray) -> np.ndarray:
    return np.where(c <= 0.04045, c / 12.92, ((c + 0.055) / 1.055) ** 2.4)


def _to_srgb(c: np.ndarray) -> np.ndarray:
    c = np.clip(c, 0.0, 1.0)
    return np.where(c <= 0.0031308, 12.92 * c, 1.055 * np.power(c, 1 / 2.4) - 0.055)


_LUMA = np.array([0.2126729, 0.7151522, 0.0721750], np.float64)
_D = 6.0 / 29.0


def _L_of_Y(Y: np.ndarray) -> np.ndarray:
    f = np.where(Y > _D ** 3, np.cbrt(np.maximum(Y, 0)), Y / (3 * _D ** 2) + 4.0 / 29.0)
    return 116.0 * f - 16.0


def _Y_of_L(L: np.ndarray) -> np.ndarray:
    f = (L + 16.0) / 116.0
    return np.where(f > _D, f ** 3, 3 * _D ** 2 * (f - 4.0 / 29.0))


def grade_to_band(img: Image.Image, band: str, sky_rgb: tuple[int, int, int] | None = None, haze: float | None = None, blur: float | None = None, limits: dict | None = None) -> tuple[Image.Image, dict]:
    """Pull a layer into its band (``limits``, else ``BANDS[band]``). Returns (image in the input's mode, the parameters applied):
    ``haze`` and ``blur`` (far and middle layers), ``L_gain`` and ``L_shift`` (the linear remap of L,
    gain at most 1), ``soft`` (the blend toward a blurred copy) and ``contrast_gain`` (under 1 when
    the contrast was still over its ceiling), ``chroma`` (the chroma scale), and the statistics before
    and after. Every change of lightness is applied as a scale of the pixel's linear light, so its hue
    is kept and nothing leaves the gamut; the chroma scale pulls the linear colour toward its own
    luminance, so the lightness it leaves is exact. The same input and parameters give byte-identical
    output; the alpha is untouched."""
    mode = img.mode
    has_alpha = "A" in img.getbands()
    src = img.convert("RGBA" if has_alpha else "RGB")
    arr = np.asarray(src)
    rgb = arr[..., :3].astype(np.float64) / 255.0
    alpha = arr[..., 3].astype(np.float64) / 255.0 if has_alpha else None
    mask = arr[..., 3] >= OPAQUE if has_alpha else np.ones(rgb.shape[:2], bool)
    block = block_for(img.width)
    before = stats_of(rgb, mask, block)
    b = limits or BANDS[band]
    params: dict = {"band": band}
    scale = img.width / SCREEN_W

    # 1. Soften (far, mid): a little blur at screen scale and a haze toward the sky colour.
    soften = SOFTEN.get(band, {})
    haze = soften.get("haze", 0.0) if haze is None else haze
    blur = soften.get("blur", 0.0) if blur is None else blur
    if blur > 0:
        rgb = _blur_masked(rgb, alpha, blur * scale)
        params["blur"] = blur
    if haze > 0 and sky_rgb is not None:
        sky = np.array(sky_rgb, np.float64) / 255.0
        rgb = rgb + haze * (sky - rgb)
        params["haze"] = haze
        params["sky"] = "#%02X%02X%02X" % tuple(sky_rgb)

    # 2. Lightness: L' = gain * L + shift, so the mean lands in the band and the p95 under its ceiling.
    lin = _to_linear(rgb)
    Y = lin @ _LUMA
    L = _L_of_Y(Y)
    mean = float(L[mask].mean()) if mask.any() else 0.0
    p95 = float(np.percentile(L[mask], 95)) if mask.any() else 0.0
    lo, hi = b["L_mean"][0] + MARGIN["L_mean"], b["L_mean"][1] - MARGIN["L_mean"]
    t_mean = min(max(mean, lo), hi)
    t_p95 = min(p95, b["L_p95"] - MARGIN["L_p95"])
    gain, shift = 1.0, 0.0
    if mean > hi or p95 > t_p95:
        # Darken through black: a gain alone keeps the darks where they are and clips nothing.
        gain = min(1.0, t_mean / mean if mean > 1e-6 else 1.0, t_p95 / p95 if p95 > 1e-6 else 1.0)
        if gain * mean < lo:
            # The p95 ceiling would drag the mean under the band: pair a gain with a shift instead.
            gain = max(0.4, min(1.0, (t_p95 - t_mean) / (p95 - mean))) if p95 - mean > 1e-6 else 1.0
            shift = t_mean - gain * mean
    elif mean < lo:
        shift = t_mean - mean
    if abs(shift) > 1e-9:
        # Clipping at 0 and 100 moves the mean, so the shift that lands it is found by bisection.
        a, c = -100.0, 100.0
        for _ in range(40):
            shift = 0.5 * (a + c)
            got = float(np.clip(gain * L + shift, 0.0, 100.0)[mask].mean())
            if got < t_mean:
                a = shift
            else:
                c = shift
        shift = 0.5 * (a + c)
    if abs(gain - 1.0) > 1e-9 or abs(shift) > 1e-9:
        L = np.clip(gain * L + shift, 0.0, 100.0)
        params["L_gain"] = round(gain, 4)
        params["L_shift"] = round(shift, 3)

    # 3. Contrast: a blend toward a blurred copy of L, then a gain under 1 about the mean.
    c = block_contrast(L, mask, block)
    c_max = b["contrast"] * MARGIN["contrast"]
    if c > c_max:
        soft = min(0.5, 1.0 - c_max / c)
        if soft > 0:
            L = L + soft * (_blur_masked(L, alpha, 1.5 * scale) - L)
            params["soft"] = round(soft, 4)
            c = block_contrast(L, mask, block)
        if c > c_max:
            g = c_max / c
            m = float(L[mask].mean())
            L = m + g * (L - m)
            params["contrast_gain"] = round(g, 4)
    L = np.clip(L, 0.0, 100.0)
    ratio = np.where(Y > 1e-6, _Y_of_L(L) / np.maximum(Y, 1e-6), 0.0)
    lin = np.clip(lin * ratio[..., None], 0.0, 1.0)

    # 4. Saturation: the linear colour pulled toward its own luminance, measured back as HSV saturation.
    chroma = 1.0
    s_max = b["sat"] * MARGIN["sat"]
    for _ in range(3):
        s = stats_of(_to_srgb(lin), mask, block)["sat"]
        if s <= s_max:
            break
        k = max(0.3, s_max / s)
        Yn = (lin @ _LUMA)[..., None]
        lin = Yn + k * (lin - Yn)
        chroma *= k
    if chroma < 1.0:
        params["chroma"] = round(chroma, 4)

    out_rgb = np.round(np.clip(_to_srgb(lin), 0, 1) * 255).astype(np.uint8)
    after = stats_of(out_rgb.astype(np.float64) / 255.0, mask, block)
    params["before"] = before
    params["after"] = after
    if has_alpha:
        out = np.dstack([out_rgb, arr[..., 3]])
        out[arr[..., 3] == 0, :3] = arr[arr[..., 3] == 0, :3]
        res = Image.fromarray(out, "RGBA")
    else:
        res = Image.fromarray(out_rgb, "RGB")
    return (res.convert(mode) if res.mode != mode else res), params


def tools_line(params: dict) -> str:
    """The provenance ``tools`` entry: ``bands: <band> haze=.. blur=.. L=gain,shift soft=.. gain=.. chroma=..``."""
    bits = [f"bands: {params['band']}"]
    if "blur" in params:
        bits.append(f"blur={params['blur']}")
    if "haze" in params:
        bits.append(f"haze={params['haze']}->{params['sky']}")
    if "L_gain" in params:
        bits.append(f"L={params['L_gain']}x{params['L_shift']:+}")
    if "soft" in params:
        bits.append(f"soft={params['soft']}")
    if "contrast_gain" in params:
        bits.append(f"gain={params['contrast_gain']}")
    if "chroma" in params:
        bits.append(f"chroma={params['chroma']}")
    a = params["after"]
    bits.append(f"L {params['before']['L_mean']}->{a['L_mean']} p95 {params['before']['L_p95']}->{a['L_p95']} contrast {params['before']['contrast']}->{a['contrast']} sat {params['before']['sat']}->{a['sat']}")
    return " ".join(bits)
