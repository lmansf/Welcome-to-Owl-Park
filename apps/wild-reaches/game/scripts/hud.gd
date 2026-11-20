extends CanvasLayer
## What the owl carries, drawn over the park: glass panes for health, feathers and relics found,
## the name of each realm as it is entered, hints, and touch buttons on a phone.

const PANES := [Color("a3202f"), Color("e6a530"), Color("1e6b4c"), Color("1f4a9c"), Color("cdb0ff")]

var touch: Dictionary
var panes: Array = []
var counts: Label
var banner_label: Label
var toast_label: Label
var title: Control
var banner_t := 0.0
var toast_t := 0.0
var totals := {}


func _label(size: int, color: Color) -> Label:
	var l := Label.new()
	l.add_theme_font_size_override("font_size", size)
	l.add_theme_color_override("font_color", color)
	l.add_theme_color_override("font_shadow_color", Color(0.02, 0.05, 0.12, 0.9))
	l.add_theme_constant_override("shadow_offset_x", 2)
	l.add_theme_constant_override("shadow_offset_y", 2)
	l.mouse_filter = Control.MOUSE_FILTER_IGNORE
	return l


func setup(world: Dictionary, _sim) -> void:
	totals = {"feather": world["feathers"].size(), "bell": 0}
	for r in world["relics"]:
		if totals.has(r["kind"]):
			totals[r["kind"]] += 1
	var root := Control.new()
	root.set_anchors_preset(Control.PRESET_FULL_RECT)
	root.mouse_filter = Control.MOUSE_FILTER_IGNORE
	add_child(root)
	for i in PANES.size():
		var pane := Polygon2D.new()
		pane.polygon = PackedVector2Array([Vector2(0, -15), Vector2(11, 0), Vector2(0, 15), Vector2(-11, 0)])
		pane.position = Vector2(34 + i * 28, 36)
		pane.color = PANES[i]
		root.add_child(pane)
		var lead := Line2D.new()
		lead.points = PackedVector2Array([Vector2(0, -15), Vector2(11, 0), Vector2(0, 15), Vector2(-11, 0), Vector2(0, -15)])
		lead.width = 2.5
		lead.default_color = Color("2a3b63")
		pane.add_child(lead)
		panes.append(pane)
	counts = _label(18, Color("f6f1e3"))
	counts.position = Vector2(22, 60)
	root.add_child(counts)
	banner_label = _label(40, Color("ffd36a"))
	banner_label.set_anchors_preset(Control.PRESET_CENTER_TOP)
	banner_label.horizontal_alignment = HORIZONTAL_ALIGNMENT_CENTER
	banner_label.grow_horizontal = Control.GROW_DIRECTION_BOTH
	banner_label.position.y = 90
	banner_label.modulate.a = 0.0
	root.add_child(banner_label)
	toast_label = _label(22, Color("f6f1e3"))
	toast_label.set_anchors_preset(Control.PRESET_CENTER_BOTTOM)
	toast_label.horizontal_alignment = HORIZONTAL_ALIGNMENT_CENTER
	toast_label.grow_horizontal = Control.GROW_DIRECTION_BOTH
	toast_label.grow_vertical = Control.GROW_DIRECTION_BEGIN
	toast_label.position.y -= 150
	toast_label.modulate.a = 0.0
	root.add_child(toast_label)

	title = Control.new()
	title.set_anchors_preset(Control.PRESET_FULL_RECT)
	title.mouse_filter = Control.MOUSE_FILTER_IGNORE
	root.add_child(title)
	var name_l := _label(64, Color("ffd36a"))
	name_l.text = "The Wild Reaches"
	name_l.set_anchors_preset(Control.PRESET_CENTER)
	name_l.grow_horizontal = Control.GROW_DIRECTION_BOTH
	name_l.horizontal_alignment = HORIZONTAL_ALIGNMENT_CENTER
	name_l.position.y -= 190
	title.add_child(name_l)
	var sub := _label(22, Color("f6f1e3"))
	sub.text = "An Owl Park story\n\nArrows or WASD to walk  ·  Space to jump  ·  Shift to dash  ·  Down to dive\nThe sunwell has gone dark. Cross the reaches, learn the guardians' moves, ring three bells.\n\nPress jump to begin"
	sub.set_anchors_preset(Control.PRESET_CENTER)
	sub.grow_horizontal = Control.GROW_DIRECTION_BOTH
	sub.horizontal_alignment = HORIZONTAL_ALIGNMENT_CENTER
	sub.position.y -= 95
	title.add_child(sub)
	if DisplayServer.is_touchscreen_available():
		_touch_buttons(root)


func _touch_buttons(root: Control) -> void:
	var size := get_viewport().get_visible_rect().size
	var spots := {
		"left": Vector2(90, size.y - 110), "right": Vector2(230, size.y - 110), "down": Vector2(160, size.y - 40),
		"jump": Vector2(size.x - 110, size.y - 110), "dash": Vector2(size.x - 250, size.y - 70),
	}
	for key in spots:
		var b := TouchScreenButton.new()
		var shape := CircleShape2D.new()
		shape.radius = 62
		b.shape = shape
		b.position = spots[key]
		b.pressed.connect(func(): touch[key] = true)
		b.released.connect(func(): touch[key] = false)
		root.add_child(b)
		var ring := Line2D.new()
		var pts := PackedVector2Array()
		for i in 33:
			pts.append(Vector2(cos(i * TAU / 32), sin(i * TAU / 32)) * 54)
		ring.points = pts
		ring.width = 3
		ring.default_color = Color(0.96, 0.94, 0.89, 0.35)
		b.add_child(ring)
		var l := _label(18, Color(0.96, 0.94, 0.89, 0.6))
		l.text = key
		l.position = Vector2(-22, -12)
		b.add_child(l)


func begin() -> void:
	var tw := create_tween()
	tw.tween_property(title, "modulate:a", 0.0, 0.8)


func banner(text: String) -> void:
	banner_label.text = text
	banner_t = 4.0


func toast(text: String, seconds: float) -> void:
	if text == "":
		return
	toast_label.text = text
	toast_t = seconds


func refresh(sim, delta: float) -> void:
	for i in panes.size():
		var on: bool = i < int(sim.p["panes"])
		panes[i].modulate = Color(1, 1, 1, 1.0 if on else 0.18)
	var n := {"feather": 0, "bell": 0}
	for id in sim.got:
		for k in n:
			if String(id).begins_with(k):
				n[k] += 1
	var moves := []
	for a in sim.have:
		if sim.have[a]:
			moves.append(a)
	counts.text = "Feathers %d/%d    Bells %d/%d\n%s" % [n["feather"], totals["feather"], n["bell"], totals["bell"], "  ".join(moves)]
	banner_t = maxf(banner_t - delta, 0.0)
	banner_label.modulate.a = lerpf(banner_label.modulate.a, 1.0 if banner_t > 1.0 else 0.0, 1 - exp(-3 * delta))
	toast_t = maxf(toast_t - delta, 0.0)
	toast_label.modulate.a = lerpf(toast_label.modulate.a, 1.0 if toast_t > 0.0 else 0.0, 1 - exp(-4 * delta))
