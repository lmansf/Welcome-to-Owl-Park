extends Node3D
## Effects, to the art bible's rule: small, soft and few. Round soft particles, short lives, eased
## sizes; additive for light, alpha for dust. Every texture is made here in code.
##
## Three layers: halos on every lamp, ambient life that follows the camera and changes with the
## realm, and one-shot bursts for what the owl does.

## Ambient life per mood: a list of [look, amount, life s, size m, colour, colour2, velocity, gravity, spin].
const AMBIENT := {
	"tree": [["glow", 26, 7.0, 0.16, Color("ffd36a"), Color("fff2c0"), Vector3(0.25, 0.2, 0), Vector3(0, 0.05, 0)], ["dust", 30, 9.0, 0.07, Color(0.8, 0.86, 1.0, 0.35), Color(0.8, 0.86, 1.0, 0.0), Vector3(0.15, 0.05, 0), Vector3(0.1, -0.02, 0)]],
	"hollow": [["dust", 70, 9.0, 0.09, Color(1.0, 0.82, 0.55, 0.5), Color(1.0, 0.8, 0.5, 0.0), Vector3(0.12, 0.1, 0), Vector3(0, 0.04, 0)], ["glow", 10, 6.0, 0.12, Color("ffcf7a"), Color("ffe9b0"), Vector3(0.1, 0.25, 0), Vector3(0, 0.1, 0)]],
	"clearing": [["glow", 44, 7.0, 0.18, Color("ffd36a"), Color("d8ff9a"), Vector3(0.35, 0.25, 0), Vector3(0, 0.04, 0)], ["leaf", 12, 9.0, 0.22, Color("f2b24a"), Color("b5562b"), Vector3(0.5, 0.1, 0), Vector3(0.25, -0.55, 0)]],
	"neon": [["glow", 22, 3.2, 0.1, Color("ff2aa1"), Color("00e5ff"), Vector3(0.1, 0.1, 0), Vector3(0, -0.9, 0)], ["dust", 34, 8.0, 0.2, Color(0.75, 0.6, 1.0, 0.16), Color(0.7, 0.6, 1.0, 0.0), Vector3(0.2, 0.3, 0), Vector3(0.05, 0.35, 0)]],
	"circuit": [["glow", 14, 1.1, 0.09, Color("00e5ff"), Color("ffffff"), Vector3(1.2, 1.2, 0), Vector3(0, -3.0, 0)], ["dust", 24, 8.0, 0.08, Color(0.6, 0.7, 1.0, 0.25), Color(0.6, 0.7, 1.0, 0.0), Vector3(0.1, 0.05, 0), Vector3(0, -0.02, 0)]],
	"ink": [["dust", 46, 8.0, 0.11, Color(0.05, 0.05, 0.07, 0.6), Color(0.05, 0.05, 0.07, 0.0), Vector3(0.3, 0.08, 0), Vector3(0.2, -0.06, 0)], ["dust", 16, 12.0, 1.8, Color(0.93, 0.92, 0.86, 0.1), Color(0.93, 0.92, 0.86, 0.0), Vector3(0.3, 0.02, 0), Vector3(0.1, 0, 0)]],
	"glass": [["glow", 22, 2.6, 0.13, Color("9fd0ff"), Color("ffffff"), Vector3(0.05, 0.05, 0), Vector3(0, -0.1, 0)], ["dust", 22, 9.0, 0.07, Color(0.8, 0.88, 1.0, 0.35), Color(0.8, 0.9, 1.0, 0.0), Vector3(0.12, 0.05, 0), Vector3(0, -0.03, 0)]],
	"tower": [["glow", 34, 2.4, 0.13, Color("ffb860"), Color("9fd0ff"), Vector3(0.05, 0.05, 0), Vector3(0, -0.25, 0)], ["dust", 22, 9.0, 0.07, Color(0.8, 0.88, 1.0, 0.35), Color(0.8, 0.9, 1.0, 0.0), Vector3(0.2, 0.05, 0), Vector3(0.15, -0.03, 0)]],
	"canopy": [["glow", 40, 7.0, 0.17, Color("ffd36a"), Color("c8ffb0"), Vector3(0.4, 0.3, 0), Vector3(0.05, 0.05, 0)], ["leaf", 18, 9.0, 0.2, Color("6e8b4e"), Color("3e5a3a"), Vector3(0.8, 0.1, 0), Vector3(0.5, -0.5, 0)]],
	"roots": [["glow", 30, 8.0, 0.12, Color("7cffc8"), Color("9ad8ff"), Vector3(0.1, 0.15, 0), Vector3(0, 0.12, 0)], ["dust", 16, 2.2, 0.06, Color(0.6, 0.8, 0.9, 0.5), Color(0.6, 0.8, 0.9, 0.0), Vector3(0.0, 0.0, 0), Vector3(0, -4.0, 0)]],
}

