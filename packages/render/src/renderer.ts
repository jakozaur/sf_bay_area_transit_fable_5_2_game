/**
 * WebGL chunk renderer (doc 03 Recommendations): three.js WebGLRenderer, packed instanced quads decoded in a
 * custom ShaderMaterial, palette texture, camera-relative rendering, sky + fog, translucent water pass,
 * cut plane with slice-texture cap, x-ray mode, plus the overlay layer and the hover highlight.
 */
import {
  type CameraState,
  CHUNK_SIZE,
  type ChunkData,
  type ChunkKey,
  type ChunkRenderer,
  type MeshOutput,
  type RenderStats,
  unpackChunkKey,
  VOXEL_SIZE_M,
  type VoxelCoord,
} from '@bayvox/core';
import {
  BoxGeometry,
  BufferAttribute,
  BufferGeometry,
  Color,
  DataTexture,
  DepthTexture,
  DirectionalLight,
  DoubleSide,
  EdgesGeometry,
  FogExp2,
  FrontSide,
  HemisphereLight,
  type IUniform,
  LineBasicMaterial,
  LineSegments,
  Mesh,
  NearestFilter,
  OrthographicCamera,
  PerspectiveCamera,
  PointLight,
  RGBAFormat,
  RGFormat,
  Scene,
  ShaderMaterial,
  UnsignedByteType,
  Vector2,
  Vector3,
  Vector4,
  WebGLRenderer,
  WebGLRenderTarget,
} from 'three';
import { CAP_MAX_RADIUS, type CapRegion, capRegion, fillCapLayer, sameRegion } from './cap.ts';
import { ChunkScene, LAYER_OVERLAY, LAYER_SKY, LAYER_TERRAIN } from './chunk-scene.ts';
import { type ColumnBatchPart, type ColumnBatchPlacement, ColumnScene } from './column-scene.ts';
import { OverlayLayer } from './overlay.ts';
import { buildPaletteRgba, PALETTE_WIDTH } from './palette.ts';
import { CAP_FRAG, CAP_VERT, CHUNK_FRAG, CHUNK_VERT, LOCAL_LIGHTS, SKY_FRAG, SKY_VERT } from './shaders.ts';
import { type Cutaway, cutawayFootprint, cutawayStrip, cylinderStrip, fillLayerRect, WALL_MAX_ROWS } from './slice.ts';
import { WallMesh } from './wall.ts';

export interface VoxelRendererOptions {
  canvas: HTMLCanvasElement;
  /** Voxel source for the cut-plane cap. Without it the cut still discards but shows no cap. */
  world?: { getChunk(key: ChunkKey): ChunkData | undefined };
  antialias?: boolean;
}

/** Per-frame view settings that are not part of CameraState. */
export interface ViewOptions {
  /** Radius around the camera target inside which CameraState.cutY applies, metres. At most CAP_MAX_RADIUS. */
  cutRadius: number;
  /** X-ray: terrain is drawn as a faint ghost, faces below the terrain top (tunnels, enclosed voids) solid. */
  xray: boolean;
  /** Animation time in seconds (water ripple). Hold it constant for stable screenshots. */
  time: number;
  /**
   * Follow cutaway: when true (the default) the trench set on the overlay (OverlayLayer.setCutaway, which the
   * entity layer does for the possessed machine) is opened. False keeps the ground closed whatever the overlay asks.
   */
  followCut: boolean;
}

const SUN_DIR = new Vector3(0.45, 0.8, 0.35).normalize();
const FOG_COLOR = new Color(0.74, 0.83, 0.91);
const ZENITH_COLOR = new Color(0.33, 0.56, 0.84);
/** Fog reaches about 90 percent at the far plane. */
const FOG_AT_FAR = 1.5;
/** Window-space depth slack when matching fragments to the first-surface depth texture. */
const PEEL_EPS = 4e-6;
/** X-ray height map: edge in voxels (one texel each) and the vertical span around the focus it resolves. */
const HEIGHT_MAP_SIZE = 1024;
const HEIGHT_MAP_SPAN = 1024;
const HEIGHT_MAP_SNAP = 64;

type Uniforms = Record<string, IUniform>;

// The renderer treats one voxel as one metre throughout (camera, cut, overlays). A different voxel size needs a scale here.
if (VOXEL_SIZE_M !== 1) throw new Error(`render: VOXEL_SIZE_M is ${VOXEL_SIZE_M}; the renderer assumes 1 m voxels`);

