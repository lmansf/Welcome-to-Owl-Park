extends Node3D
## Owl Park: The Night Tree. Builds the park from world.json and library.glb, runs the rules
## (sim.gd) at a fixed 120 steps a second, and dresses what they say: the owl, the camera, the
## moving parts, the light, the sounds and the HUD.
##
## Blender's axes (x right, y away, z up) become Godot's (x right, y up, z toward the camera).

const SimC = preload("res://scripts/sim.gd")
const Hud = preload("res://scripts/hud.gd")
const Sfx = preload("res://scripts/sfx.gd")
const Fx = preload("res://scripts/fx.gd")
const CHUNK := 48.0
const SAVE := "user://night-tree.json"

## What each realm's air looks like: background, fog, ambient light, moonlight.
const MOODS := {
	"tree": [Color("0a1830"), Color("16305a"), 0.006, Color("3a527e"), Color("9db8ff"), 1.5],
	"hollow": [Color("120d0a"), Color("3a2414"), 0.012, Color("6a4a30"), Color("ffcf8a"), 1.0],
	"clearing": [Color("0e1c34"), Color("2a4468"), 0.007, Color("4a5e80"), Color("ffd9a0"), 1.45],
	"neon": [Color("0b0b18"), Color("2a1a52"), 0.008, Color("4a3f86"), Color("b6a8ff"), 1.1],
	"circuit": [Color("05050c"), Color("120f2a"), 0.016, Color("2c2a52"), Color("8090ff"), 0.65],
	"ink": [Color("1a2030"), Color("5a6276"), 0.012, Color("7a8090"), Color("e8ecf6"), 1.55],
	"glass": [Color("0c1a38"), Color("27407a"), 0.006, Color("4c5c92"), Color("b8d0ff"), 1.5],
	"tower": [Color("0a1430"), Color("2a3a7a"), 0.009, Color("56609a"), Color("c8d8ff"), 1.35],
	"canopy": [Color("0a1a2a"), Color("1c4048"), 0.007, Color("3e6462"), Color("c4e6d4"), 1.55],
	"roots": [Color("060b16"), Color("12243a"), 0.014, Color("3c5068"), Color("8fd8e0"), 1.05],
}
## Props that shed light: asset -> [height of the flame, colour].
const LAMPS := {
	"lantern-post": [2.6, Color("ffcf7a")], "lantern-hang": [-0.9, Color("ffcf7a")], "bench": [2.3, Color("ffcf7a")],
	"street-lamp": [3.6, Color("ff5ac0")], "glass-lamp": [2.6, Color("9fd0ff")], "glass-lamp-hang": [-0.9, Color("ffb860")],
	"paper-lantern": [1.0, Color("fff0d0")], "paper-lantern-hang": [-0.6, Color("fff0d0")], "stone-lantern": [1.4, Color("ffd9a0")],
	"acorn-lamp": [-0.7, Color("ffcf7a")], "shrine": [1.5, Color("f6f1e3")], "lantern-ring": [0.5, Color("ffb860")],
	"crown-shrine": [3.0, Color("ffd36a")], "finish-shrine": [2.4, Color("ffd9a0")], "treehouse": [4.0, Color("f2b24a")],
	"ticket-booth": [2.0, Color("ffcf7a")], "feather-shop": [2.4, Color("ff7ad0")], "crystal-cluster": [0.6, Color("9ad8ff")],
	"glowworms": [-1.0, Color("7cffc8")], "vending-machine": [1.2, Color("00e5ff")], "neon-arch": [3.0, Color("ff2aa1")],
}
const HINTS := {
	"flap": "Flap: jump again in the air",
	"dash": "Dash: Shift or X, on the ground or in the air",
	"glide": "Glide: hold jump while falling. Rising air will carry you",
	"kick": "Wall kick: jump while touching a wall",
}

