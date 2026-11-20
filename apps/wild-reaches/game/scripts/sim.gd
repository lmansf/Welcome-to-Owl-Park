class_name Sim
extends RefCounted
## The game's rules: the owl's movement, the world's moving parts and the camera.
##
## This is blender/nt/sim/sim.py line for line; tests/parity.gd keeps the two in step, so the map
## checker (which plays the Python one) speaks for the game. Coordinates: x right, z up, metres.
## The owl's position is the middle of its feet.

const ABILITIES := ["flap", "dash", "glide", "kick", "dive"]
const GRID := 8.0
const EPS := 1e-6
const LOCAL := ["hazards", "updrafts", "winds", "doors", "waters", "frail", "circuits", "bridges", "moths", "swings", "feathers", "relics", "shrines", "benches"]

var w: Dictionary
var T: Dictionary
var dt: float
var hz: int
var tick := 0
var events: Array = []
var have := {}
var got := {}
var open := {}
var frail := {}
var painted := {}
var won := false
var p := {}
var cam := {}
var grid_s := {}
var grid_o := {}
var lkey = null
var loc := {}


static func approach(v: float, target: float, step: float) -> float:
	if v < target:
		return minf(v + step, target)
	return maxf(v - step, target)


static func no_input() -> Dictionary:
	return {"left": false, "right": false, "up": false, "down": false, "jump": false, "dash": false}


func _init(world: Dictionary, tuning: Dictionary, abilities: Array = []) -> void:
	w = world
	T = tuning
	hz = int(tuning["hz"])
	dt = 1.0 / hz
	for a in ABILITIES:
		have[a] = a in abilities
	var sp: Dictionary = world["spawn"]
	p = {
		"x": float(sp["x"]), "z": float(sp["z"]), "vx": 0.0, "vz": 0.0, "face": 1, "ground": false,
		"coyote": 0.0, "buffer": 0.0, "flaps": 0, "dashT": 0.0, "dashCd": 0.0, "dashDir": 1, "dashReady": true,
		"wall": 0, "wallT": 0.0, "wallSide": 0, "lockT": 0.0, "dropT": 0.0, "cutOK": false,
		"gliding": false, "clinging": false, "panes": int(tuning["panes"]), "invuln": 0.0,
		"safeX": float(sp["x"]), "safeZ": float(sp["z"]), "benchX": float(sp["x"]), "benchZ": float(sp["z"]), "bench": "",
		"prevJump": false, "prevDash": false, "on": "", "zone": "", "wet": false, "surf": 0.0,
	}
	var c: Dictionary = tuning["camera"]
	cam = {"x": float(sp["x"]), "z": float(sp["z"]) + c["rise"], "dist": float(c["distance"]), "look": 0.0, "baseZ": float(sp["z"])}
	_index()


# ---- the static world, bucketed so a step only looks nearby ----

func _index() -> void:
	var solids: Array = w["solids"]
	for i in solids.size():
		var s: Dictionary = solids[i]
		_bucket(grid_s, i, s["x0"], s["z0"], s["x1"], s["z1"])
	var oneways: Array = w["oneways"]
	for i in oneways.size():
		var o: Dictionary = oneways[i]
		_bucket(grid_o, i, o["x0"], o["z"] - 0.5, o["x1"], o["z"])


func _bucket(grid: Dictionary, i: int, x0: float, z0: float, x1: float, z1: float) -> void:
	for gx in range(floori(x0 / GRID), floori(x1 / GRID) + 1):
		for gz in range(floori(z0 / GRID), floori(z1 / GRID) + 1):
			var k := gx * 100003 + gz
			if not grid.has(k):
				grid[k] = []
			grid[k].append(i)


func _bounds(kind: String, o: Dictionary) -> Array:
	if kind in ["hazards", "updrafts", "winds", "doors", "waters"]:
		return [o["x0"], o["z0"], o["x1"], o["z1"]]
	if kind in ["frail", "circuits"]:
		return [o["x0"], o["z"], o["x1"], o["z"]]
	if kind == "bridges":
		var x0: float = o["x"]
		var x1: float = o["x"]
		var z0: float = o["z"]
		var z1: float = o["z"]
		for sg in o["segs"]:
			x0 = minf(x0, sg["x0"])
			x1 = maxf(x1, sg["x1"])
			z0 = minf(z0, sg["z"])
			z1 = maxf(z1, sg["z"])
		return [x0, z0, x1, z1]
	if kind == "moths":
		return [o["x"] - absf(o["ax"]), o["z"] - absf(o["az"]), o["x"] + absf(o["ax"]), o["z"] + absf(o["az"])]
	if kind == "swings":
		return [o["x"] - o["len"], o["z"] - o["len"], o["x"] + o["len"], o["z"]]
	return [o["x"], o["z"], o["x"], o["z"]]