export class VoxelRenderer implements ChunkRenderer {
  /** Polylines, markers and simple meshes in world metres. */
  readonly overlay = new OverlayLayer();
  private readonly gl: WebGLRenderer;
  private readonly scene = new Scene();
  private readonly camera = new PerspectiveCamera();
  private readonly chunks: ChunkScene;
  private readonly columns: ColumnScene;
  private readonly world: VoxelRendererOptions['world'];
  private readonly uniforms: Uniforms;
  private readonly skyUniforms: Uniforms;
  private readonly capUniforms: Uniforms;
  private readonly opaqueMaterial: ShaderMaterial;
  private readonly depthMaterial: ShaderMaterial;
  private readonly solidMaterial: ShaderMaterial;
  private readonly ghostMaterial: ShaderMaterial;
  private readonly cap: Mesh;
  /** Ring wall of the cut plane, and floor and walls of the follow cutaway. */
  private readonly cutWall: WallMesh;
  private readonly boxWall: WallMesh;
  private readonly boxFloor: Mesh;
  private readonly boxFloorUniforms: Uniforms;
  private boxFloorTexture: DataTexture | null = null;
  private boxFloorData = new Uint8Array(0);
  private readonly pointLights: PointLight[] = [];
  /** Bumped whenever voxel data may have changed (a chunk upload); slices filled at an older version are stale. */
  private voxelVersion = 0;
  private cutWallKey = '';
  private boxKey = '';
  /** Highest chunk layer that has ever had a mesh: how far up cut walls need to reach. */
  private topCy = Number.NEGATIVE_INFINITY;
  private readonly highlight: LineSegments;
  private readonly fog: FogExp2;
  private readonly firstDepth: WebGLRenderTarget;
  private readonly heightMap: WebGLRenderTarget;
  private readonly heightCamera = new OrthographicCamera(
    -HEIGHT_MAP_SIZE / 2,
    HEIGHT_MAP_SIZE / 2,
    HEIGHT_MAP_SIZE / 2,
    -HEIGHT_MAP_SIZE / 2,
    0,
    HEIGHT_MAP_SPAN,
  );
  private readonly paletteTexture: DataTexture;
  private capTexture: DataTexture | null = null;
  private capData = new Uint8Array(0);
  private capShown: CapRegion | null = null;
  private capDirty = true;
  /** Bumped whenever chunk geometry changes; the x-ray height map is redrawn only when it or its placement changes. */
  private terrainVersion = 0;
  private heightMapKey = '';
  /** Bumped by every state change that alters the picture apart from the camera passed to draw(). */
  private changes = 0;
  private origin: VoxelCoord = { x: 0, y: 0, z: 0 };
  private highlightVoxel: VoxelCoord | null = null;
  private hole: [number, number, number, number] | null = null;
  private view: ViewOptions = { cutRadius: 160, xray: false, time: 0, followCut: true };
  private lastStats = { drawCalls: 0, triangles: 0 };