var world: Dictionary
var tuning: Dictionary
var sim
var lib := {}
var parts_cache := {}
var paint: ShaderMaterial
var layers := {}
var owl: Node3D
var owl_rig: Node3D
var wing_l: Node3D
var wing_r: Node3D
var ents: Array = []
var camera: Camera3D
var env: Environment
var moon: DirectionalLight3D
var owl_light: OmniLight3D
var lamp_spots: Array = []
var lamp_lights: Array = []
var lamp_timer := 0.0
var hud
var sfx
var fx
var acc := 0.0
var mood := "tree"
var mood_now: Array = []
var flap_t := 0.0
var squash := 0.0
var yaw := 1.0
var started := false
var demo := false
var last_zone := ""
var clock := 0.0
var missing := {}
var touch := {"left": false, "right": false, "down": false, "jump": false, "dash": false}


func _ready() -> void:
	_actions()
	world = JSON.parse_string(FileAccess.get_file_as_string("res://world/world.json"))
	tuning = JSON.parse_string(FileAccess.get_file_as_string("res://world/tuning.json"))
	paint = ShaderMaterial.new()
	paint.shader = load("res://shaders/paint.gdshader")
	# the value plan (ART-BIBLE 2): the same paint, held back for what is not the subject of the picture
	for spec in [["fill", 0.62, 0.3, 0.25, 0.06], ["wall", 0.55, 0.35, 0.3, 0.05], ["far", 0.9, 0.6, 0.1, 0.0]]:
		var m: ShaderMaterial = paint.duplicate()
		m.set_shader_parameter("tint", Color(spec[1], spec[1], spec[1]))
		m.set_shader_parameter("fade", spec[2])
		m.set_shader_parameter("mute", spec[3])
		m.set_shader_parameter("rim_strength", spec[4])
		layers[spec[0]] = m
	_library()
	_air()
	_decor()
	_entities()
	_owl()
	sim = SimC.new(world, tuning, [])
	sfx = Sfx.new()
	add_child(sfx)
	fx = Fx.new()
	add_child(fx)
	fx.halos_for(lamp_spots)
	fx.air_for(world)
	_vignette()
	hud = Hud.new()
	hud.touch = touch
	add_child(hud)
	_load_game()
	_query()
	hud.setup(world, sim)
	if started:
		hud.begin()
	if not missing.is_empty():
		print("missing assets: ", missing)
	_dress(0.0)


func _actions() -> void:
	var keys := {
		"left": [KEY_LEFT, KEY_A], "right": [KEY_RIGHT, KEY_D], "up": [KEY_UP, KEY_W], "down": [KEY_DOWN, KEY_S],
		"jump": [KEY_SPACE, KEY_Z, KEY_K], "dash": [KEY_SHIFT, KEY_X, KEY_L], "new_night": [KEY_F8],
	}
	var pads := {"left": JOY_BUTTON_DPAD_LEFT, "right": JOY_BUTTON_DPAD_RIGHT, "down": JOY_BUTTON_DPAD_DOWN, "jump": JOY_BUTTON_A, "dash": JOY_BUTTON_X}
	for a in keys:
		if not InputMap.has_action(a):
			InputMap.add_action(a, 0.4)
		for k in keys[a]:
			var e := InputEventKey.new()
			e.physical_keycode = k
			InputMap.action_add_event(a, e)
		if pads.has(a):
			var b := InputEventJoypadButton.new()
			b.button_index = pads[a]
			InputMap.action_add_event(a, b)
	for pair in [["left", JOY_AXIS_LEFT_X, -1.0], ["right", JOY_AXIS_LEFT_X, 1.0], ["down", JOY_AXIS_LEFT_Y, 1.0]]:
		var m := InputEventJoypadMotion.new()
		m.axis = pair[1]
		m.axis_value = pair[2]
		InputMap.action_add_event(pair[0], m)


# ---- the library and what is built from it ----

func _library() -> void:
	var scene: PackedScene = load("res://world/library.glb")
	var root := scene.instantiate()
	for child in root.get_children():
		lib[String(child.name)] = child
	for mi in root.find_children("*", "MeshInstance3D", true, false):
		var mesh: Mesh = mi.mesh
		for i in mesh.get_surface_count():
			var m := mesh.surface_get_material(i)
			if m == null or m.resource_name == "nt_paint" or m.resource_name == "":
				mesh.surface_set_material(i, paint)
	# the templates stay out of the tree; they are only copied from
	for child in root.get_children():
		root.remove_child(child)
	root.free()