## One-shot bursts: [look, amount, life, size, colour, colour2, speed min, speed max, spread deg, gravity, direction].
const BURSTS := {
	"jump": ["dust", 7, 0.4, 0.2, Color(0.9, 0.9, 0.95, 0.45), Color(0.9, 0.9, 1, 0), 0.6, 1.8, 70, Vector3(0, 0.4, 0), Vector3.UP],
	"land": ["dust", 10, 0.45, 0.24, Color(0.9, 0.9, 0.95, 0.5), Color(0.9, 0.9, 1, 0), 1.2, 3.0, 88, Vector3(0, 0.2, 0), Vector3.UP],
	"flap": ["leaf", 5, 0.8, 0.16, Color("e9d9b8"), Color("8a6a45"), 1.0, 2.6, 70, Vector3(0, -3.0, 0), Vector3.DOWN],
	"dash": ["glow", 14, 0.32, 0.2, Color("ffe9b0"), Color("ffd36a"), 0.3, 1.6, 30, Vector3.ZERO, Vector3.LEFT],
	"kick": ["dust", 8, 0.4, 0.2, Color(0.9, 0.9, 0.95, 0.5), Color(0.9, 0.9, 1, 0), 1.0, 2.6, 60, Vector3(0, -1, 0), Vector3.LEFT],
	"pogo": ["glow", 12, 0.4, 0.16, Color("ff8ab0"), Color("fff2c0"), 2.0, 4.5, 80, Vector3(0, -6, 0), Vector3.UP],
	"feather": ["glow", 16, 0.8, 0.18, Color("ffd36a"), Color("fff6d8"), 1.0, 3.2, 180, Vector3(0, 1.5, 0), Vector3.UP],
	"relic": ["glow", 34, 1.3, 0.22, Color("fff6d8"), Color("ffd36a"), 1.5, 5.0, 180, Vector3(0, 2.0, 0), Vector3.UP],
	"grant": ["glow", 70, 2.2, 0.26, Color("f6f1e3"), Color("ffd36a"), 1.0, 6.5, 40, Vector3(0, 2.5, 0), Vector3.UP],
	"bench": ["glow", 18, 1.6, 0.16, Color("ffcf7a"), Color("fff2c0"), 0.3, 1.2, 180, Vector3(0, 1.0, 0), Vector3.UP],
	"hurt": ["shard", 12, 0.7, 0.2, Color("9fd0ff"), Color("a3202f"), 2.0, 5.5, 180, Vector3(0, -9, 0), Vector3.UP],
	"faint": ["shard", 26, 1.0, 0.24, Color("cdb0ff"), Color("1f4a9c"), 2.0, 7.0, 180, Vector3(0, -9, 0), Vector3.UP],
	"paint": ["dust", 16, 0.6, 0.3, Color(0.05, 0.05, 0.07, 0.8), Color(0.05, 0.05, 0.07, 0), 1.0, 4.0, 60, Vector3(0, -5, 0), Vector3.UP],
	"crack": ["shard", 8, 0.6, 0.16, Color("dff0ff"), Color("9fd0ff"), 1.0, 3.0, 120, Vector3(0, -9, 0), Vector3.UP],
	"door": ["dust", 18, 0.9, 0.3, Color(0.85, 0.75, 0.6, 0.5), Color(0.8, 0.7, 0.6, 0), 0.6, 2.2, 90, Vector3(0, 0.3, 0), Vector3.UP],
	"won": ["glow", 120, 3.5, 0.3, Color("ffd36a"), Color("ffffff"), 2.0, 9.0, 180, Vector3(0, 1.0, 0), Vector3.UP],
}