  constructor(opts: VoxelRendererOptions) {
    this.world = opts.world;
    // Throws with three's own message if WebGL2 is unavailable.
    this.gl = new WebGLRenderer({
      canvas: opts.canvas,
      antialias: opts.antialias ?? true,
      alpha: false,
      powerPreference: 'high-performance',
    });
    this.gl.autoClear = false;
    this.gl.info.autoReset = false;
    this.gl.setClearColor(FOG_COLOR, 1);

    this.paletteTexture = new DataTexture(buildPaletteRgba(), PALETTE_WIDTH, 1, RGBAFormat, UnsignedByteType);
    this.paletteTexture.minFilter = NearestFilter;
    this.paletteTexture.magFilter = NearestFilter;
    this.paletteTexture.needsUpdate = true;

    this.firstDepth = new WebGLRenderTarget(1, 1, { depthBuffer: true, depthTexture: new DepthTexture(1, 1) });
    this.heightMap = new WebGLRenderTarget(HEIGHT_MAP_SIZE, HEIGHT_MAP_SIZE, {
      depthBuffer: true,
      depthTexture: new DepthTexture(HEIGHT_MAP_SIZE, HEIGHT_MAP_SIZE),
    });
    // Looking straight down with -z up: texel x grows with world x, texel y with -z.
    this.heightCamera.up.set(0, 0, -1);
    this.heightCamera.layers.set(LAYER_TERRAIN);

    this.uniforms = {
      uPalette: { value: this.paletteTexture },
      uOriginVoxel: { value: new Vector3() },
      uSunDir: { value: SUN_DIR },
      uSunColor: { value: new Vector3(0.55, 0.52, 0.46) },
      uSkyLight: { value: new Vector3(0.62, 0.66, 0.72) },
      uGroundLight: { value: new Vector3(0.36, 0.34, 0.32) },
      uFogColor: { value: FOG_COLOR },
      uFogDensity: { value: 0 },
      uCut: { value: new Vector4() },
      uCutOn: { value: 0 },
      uHole: { value: new Vector4() },
      uHoleOn: { value: 0 },
      uTime: { value: 0 },
      uFirstDepth: { value: this.firstDepth.depthTexture },
      uInvResolution: { value: new Vector2(1, 1) },
      uPeelEps: { value: PEEL_EPS },
      uHeightTex: { value: this.heightMap.depthTexture },
      uHeightRect: { value: new Vector4() },
      uHeightRange: { value: HEIGHT_MAP_SPAN },
      uBox: { value: new Vector4() },
      uBoxExt: { value: new Vector4() },
      uBoxOn: { value: 0 },
      uLightPos: { value: Array.from({ length: LOCAL_LIGHTS }, () => new Vector4()) },
      uLightColor: { value: Array.from({ length: LOCAL_LIGHTS }, () => new Vector3()) },
    };
    const chunkMaterial = (defines: Record<string, string>): ShaderMaterial =>
      new ShaderMaterial({ uniforms: this.uniforms, vertexShader: CHUNK_VERT, fragmentShader: CHUNK_FRAG, defines });
    this.opaqueMaterial = chunkMaterial({});
    const waterMaterial = chunkMaterial({ WATER: '' });
    waterMaterial.transparent = true;
    waterMaterial.depthWrite = false;
    this.depthMaterial = chunkMaterial({ PASS_DEPTH: '' });
    this.depthMaterial.colorWrite = false;
    this.solidMaterial = chunkMaterial({ PASS_SOLID: '' });
    this.ghostMaterial = chunkMaterial({ PASS_GHOST: '' });
    this.ghostMaterial.transparent = true;
    this.ghostMaterial.depthTest = false;
    this.ghostMaterial.depthWrite = false;

    this.chunks = new ChunkScene(this.opaqueMaterial, waterMaterial);
    this.columns = new ColumnScene(this.opaqueMaterial, waterMaterial);
    this.scene.add(this.chunks.terrain, this.chunks.water, this.columns.terrain, this.columns.water, this.overlay.group);

    // Sky: one triangle covering the screen at the far plane, drawn first.
    this.skyUniforms = {
      uCamRight: { value: new Vector3() },
      uCamUp: { value: new Vector3() },
      uCamForward: { value: new Vector3() },
      uFogColor: { value: FOG_COLOR },
      uZenith: { value: ZENITH_COLOR },
      uSunDir: { value: SUN_DIR },
    };
    const skyGeometry = new BufferGeometry();
    skyGeometry.setAttribute('position', new BufferAttribute(new Float32Array([-1, -1, 0, 3, -1, 0, -1, 3, 0]), 3));
    const sky = new Mesh(
      skyGeometry,
      new ShaderMaterial({
        uniforms: this.skyUniforms,
        vertexShader: SKY_VERT,
        fragmentShader: SKY_FRAG,
        depthTest: false,
        depthWrite: false,
      }),
    );
    sky.frustumCulled = false;
    sky.renderOrder = -1000;
    sky.layers.set(LAYER_SKY);
    this.scene.add(sky);

    // Cap quad for the cut plane.
    this.capUniforms = { ...this.uniforms, uCapTex: { value: null }, uCapSize: { value: new Vector2(1, 1) } };
    const capGeometry = new BufferGeometry();
    capGeometry.setAttribute('position', new BufferAttribute(new Float32Array([0, 0, 0, 1, 0, 0, 1, 1, 0, 0, 1, 0]), 3));
    capGeometry.setIndex([0, 1, 2, 0, 2, 3]);
    this.cap = new Mesh(
      capGeometry,
      new ShaderMaterial({ uniforms: this.capUniforms, vertexShader: CAP_VERT, fragmentShader: CAP_FRAG, side: DoubleSide }),
    );
    this.cap.frustumCulled = false;
    this.cap.visible = false;
    this.cap.layers.set(LAYER_OVERLAY);
    this.scene.add(this.cap);

    // Cut faces that are not the horizontal cap: the ring wall of the cut plane, floor and walls of the follow cutaway.
    this.cutWall = new WallMesh(this.uniforms, false);
    this.boxWall = new WallMesh(this.uniforms, true);
    this.boxFloorUniforms = { ...this.uniforms, uCapTex: { value: null }, uCapSize: { value: new Vector2(1, 1) } };
    this.boxFloor = new Mesh(
      capGeometry,
      new ShaderMaterial({
        uniforms: this.boxFloorUniforms,
        vertexShader: CAP_VERT,
        fragmentShader: CAP_FRAG,
        side: DoubleSide,
        defines: { FOR_BOX: '' },
      }),
    );
    this.boxFloor.frustumCulled = false;
    this.boxFloor.visible = false;
    this.boxFloor.layers.set(LAYER_OVERLAY);
    this.scene.add(this.cutWall.mesh, this.boxWall.mesh, this.boxFloor);

    // Hover box, slightly larger than a voxel so it does not z-fight the faces.
    this.highlight = new LineSegments(new EdgesGeometry(new BoxGeometry(1.04, 1.04, 1.04)), new LineBasicMaterial({ color: 0xfff176 }));
    this.highlight.visible = false;
    this.highlight.layers.set(LAYER_OVERLAY);
    this.scene.add(this.highlight);

    // Lights and fog for overlay meshes (three materials); chunk shaders implement the same look themselves.
    const hemi = new HemisphereLight(0xd6e4f5, 0x6b655e, 2.2);
    const sun = new DirectionalLight(0xfff1dc, 2.0);
    sun.position.copy(SUN_DIR);
    for (const light of [hemi, sun]) {
      light.layers.enableAll();
      this.scene.add(light);
    }
    // Local lights for overlay meshes: a fixed set, dark when unused, so material programs never recompile.
    for (let i = 0; i < LOCAL_LIGHTS; i++) {
      // Decay 0: no inverse-square blow-up next to the lamp; the cutoff distance shapes the falloff.
      const light = new PointLight(0xffffff, 0, 1, 0);
      light.layers.enableAll();
      this.pointLights.push(light);
      this.scene.add(light);
    }
    this.fog = new FogExp2(FOG_COLOR, 0);
    this.scene.fog = this.fog;
  }

