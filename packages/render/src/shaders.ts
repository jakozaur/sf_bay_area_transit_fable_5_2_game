/**
 * GLSL for packed instanced quads (core mesh.ts layout), the cut-plane cap and the sky.
 * three compiles ShaderMaterial sources as GLSL ES 3.00 and supplies position, modelMatrix, modelViewMatrix,
 * projectionMatrix and gl_FragColor. All positions are render-origin relative; colours are display-space (sRGB bytes
 * lit directly), which keeps the palette exact and the look flat.
 */

/** Local lights the shaders evaluate per fragment (the renderer picks the nearest ones). */
export const LOCAL_LIGHTS = 3;

/** Shared by every fragment shader: lighting, fog, per-voxel hash, cut tests, local lights. */
const COMMON_FRAG = /* glsl */ `
#define LIGHTS ${LOCAL_LIGHTS}
uniform sampler2D uPalette;
uniform vec3 uOriginVoxel;
uniform vec3 uSunDir;
uniform vec3 uSunColor;
uniform vec3 uSkyLight;
uniform vec3 uGroundLight;
uniform vec3 uFogColor;
uniform float uFogDensity;
uniform vec4 uCut; // focus x, cut y, focus z, radius (origin relative)
uniform float uCutOn;
uniform float uTime;
uniform vec4 uHole; // min x, min z, max x, max z (origin relative): where LOD columns give way to voxel chunks
uniform float uHoleOn;
uniform vec4 uBox; // follow cutaway: reference x, z (origin relative), sin and cos of its yaw
uniform vec4 uBoxExt; // metres ahead, behind, half width, floor y (origin relative)
uniform float uBoxOn;
uniform vec4 uLightPos[LIGHTS]; // origin relative xyz, reach in metres (0: off)
uniform vec3 uLightColor[LIGHTS];

float voxelHash(vec3 cell) {
  ivec3 c = ivec3(cell);
  uint h = uint(c.x) * 73856093u ^ uint(c.y) * 19349663u ^ uint(c.z) * 83492791u;
  h ^= h >> 13;
  h *= 0x5bd1e995u;
  h ^= h >> 15;
  return float(h & 0xffffu) / 65535.0;
}

vec3 applyFog(vec3 col, float viewDist) {
  float d = viewDist * uFogDensity;
  return mix(col, uFogColor, 1.0 - exp(-d * d));
}

vec3 lightFor(vec3 n) {
  vec3 ambient = mix(uGroundLight, uSkyLight, 0.5 + 0.5 * n.y);
  return ambient + uSunColor * max(dot(n, uSunDir), 0.0);
}

bool insideHole(vec3 rel) {
  return uHoleOn > 0.5 && rel.x > uHole.x && rel.x < uHole.z && rel.z > uHole.y && rel.z < uHole.w;
}

bool insideCut(vec3 rel) {
  if (uCutOn < 0.5) return false;
  vec2 d = rel.xz - uCut.xz;
  return dot(d, d) < uCut.w * uCut.w;
}

bool insideBoxPlan(vec3 rel) {
  vec2 d = rel.xz - uBox.xy;
  float along = d.x * uBox.z + d.y * uBox.w;
  float side = d.x * uBox.w - d.y * uBox.z;
  return along < uBoxExt.x && along > -uBoxExt.y && abs(side) < uBoxExt.z;
}

/** Removed by the horizontal cut plane (faces lying exactly in the plane go too: the cap replaces them). */
bool cutByPlane(vec3 rel) {
  return rel.y > uCut.y - 0.01 && insideCut(rel);
}

/** Removed by the follow cutaway. */
bool cutByBox(vec3 rel) {
  return uBoxOn > 0.5 && rel.y > uBoxExt.w - 0.01 && insideBoxPlan(rel);
}

/** Warm local light (work lamps, the breakthrough flash) on a surface point with normal n. */
vec3 localLight(vec3 rel, vec3 n) {
  vec3 sum = vec3(0.0);
  for (int i = 0; i < LIGHTS; i++) {
    float reach = uLightPos[i].w;
    if (reach <= 0.0) continue;
    vec3 d = uLightPos[i].xyz - rel;
    float dist = length(d);
    float a = clamp(1.0 - dist / reach, 0.0, 1.0);
    sum += uLightColor[i] * (a * a) * (0.35 + 0.65 * max(dot(n, d / max(dist, 0.001)), 0.0));
  }
  return sum;
}

/** 1 near voxel grid lines of a face, 0 inside; fades out once a voxel is smaller than about a pixel. */
float gridEdge(vec2 uv) {
  vec2 f = fract(uv);
  vec2 e = min(f, 1.0 - f);
  float px = max(fwidth(uv.x), fwidth(uv.y));
  float width = max(0.045, px * 0.75);
  float line = 1.0 - smoothstep(width * 0.5, width, min(e.x, e.y));
  return line * (1.0 - smoothstep(0.15, 0.5, px));
}
`;