func _local() -> Dictionary:
	var cx := floori(p["x"] / 16.0)
	var cz := floori(p["z"] / 16.0)
	var key := cx * 100003 + cz
	if lkey == null or key != lkey:
		lkey = key
		var x0 := cx * 16 - 5
		var x1 := cx * 16 + 21
		var z0 := cz * 16 - 5
		var z1 := cz * 16 + 21
		loc = {}
		for kind in LOCAL:
			var out := []
			for o in w[kind]:
				var b := _bounds(kind, o)
				if b[2] >= x0 and b[0] <= x1 and b[3] >= z0 and b[1] <= z1:
					out.append(o)
			loc[kind] = out
	return loc


func _near(grid: Dictionary, x: float, z: float) -> Array:
	var out := []
	var gx0 := floori((x - 2) / GRID)
	var gx1 := floori((x + 2) / GRID)
	var gz0 := floori((z - 2) / GRID)
	var gz1 := floori((z + 3) / GRID)
	for gx in range(gx0, gx1 + 1):
		for gz in range(gz0, gz1 + 1):
			var b = grid.get(gx * 100003 + gz)
			if b != null:
				for i in b:
					if not (i in out):
						out.append(i)
	return out


# ---- the moving parts ----

func time() -> float:
	return tick * dt


func circuit_on(c: Dictionary) -> bool:
	return posmod(tick / roundi(c["period"] * hz), 2) == int(c["group"])


func frail_on(f: Dictionary) -> bool:
	if not frail.has(f["id"]):
		return true
	var at: int = frail[f["id"]]
	var back := at + roundi(T["frail"]["respawn"] * hz)
	if tick >= back:
		frail.erase(f["id"])
		return true
	return tick < at


func bridge_on(b: Dictionary) -> bool:
	return tick < int(painted.get(b["id"], 0))


func updraft_on(u: Dictionary) -> bool:
	if u["off"] <= 0:
		return true
	return posmod(tick + roundi(u["phase"] * hz), roundi((u["on"] + u["off"]) * hz)) < roundi(u["on"] * hz)


func moth_at(m: Dictionary) -> Vector2:
	var a: float = 2 * PI * time() / m["period"] + m["phase"]
	return Vector2(m["x"] + m["ax"] * sin(a), m["z"] + m["az"] * sin(a))


func swing_angle(s: Dictionary) -> float:
	return s["amp"] * sin(2 * PI * time() / s["period"] + s["phase"])


func swing_at(s: Dictionary) -> Vector2:
	var a := swing_angle(s)
	return Vector2(s["x"] + s["len"] * sin(a), s["z"] - s["len"] * cos(a))


func door_solid(d: Dictionary) -> bool:
	return not open.has(d["id"])


func live_oneways() -> Array:
	var out := []
	var L := _local()
	for f in L["frail"]:
		if frail_on(f):
			out.append(["frail", f["id"], f["x0"], f["x1"], f["z"]])
	for c in L["circuits"]:
		if circuit_on(c):
			out.append(["circuit", c["id"], c["x0"], c["x1"], c["z"]])
	for b in L["bridges"]:
		if bridge_on(b):
			for s in b["segs"]:
				out.append(["bridge", b["id"], s["x0"], s["x1"], s["z"]])
	return out


# ---- collision ----

func _hits_solid(x: float, z: float) -> Dictionary:
	var hw: float = T["owl"]["halfWidth"]
	var h: float = T["owl"]["height"]
	var solids: Array = w["solids"]
	for i in _near(grid_s, x, z):
		var s: Dictionary = solids[i]
		if x + hw > s["x0"] + EPS and x - hw < s["x1"] - EPS and z + h > s["z0"] + EPS and z < s["z1"] - EPS:
			return s
	for d in _local()["doors"]:
		if door_solid(d) and x + hw > d["x0"] + EPS and x - hw < d["x1"] - EPS and z + h > d["z0"] + EPS and z < d["z1"] - EPS:
			return d
	return {}