func _place(pv: Array, r: float, s: Array) -> Transform3D:
	var b := Basis(Vector3.UP, deg_to_rad(r)) * Basis.from_scale(Vector3(s[0], s[2], s[1]))
	return Transform3D(b, Vector3(pv[0], pv[2], -pv[1]))


func _parts(asset: String) -> Array:
	if parts_cache.has(asset):
		return parts_cache[asset]
	var out := []
	var t: Node3D = lib.get(asset)
	if t != null:
		var todo := [[t, t.transform]]
		while not todo.is_empty():
			var item: Array = todo.pop_back()
			var n: Node3D = item[0]
			if n is MeshInstance3D:
				out.append([n.mesh, item[1]])
			for c in n.get_children():
				if c is Node3D:
					todo.append([c, item[1] * c.transform])
	parts_cache[asset] = out
	return out


func _decor() -> void:
	var groups := {}
	for d in world["decor"]:
		var asset: String = d["a"]
		var parts := _parts(asset)
		if parts.is_empty():
			missing[asset] = int(missing.get(asset, 0)) + 1
			continue
		var x := _place(d["p"], d["r"], d["s"])
		var key := "%d|%d" % [floori(x.origin.x / CHUNK), floori(x.origin.y / CHUNK)]
		for i in parts.size():
			var k := "%s|%d|%s" % [asset, i, key]
			if not groups.has(k):
				groups[k] = [parts[i][0], []]
			groups[k][1].append(x * parts[i][1])
		if LAMPS.has(asset):
			var lamp: Array = LAMPS[asset]
			lamp_spots.append([x.origin + Vector3(0, lamp[0], 0.6), lamp[1]])
	var holder := Node3D.new()
	holder.name = "Decor"
	add_child(holder)
	for k in groups:
		var mm := MultiMesh.new()
		mm.transform_format = MultiMesh.TRANSFORM_3D
		mm.mesh = groups[k][0]
		var xs: Array = groups[k][1]
		mm.instance_count = xs.size()
		for i in xs.size():
			mm.set_instance_transform(i, xs[i])
		var mi := MultiMeshInstance3D.new()
		mi.multimesh = mm
		var layer := _layer(k.get_slice("|", 0), (xs[0] as Transform3D).origin.z)
		if layer != "" and mm.mesh.get_surface_count() == 1:
			mi.material_override = layers[layer]
		holder.add_child(mi)


## Which part of the picture an asset belongs to: the mass under the ground, the wall behind the
## path, the far scenery, or (the default) the things the eye should go to.
func _layer(asset: String, z: float) -> String:
	if asset.begins_with("fill-"):
		return "fill"
	if asset.ends_with("-wall") or asset.ends_with("-wall-b") or asset.begins_with("facade"):
		return "wall"
	if z <= -9.0 and not (asset.begins_with("star") or asset.begins_with("moon") or asset == "shooting-star"):
		return "far"
	return ""


func _copy(asset: String) -> Node3D:
	var t: Node3D = lib.get(asset)
	if t == null:
		missing[asset] = int(missing.get(asset, 0)) + 1
		return null
	return t.duplicate()


func _entities() -> void:
	var holder := Node3D.new()
	holder.name = "Entities"
	add_child(holder)
	var lookup := {}
	for kind in ["updrafts", "frail", "circuits", "bridges", "moths", "swings", "feathers", "relics", "doors"]:
		for o in world[kind]:
			lookup[o["id"]] = o
	for e in world["entities"]:
		var n := _copy(e["a"])
		if n == null:
			continue
		var x := _place(e["p"], e["r"], e["s"])
		n.transform = x * n.transform
		holder.add_child(n)
		ents.append({"kind": e["kind"], "ref": e["ref"], "node": n, "data": lookup.get(e["ref"], {}), "base": n.transform, "seed": float(ents.size()) * 1.7})