  /** WebGL UNMASKED_RENDERER string. */
  rendererString(): string {
    const gl = this.gl.getContext();
    const ext = gl.getExtension('WEBGL_debug_renderer_info');
    const name: unknown = gl.getParameter(ext ? ext.UNMASKED_RENDERER_WEBGL : gl.RENDERER);
    if (typeof name !== 'string' || name === '') throw new Error('VoxelRenderer: WebGL returned no renderer string');
    return name;
  }

  /** Device pixels per CSS pixel currently in use. */
  get pixelRatio(): number {
    return this.gl.getPixelRatio();
  }

  /**
   * Changes whenever something other than the camera would alter the next frame: chunk uploads and removals,
   * overlay edits, view settings, highlight, origin, size. A caller may skip draw() while this and the camera are unchanged.
   */
  get revision(): number {
    return this.changes + this.terrainVersion + this.overlay.revision;
  }

  /** Sets the drawing buffer to `width` x `height` CSS pixels times `pixelRatio`. */
  resize(width: number, height: number, pixelRatio: number): void {
    if (!(width > 0) || !(height > 0) || !(pixelRatio > 0)) {
      throw new RangeError(`VoxelRenderer.resize: bad size ${width} x ${height} at ratio ${pixelRatio}`);
    }
    this.changes++;
    this.gl.setPixelRatio(pixelRatio);
    this.gl.setSize(width, height, false);
    const buffer = this.gl.getDrawingBufferSize(new Vector2());
    this.firstDepth.setSize(buffer.x, buffer.y);
    (this.uniforms.uInvResolution as IUniform<Vector2>).value.set(1 / buffer.x, 1 / buffer.y);
  }

  upload(mesh: MeshOutput): void {
    this.chunks.upload(mesh);
    // An upload means voxels changed or arrived: the cut-face slices and the height map may be stale.
    this.capDirty = true;
    this.voxelVersion++;
    if (mesh.quads.length > 0) this.topCy = Math.max(this.topCy, unpackChunkKey(mesh.key).cy);
    this.terrainVersion++;
  }

  remove(key: ChunkKey): void {
    this.chunks.remove(key);
    this.terrainVersion++;
  }

