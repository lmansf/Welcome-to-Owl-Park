"""Every module in this folder registers its assets when imported."""
import importlib
import pkgutil
import traceback

BROKEN = []
for _m in sorted(m.name for m in pkgutil.iter_modules(__path__)):
    try:
        importlib.import_module(f"{__name__}.{_m}")
    except Exception:  # a pack that fails to load is reported by the build, not swallowed
        BROKEN.append((_m, traceback.format_exc()))