func _owl() -> void:
	owl = Node3D.new()
	owl.name = "Owl"
	add_child(owl)
	owl_rig = Node3D.new()
	owl.add_child(owl_rig)
	var body := _copy("owl-great-horned")
	if body != null:
		body.scale *= 1.3
		owl_rig.add_child(body)
		# the hero carries a little light of its own, so it reads against any wall
		var own := paint.duplicate()
		own.set_shader_parameter("self_light", 0.22)
		for mi in body.find_children("*", "MeshInstance3D", true, false):
			mi.material_override = own
		wing_l = body.get_node_or_null("owl-great-horned_wingL")
		wing_r = body.get_node_or_null("owl-great-horned_wingR")
	owl_light = OmniLight3D.new()
	owl_light.light_color = Color("ffd9a0")
	owl_light.light_energy = 2.0
	owl_light.omni_range = 9.0
	owl_light.omni_attenuation = 1.4
	owl_light.position = Vector3(0, 1.2, 1.8)
	owl.add_child(owl_light)


func _air() -> void:
	env = Environment.new()
	env.background_mode = Environment.BG_COLOR
	env.ambient_light_source = Environment.AMBIENT_SOURCE_COLOR
	env.ambient_light_energy = 1.9
	env.fog_enabled = true
	env.fog_mode = Environment.FOG_MODE_DEPTH  # the path stays clear; what lies behind it fades into the night
	env.fog_depth_begin = 26.0
	env.fog_depth_end = 150.0
	env.fog_depth_curve = 0.55
	env.fog_sky_affect = 0.0
	env.glow_enabled = true
	env.glow_intensity = 0.9
	env.glow_bloom = 0.12
	env.glow_hdr_threshold = 0.95
	env.tonemap_mode = Environment.TONE_MAPPER_FILMIC
	env.tonemap_exposure = 1.45
	var we := WorldEnvironment.new()
	we.environment = env
	add_child(we)
	moon = DirectionalLight3D.new()
	moon.rotation_degrees = Vector3(-52, 28, 0)
	add_child(moon)
	var fill := DirectionalLight3D.new()
	fill.rotation_degrees = Vector3(-12, -38, 0)
	fill.light_color = Color("ffd0a0")
	fill.light_energy = 0.5
	add_child(fill)
	camera = Camera3D.new()
	camera.fov = tuning["camera"]["fov"]
	camera.far = 420.0
	camera.near = 0.5
	add_child(camera)
	camera.make_current()
	for i in 6:
		var l := OmniLight3D.new()
		l.omni_range = 11.0
		l.omni_attenuation = 1.3
		l.light_energy = 0.0
		add_child(l)
		lamp_lights.append(l)
	mood_now = MOODS["tree"].duplicate()
	_apply_mood()


func _vignette() -> void:
	## The corners fall away into the night, so the eye stays with the owl.
	var layer := CanvasLayer.new()
	layer.layer = 0
	var rect := ColorRect.new()
	rect.set_anchors_preset(Control.PRESET_FULL_RECT)
	rect.mouse_filter = Control.MOUSE_FILTER_IGNORE
	var sh := Shader.new()
	sh.code = "shader_type canvas_item;\nvoid fragment() {\n\tvec2 d = (UV - vec2(0.5)) * vec2(1.0, 0.86);\n\tCOLOR = vec4(0.01, 0.02, 0.06, smoothstep(0.34, 0.86, length(d)) * 0.6);\n}\n"
	var m := ShaderMaterial.new()
	m.shader = sh
	rect.material = m
	layer.add_child(rect)
	add_child(layer)


func _apply_mood() -> void:
	env.background_color = mood_now[0]
	env.fog_light_color = mood_now[1]
	env.fog_density = clampf(mood_now[2] * 110.0, 0.0, 1.0)
	env.ambient_light_color = mood_now[3]
	moon.light_color = mood_now[4]
	moon.light_energy = mood_now[5]


# ---- saving, and starting somewhere else for tests ----

