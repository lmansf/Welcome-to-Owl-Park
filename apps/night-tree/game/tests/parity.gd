extends SceneTree
## Replays the run recorded by blender/export_world.py and checks the port lands where Python did.
## Run: godot --headless --path game --script res://tests/parity.gd

func _init() -> void:
	var world: Dictionary = JSON.parse_string(FileAccess.get_file_as_string("res://world/world.json"))
	var tuning: Dictionary = JSON.parse_string(FileAccess.get_file_as_string("res://world/tuning.json"))
	var runs: Array = JSON.parse_string(FileAccess.get_file_as_string("res://tests/parity.json"))
	var SimC = load("res://scripts/sim.gd")
	var bad := 0
	var checked := 0
	for ri in runs.size():
		var run: Dictionary = runs[ri]
		var s = SimC.new(world, tuning, ["flap", "dash", "glide", "kick"])
		s.p["x"] = run["x"]
		s.p["z"] = run["z"]
		for i in run["segs"].size():
			var seg: Array = run["segs"][i]
			var inp := {"left": seg[1] > 0, "right": seg[2] > 0, "down": seg[3] > 0, "jump": seg[4] > 0, "dash": seg[5] > 0, "up": false}
			for _k in int(seg[0]):
				s.step(inp)
			var want: Array = run["snaps"][i]
			var have: Array = s.snapshot()
			checked += 1
			var ok: bool = int(want[10]) == s.got.size()
			for k in 9:
				if absf(float(want[k]) - float(have[k])) > 1e-3:
					ok = false
			if not ok:
				bad += 1
				if bad <= 5:
					print("run ", ri, " segment ", i, "\n  python ", want, "\n  godot  ", have, " got ", s.got.size())
				break
	print("parity: ", checked, " checkpoints, ", bad, " runs diverged")
	quit(1 if bad > 0 else 0)
