/** Station, dig and drive tools and the host, on the fake services of ./fake.ts. */
import { TOOL_COMMANDS, TOOL_KEYS, type ToolStatus } from '@bayvox/core';
import type { GameCommand, ScenarioDef, StationView } from '@bayvox/sim';
import { expect, test } from 'vitest';
import {
  connectAnchors,
  createAlignmentTool,
  createDigTool,
  createDriveTool,
  createStationTool,
  createToolHost,
  createTools,
  type DriveTool,
  type StationTool,
  type ToolHost,
} from './contract.ts';
import { createFake, type Fake, fakeTbm, GROUND_Y } from './fake.ts';
import { PACKAGE_NAME } from './index.ts';

interface Rig {
  fake: Fake;
  host: ToolHost;
  station: StationTool;
  drive: DriveTool;
  frame(dt?: number): void;
  readout(id: string): { value: string; bad: boolean };
  last(): GameCommand;
}

function rig(): Rig {
  const fake = createFake();
  const station = createStationTool();
  const drive = createDriveTool();
  const host = createToolHost({
    world: fake.world,
    services: () => fake.services,
    tools: [createAlignmentTool({ geologyOf: fake.geologyOf }), station, createDigTool(), drive],
  });
  return {
    fake,
    host,
    station,
    drive,
    frame(dt = 1 / 60) {
      fake.apply();
      host.update(dt);
    },
    readout(id) {
      const x = host.port.status.get().readouts.find((o) => o.id === id);
      if (x === undefined) throw new Error(`no readout ${id}`);
      return x;
    },
    last() {
      if (fake.commands.length === 0) throw new Error('no command was sent');
      return fake.commands[fake.commands.length - 1];
    },
  };
}

/** A line along z = 500 from x = 500 with a right-angle bend at x = 1500 down to z = 1000 and on to x = 2500. */
function withLine(
  r: Rig,
  points: [number, number][] = [
    [500, 500],
    [1500, 500],
    [1500, 1000],
    [2500, 1000],
  ],
): void {
  r.fake.services.sim.command({
    t: 'setAlignment',
    projectId: 'portal',
    name: 'The Portal',
    waypoints: points.map(([x, z]) => ({ x, y: GROUND_Y - 20, z })),
  });
  r.fake.apply();
  r.fake.commands.length = 0;
}

function withTbm(r: Rig, ...tbms: ReturnType<typeof fakeTbm>[]): void {
  withLine(r, [
    [100, 100],
    [2100, 100],
  ]);
  r.fake.mutate((s) => {
    s.projects[0].tbms = tbms.length > 0 ? tbms : [fakeTbm()];
  });
}

test('package name and tool order', () => {
  expect(PACKAGE_NAME).toBe('@bayvox/tools');
  expect(createTools().map((t) => t.id)).toEqual(['plan', 'station', 'dig', 'drive']);
});

// ---------------------------------------------------------------- station