func _load_game() -> void:
	if not FileAccess.file_exists(SAVE):
		return
	var data = JSON.parse_string(FileAccess.get_file_as_string(SAVE))
	if typeof(data) != TYPE_DICTIONARY:
		return
	for a in data.get("have", []):
		if sim.have.has(a):
			sim.have[a] = true
	for id in data.get("got", []):
		sim.got[id] = true
	for id in data.get("open", []):
		sim.open[id] = true
	for b in world["benches"]:
		if b["id"] == data.get("bench", ""):
			_teleport(b["x"], b["z"])
			sim.p["bench"] = b["id"]
			sim.p["benchX"] = b["x"]
			sim.p["benchZ"] = b["z"]


func _save_game() -> void:
	var have := []
	for a in sim.have:
		if sim.have[a]:
			have.append(a)
	var f := FileAccess.open(SAVE, FileAccess.WRITE)
	if f != null:
		f.store_string(JSON.stringify({"have": have, "got": sim.got.keys(), "open": sim.open.keys(), "bench": sim.p["bench"]}))


func _teleport(x: float, z: float) -> void:
	sim.p["x"] = x
	sim.p["z"] = z
	sim.p["safeX"] = x
	sim.p["safeZ"] = z
	sim.cam["x"] = x
	sim.cam["z"] = z + tuning["camera"]["rise"]
	sim.cam["baseZ"] = z
	sim.lkey = null


func _query() -> void:
	## On the web, ?x=..&z=..&have=flap,dash&demo=1 starts the owl elsewhere (for screenshots and tests).
	if not OS.has_feature("web"):
		return
	var q = JavaScriptBridge.eval("window.location.search", true)
	if typeof(q) != TYPE_STRING or q == "":
		return
	var args := {}
	for pair in q.trim_prefix("?").split("&"):
		var kv: PackedStringArray = pair.split("=")
		if kv.size() == 2:
			args[kv[0]] = kv[1]
	if args.has("have"):
		for a in args["have"].split(","):
			if a == "all":
				for k in sim.have:
					sim.have[k] = true
			elif sim.have.has(a):
				sim.have[a] = true
	if args.has("x") and args.has("z"):
		_teleport(float(args["x"]), float(args["z"]))
		sim.p["benchX"] = float(args["x"])
		sim.p["benchZ"] = float(args["z"])
	demo = args.has("demo")
	if args.has("hide"):  # for finding out what draws something: ?hide=fx, hud, halos, ambient, owl
		var what: String = args["hide"]
		fx.visible = what != "fx"
		hud.visible = what != "hud"
		owl.visible = what != "owl"
		if what == "halos" and fx.halos != null:
			fx.halos.visible = false
		if what == "ambient":
			for m in fx.ambient:
				for e in fx.ambient[m]:
					e.amount = 1
					e.scale_amount_max = 0.01
					e.scale_amount_min = 0.01
	if args.has("x") or demo:
		started = true


# ---- the loop ----

func _input_now() -> Dictionary:
	var inp := {
		"left": Input.is_action_pressed("left") or touch["left"], "right": Input.is_action_pressed("right") or touch["right"],
		"up": Input.is_action_pressed("up"), "down": Input.is_action_pressed("down") or touch["down"],
		"jump": Input.is_action_pressed("jump") or Input.is_action_pressed("up") or touch["jump"], "dash": Input.is_action_pressed("dash") or touch["dash"],
	}
	if demo:
		inp["right"] = true
		inp["jump"] = fmod(clock, 1.4) < 0.5
	return inp


func _process(delta: float) -> void:
	clock += delta
	var inp := _input_now()
	if not started:
		if inp["jump"] or inp["left"] or inp["right"] or inp["dash"]:
			started = true
			hud.begin()
		inp = SimC.no_input()
	if Input.is_action_just_pressed("new_night"):
		DirAccess.remove_absolute(ProjectSettings.globalize_path(SAVE))
		get_tree().reload_current_scene()
		return
	acc = minf(acc + delta, 0.1)
	while acc >= sim.dt:
		acc -= sim.dt
		sim.step(inp)
		for e in sim.events:
			_event(e)
	_dress(delta)