  /**
   * Adds or replaces a batch of column patch meshes (LOD tiers, see column-scene.ts). Batches are drawn with
   * the chunk materials; inside the column hole (setColumnHole) they give way to voxel chunks.
   */
  setColumnBatch(id: string, parts: readonly ColumnBatchPart[], placement: ColumnBatchPlacement): void {
    this.columns.setBatch(id, parts, placement);
    this.terrainVersion++;
  }

  removeColumnBatch(id: string): void {
    if (this.columns.removeBatch(id)) this.terrainVersion++;
  }

  setColumnBatchVisible(id: string, visible: boolean): void {
    if (this.columns.setVisible(id, visible)) this.terrainVersion++;
  }

  /**
   * Plan rectangle in world metres [minX, minZ, maxX, maxZ] inside which column batches are not drawn
   * because voxel chunks cover it; null for no hole.
   */
  setColumnHole(rect: readonly [number, number, number, number] | null): void {
    const old = this.hole;
    if (rect === null ? old === null : old !== null && rect.every((v, i) => v === old[i])) return;
    if (rect !== null && !(rect.every(Number.isFinite) && rect[2] > rect[0] && rect[3] > rect[1])) {
      throw new RangeError(`VoxelRenderer.setColumnHole: bad rectangle [${rect.join(', ')}]`);
    }
    this.hole = rect === null ? null : [rect[0], rect[1], rect[2], rect[3]];
    this.terrainVersion++;
  }

  /** Shows or hides all voxel chunk meshes (they are kept). Used when the view is too far out for them to matter. */
  setChunksVisible(visible: boolean): void {
    if (this.chunks.terrain.visible === visible) return;
    this.chunks.terrain.visible = visible;
    this.chunks.water.visible = visible;
    this.terrainVersion++;
  }

  /** Quads held in column batches, visible or not. */
  columnQuadCount(): number {
    return this.columns.quadCount;
  }

  setRenderOrigin(chunk: VoxelCoord): void {
    this.chunks.setOrigin(chunk.x, chunk.y, chunk.z);
    this.columns.setOrigin(chunk.x, chunk.y, chunk.z);
    this.overlay.setOrigin(chunk.x, chunk.y, chunk.z);
    this.changes++;
    this.origin = { x: chunk.x, y: chunk.y, z: chunk.z };
  }

  /** Current floating origin as a chunk coordinate. */
  renderOrigin(): VoxelCoord {
    return { ...this.origin };
  }

  setView(v: Partial<ViewOptions>): void {
    const next = { ...this.view, ...v };
    if (!(next.cutRadius > 0) || next.cutRadius > CAP_MAX_RADIUS) {
      throw new RangeError(`VoxelRenderer.setView: cutRadius must be in (0, ${CAP_MAX_RADIUS}] m, got ${next.cutRadius}`);
    }
    if (
      next.cutRadius !== this.view.cutRadius ||
      next.xray !== this.view.xray ||
      next.time !== this.view.time ||
      next.followCut !== this.view.followCut
    ) {
      this.changes++;
    }
    this.view = next;
  }

  /** Shows the hover box around a world voxel, or hides it with null. */
  setHighlight(voxel: VoxelCoord | null): void {
    const old = this.highlightVoxel;
    if (voxel === null ? old === null : old !== null && old.x === voxel.x && old.y === voxel.y && old.z === voxel.z) return;
    this.changes++;
    this.highlightVoxel = voxel === null ? null : { ...voxel };
  }

  /** Quads in uploaded chunk meshes, opaque plus transparent. Column batches are counted by columnQuadCount(). */
  quadCount(): number {
    return this.chunks.quadCount;
  }