export const CHUNK_VERT = /* glsl */ `
in uvec2 aQuad;
out vec3 vRel;
out vec2 vUv;
out float vViewDist;
flat out vec2 vSize;
flat out vec3 vNormal;
flat out int vMat;
flat out vec4 vAo;
flat out float vLod;
out vec3 vCell;

void main() {
  uint a = aQuad.x;
  uint b = aQuad.y;
  vec3 p = vec3(float(a & 63u), float((a >> 6) & 63u), float((a >> 12) & 63u));
  // Column batches (column-scene.ts): the flag bits carry the quad's patch and slab inside the batch,
  // bit 31 of word 0 marks a quad that gives way to voxel chunks inside the hole. Both are 0 for chunk meshes.
  p += 32.0 * vec3(float((b >> 18) & 31u), float((b >> 28) & 15u), float((b >> 23) & 31u));
  vLod = float(a >> 31);
  float w = float(((a >> 18) & 31u) + 1u);
  float h = float(((a >> 23) & 31u) + 1u);
  uint face = (a >> 28) & 7u;
  uint axis = face >> 1;
  bool negative = (face & 1u) == 1u;
  // u = (axis + 1) % 3, v = (axis + 2) % 3, so u x v = +normal and the unit quad is counter-clockwise from outside.
  vec3 n = axis == 0u ? vec3(1.0, 0.0, 0.0) : axis == 1u ? vec3(0.0, 1.0, 0.0) : vec3(0.0, 0.0, 1.0);
  vec3 u = axis == 0u ? vec3(0.0, 1.0, 0.0) : axis == 1u ? vec3(0.0, 0.0, 1.0) : vec3(1.0, 0.0, 0.0);
  vec3 v = axis == 0u ? vec3(0.0, 0.0, 1.0) : axis == 1u ? vec3(1.0, 0.0, 0.0) : vec3(0.0, 1.0, 0.0);
  vec2 c = position.xy;
  // Negative faces mirror the corner order to keep the outside counter-clockwise.
  if (negative) c.x = 1.0 - c.x;
  vec3 local = p + u * (c.x * w) + v * (c.y * h) + (negative ? vec3(0.0) : n);
  vUv = c * vec2(w, h);
  vSize = vec2(w, h);
  vNormal = negative ? -n : n;
  vMat = int(b & 1023u);
  uint ao = (b >> 10) & 255u;
  vAo = vec4(float(ao & 3u), float((ao >> 2) & 3u), float((ao >> 4) & 3u), float((ao >> 6) & 3u)) / 3.0;
  vCell = local;
  vRel = (modelMatrix * vec4(local, 1.0)).xyz;
  vec4 mv = modelViewMatrix * vec4(local, 1.0);
  vViewDist = length(mv.xyz);
  gl_Position = projectionMatrix * mv;
}
`;