func _event(e: String) -> void:
	var kind := e.get_slice(":", 0)
	sfx.play(kind)
	var feet := Vector3(sim.p["x"], sim.p["z"] + 0.1, 0.3)
	if clock < 1.0:
		return  # waking on a bench is not an arrival: no sparkle on the first frame
	if kind in ["jump", "land", "kick", "door", "paint", "crack"]:
		fx.burst(kind, feet, sim.p["face"])
	else:
		fx.burst(kind, feet + Vector3(0, 0.55, 0), sim.p["face"])
	if e == "jump" or e == "flap" or e == "kick" or e == "pogo":
		flap_t = 0.32
		squash = 0.25
	elif e == "land":
		squash = -0.3
	elif e.begins_with("grant:"):
		hud.toast(HINTS.get(e.get_slice(":", 1), ""), 7.0)
		_save_game()
	elif e == "bench" or e.begins_with("relic") or e == "door":
		_save_game()
		if e == "bench":
			hud.toast("Rested. The night is saved here.", 2.5)
	elif e == "won":
		hud.toast("Three bells ring, and the crown lantern wakes. The park is whole again.", 12.0)
		_save_game()
	elif e == "faint":
		hud.toast("Back to the last bench. Nothing is lost but time.", 3.0)


func _dress(delta: float) -> void:
	var p: Dictionary = sim.p
	var c: Dictionary = sim.cam
	# the owl
	owl.position = Vector3(p["x"], p["z"], 0)
	var want_yaw: float = float(p["face"]) * (0.25 if p["clinging"] else 1.0)
	yaw = lerpf(yaw, want_yaw, 1 - exp(-14 * delta))
	squash = lerpf(squash, 0.0, 1 - exp(-10 * delta))
	flap_t = maxf(flap_t - delta, 0.0)
	var stretch := 1.0 + squash + clampf(absf(p["vz"]) * 0.006, 0, 0.12) * (0.0 if p["ground"] else 1.0)
	var bob := 0.0
	var lean := 0.0
	if p["ground"] and absf(p["vx"]) > 0.5:
		bob = absf(sin(clock * 16.0)) * 0.07
		lean = -0.12 * signf(p["vx"])
	if p["dashT"] > 0:
		lean = -0.5 * float(p["dashDir"])
	elif p["gliding"]:
		lean = -0.3 * float(p["face"])
	owl_rig.position = Vector3(0, bob, 0)
	owl_rig.rotation = Vector3(0, yaw * 1.15, lean)
	owl_rig.scale = Vector3(1.0 / sqrt(stretch), stretch, 1.0 / sqrt(stretch))
	var spread := 0.08 + 0.05 * sin(clock * 2.0)
	if p["gliding"]:
		spread = 1.45 + 0.06 * sin(clock * 9.0)
	elif flap_t > 0:
		spread = 0.4 + 1.2 * absf(sin(flap_t * 20.0))
	elif p["dashT"] > 0:
		spread = 0.9
	elif not p["ground"]:
		spread = 0.55 + 0.25 * sin(clock * 18.0)
	elif absf(p["vx"]) > 0.5:
		spread = 0.2 + 0.1 * sin(clock * 16.0)
	if wing_l != null and wing_r != null:
		wing_l.rotation.z = lerp_angle(wing_l.rotation.z, -spread, 1 - exp(-24 * delta))
		wing_r.rotation.z = lerp_angle(wing_r.rotation.z, spread, 1 - exp(-24 * delta))
	owl.visible = p["invuln"] <= 0.12 or fmod(clock, 0.16) < 0.09

	camera.position = Vector3(c["x"], c["z"], c["dist"])

	# the realm's air
	var zone := String(p["zone"])
	if zone != last_zone and zone != "":
		last_zone = zone
		for zn in world["zones"]:
			if zn["name"] == zone:
				mood = zn["mood"]
		if started:
			hud.banner(zone)
	var target: Array = MOODS.get(mood, MOODS["tree"])
	var k := 1 - exp(-1.2 * delta)
	for i in 5:
		if i == 2:
			mood_now[i] = lerpf(mood_now[i], target[i], k)
		else:
			mood_now[i] = (mood_now[i] as Color).lerp(target[i], k)
	mood_now[5] = lerpf(mood_now[5], target[5], k)
	_apply_mood()

	# lamps near the owl shed real light
	lamp_timer -= delta
	if lamp_timer <= 0:
		lamp_timer = 0.3
		var near := []
		for spot in lamp_spots:
			var d: float = (spot[0] as Vector3).distance_squared_to(owl.position)
			if d < 900.0:
				near.append([d, spot])
		near.sort_custom(func(a, b): return a[0] < b[0])
		for i in lamp_lights.size():
			var l: OmniLight3D = lamp_lights[i]
			if i < near.size():
				l.position = near[i][1][0]
				l.light_color = near[i][1][1]
				l.set_meta("on", true)
			else:
				l.set_meta("on", false)
	for l in lamp_lights:
		var on: bool = l.get_meta("on", false)
		l.light_energy = lerpf(l.light_energy, (1.5 + 0.12 * sin(clock * 7.0 + l.position.x)) if on else 0.0, 1 - exp(-4 * delta))

	_dress_entities(delta)
	fx.refresh(sim, camera.position, mood, owl.position)
	var rim: Color = (mood_now[4] as Color).lerp(mood_now[1], 0.4)
	paint.set_shader_parameter("rim", rim)
	for m in layers.values():
		m.set_shader_parameter("rim", rim)
	hud.refresh(sim, delta)