var looks := {}
var quad: QuadMesh
var ambient := {}
var mood := ""
var pool: Array = []
var pool_next := 0
var glide_l: CPUParticles3D
var glide_r: CPUParticles3D
var slide: CPUParticles3D
var drafts: Array = []
var shadow: MeshInstance3D
var halos: MultiMeshInstance3D


func _ready() -> void:
	quad = QuadMesh.new()
	quad.size = Vector2.ONE
	var soft := _radial([Color(1, 1, 1, 1), Color(1, 1, 1, 0.55), Color(1, 1, 1, 0.12), Color(1, 1, 1, 0)], [0.0, 0.25, 0.6, 1.0])
	var flake := _radial([Color(1, 1, 1, 1), Color(1, 1, 1, 1), Color(1, 1, 1, 0)], [0.0, 0.62, 0.75])
	looks["glow"] = _material(soft, true)
	looks["dust"] = _material(soft, false)
	looks["leaf"] = _material(flake, false)
	looks["shard"] = _material(flake, true)
	for m in AMBIENT:
		var pair := []
		for spec in AMBIENT[m]:
			var e := _emitter(spec[0], spec[1], spec[2], spec[3], spec[4], spec[5])
			e.emission_shape = CPUParticles3D.EMISSION_SHAPE_BOX
			e.emission_box_extents = Vector3(26, 15, 5)
			e.direction = Vector3(1, 0.3, 0)
			e.spread = 180.0
			e.initial_velocity_min = 0.0
			e.initial_velocity_max = (spec[6] as Vector3).length()
			e.gravity = spec[7]
			e.emitting = false
			e.visible = false
			e.preprocess = spec[2]
			if spec[0] == "leaf":
				e.angular_velocity_min = -220.0
				e.angular_velocity_max = 220.0
			add_child(e)
			pair.append(e)
		ambient[m] = pair
	for i in 10:
		var b := _emitter("dust", 8, 0.5, 0.2, Color.WHITE, Color.WHITE)
		b.one_shot = true
		b.explosiveness = 0.92
		b.emitting = false
		add_child(b)
		pool.append(b)
	glide_l = _trail(Color(0.85, 0.92, 1.0, 0.4))
	glide_r = _trail(Color(0.85, 0.92, 1.0, 0.4))
	slide = _trail(Color(0.9, 0.88, 0.8, 0.5))
	slide.gravity = Vector3(0, 1.2, 0)
	# a soft shadow under the owl, so it sits on the ground
	shadow = MeshInstance3D.new()
	var sq := QuadMesh.new()
	sq.size = Vector2(1.5, 1.5)
	sq.orientation = PlaneMesh.FACE_Y
	shadow.mesh = sq
	var sm := StandardMaterial3D.new()
	sm.shading_mode = BaseMaterial3D.SHADING_MODE_UNSHADED
	sm.transparency = BaseMaterial3D.TRANSPARENCY_ALPHA
	sm.albedo_texture = soft
	sm.albedo_color = Color(0.0, 0.01, 0.04, 0.5)
	shadow.material_override = sm
	add_child(shadow)


func _radial(colors: Array, offsets: Array) -> GradientTexture2D:
	var g := Gradient.new()
	g.colors = PackedColorArray(colors)
	g.offsets = PackedFloat32Array(offsets)
	var t := GradientTexture2D.new()
	t.gradient = g
	t.fill = GradientTexture2D.FILL_RADIAL
	t.fill_from = Vector2(0.5, 0.5)
	t.fill_to = Vector2(0.5, 0.0)
	t.width = 64
	t.height = 64
	return t


