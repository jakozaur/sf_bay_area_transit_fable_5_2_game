/** Debug panel (lil-gui), behind the `debug=1` URL parameter: live render counters and the view toggles. */
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

export interface HudModel {
  stats: HudStats;
  /** Edited in place by the panel; `onViewChange` is called after every edit. */
  view: { cut: boolean; cutY: number; cutRadius: number; xray: boolean };
  cutRange: { min: number; max: number; maxRadius: number };
  bookmarks: number;
  goToBookmark(index: number): void;
  onViewChange(): void;
}

/** Builds the panel. Call `refresh` a few times a second to update the displayed values. */
export function createHud(model: HudModel): { refresh(): void; dispose(): void } {
  const gui = new GUI({ title: 'Debug' });
  const stats = gui.addFolder('Stats');
  for (const key of Object.keys(model.stats) as (keyof HudStats)[])
    stats
      .add(model.stats, key)
      .disable()
      .decimals(key === 'frameMs' || key === 'gpuMB' ? 1 : 0);
  const view = gui.addFolder('Underground view');
  view.add(model.view, 'cut').name('cut plane (C)').onChange(model.onViewChange);
  view.add(model.view, 'cutY', model.cutRange.min, model.cutRange.max, 1).name('cut height ([ ])').onChange(model.onViewChange);
  view.add(model.view, 'cutRadius', 16, model.cutRange.maxRadius, 1).name('cut radius').onChange(model.onViewChange);
  view.add(model.view, 'xray').name('x-ray (X)').onChange(model.onViewChange);
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
