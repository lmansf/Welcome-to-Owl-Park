"""The reaches' colours, registered before any pack sculpts with them. Hex, then emission.

Daylight, not night: warm sun on the tops, cool sky in the shadows. Each reach keeps two or three
accents over the shared earths, barks and mosses (README.md, Art).
"""
from ..vox import register_colour

for _name, _hex, _emit in (
    # the golden grove and the mistfalls
    ("gold_leaf", "#E9A632", 0), ("gold_leaf_light", "#F7CF62", 0.2), ("gold_leaf_dark", "#B8701E", 0),
    ("moss_bright", "#8DBA4E", 0), ("moss_green", "#5E8C3A", 0), ("fern", "#4E8046", 0),
    ("earth_warm", "#6B4A2E", 0), ("bark_warm", "#4E3220", 0), ("flower_pink", "#F29BB5", 0.3),
    ("crystal_green", "#7CFFB0", 3.0), ("wet_stone", "#5E7676", 0), ("wet_stone_dark", "#364A4E", 0),
    ("mist", "#D7ECEC", 0.4), ("falls_white", "#EAF6FA", 1.2), ("falls_blue", "#8FD0E8", 0.8),
    # the ember deep
    ("basalt", "#2A2224", 0), ("basalt_light", "#4C3D3A", 0), ("ash", "#6E625C", 0),
    ("ember_orange", "#E2541C", 1.0), ("lava_glow", "#FF7A1E", 5.0), ("lava_core", "#FFD25A", 6.0),
    # the frostfall peaks
    ("ice", "#A6D8F0", 0.2), ("ice_deep", "#5A8EBF", 0), ("ice_glow", "#A8EEFF", 2.5),
    ("frost_stone", "#7A88A0", 0), ("frost_stone_dark", "#4A556E", 0),
    # the canyon and the colonnades
    ("sandstone", "#D29A5E", 0), ("sand_light", "#EFCB8C", 0), ("sand_dark", "#A26A3A", 0),
    ("rust", "#8C4A26", 0), ("dry_grass", "#C8A55A", 0), ("temple_stone", "#CDB08A", 0),
    ("temple_dark", "#86684C", 0), ("root_brown", "#5C3A24", 0), ("amber_glow", "#FFB54A", 4.0),
    # the gloamglow caves and the sunken sea
    ("cave_blue", "#2A4E78", 0), ("cave_teal", "#3C7A86", 0), ("cave_deep", "#152A46", 0),
    ("crystal_cyan", "#56DCFF", 3.5), ("mushroom_cyan", "#6AF0FF", 3.0),
    ("coral_stone", "#3E6E8A", 0), ("sea_deep", "#1C3A5A", 0), ("sea_sand", "#C9BC8E", 0),
    ("coral_pink", "#FF7E9C", 0.5), ("coral_orange", "#FF9C5A", 0.4), ("sea_glow", "#5FFFE0", 3.0),
    ("kelp", "#2E7A5A", 0), ("kelp_light", "#4FA071", 0),
    # the sky ruins
    ("marble", "#EDE6D6", 0), ("marble_shadow", "#B9B2A6", 0), ("sky_blue", "#9CCBF0", 0.3),
    ("sun_glow", "#FFE9A8", 5.0),
):
    register_colour(_name, _hex, emission=_emit)