func _box_hit(x: float, z: float, x0: float, z0: float, x1: float, z1: float) -> bool:
	var hw: float = T["owl"]["halfWidth"]
	var h: float = T["owl"]["height"]
	return x + hw > x0 and x - hw < x1 and z + h > z0 and z < z1


# ---- one step ----

func step(inp: Dictionary) -> void:
	events = []
	tick += 1
	var hw: float = T["owl"]["halfWidth"]
	var press_jump: bool = inp["jump"] and not p["prevJump"]
	var press_dash: bool = inp["dash"] and not p["prevDash"]
	p["prevJump"] = inp["jump"]
	p["prevDash"] = inp["dash"]

	if p["ground"]:
		p["coyote"] = T["jump"]["coyote"]
	else:
		p["coyote"] -= dt
	if press_jump:
		p["buffer"] = T["jump"]["buffer"]
	else:
		p["buffer"] -= dt
	if p["invuln"] > 0:
		p["invuln"] -= dt
	if p["dropT"] > 0:
		p["dropT"] -= dt
	if p["dashCd"] > 0:
		p["dashCd"] -= dt
	if p["wall"] != 0:
		p["wallT"] = T["kick"]["grace"]
		p["wallSide"] = p["wall"]
	else:
		p["wallT"] -= dt

	var ax: int = (1 if inp["right"] else 0) - (1 if inp["left"] else 0)
	if p["lockT"] > 0:
		p["lockT"] -= dt
	else:
		if ax != 0:
			p["vx"] = approach(p["vx"], ax * T["run"]["speed"], (T["run"]["groundAccel"] if p["ground"] else T["run"]["airAccel"]) * dt)
			p["face"] = ax
		else:
			p["vx"] = approach(p["vx"], 0.0, (T["run"]["friction"] if p["ground"] else T["run"]["airDrag"]) * dt)

	if press_dash and have["dash"] and p["dashT"] <= 0 and p["dashCd"] <= 0 and p["dashReady"]:
		p["dashT"] = T["dash"]["time"]
		p["dashDir"] = ax if ax != 0 else p["face"]
		p["face"] = p["dashDir"]
		p["dashReady"] = false
		p["lockT"] = 0.0
		events.append("dash")

	p["gliding"] = false
	p["clinging"] = false
	p["wet"] = false
	var wmid: float = p["z"] + T["owl"]["height"] * 0.5
	for wt in _local()["waters"]:
		if p["x"] >= wt["x0"] and p["x"] < wt["x1"] and wmid >= wt["z0"] and wmid < wt["z1"]:
			p["wet"] = true
			p["surf"] = float(wt["z1"])
			break
	if p["dashT"] > 0:
		p["dashT"] -= dt
		p["vx"] = p["dashDir"] * T["dash"]["speed"]
		p["vz"] = 0.0
		if p["dashT"] <= 0:
			p["vx"] = p["dashDir"] * T["run"]["speed"]
			p["dashCd"] = T["dash"]["cooldown"]
	elif p["wet"]:
		# in water: a diver swims every way; without the dive the owl only bobs at the top
		var S: Dictionary = T["swim"]
		p["flaps"] = 1
		p["dashReady"] = true
		p["cutOK"] = false
		p["coyote"] = float(T["jump"]["coyote"])
		p["vx"] = minf(maxf(p["vx"], -S["speed"]), S["speed"])
		var near_top: bool = p["z"] + T["owl"]["height"] > p["surf"] - S["reach"]
		if p["buffer"] > 0 and near_top:
			p["vz"] = float(S["breach"])
			p["buffer"] = 0.0
			events.append("breach")
		elif have["dive"]:
			var az := (1 if (inp["up"] or inp["jump"]) else 0) - (1 if inp["down"] else 0)
			p["vz"] = approach(p["vz"], az * S["speed"] if az != 0 else float(S["drift"]), S["accel"] * dt)
		else:
			p["vz"] = approach(p["vz"], S["float"], S["damp"] * dt)
	else:
		if p["buffer"] > 0:
			if p["ground"] or p["coyote"] > 0:
				if inp["down"] and p["on"] != "" and p["ground"]:
					p["dropT"] = T["drop"]
					p["ground"] = false
					p["coyote"] = 0.0
					events.append("drop")
				else:
					p["vz"] = T["jump"]["speed"]
					p["ground"] = false
					p["coyote"] = 0.0
					p["cutOK"] = true
					events.append("jump")
				p["buffer"] = 0.0
			elif have["kick"] and p["wallT"] > 0 and p["vz"] <= 0:  # rising past a wall flaps; falling, it kicks
				p["vx"] = -p["wallSide"] * T["kick"]["x"]
				p["vz"] = T["kick"]["z"]
				p["face"] = -p["wallSide"]
				p["lockT"] = T["kick"]["lock"]
				p["wallT"] = 0.0
				p["flaps"] = 1
				p["dashReady"] = true
				p["cutOK"] = true
				p["buffer"] = 0.0
				events.append("kick")
			elif have["flap"] and p["flaps"] > 0:
				p["vz"] = T["flap"]["speed"]
				p["flaps"] -= 1
				p["cutOK"] = true
				p["buffer"] = 0.0
				events.append("flap")
		if p["vz"] <= 0:
			p["cutOK"] = false
		if p["cutOK"] and not inp["jump"] and p["vz"] > T["jump"]["cut"]:
			p["vz"] = T["jump"]["cut"]
			p["cutOK"] = false

		p["clinging"] = have["kick"] and not p["ground"] and p["wall"] != 0 and ax == p["wall"] and p["vz"] <= 0
		var wants: bool = have["glide"] and inp["jump"] and not p["ground"] and not p["clinging"]
		var lift := 0.0
		if wants:
			for u in _local()["updrafts"]:
				if updraft_on(u) and _box_hit(p["x"], p["z"], u["x0"], u["z0"], u["x1"], u["z1"]):
					lift = maxf(lift, u["lift"])
		if lift > 0 and p["vz"] <= lift:
			p["gliding"] = true
			p["vz"] = minf(p["vz"] + T["glide"]["liftAccel"] * dt, lift)
		else:
			p["gliding"] = wants and p["vz"] <= 0
			p["vz"] -= T["jump"]["gravity"] * dt
			if p["gliding"]:
				p["vz"] = maxf(p["vz"], -T["glide"]["fall"])
			elif p["clinging"]:
				p["vz"] = maxf(p["vz"], -T["kick"]["slide"])
			else:
				p["vz"] = maxf(p["vz"], -T["jump"]["maxFall"])

	# sideways, then stop against walls
	var push := 0.0
	if not p["ground"]:
		for wd in _local()["winds"]:
			if _box_hit(p["x"], p["z"], wd["x0"], wd["z0"], wd["x1"], wd["z1"]):
				push += wd["push"] * (0.4 if p["gliding"] else 1.0) * (1.6 if p["gliding"] and wd["push"] * p["face"] > 0 else 1.0)
	var nx: float = p["x"] + (p["vx"] + push) * dt
	var s: Dictionary = _hits_solid(nx, p["z"])
	if not s.is_empty() and p["ground"] and s["z1"] > p["z"] and s["z1"] - p["z"] <= T["step"] + EPS and _hits_solid(nx, s["z1"]).is_empty():
		# a rise of up to a metre is walked up, the way a slope is
		p["z"] = float(s["z1"])
		s = {}
	if not s.is_empty():
		if nx > p["x"]:
			nx = s["x0"] - hw
		elif nx < p["x"]:
			nx = s["x1"] + hw
		else:
			nx = p["x"]
		if not _hits_solid(nx, p["z"]).is_empty():
			nx = p["x"]
		p["vx"] = 0.0
		if p["dashT"] > 0:
			p["dashT"] = 0.0
			p["dashCd"] = T["dash"]["cooldown"]
	p["x"] = nx
	p["wall"] = 0
	if not _hits_solid(p["x"] + 0.06, p["z"]).is_empty():
		p["wall"] = 1
	elif not _hits_solid(p["x"] - 0.06, p["z"]).is_empty():
		p["wall"] = -1

	# up and down, then land or bump
	var was_ground: bool = p["ground"]
	var feet: float = p["z"]
	var nz: float = p["z"] + p["vz"] * dt
	p["ground"] = false
	p["on"] = ""
	s = _hits_solid(p["x"], nz)
	if not s.is_empty():
		if p["vz"] <= 0:
			nz = s["z1"]
			p["ground"] = true
		else:
			nz = s["z0"] - T["owl"]["height"]
		p["vz"] = 0.0
	if p["vz"] <= 0 and not p["ground"] and p["dropT"] <= 0 and not p["wet"]:  # ledges do not catch a swimmer
		var best: Array = []
		var oneways: Array = w["oneways"]
		for i in _near(grid_o, p["x"], p["z"]):
			var o: Dictionary = oneways[i]
			if p["x"] + hw > o["x0"] and p["x"] - hw < o["x1"] and feet >= o["z"] - EPS and nz <= o["z"]:
				if best.is_empty() or o["z"] > best[1]:
					best = ["plat", o["z"], ""]
		for lo in live_oneways():
			if p["x"] + hw > lo[2] and p["x"] - hw < lo[3] and feet >= lo[4] - EPS and nz <= lo[4]:
				if best.is_empty() or lo[4] > best[1]:
					best = [lo[0], lo[4], lo[1]]
		if not best.is_empty():
			nz = best[1]
			p["vz"] = 0.0
			p["ground"] = true
			p["on"] = best[0]
			if best[0] == "frail" and not frail.has(best[2]):
				frail[best[2]] = tick + roundi(T["frail"]["delay"] * hz)
				events.append("crack")
	p["z"] = nz
	if p["ground"]:
		p["flaps"] = 1
		if p["dashT"] <= 0:
			p["dashReady"] = true
		if not was_ground:
			events.append("land")
		if (p["on"] == "" or p["on"] == "plat") and p["invuln"] <= 0 and not _near_hazard():
			p["safeX"] = p["x"]
			p["safeZ"] = p["z"]

	_touch(inp)
	_camera()