/**
 * Defines select the pass:
 *   PASS_DEPTH  depth only (colour is not written): the top-down height map and the first-surface depth for x-ray
 *   PASS_SOLID  x-ray solids: faces below the terrain top of their column, i.e. tunnel and void walls
 *   PASS_GHOST  x-ray ghost: the first surface only, faint
 *   WATER       translucent pass
 */
export const CHUNK_FRAG = /* glsl */ `
${COMMON_FRAG}
uniform sampler2D uFirstDepth;
uniform vec2 uInvResolution;
uniform float uPeelEps;
uniform sampler2D uHeightTex; // top-down orthographic depth of the terrain
uniform vec4 uHeightRect; // min x, max z, size in texels (1 per voxel), top y (origin relative)
uniform float uHeightRange; // metres covered by depth 0..1
in vec3 vRel;
in vec2 vUv;
in float vViewDist;
flat in vec2 vSize;
flat in vec3 vNormal;
flat in int vMat;
flat in vec4 vAo;
flat in float vLod;
in vec3 vCell;

void main() {
  if (cutByPlane(vRel) || cutByBox(vRel)) discard;
  if (vLod > 0.5 && insideHole(vRel)) discard;
#ifdef PASS_DEPTH
  gl_FragColor = vec4(0.0);
#else
#ifdef PASS_SOLID
  // Underground test: compare against the terrain top of the column on the open side of the face.
  // The probe is pulled a hair inside the quad first: on a quad edge the interpolated position sits exactly
  // on a voxel boundary and would read the neighbouring column (dotted lines up every stepped wall).
  vec3 probe = vRel + vNormal * 0.5;
  if (vLod < 0.5) {
    vec3 an = abs(vNormal);
    vec3 ua = an.x > 0.5 ? vec3(0.0, 1.0, 0.0) : an.y > 0.5 ? vec3(0.0, 0.0, 1.0) : vec3(1.0, 0.0, 0.0);
    vec3 va = an.x > 0.5 ? vec3(0.0, 0.0, 1.0) : an.y > 0.5 ? vec3(1.0, 0.0, 0.0) : vec3(0.0, 1.0, 0.0);
    // vUv runs along +u and +v on every face (the vertex shader mirrors the corner, not the axis).
    vec2 nudge = clamp(vUv, vec2(0.02), vSize - 0.02) - vUv;
    probe += ua * nudge.x + va * nudge.y;
  }
  vec2 cell = vec2(floor(probe.x - uHeightRect.x), floor(uHeightRect.y - probe.z));
  if (cell.x < 0.0 || cell.y < 0.0 || cell.x >= uHeightRect.z || cell.y >= uHeightRect.z) discard;
  float top = uHeightRect.w - texelFetch(uHeightTex, ivec2(cell), 0).r * uHeightRange;
  if (vRel.y > top - 0.5) discard;
#endif
#ifdef PASS_GHOST
  if (gl_FragCoord.z > texture(uFirstDepth, gl_FragCoord.xy * uInvResolution).r + uPeelEps) discard;
#endif
  vec4 pal = texelFetch(uPalette, ivec2(vMat, 0), 0);
  vec3 world = vRel + uOriginVoxel;
#ifdef WATER
  // The ripple has an 18 m wavelength: fade it out before it aliases into rings at regional zoom.
  float metresPerPixel = max(fwidth(vRel.x), fwidth(vRel.z));
  float ripple = sin(world.x * 0.35 + uTime * 1.3) * sin(world.z * 0.31 - uTime * 1.1) * (1.0 - smoothstep(1.5, 5.0, metresPerPixel));
  // A slow long swell under the ripple, and a faint glint where the ripple faces the sun.
  float swell = sin((world.x + world.z) * 0.045 + uTime * 0.5) * (1.0 - smoothstep(6.0, 20.0, metresPerPixel));
  vec3 col = pal.rgb * lightFor(vNormal) * (1.0 + 0.06 * ripple + 0.03 * swell);
  col += vec3(1.0, 0.95, 0.85) * 0.05 * smoothstep(0.75, 1.0, ripple);
  col *= 1.0 - 0.10 * gridEdge(vUv);
  gl_FragColor = vec4(applyFog(col, vViewDist), pal.a);
#else
  if (!gl_FrontFacing) {
    // Inside of a shell opened by the cut: flat dark version of the material, reads as solid mass.
    gl_FragColor = vec4(applyFog(pal.rgb * (0.34 + 0.5 * localLight(vRel, -vNormal)), vViewDist), 1.0);
    return;
  }
  float px = max(fwidth(vUv.x), fwidth(vUv.y));
  float detail = 1.0 - smoothstep(0.15, 0.5, px);
  // The voxel behind this face: step half a voxel against the normal, then floor. LOD columns are scaled
  // cells, so they hash their own cell grid instead of world metres.
  float jitter = voxelHash(floor((vLod > 0.5 ? vCell : world) - vNormal * 0.5)) - 0.5;
  vec3 col = pal.rgb * (1.0 + 0.11 * jitter * detail);
  vec2 q = vUv / vSize;
  float ao = mix(mix(vAo.x, vAo.y, q.x), mix(vAo.z, vAo.w, q.x), q.y);
  col *= lightFor(vNormal) * mix(0.55, 1.0, ao) + localLight(vRel, vNormal);
  col *= 1.0 - 0.20 * gridEdge(vUv);
#ifdef PASS_SOLID
  col = mix(col, vec3(1.0, 0.62, 0.2), 0.25);
  gl_FragColor = vec4(applyFog(col, vViewDist), 1.0);
#elif defined(PASS_GHOST)
  gl_FragColor = vec4(applyFog(col * 0.9, vViewDist), 0.3);
#else
  gl_FragColor = vec4(applyFog(col, vViewDist), 1.0);
#endif
#endif
#endif
}
`;