test('station: unavailable without a line; the ghost snaps onto the alignment and into a straight run', () => {
  const r = rig();
  expect(r.host.port.availability.get().station).toBe('Draw an alignment first');
  expect(() => r.host.port.activate('station')).toThrow(/station is unavailable: Draw an alignment first/);
  withLine(r);
  expect(r.host.port.availability.get().station).toBeNull();
  r.host.port.activate('station');
  expect(r.station.candidate()).toBeNull();
  // 30 m off the first leg: snapped onto it.
  r.host.handle({ type: 'pointer.hover', x: 1000, y: 530 });
  expect(r.station.candidate()).toEqual({ chainageM: 500, template: 'undergroundStandard', valid: true, reason: '' });
  let p = r.fake.previews[r.fake.previews.length - 1];
  if (p?.kind !== 'station') throw new Error('expected a station preview');
  expect(p.valid).toBe(true);
  expect(p.station.position).toEqual({ x: 1000, y: GROUND_Y - 20, z: 500 });
  // Travelling east: yaw 90 degrees (travel is sin yaw, 0, cos yaw).
  expect(p.station.yaw).toBeCloseTo(Math.PI / 2, 9);
  expect(p.station.style).toBe('compactBox');
  expect(p.station.lengthM).toBeCloseTo(154, 9);
  // More than 80 m from the line: no ghost.
  r.host.handle({ type: 'pointer.hover', x: 1000, y: 700 });
  expect(r.station.candidate()).toBeNull();
  expect(r.fake.previews[r.fake.previews.length - 1]).toBeNull();
  // Near the start the 140 m platform is pushed inside the line; near the bend it is pushed off it.
  r.host.handle({ type: 'pointer.hover', x: 510, y: 500 });
  expect(r.station.candidate()?.chainageM).toBe(70);
  r.host.handle({ type: 'pointer.hover', x: 1490, y: 500 });
  expect(r.station.candidate()).toMatchObject({ chainageM: 930, valid: true });
  // On the middle leg the ghost turns south.
  r.host.handle({ type: 'pointer.hover', x: 1500, y: 750 });
  p = r.fake.previews[r.fake.previews.length - 1];
  if (p?.kind !== 'station') throw new Error('expected a station preview');
  expect(p.station.yaw).toBeCloseTo(0, 9);
  // Leaving the canvas clears the ghost; the same cursor twice does not push the preview twice.
  r.host.handle({ type: 'pointer.hover', x: 1000, y: 500 });
  const pushed = r.fake.previews.length;
  r.host.handle({ type: 'pointer.hover', x: 1000, y: 500 });
  r.host.update(1 / 60);
  expect(r.fake.previews).toHaveLength(pushed);
  r.host.handle({ type: 'pointer.leave' });
  expect(r.fake.previews[r.fake.previews.length - 1]).toBeNull();
});

test('station: platform length check, overlap check, placing and removing', () => {
  const r = rig();
  // A 100 m straight run between two bends cannot hold a 140 m platform.
  withLine(r, [
    [500, 500],
    [1500, 500],
    [1500, 600],
    [2500, 600],
  ]);
  r.host.port.activate('station');
  r.host.handle({ type: 'pointer.hover', x: 1500, y: 550 });
  expect(r.station.candidate()).toMatchObject({
    valid: false,
    reason: 'Platforms are straight: this run is 100 m, the platform needs 140 m.',
  });
  expect(r.readout('platform').bad).toBe(true);
  expect(r.host.handle({ type: 'tool.primary', x: 1500, y: 550 })).toBe(true);
  expect(r.fake.commands).toEqual([]);
  expect(r.fake.cues).toEqual(['tool.invalid']);
  // A valid spot: one addStation with the chainage and the depth of the line there.
  expect(r.host.handle({ type: 'tool.primary', x: 1000, y: 520 })).toBe(true);
  expect(r.fake.commands).toEqual([
    {
      t: 'addStation',
      projectId: 'portal',
      stationId: 'station-1',
      name: 'Station 1',
      template: 'undergroundStandard',
      chainageM: 500,
      depthM: 20,
    },
  ]);
  expect(r.fake.cues[r.fake.cues.length - 1]).toBe('tool.place');
  r.frame();
  // 100 m further along the platforms would overlap.
  r.host.handle({ type: 'pointer.hover', x: 1100, y: 500 });
  expect(r.station.candidate()).toMatchObject({ valid: false, reason: 'Too close to Station 1: platforms would overlap.' });
  r.host.handle({ type: 'pointer.hover', x: 1140, y: 500 });
  expect(r.station.candidate()?.valid).toBe(true);
  // A surface station carries no depth; the depth option overrides the line's.
  r.host.port.setOption(TOOL_KEYS.stationDepthM, 31);
  r.host.handle({ type: 'tool.primary', x: 1200, y: 500 });
  expect(r.last()).toMatchObject({ t: 'addStation', stationId: 'station-2', name: 'Station 2', chainageM: 700, depthM: 31 });
  r.frame();
  r.host.port.setOption(TOOL_KEYS.stationTemplate, 'surface');
  r.host.handle({ type: 'tool.primary', x: 2200, y: 600 });
  expect(r.last()).toMatchObject({ t: 'addStation', template: 'surface' });
  expect('depthM' in r.last()).toBe(false);
  r.frame();
  expect(r.fake.project()?.stations.map((s: StationView) => s.id)).toEqual(['station-1', 'station-2', 'station-3']);
  // Right-click on a station removes it; on empty ground it is not consumed.
  expect(r.host.handle({ type: 'tool.secondary', x: 3000, y: 3000 })).toBe(false);
  expect(r.host.handle({ type: 'tool.secondary', x: 1004, y: 503 })).toBe(true);
  expect(r.last()).toEqual({ t: 'removeStation', projectId: 'portal', stationId: 'station-1' });
  expect(r.fake.cues[r.fake.cues.length - 1]).toBe('tool.remove');
  r.frame();
  // The freed name is reused only if it is free: station-1 is gone, but ids count on from the list length.
  r.host.handle({ type: 'tool.primary', x: 900, y: 500 });
  expect(r.last()).toMatchObject({ stationId: 'station-4' });
  // Option validation.
  expect(() => r.host.port.setOption(TOOL_KEYS.stationTemplate, 'spaceport')).toThrow(/station\.template must be one of/);
  expect(() => r.host.port.setOption(TOOL_KEYS.stationDepthM, -3)).toThrow(/station\.depthM must be a number in \[0, 80\]/);
  expect(() => r.host.port.invoke('station.nope')).toThrow(/unknown command/);
});

