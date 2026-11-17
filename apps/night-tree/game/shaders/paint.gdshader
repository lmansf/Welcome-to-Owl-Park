shader_type spatial;
// The one material every sculpted surface shares. Vertex colour is the paint; its alpha is how
// strongly that paint glows. A soft wrap keeps shadow sides readable, like a painted backdrop.
render_mode diffuse_lambert_wrap, specular_disabled;

uniform float glow = 3.2;
uniform float wrap = 0.55;
uniform vec3 tint : source_color = vec3(1.0);
uniform float fade = 1.0;

void fragment() {
	ALBEDO = COLOR.rgb * tint;
	ROUGHNESS = wrap;
	EMISSION = COLOR.rgb * COLOR.a * glow * fade;
}