/** Cap: one horizontal quad at the cut height, coloured from a material-id slice texture (RG8 = id low, id high). */
export const CAP_VERT = /* glsl */ `
uniform vec2 uCapSize;
out vec3 vRel;
out vec2 vCell;
out float vViewDist;
void main() {
  vec3 local = vec3(position.x * uCapSize.x, 0.0, position.y * uCapSize.y);
  vCell = local.xz;
  vRel = (modelMatrix * vec4(local, 1.0)).xyz;
  vec4 mv = modelViewMatrix * vec4(local, 1.0);
  vViewDist = length(mv.xyz);
  gl_Position = projectionMatrix * mv;
}
`;

export const CAP_FRAG = /* glsl */ `
${COMMON_FRAG}
uniform sampler2D uCapTex;
in vec3 vRel;
in vec2 vCell;
in float vViewDist;
void main() {
#ifdef FOR_BOX
  // Floor of the follow cutaway; where the cut plane is lower still, its own cap shows instead.
  if (uBoxOn < 0.5 || !insideBoxPlan(vRel) || cutByPlane(vRel + vec3(0.0, 0.02, 0.0))) discard;
#else
  if (!insideCut(vRel) || cutByBox(vRel + vec3(0.0, 0.02, 0.0))) discard;
#endif
  vec2 rg = texelFetch(uCapTex, ivec2(floor(vCell)), 0).rg;
  int id = int(rg.r * 255.0 + 0.5) + int(rg.g * 255.0 + 0.5) * 256;
  if (id == 0) discard;
  vec3 pal = texelFetch(uPalette, ivec2(id, 0), 0).rgb;
  vec3 world = vRel + uOriginVoxel;
  float px = max(fwidth(vCell.x), fwidth(vCell.y));
  float detail = 1.0 - smoothstep(0.15, 0.5, px);
  float jitter = voxelHash(floor(vec3(world.x, world.y - 0.5, world.z))) - 0.5;
  // Flat, slightly dimmed: a section through the mass, not a lit surface.
  vec3 col = pal * (0.80 + localLight(vRel, vec3(0.0, 1.0, 0.0))) * (1.0 + 0.11 * jitter * detail);
  col *= 1.0 - 0.26 * gridEdge(vCell);
  gl_FragColor = vec4(applyFog(col, vViewDist), 1.0);
}
`;