# ---- what the owl touches ----

func _touch(inp: Dictionary) -> void:
	var L := _local()
	var mid: float = p["z"] + T["owl"]["height"] / 2
	var r: float = T["reach"]["pickup"]
	for f in L["feathers"]:
		if not got.has(f["id"]) and absf(f["x"] - p["x"]) < r and absf(f["z"] - mid) < r:
			got[f["id"]] = true
			events.append("feather")
	for f in L["relics"]:
		if not got.has(f["id"]) and absf(f["x"] - p["x"]) < r and absf(f["z"] - mid) < r:
			got[f["id"]] = true
			events.append("relic:" + f["kind"])
	for sh in L["shrines"]:
		if not have[sh["grants"]] and absf(sh["x"] - p["x"]) < T["reach"]["shrine"] and absf(sh["z"] - p["z"]) < 2.5:
			have[sh["grants"]] = true
			events.append("grant:" + sh["grants"])
	if p["ground"]:
		for b in L["benches"]:
			if absf(b["x"] - p["x"]) < T["reach"]["bench"] and absf(b["z"] - p["z"]) < 0.5:
				if p["bench"] != b["id"] or p["panes"] < T["panes"]:
					events.append("bench")
				p["bench"] = b["id"]
				p["benchX"] = b["x"]
				p["benchZ"] = b["z"]
				p["panes"] = int(T["panes"])
	for d in L["doors"]:
		if not open.has(d["id"]):
			var x0: float = d["x0"] - 0.7 if d["side"] < 0 else d["x1"]
			var x1: float = d["x0"] if d["side"] < 0 else d["x1"] + 0.7
			if _box_hit(p["x"], p["z"], x0, d["z0"], x1, d["z1"]):
				open[d["id"]] = true
				events.append("door")
	for b in L["bridges"]:
		if _box_hit(p["x"], p["z"], b["x"] - 0.5, b["z"], b["x"] + 0.5, b["z"] + 1.0):
			if not bridge_on(b):
				events.append("paint")
			painted[b["id"]] = tick + roundi(b["life"] * hz)
	var c: Dictionary = w["crown"]
	if not won and absf(c["x"] - p["x"]) < 1.5 and absf(c["z"] - p["z"]) < 2.5:
		var bells := 0
		for f in w["relics"]:
			if f["kind"] == "bell" and got.has(f["id"]):
				bells += 1
		if bells >= c["bells"]:
			won = true
			events.append("won")

	var hurt: bool = p["z"] < w["killZ"]
	var pogo := false
	if p["invuln"] <= 0:
		var can_pogo: bool = inp["down"] and not p["ground"] and p["vz"] <= 0
		for h in L["hazards"]:
			if _box_hit(p["x"], p["z"], h["x0"], h["z0"], h["x1"], h["z1"]):
				if can_pogo and p["z"] > (h["z0"] + h["z1"]) / 2:
					pogo = true
				else:
					hurt = true
		for m in L["moths"]:
			var mp := moth_at(m)
			if _box_hit(p["x"], p["z"], mp.x - m["r"], mp.y - m["r"], mp.x + m["r"], mp.y + m["r"]):
				if can_pogo and p["z"] > mp.y:
					pogo = true
				else:
					hurt = true
		for sw in L["swings"]:
			var sp := swing_at(sw)
			if _box_hit(p["x"], p["z"], sp.x - sw["r"], sp.y - sw["r"], sp.x + sw["r"], sp.y + sw["r"]):
				if can_pogo and p["z"] > sp.y:
					pogo = true
				else:
					hurt = true
	if hurt:
		_hurt()
	elif pogo:
		p["vz"] = T["pogo"]["speed"]
		p["flaps"] = 1
		p["dashReady"] = true
		p["cutOK"] = false
		p["invuln"] = 0.12
		events.append("pogo")

	p["zone"] = ""
	for zn in w["zones"]:
		if p["x"] >= zn["x0"] and p["x"] < zn["x1"] and mid >= zn["z0"] and mid < zn["z1"]:
			p["zone"] = zn["name"]
			break


