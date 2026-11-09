/** Debug HUD (lil-gui): live counters and the view toggles. Temporary until packages/ui lands. */
import GUI from 'lil-gui';

export interface HudStats {
  fps: number;
  frameMs: number;
  chunks: number;
  queued: number;
  quads: number;
  drawCalls: number;
  triangles: number;
  gpuMB: number;
}

/** Sim readout and controls. The panel reads the values and writes `speed` back through setSpeed. */
export interface HudSim {
  date: string;
  speed: number;
  cashMillions: number;
  spentMillions: number;
  /** Phase and gate of the first project, or a hint when there is none. */
  project: string;
  setSpeed(speed: number): void;
  /** Draws the scenario's reference project (the official plan). */
  drawReference(): void;
  /** Approves a drafted project or passes the gate it is waiting at. */
  passGate(): void;
}

export interface HudModel {
  stats: HudStats;
  sim: HudSim;
  view: { cut: boolean; cutY: number; cutRadius: number; xray: boolean };
  tool: { digRadius: number };
  cutRange: { min: number; max: number; maxRadius: number };
  bookmarks: number;
  goToBookmark(index: number): void;
}

/** Builds the panel. It reads and writes `model.view` and `model.tool` directly; call the result once per frame group to refresh. */
export function createHud(model: HudModel): { refresh(): void; dispose(): void } {
  const gui = new GUI({ title: 'Debug' });
  const stats = gui.addFolder('Stats');
  for (const key of Object.keys(model.stats) as (keyof HudStats)[])
    stats
      .add(model.stats, key)
      .disable()
      .decimals(key === 'frameMs' || key === 'gpuMB' ? 1 : 0);
  const sim = gui.addFolder('Sim');
  sim.add(model.sim, 'date').disable();
  sim
    .add(model.sim, 'speed', { paused: 0, '1x': 1, '10x': 10, '100x': 100 })
    .name('speed')
    .onChange((v: number) => model.sim.setSpeed(v));
  sim.add(model.sim, 'cashMillions').name('cash $M').disable().decimals(0);
  sim.add(model.sim, 'spentMillions').name('spent $M').disable().decimals(0);
  sim.add(model.sim, 'project').disable();
  sim.add(model.sim, 'drawReference').name('draw the official plan');
  sim.add(model.sim, 'passGate').name('approve / pass gate');
  const view = gui.addFolder('Underground view');
  view.add(model.view, 'cut').name('cut plane (C)');
  view.add(model.view, 'cutY', model.cutRange.min, model.cutRange.max, 1).name('cut height ([ ])');
  view.add(model.view, 'cutRadius', 16, model.cutRange.maxRadius, 1).name('cut radius');
  view.add(model.view, 'xray').name('x-ray (X)');
  const tool = gui.addFolder('Dig tool (click)');
  tool.add(model.tool, 'digRadius', 1, 12, 0.5).name('radius');
  const cam = gui.addFolder('Camera');
  const actions: Record<string, () => void> = {};
  for (let i = 0; i < model.bookmarks; i++) {
    const name = `bookmark ${i + 1}`;
    actions[name] = () => model.goToBookmark(i);
    cam.add(actions, name);
  }
  // Clicks and keys on the panel must not reach the game.
  for (const type of ['pointerdown', 'pointerup', 'wheel', 'keydown', 'keyup'] as const) {
    gui.domElement.addEventListener(type, (e) => e.stopPropagation());
  }
  return {
    refresh() {
      for (const c of gui.controllersRecursive()) c.updateDisplay();
    },
    dispose() {
      gui.destroy();
    },
  };
}