/**
 * Wall: vertical quads of a cut face (slice.ts WallStrip), coloured from a material-id texture with one
 * column per sample along the wall and one row per voxel layer. Local y is the row coordinate.
 */
export const WALL_VERT = /* glsl */ `
in float aU;
out vec3 vRel;
out vec2 vTexel;
out float vViewDist;
void main() {
  vTexel = vec2(aU, position.y);
  vRel = (modelMatrix * vec4(position, 1.0)).xyz;
  vec4 mv = modelViewMatrix * vec4(position, 1.0);
  vViewDist = length(mv.xyz);
  gl_Position = projectionMatrix * mv;
}
`;

export const WALL_FRAG = /* glsl */ `
${COMMON_FRAG}
uniform sampler2D uWallTex;
uniform vec2 uWallSize; // columns, rows
uniform float uWallMetres; // metres of wall per column
in vec3 vRel;
in vec2 vTexel;
in float vViewDist;
void main() {
#ifdef FOR_BOX
  if (cutByPlane(vRel)) discard;
#else
  if (cutByBox(vRel)) discard;
#endif
  ivec2 t = ivec2(floor(vTexel));
  if (t.x < 0 || t.y < 0 || t.x >= int(uWallSize.x) || t.y >= int(uWallSize.y)) discard;
  vec2 rg = texelFetch(uWallTex, t, 0).rg;
  int id = int(rg.r * 255.0 + 0.5) + int(rg.g * 255.0 + 0.5) * 256;
  // AIR and WATER: nothing to cut through.
  if (id <= 1) discard;
  vec3 pal = texelFetch(uPalette, ivec2(id, 0), 0).rgb;
  vec2 cell = vec2(vTexel.x * uWallMetres, vTexel.y);
  float px = max(fwidth(cell.x), fwidth(cell.y));
  float detail = 1.0 - smoothstep(0.15, 0.5, px);
  float jitter = voxelHash(vec3(floor(cell.x) + 17.0, floor(cell.y), 5.0)) - 0.5;
  // A section through the mass, a little darker than the cap so the corner between them reads.
  vec3 n = normalize(cross(dFdx(vRel), dFdy(vRel)));
  vec3 col = pal * (0.66 + localLight(vRel, n) + localLight(vRel, -n)) * (1.0 + 0.11 * jitter * detail);
  col *= 1.0 - 0.26 * gridEdge(cell);
  gl_FragColor = vec4(applyFog(col, vViewDist), 1.0);
}
`;

/** Sky: full-screen triangle at the far plane, vertical gradient from the fog colour at the horizon to the zenith. */
export const SKY_VERT = /* glsl */ `
uniform vec3 uCamRight; // scaled by tan(fov / 2) * aspect
uniform vec3 uCamUp; // scaled by tan(fov / 2)
uniform vec3 uCamForward;
out vec3 vDir;
void main() {
  vDir = uCamForward + position.x * uCamRight + position.y * uCamUp;
  gl_Position = vec4(position.xy, 1.0, 1.0);
}
`;

export const SKY_FRAG = /* glsl */ `
uniform vec3 uFogColor;
uniform vec3 uZenith;
uniform vec3 uSunDir;
in vec3 vDir;
void main() {
  vec3 d = normalize(vDir);
  float t = pow(clamp(d.y, 0.0, 1.0), 0.55);
  vec3 col = mix(uFogColor, uZenith, t);
  float sun = max(dot(d, uSunDir), 0.0);
  col += vec3(1.0, 0.9, 0.7) * (0.25 * pow(sun, 24.0) + 0.5 * pow(sun, 600.0));
  gl_FragColor = vec4(col, 1.0);
}
`;
