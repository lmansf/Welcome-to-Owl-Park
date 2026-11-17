shader_type spatial;
// The one material every sculpted surface shares. Vertex colour is the paint; its alpha is how
// strongly that paint glows. A soft wrap keeps shadow sides readable, like a painted backdrop.
render_mode diffuse_lambert_wrap, specular_disabled;

uniform float glow = 2.3;
uniform float self_light = 0.0;
uniform float wrap = 0.55;
uniform vec3 tint : source_color = vec3(1.0);
uniform float fade = 1.0;
uniform float mute = 0.0;
uniform vec3 rim : source_color = vec3(0.6, 0.75, 1.0);
uniform float rim_strength = 0.22;

void fragment() {
	// walls and the mass under the ground are the quiet part of the picture: `mute` greys them, `tint` darkens
	vec3 base = mix(COLOR.rgb, vec3(dot(COLOR.rgb, vec3(0.3, 0.55, 0.15))), mute);
	ALBEDO = base * tint;
	ROUGHNESS = wrap;
	// a thin edge of moonlight where a form turns away: it lifts shapes off the dark behind them
	float edge = pow(1.0 - clamp(dot(NORMAL, VIEW), 0.0, 1.0), 3.0);
	EMISSION = base * (COLOR.a * glow * fade + self_light) + rim * edge * rim_strength * (0.4 + base);
}