test('station: a line shorter than the platform, and a frozen design, refuse with the reason', () => {
  const r = rig();
  withLine(r, [
    [500, 500],
    [600, 500],
  ]);
  r.host.port.activate('station');
  r.host.handle({ type: 'pointer.hover', x: 550, y: 500 });
  expect(r.station.candidate()?.reason).toBe('The line is 100 m long, shorter than a 140 m platform.');
  const r2 = rig();
  withLine(r2);
  r2.host.port.activate('station');
  r2.host.handle({ type: 'tool.primary', x: 1000, y: 500 });
  r2.frame();
  r2.fake.mutate((s) => {
    s.projects[0].designFrozen = true;
  });
  r2.frame();
  expect(r2.host.port.availability.get().station).toBe('The design went to tender. Stations are fixed.');
  const sent = r2.fake.commands.length;
  r2.host.handle({ type: 'tool.primary', x: 2000, y: 1000 });
  r2.host.handle({ type: 'tool.secondary', x: 1000, y: 500 });
  expect(r2.fake.commands).toHaveLength(sent);
  expect(r2.host.port.status.get().hint).toBe('The design went to tender. Stations are fixed.');
});

// ---------------------------------------------------------------- dig

test('dig: holding the button digs continuously through world.dig and charges every bite', () => {
  const r = rig();
  r.host.port.activate('dig', { [TOOL_KEYS.digRadiusM]: 4 });
  r.host.handle({ type: 'pointer.hover', x: 700.2, y: 300.9 });
  const p = r.fake.previews[r.fake.previews.length - 1];
  expect(p).toEqual({ kind: 'brush', center: { x: 700.5, y: GROUND_Y - 0.5, z: 300.5 }, radiusM: 4, valid: true });
  // Pressing on the ground claims the gesture and bites at once.
  expect(r.host.handle({ type: 'pointer.down', x: 700, y: 300, button: 0 })).toBe(true);
  expect(r.fake.digs).toEqual([{ center: { x: 700.5, y: GROUND_Y - 0.5, z: 300.5 }, radiusM: 4 }]);
  expect(r.fake.commands).toEqual([{ t: 'chargeDig', volumeM3: 100 }]);
  expect(r.fake.cues).toEqual(['dig']);
  // Held for one second at 60 fps: about 12 more bites, one per 0.08 s, following the cursor.
  r.host.handle({ type: 'pointer.drag', x: 710, y: 300 });
  for (let i = 0; i < 60; i++) r.frame();
  expect(r.fake.digs.length).toBeGreaterThanOrEqual(12);
  expect(r.fake.digs.length).toBeLessThanOrEqual(14);
  expect(r.fake.digs[r.fake.digs.length - 1].center.x).toBe(710.5);
  expect(r.fake.commands.every((c) => c.t === 'chargeDig')).toBe(true);
  expect(r.fake.commands).toHaveLength(r.fake.digs.length);
  // The sound is throttled.
  expect(r.fake.cues.length).toBeLessThan(r.fake.digs.length);
  expect(r.host.port.status.get().hint).toBe('Digging. Release to stop.');
  // Release stops it.
  expect(r.host.handle({ type: 'pointer.up', x: 710, y: 300 })).toBe(true);
  const n = r.fake.digs.length;
  for (let i = 0; i < 30; i++) r.frame();
  expect(r.fake.digs).toHaveLength(n);
  // Readouts: the stroke at the sim's price, and the sim's running total.
  expect(r.readout('rate').value).toBe('$390/m3');
  expect(r.readout('stroke').value).toBe(`${n * 100} m3, $${Math.round((n * 100 * 390) / 1000)}K`);
  expect(r.readout('total').value).toBe(r.readout('stroke').value);
  expect(r.fake.snapshot().handDig.volumeM3).toBe(n * 100);
});