func _near_hazard() -> bool:
	for h in _local()["hazards"]:
		if p["x"] > h["x0"] - 1.5 and p["x"] < h["x1"] + 1.5 and p["z"] + 2 > h["z0"] and p["z"] - 2 < h["z1"]:
			return true
	return false


func _hurt() -> void:
	p["panes"] -= 1
	p["vx"] = 0.0
	p["vz"] = 0.0
	p["dashT"] = 0.0
	p["lockT"] = 0.0
	p["invuln"] = T["invuln"]
	if p["panes"] <= 0:
		p["panes"] = int(T["panes"])
		p["x"] = p["benchX"]
		p["z"] = p["benchZ"]
		lkey = null
		events.append("faint")
	else:
		p["x"] = p["safeX"]
		p["z"] = p["safeZ"]
		events.append("hurt")
	p["safeX"] = p["x"]
	p["safeZ"] = p["z"]


# ---- the camera ----

func _camera() -> void:
	var C: Dictionary = T["camera"]
	var c := cam
	c["look"] += (p["face"] * C["lookAhead"] - c["look"]) * (1 - exp(-C["lookEase"] * dt))
	if p["ground"] or p["clinging"]:
		c["baseZ"] = p["z"]
	elif p["z"] > c["baseZ"] + C["windowUp"]:
		c["baseZ"] = p["z"] - C["windowUp"]
	elif p["z"] < c["baseZ"] - C["windowDown"]:
		c["baseZ"] = p["z"] + C["windowDown"]
	var tx: float = p["x"] + c["look"]
	var tz: float = c["baseZ"] + C["rise"]
	var dist: float = C["distance"]
	var zone = null
	for zn in w["zones"]:
		if zn["name"] == p["zone"]:
			zone = zn
			break
	if zone != null:
		dist = C["distance"] * zone["zoom"]
	c["dist"] += (dist - c["dist"]) * (1 - exp(-C["zoomEase"] * dt))
	if zone != null and zone["lock"]:
		var half_h: float = c["dist"] * tan(deg_to_rad(C["fov"]) / 2)
		var half_w: float = half_h * 16 / 9
		if zone["x1"] - zone["x0"] > 2 * half_w:
			tx = minf(maxf(tx, zone["x0"] + half_w), zone["x1"] - half_w)
		else:
			tx = (zone["x0"] + zone["x1"]) / 2
		if zone["z1"] - zone["z0"] > 2 * half_h:
			tz = minf(maxf(tz, zone["z0"] + half_h), zone["z1"] - half_h)
		else:
			tz = (zone["z0"] + zone["z1"]) / 2
	var kz: float = C["fallZ"] if p["vz"] < -12 else C["followZ"]
	c["x"] += (tx - c["x"]) * (1 - exp(-C["followX"] * dt))
	c["z"] += (tz - c["z"]) * (1 - exp(-kz * dt))


func snapshot() -> Array:
	return [snappedf(p["x"], 1e-6), snappedf(p["z"], 1e-6), snappedf(p["vx"], 1e-6), snappedf(p["vz"], 1e-6), 1 if p["ground"] else 0, p["panes"], snappedf(cam["x"], 1e-6), snappedf(cam["z"], 1e-6), snappedf(cam["dist"], 1e-6)]