  draw(camera: CameraState, _alpha: number): void {
    // Chunk meshes are drawn in batches; the batches whose chunks changed since the last frame are rebuilt now.
    this.chunks.flush();
    const ox = this.origin.x * CHUNK_SIZE;
    const oy = this.origin.y * CHUNK_SIZE;
    const oz = this.origin.z * CHUNK_SIZE;
    const cam = this.camera;
    cam.position.set(camera.position.x - ox, camera.position.y - oy, camera.position.z - oz);
    cam.up.set(0, 1, 0);
    cam.lookAt(camera.target.x - ox, camera.target.y - oy, camera.target.z - oz);
    cam.fov = camera.fovYDeg;
    cam.aspect = camera.aspect;
    cam.near = camera.near;
    cam.far = camera.far;
    cam.updateProjectionMatrix();
    cam.updateMatrixWorld();

    const u = this.uniforms;
    (u.uOriginVoxel as IUniform<Vector3>).value.set(ox, oy, oz);
    const density = FOG_AT_FAR / camera.far;
    u.uFogDensity.value = density;
    this.fog.density = density;
    u.uTime.value = this.view.time;
    const cutOn = camera.cutY !== undefined;
    u.uCutOn.value = cutOn ? 1 : 0;
    if (camera.cutY !== undefined) {
      (u.uCut as IUniform<Vector4>).value.set(camera.target.x - ox, camera.cutY - oy, camera.target.z - oz, this.view.cutRadius);
    }
    const hole = this.hole;
    u.uHoleOn.value = hole === null ? 0 : 1;
    if (hole !== null) (u.uHole as IUniform<Vector4>).value.set(hole[0] - ox, hole[1] - oz, hole[2] - ox, hole[3] - oz);
    const box = this.view.followCut ? this.overlay.cutaway : null;
    u.uBoxOn.value = box === null ? 0 : 1;
    if (box !== null) {
      (u.uBox as IUniform<Vector4>).value.set(box.position.x - ox, box.position.z - oz, Math.sin(box.yaw), Math.cos(box.yaw));
      (u.uBoxExt as IUniform<Vector4>).value.set(box.aheadM, box.behindM, box.halfWidthM, box.floorY - oy);
    }
    this.updateLights(camera, ox, oy, oz);
    // With a cut active, back faces show the dark inside of opened shells.
    const side = cutOn || box !== null ? DoubleSide : FrontSide;
    if (this.opaqueMaterial.side !== side) {
      this.opaqueMaterial.side = side;
      this.opaqueMaterial.needsUpdate = true;
    }
    this.updateCap(camera, ox, oy, oz);
    this.updateCutWall(camera, ox, oy, oz);
    this.updateBox(box, ox, oy, oz);

    // Sky ray basis from the camera matrix columns.
    const e = cam.matrixWorld.elements;
    const t = Math.tan((camera.fovYDeg * Math.PI) / 360);
    (this.skyUniforms.uCamRight as IUniform<Vector3>).value
      .set(e[0] as number, e[1] as number, e[2] as number)
      .multiplyScalar(t * camera.aspect);
    (this.skyUniforms.uCamUp as IUniform<Vector3>).value.set(e[4] as number, e[5] as number, e[6] as number).multiplyScalar(t);
    (this.skyUniforms.uCamForward as IUniform<Vector3>).value.set(-(e[8] as number), -(e[9] as number), -(e[10] as number));

    const h = this.highlightVoxel;
    this.highlight.visible = h !== null;
    if (h !== null) this.highlight.position.set(h.x + 0.5 - ox, h.y + 0.5 - oy, h.z + 0.5 - oz);
    const bufferHeight = this.gl.getDrawingBufferSize(new Vector2()).y / this.gl.getPixelRatio();
    this.overlay.updateMarkers(camera.position, bufferHeight / ((camera.fovYDeg * Math.PI) / 180));

    const gl = this.gl;
    gl.info.reset();
    if (this.view.xray) {
      // 1. Terrain top per column, seen from above, into a depth texture (no cut: the real ground).
      // The map is centred on the focus snapped to a coarse grid, so panning redraws it only now and then.
      const snap = (v: number): number => Math.round(v / HEIGHT_MAP_SNAP) * HEIGHT_MAP_SNAP;
      const fx = snap(camera.target.x) - ox;
      const fz = snap(camera.target.z) - oz;
      const top = snap(camera.target.y) - oy + HEIGHT_MAP_SPAN / 2;
      this.scene.overrideMaterial = this.depthMaterial;
      const heightMapKey = `${this.terrainVersion}|${ox},${oy},${oz}|${fx},${top},${fz}`;
      if (heightMapKey !== this.heightMapKey) {
        this.heightMapKey = heightMapKey;
        const hc = this.heightCamera;
        hc.position.set(fx, top, fz);
        hc.lookAt(fx, top - 1, fz);
        hc.updateMatrixWorld();
        (u.uHeightRect as IUniform<Vector4>).value.set(fx - HEIGHT_MAP_SIZE / 2, fz + HEIGHT_MAP_SIZE / 2, HEIGHT_MAP_SIZE, top);
        u.uCutOn.value = 0;
        u.uBoxOn.value = 0;
        gl.setRenderTarget(this.heightMap);
        gl.clear();
        gl.render(this.scene, hc);
        u.uCutOn.value = cutOn ? 1 : 0;
        u.uBoxOn.value = box === null ? 0 : 1;
      }
      // 2. Depth of the first surface from the camera.
      cam.layers.set(LAYER_TERRAIN);
      gl.setRenderTarget(this.firstDepth);
      gl.clear();
      gl.render(this.scene, cam);
      gl.setRenderTarget(null);
      gl.clear();
      // 3. Sky.
      this.scene.overrideMaterial = null;
      cam.layers.set(LAYER_SKY);
      gl.render(this.scene, cam);
      // 4. Faces below the terrain top (tunnels, voids), solid and depth sorted among themselves.
      cam.layers.set(LAYER_TERRAIN);
      this.scene.overrideMaterial = this.solidMaterial;
      gl.render(this.scene, cam);
      // 5. The first surface as a faint ghost over everything.
      this.scene.overrideMaterial = this.ghostMaterial;
      gl.render(this.scene, cam);
      // 6. Cap, overlays, highlight.
      this.scene.overrideMaterial = null;
      cam.layers.set(LAYER_OVERLAY);
      gl.render(this.scene, cam);
    } else {
      cam.layers.enableAll();
      gl.clear();
      gl.render(this.scene, cam);
    }
    this.lastStats = { drawCalls: gl.info.render.calls, triangles: gl.info.render.triangles };
  }