test('dig: sky, empty bites, single clicks, project booking and the radius option', () => {
  const r = rig();
  r.host.port.activate('dig');
  // Over the sky the press is not claimed: the camera keeps it.
  r.fake.skyBelowX = 100;
  expect(r.host.handle({ type: 'pointer.down', x: 50, y: 50, button: 0 })).toBe(false);
  expect(r.host.handle({ type: 'pointer.up', x: 50, y: 50 })).toBe(false);
  // The right button never digs.
  expect(r.host.handle({ type: 'pointer.down', x: 500, y: 500, button: 2 })).toBe(false);
  expect(r.fake.digs).toEqual([]);
  // A bite that only met air charges nothing.
  r.fake.digVolumeM3 = 0;
  expect(r.host.handle({ type: 'tool.primary', x: 500, y: 500 })).toBe(true);
  expect(r.fake.digs).toHaveLength(1);
  expect(r.fake.commands).toEqual([]);
  expect(r.fake.cues).toEqual([]);
  // With a mission project the charge is booked to it.
  withLine(r);
  r.fake.digVolumeM3 = 12.5;
  r.host.handle({ type: 'tool.primary', x: 500, y: 500 });
  expect(r.fake.commands).toEqual([{ t: 'chargeDig', volumeM3: 12.5, projectId: 'portal' }]);
  // Radius: keys step it inside 1..16, the option validates.
  expect(r.host.port.status.get().values[TOOL_KEYS.digRadiusM]).toBe(3);
  for (let i = 0; i < 20; i++) r.host.handle({ type: 'tool.adjust', delta: 1 });
  expect(r.host.port.status.get().values[TOOL_KEYS.digRadiusM]).toBe(16);
  for (let i = 0; i < 20; i++) r.host.handle({ type: 'tool.adjust', delta: -1 });
  expect(r.host.port.status.get().values[TOOL_KEYS.digRadiusM]).toBe(1);
  r.host.port.setOption(TOOL_KEYS.digRadiusM, 8);
  r.host.handle({ type: 'tool.primary', x: 600, y: 600 });
  expect(r.fake.digs[r.fake.digs.length - 1].radiusM).toBe(8);
  expect(() => r.host.port.setOption(TOOL_KEYS.digRadiusM, 65)).toThrow(/dig\.radiusM must be a number in \[1, 16\], got 65/);
  expect(() => r.host.port.activate('dig', { 'dig.nope': 1 })).toThrow(/unknown option dig\.nope/);
  // A failed activation leaves no tool active (the old one was already put away), and says so in the status.
  expect(r.host.active()).toBeNull();
  expect(r.host.port.status.get().id).toBeNull();
  // A broken world port fails loudly.
  r.host.port.activate('dig');
  r.fake.digVolumeM3 = Number.NaN;
  expect(() => r.host.handle({ type: 'tool.primary', x: 600, y: 600 })).toThrow(/world\.dig returned removedM3 NaN/);
});