func _dress_entities(delta: float) -> void:
	for e in ents:
		var n: Node3D = e["node"]
		var base: Transform3D = e["base"]
		var d: Dictionary = e["data"]
		var sd: float = e["seed"]
		match e["kind"]:
			"feather", "relic":
				n.visible = not sim.got.has(e["ref"])
				if n.visible:
					n.transform = base.translated(Vector3(0, 0.15 * sin(clock * 2.2 + sd), 0)) * Transform3D(Basis(Vector3.UP, clock * 1.4 + sd), Vector3.ZERO)
			"moth":
				var mp: Vector2 = sim.moth_at(d)
				n.position = Vector3(mp.x, mp.y + 0.08 * sin(clock * 9.0 + sd), 0)
				var wl := n.get_node_or_null("lamp-moth_wingL")
				var wr := n.get_node_or_null("lamp-moth_wingR")
				var f := 0.7 * sin(clock * 30.0 + sd)
				if wl != null:
					wl.rotation.z = -f
				if wr != null:
					wr.rotation.z = f
			"swing":
				n.transform = base * Transform3D(Basis(Vector3.BACK, sim.swing_angle(d)), Vector3.ZERO)
			"frail":
				var on: bool = sim.frail_on(d)
				n.visible = on
				var shake := 0.0
				if sim.frail.has(d["id"]) and on:
					shake = 0.04
				n.transform = base.translated(Vector3(randf_range(-shake, shake), randf_range(-shake, shake), 0))
			"circuit":
				var lit: bool = sim.circuit_on(d)
				var s: float = lerpf(n.scale.y, 1.0 if lit else 0.12, 1 - exp(-18 * delta))
				n.transform = base.scaled_local(Vector3(1.0 if lit else 0.94, s, 1.0 if lit else 0.5))
			"bridge":
				var left: float = (float(sim.painted.get(d["id"], 0)) - sim.tick) * sim.dt
				n.visible = left > 0
				if n.visible:
					var thin := clampf(left / 0.7, 0.15, 1.0)
					n.transform = base.scaled_local(Vector3(1, thin, thin))
			"door":
				n.visible = not sim.open.has(e["ref"])
			"updraft":
				var up: bool = sim.updraft_on(d)
				var s2: float = lerpf(n.scale.x / maxf(base.basis.get_scale().x, 0.001), 1.0 if up else 0.25, 1 - exp(-6 * delta))
				n.transform = (base * Transform3D(Basis(Vector3.UP, clock * 1.6 + sd), Vector3.ZERO)).scaled_local(Vector3(s2, 1, s2))