  /** Blocks until the GPU has executed every queued command. For benchmarks only. */
  finish(): void {
    this.gl.getContext().finish();
  }

  stats(): RenderStats {
    return {
      drawCalls: this.lastStats.drawCalls,
      triangles: this.lastStats.triangles,
      chunksLoaded: this.chunks.chunkCount,
      chunksMeshed: this.chunks.meshedCount,
      gpuBytes:
        this.chunks.quadBytes +
        this.columns.quadBytes +
        PALETTE_WIDTH * 4 +
        this.capData.byteLength +
        this.cutWall.bytes +
        this.boxWall.bytes +
        this.boxFloorData.byteLength,
    };
  }

  dispose(): void {
    this.chunks.dispose();
    this.columns.dispose();
    this.overlay.clear();
    this.capTexture?.dispose();
    this.boxFloorTexture?.dispose();
    this.cutWall.dispose();
    this.boxWall.dispose();
    this.paletteTexture.dispose();
    this.firstDepth.dispose();
    this.heightMap.dispose();
    this.gl.dispose();
  }

  private updateCap(camera: CameraState, ox: number, oy: number, oz: number): void {
    if (camera.cutY === undefined || this.world === undefined) {
      this.cap.visible = false;
      return;
    }
    const region = capRegion(camera.cutY, camera.target.x, camera.target.z, this.view.cutRadius);
    if (this.capDirty || !sameRegion(this.capShown, region)) {
      const size = region.n * CHUNK_SIZE;
      if (this.capTexture === null || this.capTexture.image.width !== size) {
        this.capTexture?.dispose();
        this.capData = new Uint8Array(size * size * 2);
        this.capTexture = new DataTexture(this.capData, size, size, RGFormat, UnsignedByteType);
        this.capTexture.minFilter = NearestFilter;
        this.capTexture.magFilter = NearestFilter;
        this.capUniforms.uCapTex.value = this.capTexture;
      }
      fillCapLayer(this.world, region, this.capData);
      this.capTexture.needsUpdate = true;
      (this.capUniforms.uCapSize as IUniform<Vector2>).value.set(size, size);
      this.capShown = region;
      this.capDirty = false;
    }
    this.cap.visible = true;
    this.cap.position.set(region.cx0 * CHUNK_SIZE - ox, camera.cutY - oy, region.cz0 * CHUNK_SIZE - oz);
  }

  /** Rows a cut wall starting at layer `y0` needs to reach the top of everything meshed so far; 0 for nothing. */
  private wallRows(y0: number): number {
    if (this.topCy === Number.NEGATIVE_INFINITY) return 0;
    return Math.max(0, Math.min(WALL_MAX_ROWS, (this.topCy + 1) * CHUNK_SIZE - y0));
  }