test('dig: switching tools in the middle of a stroke stops the digging', () => {
  const r = rig();
  withLine(r);
  r.host.port.activate('dig');
  r.host.handle({ type: 'pointer.down', x: 700, y: 300, button: 0 });
  r.host.port.activate('station');
  const n = r.fake.digs.length;
  for (let i = 0; i < 30; i++) r.frame();
  expect(r.fake.digs).toHaveLength(n);
});

// ---------------------------------------------------------------- drive

test('drive: unavailable without a machine; activation takes manual control and starts the cutaway follow', () => {
  const r = rig();
  expect(r.host.port.availability.get().drive).toBe('No machine to drive yet');
  expect(() => r.host.port.activate('drive')).toThrow(/drive is unavailable: No machine to drive yet/);
  withTbm(r);
  expect(r.host.port.availability.get().drive).toBeNull();
  r.host.port.activate('drive');
  expect(r.drive.headingId()).toBe('portal/tbm-1');
  expect(r.fake.commands).toEqual([{ t: 'tbmControl', headingId: 'portal/tbm-1', autopilot: false }]);
  expect(r.fake.follows).toEqual(['cutaway:portal/tbm-1']);
  const s = r.host.port.status.get();
  expect(s.id).toBe('drive');
  expect(s.hint).toBe('W S thrust, A D steer, R F pitch, Space autopilot, Esc release.');
  expect(s.values[TOOL_KEYS.driveHeadingId]).toBe('portal/tbm-1');
  expect(r.readout('thrust').value).toBe('100%');
  expect(r.readout('ground').value).toBe('Soft ground');
  // The guidance line: from 20 m behind the cutterhead to the end of the drive.
  const p = r.fake.previews[r.fake.previews.length - 1];
  if (p?.kind !== 'guidance') throw new Error('expected a guidance preview');
  expect(p.guidance.tbmId).toBe('portal/tbm-1');
  expect(p.guidance.path[0]).toEqual({ x: 280, y: GROUND_Y - 20, z: 100 });
  expect(p.guidance.path[p.guidance.path.length - 1]).toEqual({ x: 2100, y: GROUND_Y - 20, z: 100 });
  expect(p.guidance.nearest).toEqual({ x: 300, y: GROUND_Y - 20, z: 100 });
  expect(p.guidance.limitM).toBe(30);
});