func _material(tex: Texture2D, additive: bool) -> StandardMaterial3D:
	var m := StandardMaterial3D.new()
	m.shading_mode = BaseMaterial3D.SHADING_MODE_UNSHADED
	m.transparency = BaseMaterial3D.TRANSPARENCY_ALPHA
	m.blend_mode = BaseMaterial3D.BLEND_MODE_ADD if additive else BaseMaterial3D.BLEND_MODE_MIX
	m.billboard_mode = BaseMaterial3D.BILLBOARD_PARTICLES
	m.vertex_color_use_as_albedo = true
	m.albedo_texture = tex
	m.disable_receive_shadows = true
	m.no_depth_test = false
	return m


func _emitter(look: String, amount: int, life: float, size: float, c0: Color, c1: Color) -> CPUParticles3D:
	var e := CPUParticles3D.new()
	e.mesh = quad
	e.material_override = looks[look]
	e.amount = amount
	e.lifetime = life
	e.randomness = 0.6
	e.lifetime_randomness = 0.4
	e.scale_amount_min = size * 0.55
	e.scale_amount_max = size * 1.3
	# every particle eases in and out: nothing pops
	var curve := Curve.new()
	curve.add_point(Vector2(0.0, 0.0))
	curve.add_point(Vector2(0.18, 1.0))
	curve.add_point(Vector2(0.7, 0.8))
	curve.add_point(Vector2(1.0, 0.0))
	e.scale_amount_curve = curve
	var ramp := Gradient.new()
	var end := c1
	if look == "glow" or look == "shard":
		end.a = 0.0
	ramp.colors = PackedColorArray([c0, c1.lerp(c0, 0.5), end])
	ramp.offsets = PackedFloat32Array([0.0, 0.5, 1.0])
	e.color_ramp = ramp
	e.local_coords = false
	return e


func _trail(c: Color) -> CPUParticles3D:
	var e := _emitter("dust", 14, 0.5, 0.16, c, Color(c.r, c.g, c.b, 0.0))
	e.initial_velocity_max = 0.3
	e.spread = 180.0
	e.gravity = Vector3.ZERO
	e.emitting = false
	add_child(e)
	return e


## A soft halo on every lamp in the park, in one draw.
func halos_for(spots: Array) -> void:
	var mm := MultiMesh.new()
	mm.transform_format = MultiMesh.TRANSFORM_3D
	mm.use_colors = true
	mm.mesh = quad
	mm.instance_count = spots.size()
	for i in spots.size():
		var size := 4.2 + fmod(float(i) * 1.37, 1.2)
		mm.set_instance_transform(i, Transform3D(Basis.from_scale(Vector3(size, size, size)), spots[i][0]))
		var c: Color = spots[i][1]
		mm.set_instance_color(i, Color(c.r, c.g, c.b, 0.34))
	halos = MultiMeshInstance3D.new()
	halos.multimesh = mm
	var m: StandardMaterial3D = looks["glow"].duplicate()
	m.billboard_mode = BaseMaterial3D.BILLBOARD_ENABLED
	m.no_depth_test = false
	halos.material_override = m
	add_child(halos)


