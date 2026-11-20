extends Node
## Every sound is made here in code, as the park's are: short tones and breaths, no audio files.

const RATE := 22050
## cue: [start Hz, end Hz, seconds, noise share, volume]
const CUES := {
	"jump": [320, 520, 0.12, 0.1, 0.35], "flap": [240, 420, 0.16, 0.6, 0.4], "land": [140, 80, 0.08, 0.7, 0.3],
	"dash": [700, 220, 0.18, 0.5, 0.4], "kick": [420, 660, 0.1, 0.2, 0.4], "pogo": [520, 880, 0.12, 0.1, 0.4],
	"drop": [260, 180, 0.08, 0.2, 0.25], "feather": [880, 1320, 0.22, 0.0, 0.4], "relic": [660, 1320, 0.6, 0.0, 0.5],
	"bench": [392, 588, 0.5, 0.0, 0.4], "grant": [330, 990, 1.1, 0.0, 0.5], "hurt": [300, 110, 0.3, 0.4, 0.5],
	"faint": [220, 70, 0.7, 0.3, 0.5], "door": [120, 200, 0.5, 0.5, 0.4], "paint": [500, 300, 0.3, 0.8, 0.35],
	"crack": [1400, 900, 0.14, 0.6, 0.35], "won": [392, 1176, 2.2, 0.0, 0.55],
}

var streams := {}
var players: Array = []
var next := 0


func _ready() -> void:
	var rng := RandomNumberGenerator.new()
	rng.seed = 7
	for cue in CUES:
		var c: Array = CUES[cue]
		var n := int(c[2] * RATE)
		var data := PackedByteArray()
		data.resize(n * 2)
		var phase := 0.0
		for i in n:
			var t := float(i) / n
			var f: float = lerpf(c[0], c[1], t)
			phase += TAU * f / RATE
			var tone := sin(phase) + 0.3 * sin(phase * 2.0)
			var v: float = (tone * (1.0 - c[3]) + rng.randf_range(-1, 1) * c[3]) * pow(1.0 - t, 1.6) * minf(t * 40.0, 1.0) * c[4]
			data.encode_s16(i * 2, int(clampf(v, -1, 1) * 32000))
		var s := AudioStreamWAV.new()
		s.format = AudioStreamWAV.FORMAT_16_BITS
		s.mix_rate = RATE
		s.data = data
		streams[cue] = s
	for i in 6:
		var p := AudioStreamPlayer.new()
		add_child(p)
		players.append(p)
	# a soft night drone under everything
	var secs := 8
	var n2 := secs * RATE
	var pad := PackedByteArray()
	pad.resize(n2 * 2)
	var notes := [110.0, 164.81, 220.0, 261.63, 329.63]
	for i in n2:
		var t := float(i) / RATE
		var v := 0.0
		for k in notes.size():
			v += sin(TAU * notes[k] * t) * (0.5 + 0.5 * sin(TAU * t * (k + 1) / secs)) / notes.size()
		pad.encode_s16(i * 2, int(v * 5200))
	var drone := AudioStreamWAV.new()
	drone.format = AudioStreamWAV.FORMAT_16_BITS
	drone.mix_rate = RATE
	drone.loop_mode = AudioStreamWAV.LOOP_FORWARD
	drone.loop_end = n2
	drone.data = pad
	var dp := AudioStreamPlayer.new()
	dp.stream = drone
	dp.volume_db = -8
	add_child(dp)
	dp.play()


func play(cue: String) -> void:
	if not streams.has(cue):
		return
	var p: AudioStreamPlayer = players[next]
	next = (next + 1) % players.size()
	p.stream = streams[cue]
	p.play()