  /** The ring wall of the cut plane: without it the side of the cut shows the sky colour instead of ground. */
  private updateCutWall(camera: CameraState, ox: number, oy: number, oz: number): void {
    const wall = this.cutWall;
    if (camera.cutY === undefined || this.world === undefined) {
      wall.mesh.visible = false;
      return;
    }
    const y0 = Math.ceil(camera.cutY);
    const rows = this.wallRows(y0);
    if (rows === 0) {
      wall.mesh.visible = false;
      return;
    }
    const r = this.view.cutRadius;
    const key = `${this.voxelVersion}|${camera.target.x},${camera.target.z},${r},${y0},${rows}`;
    if (key !== this.cutWallKey) {
      this.cutWallKey = key;
      wall.update(this.world, cylinderStrip(camera.target.x, camera.target.z, r), y0, rows, `cyl${r}`);
    }
    wall.mesh.visible = true;
    wall.mesh.position.set(camera.target.x - ox, y0 - oy, camera.target.z - oz);
  }

  /** Floor and walls of the follow cutaway. */
  private updateBox(box: Cutaway | null, ox: number, oy: number, oz: number): void {
    if (box === null || this.world === undefined) {
      this.boxWall.mesh.visible = false;
      this.boxFloor.visible = false;
      return;
    }
    const rows = this.wallRows(box.floorY);
    const foot = cutawayFootprint(box);
    const key = `${this.voxelVersion}|${box.position.x},${box.position.z},${box.yaw},${box.aheadM},${box.behindM},${box.halfWidthM},${box.floorY},${rows}`;
    if (key !== this.boxKey) {
      this.boxKey = key;
      if (rows > 0) {
        this.boxWall.update(
          this.world,
          cutawayStrip(box),
          box.floorY,
          rows,
          `box${box.yaw},${box.aheadM},${box.behindM},${box.halfWidthM}`,
        );
      }
      if (this.boxFloorTexture === null || this.boxFloorTexture.image.width !== foot.w || this.boxFloorTexture.image.height !== foot.d) {
        this.boxFloorTexture?.dispose();
        this.boxFloorData = new Uint8Array(foot.w * foot.d * 2);
        this.boxFloorTexture = new DataTexture(this.boxFloorData, foot.w, foot.d, RGFormat, UnsignedByteType);
        this.boxFloorTexture.minFilter = NearestFilter;
        this.boxFloorTexture.magFilter = NearestFilter;
        this.boxFloorTexture.unpackAlignment = 1;
        this.boxFloorUniforms.uCapTex.value = this.boxFloorTexture;
        (this.boxFloorUniforms.uCapSize as IUniform<Vector2>).value.set(foot.w, foot.d);
      }
      fillLayerRect(this.world, foot.x0, foot.z0, foot.w, foot.d, box.floorY - 1, this.boxFloorData);
      this.boxFloorTexture.needsUpdate = true;
    }
    this.boxWall.mesh.visible = rows > 0;
    this.boxWall.mesh.position.set(box.position.x - ox, box.floorY - oy, box.position.z - oz);
    this.boxFloor.visible = true;
    this.boxFloor.position.set(foot.x0 - ox, box.floorY - oy, foot.z0 - oz);
  }

  /** Hands the local lights nearest to the camera focus to the chunk shaders and to the point lights of the overlay meshes. */
  private updateLights(camera: CameraState, ox: number, oy: number, oz: number): void {
    const t = camera.target;
    const nearest = [...this.overlay.lights.values()]
      .filter((l) => l.intensity > 0)
      .map((l) => ({ l, d: Math.hypot(l.position.x - t.x, l.position.y - t.y, l.position.z - t.z) }))
      .sort((a, b) => a.d - b.d);
    const pos = (this.uniforms.uLightPos as IUniform<Vector4[]>).value;
    const col = (this.uniforms.uLightColor as IUniform<Vector3[]>).value;
    for (let i = 0; i < LOCAL_LIGHTS; i++) {
      const entry = nearest[i];
      const p = pos[i] as Vector4;
      const point = this.pointLights[i] as PointLight;
      if (entry === undefined) {
        p.set(0, 0, 0, 0);
        point.intensity = 0;
        continue;
      }
      const l = entry.l;
      p.set(l.position.x - ox, l.position.y - oy, l.position.z - oz, l.radiusM);
      // Display-space colour times intensity: the chunk shaders light sRGB bytes directly.
      (col[i] as Vector3)
        .set(((l.color >> 16) & 255) / 255, ((l.color >> 8) & 255) / 255, (l.color & 255) / 255)
        .multiplyScalar(l.intensity);
      point.color.setHex(l.color);
      point.intensity = l.intensity * 3;
      point.distance = l.radiusM;
      point.position.set(p.x, p.y, p.z);
    }
  }
}