## Rising motes in each column of air, sideways streaks in each wind.
func air_for(world: Dictionary) -> void:
	for u in world["updrafts"]:
		var h: float = u["z1"] - u["z0"]
		var e := _emitter("glow", int(h * 2.2), 1.6, 0.14, Color(0.86, 0.96, 0.92, 0.9), Color(0.7, 0.95, 0.9, 0.0))
		e.emission_shape = CPUParticles3D.EMISSION_SHAPE_BOX
		e.emission_box_extents = Vector3((u["x1"] - u["x0"]) * 0.45, h * 0.5, 0.6)
		e.position = Vector3((u["x0"] + u["x1"]) * 0.5, (u["z0"] + u["z1"]) * 0.5, 0)
		e.direction = Vector3.UP
		e.spread = 6.0
		e.initial_velocity_min = 3.0
		e.initial_velocity_max = 6.5
		e.gravity = Vector3.ZERO
		e.local_coords = true
		add_child(e)
		drafts.append([u, e])
	for wd in world["winds"]:
		var w: float = wd["x1"] - wd["x0"]
		var hh: float = wd["z1"] - wd["z0"]
		var e2 := _emitter("dust", int(w * hh * 0.12), 1.4, 0.12, Color(0.9, 0.95, 1.0, 0.5), Color(0.9, 0.95, 1.0, 0.0))
		e2.emission_shape = CPUParticles3D.EMISSION_SHAPE_BOX
		e2.emission_box_extents = Vector3(w * 0.5, hh * 0.5, 1.0)
		e2.position = Vector3((wd["x0"] + wd["x1"]) * 0.5, (wd["z0"] + wd["z1"]) * 0.5, 0)
		e2.direction = Vector3(signf(wd["push"]), 0, 0)
		e2.spread = 4.0
		e2.initial_velocity_min = 5.0
		e2.initial_velocity_max = 9.0
		e2.gravity = Vector3.ZERO
		e2.local_coords = true
		add_child(e2)


func burst(kind: String, at: Vector3, facing: int = 1) -> void:
	if not BURSTS.has(kind):
		return
	var s: Array = BURSTS[kind]
	var e: CPUParticles3D = pool[pool_next]
	pool_next = (pool_next + 1) % pool.size()
	e.material_override = looks[s[0]]
	e.amount = s[1]
	e.lifetime = s[2]
	e.scale_amount_min = s[3] * 0.5
	e.scale_amount_max = s[3] * 1.3
	var ramp := Gradient.new()
	var c1: Color = s[5]
	var mid: Color = (s[4] as Color).lerp(c1, 0.5)
	if s[0] != "dust":
		c1.a = 0.0
		mid.a = 1.0
	ramp.colors = PackedColorArray([s[4], mid, c1])
	ramp.offsets = PackedFloat32Array([0.0, 0.5, 1.0])
	e.color_ramp = ramp
	e.initial_velocity_min = s[6]
	e.initial_velocity_max = s[7]
	e.spread = s[8]
	e.gravity = s[9]
	var dir: Vector3 = s[10]
	if dir == Vector3.LEFT:
		dir = Vector3(-facing, 0.15, 0)
	e.direction = dir
	e.angular_velocity_min = -300.0 if s[0] == "shard" or s[0] == "leaf" else 0.0
	e.angular_velocity_max = 300.0 if s[0] == "shard" or s[0] == "leaf" else 0.0
	e.position = at
	e.restart()
	e.emitting = true


func _put_away(e: CPUParticles3D) -> void:
	if not e.emitting:
		e.visible = false


func refresh(sim, cam_pos: Vector3, now_mood: String, owl_pos: Vector3) -> void:
	if now_mood != mood:
		for m in ambient:
			for e in ambient[m]:
				e.emitting = m == now_mood
				if m == now_mood:
					e.visible = true
				elif e.visible:
					# let the old air drift out, then put it away (an idle emitter still draws its parked motes)
					get_tree().create_timer(e.lifetime).timeout.connect(_put_away.bind(e))
		mood = now_mood
	for m in ambient:
		for e in ambient[m]:
			e.position = Vector3(cam_pos.x, cam_pos.y, -1.5)
	var p: Dictionary = sim.p
	var gliding: bool = p["gliding"]
	var side := Vector3(0.0, 0.75, 0.0)
	glide_l.position = owl_pos + side + Vector3(0, 0, 0.9)
	glide_r.position = owl_pos + side + Vector3(0, 0, -0.9)
	glide_l.emitting = gliding
	glide_r.emitting = gliding
	slide.position = owl_pos + Vector3(0.3 * float(p["wall"]), 0.2, 0.3)
	slide.emitting = p["clinging"] and p["vz"] < -1.0
	for pair in drafts:
		pair[1].emitting = sim.updraft_on(pair[0])
	shadow.visible = p["ground"]
	shadow.position = owl_pos + Vector3(0, 0.04, 0)