test('drive: keys become tbmControl commands only when an input changes', () => {
  const r = rig();
  withTbm(r);
  r.host.port.activate('drive');
  r.frame();
  r.fake.commands.length = 0;
  const sent = (): GameCommand[] => r.fake.commands.splice(0);
  // The lever starts at the machine's thrust (full): W has nowhere to go, S steps down by quarters to zero.
  expect(r.host.handle({ type: 'drive.thrust', delta: 1 })).toBe(true);
  expect(sent()).toEqual([]);
  r.host.handle({ type: 'drive.thrust', delta: -1 });
  r.host.handle({ type: 'drive.thrust', delta: -1 });
  expect(sent()).toEqual([
    { t: 'tbmControl', headingId: 'portal/tbm-1', thrust: 0.75 },
    { t: 'tbmControl', headingId: 'portal/tbm-1', thrust: 0.5 },
  ]);
  for (let i = 0; i < 5; i++) r.host.handle({ type: 'drive.thrust', delta: -1 });
  expect(sent().map((c) => (c.t === 'tbmControl' ? c.thrust : null))).toEqual([0.25, 0]);
  // Steer and pitch: one command per change, none for a repeat.
  r.host.handle({ type: 'drive.axes', steer: 1, pitch: 0 });
  r.host.handle({ type: 'drive.axes', steer: 1, pitch: 0 });
  r.host.handle({ type: 'drive.axes', steer: 1, pitch: -1 });
  r.host.handle({ type: 'drive.axes', steer: 0, pitch: 0 });
  expect(sent()).toEqual([
    { t: 'tbmControl', headingId: 'portal/tbm-1', steer: 1, pitch: 0 },
    { t: 'tbmControl', headingId: 'portal/tbm-1', steer: 1, pitch: -1 },
    { t: 'tbmControl', headingId: 'portal/tbm-1', steer: 0, pitch: 0 },
  ]);
  // Frames without input send nothing.
  for (let i = 0; i < 30; i++) r.frame();
  expect(sent()).toEqual([]);
  // Space hands over to the cruise law and back; taking back restates the lever and the axes.
  r.host.handle({ type: 'drive.autopilot' });
  expect(sent()).toEqual([{ t: 'tbmControl', headingId: 'portal/tbm-1', autopilot: true }]);
  expect(r.host.port.status.get().hint).toMatch(/^Autopilot cruises/);
  expect(r.readout('mode').value).toBe('Autopilot');
  // Releasing a key under autopilot is not a takeover; pressing one is.
  r.host.handle({ type: 'drive.axes', steer: 0, pitch: 0 });
  expect(sent()).toEqual([]);
  r.host.handle({ type: 'drive.axes', steer: -1, pitch: 0 });
  expect(sent()).toEqual([{ t: 'tbmControl', headingId: 'portal/tbm-1', thrust: 0, steer: -1, pitch: 0, autopilot: false }]);
  r.host.handle({ type: 'drive.autopilot' });
  r.host.handle({ type: 'drive.thrust', delta: 1 });
  expect(sent()).toEqual([
    { t: 'tbmControl', headingId: 'portal/tbm-1', autopilot: true },
    { t: 'tbmControl', headingId: 'portal/tbm-1', thrust: 0.25, steer: -1, pitch: 0, autopilot: false },
  ]);
  // Pointer actions are not the drive tool's: the camera keeps them.
  expect(r.host.handle({ type: 'pointer.down', x: 5, y: 5, button: 0 })).toBe(false);
  expect(r.host.handle({ type: 'tool.primary', x: 5, y: 5 })).toBe(false);
});

test('drive: Escape, the release button and a tool switch all hand the machine back to autopilot and end the follow', () => {
  for (const how of ['escape', 'button', 'switch', 'dispose'] as const) {
    const r = rig();
    withTbm(r);
    r.host.port.activate('drive');
    r.fake.commands.length = 0;
    if (how === 'escape') expect(r.host.handle({ type: 'tool.cancel' })).toBe(true);
    else if (how === 'button') r.host.port.invoke(TOOL_COMMANDS.driveRelease);
    else if (how === 'switch') r.host.port.activate('dig');
    else r.host.dispose();
    expect(r.fake.commands, how).toEqual([{ t: 'tbmControl', headingId: 'portal/tbm-1', autopilot: true }]);
    expect(r.fake.follows, how).toEqual(['cutaway:portal/tbm-1', null]);
    expect(r.drive.headingId(), how).toBeNull();
    expect(r.host.active()?.id ?? null, how).toBe(how === 'switch' ? 'dig' : null);
    if (how !== 'dispose') expect(r.host.port.status.get().id, how).toBe(how === 'switch' ? 'dig' : null);
  }
});

test('drive: breakthrough ends the possession by itself; deviation and stops show in the readouts', () => {
  const r = rig();
  withTbm(r);
  r.host.port.activate('drive');
  r.frame();
  r.fake.mutate((s) => {
    s.projects[0].tbms = [
      fakeTbm({
        driven: true,
        autopilot: false,
        status: 'stopped',
        rateMPerDay: 0,
        stopReason: 'corridor',
        gradePct: 3.4,
        deviation: { lateralM: 30, verticalM: 0, totalM: 30, planChainageM: 640, limitM: 30, offPlan: true },
      }),
    ];
  });
  r.host.update(1 / 60);
  expect(r.readout('deviation')).toMatchObject({ value: '30.0 m (corridor 30 m)', bad: true });
  expect(r.readout('grade').bad).toBe(true);
  expect(r.readout('stopped')).toMatchObject({ value: 'At the edge of the corridor: steer back to the line', bad: true });
  expect(r.host.port.status.get().hint).toMatch(/^Off the plan/);
  const p = r.fake.previews[r.fake.previews.length - 1];
  if (p?.kind !== 'guidance') throw new Error('expected a guidance preview');
  expect(p.guidance.deviationM).toBe(30);
  expect(p.guidance.path[0].x).toBe(720);
  // Breakthrough.
  r.fake.commands.length = 0;
  r.fake.mutate((s) => {
    s.projects[0].tbms = [fakeTbm({ status: 'done', breakthroughTick: 400 })];
  });
  r.host.update(1 / 60);
  expect(r.host.active()).toBeNull();
  expect(r.drive.headingId()).toBeNull();
  // A finished machine needs no command; the camera is let go.
  expect(r.fake.commands).toEqual([]);
  expect(r.fake.follows[r.fake.follows.length - 1]).toBeNull();
  expect(r.host.port.availability.get().drive).toBe('Every machine has broken through');
});

test('drive: the heading option picks and switches machines', () => {
  const r = rig();
  withTbm(
    r,
    fakeTbm({ status: 'stopped', thrust: 0 }),
    fakeTbm({ id: 'portal/tbm-2', name: 'Krystyna' }),
    fakeTbm({ id: 'portal/tbm-3', name: 'Maria', status: 'done' }),
  );
  // Default: the first running machine, not the stopped one.
  r.host.port.activate('drive');
  expect(r.drive.headingId()).toBe('portal/tbm-2');
  const opt = r.host.port.status.get().options[0];
  if (opt.kind !== 'choice') throw new Error('expected a choice option');
  expect(opt.choices).toEqual([
    { value: 'portal/tbm-1', label: 'Anna' },
    { value: 'portal/tbm-2', label: 'Krystyna' },
    { value: 'portal/tbm-3', label: 'Maria', disabledReason: 'Broke through' },
  ]);
  r.fake.commands.length = 0;
  r.host.port.setOption(TOOL_KEYS.driveHeadingId, 'portal/tbm-1');
  expect(r.fake.commands).toEqual([
    { t: 'tbmControl', headingId: 'portal/tbm-2', autopilot: true },
    { t: 'tbmControl', headingId: 'portal/tbm-1', autopilot: false },
  ]);
  expect(r.fake.follows).toEqual(['cutaway:portal/tbm-2', null, 'cutaway:portal/tbm-1']);
  // The stopped machine's lever starts at zero.
  expect(r.readout('thrust').value).toBe('0%');
  expect(() => r.host.port.setOption(TOOL_KEYS.driveHeadingId, 'portal/tbm-3')).toThrow(/Maria has broken through/);
  expect(() => r.host.port.setOption(TOOL_KEYS.driveHeadingId, 'nope')).toThrow(
    /no heading nope \(have: portal\/tbm-1, portal\/tbm-2, portal\/tbm-3\)/,
  );
  // A failed switch keeps the current machine.
  expect(r.drive.headingId()).toBe('portal/tbm-1');
  r.host.port.activate(null);
  r.host.port.activate('drive', { [TOOL_KEYS.driveHeadingId]: 'portal/tbm-1' });
  expect(r.drive.headingId()).toBe('portal/tbm-1');
});

// ---------------------------------------------------------------- host

test('host: status and availability publish on change only; errors name the problem', () => {
  const r = rig();
  const statuses: ToolStatus[] = [];
  const avail: unknown[] = [];
  r.host.port.status.subscribe((s) => statuses.push(s));
  r.host.port.availability.subscribe((a) => avail.push(a));
  expect(r.host.port.status.get()).toEqual({ id: null, hint: '', readouts: [], options: [], values: {}, commands: [] });
  expect(r.host.handle({ type: 'tool.primary', x: 1, y: 1 })).toBe(false);
  expect(r.host.handle({ type: 'tool.cancel' })).toBe(false);
  expect(r.host.undo()).toBe(false);
  expect(() => r.host.port.setOption('x', 1)).toThrow(/setOption\(x\) needs an active tool/);
  expect(() => r.host.port.invoke('x')).toThrow(/invoke\(x\) needs an active tool/);
  expect(() => r.host.port.activate('fly' as 'dig')).toThrow(/unknown tool fly/);
  r.host.port.activate('dig');
  expect(statuses).toHaveLength(1);
  const same = r.host.port.status.get();
  for (let i = 0; i < 10; i++) r.host.update(1 / 60);
  // Nothing changed: the same object, no notification.
  expect(r.host.port.status.get()).toBe(same);
  expect(statuses).toHaveLength(1);
  r.host.handle({ type: 'tool.adjust', delta: 1 });
  expect(statuses).toHaveLength(2);
  // Activating the active tool again is a no-op; with options it restarts the tool.
  r.host.port.activate('dig');
  expect(r.host.port.status.get().values[TOOL_KEYS.digRadiusM]).toBe(4);
  r.host.port.activate('dig', { [TOOL_KEYS.digRadiusM]: 9 });
  expect(r.host.port.status.get().values[TOOL_KEYS.digRadiusM]).toBe(9);
  // Availability follows the snapshot.
  expect(r.host.port.availability.get()).toEqual({
    plan: null,
    station: 'Draw an alignment first',
    dig: null,
    drive: 'No machine to drive yet',
  });
  const before = avail.length;
  withLine(r);
  expect(r.host.port.availability.get().station).toBeNull();
  expect(avail.length).toBe(before + 1);
  r.fake.mutate(() => {});
  expect(avail.length).toBe(before + 1);
  // Dispose puts the tool away and makes the host inert.
  r.host.dispose();
  expect(r.host.active()).toBeNull();
  expect(r.host.handle({ type: 'tool.primary', x: 1, y: 1 })).toBe(false);
  expect(() => r.host.port.activate('dig')).toThrow(/used after dispose/);
  r.host.dispose();
});

test('host: rejects a duplicate or foreign tool; the default tool set works with scenario anchors', () => {
  const fake = createFake();
  expect(() => createToolHost({ world: fake.world, services: () => fake.services, tools: [createDigTool(), createDigTool()] })).toThrow(
    /two tools with id dig/,
  );
  const scenario = {
    objectives: [
      {
        id: 'connect',
        title: 'c',
        kind: 'connect',
        a: { name: '4th and King', x: 100, z: 100 },
        b: { name: 'Transit Center', x: 3000, z: 1000 },
        radiusM: 400,
      },
      { id: 'cost', title: 'm', kind: 'maxCost', cents: 1 },
    ],
  } as Pick<ScenarioDef, 'objectives'>;
  expect(connectAnchors(scenario)).toEqual([
    { id: 'connect/a', name: '4th and King', x: 100, z: 100 },
    { id: 'connect/b', name: 'Transit Center', x: 3000, z: 1000 },
  ]);
  const host = createToolHost({ world: fake.world, services: () => fake.services, anchors: () => connectAnchors(scenario) });
  expect(host.port.availability.get().plan).toBeNull();
  host.port.activate('dig');
  expect(host.active()?.id).toBe('dig');
});
