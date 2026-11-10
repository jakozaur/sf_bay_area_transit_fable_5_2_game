import { TOOL_COMMANDS, TOOL_KEYS } from '@bayvox/core';
import type { GameCommand, Waypoint } from '@bayvox/sim';
import { expect, test } from 'vitest';
import { PLAN_REDO, PLAN_UNDO } from './alignment.ts';
import {
  type AlignmentTool,
  createAlignmentTool,
  createDigTool,
  createDriveTool,
  createStationTool,
  createToolHost,
  type PlanAnchor,
  type ToolHost,
} from './contract.ts';
import { createFake, type Fake, GROUND_Y, OFFICIAL } from './fake.ts';
import { smoothCentreline } from './util.ts';

const ANCHORS: PlanAnchor[] = [
  { id: 'a', name: '4th and King', x: 100, z: 100 },
  { id: 'b', name: 'Salesforce Transit Center', x: 3000, z: 1000, y: -8 },
];

interface Rig {
  fake: Fake;
  host: ToolHost;
  plan: AlignmentTool;
  /** One app frame: queued commands reach the sim, then the host updates. */
  frame(dt?: number): void;
  click(x: number, y: number): boolean;
  setAlignments(): Extract<GameCommand, { t: 'setAlignment' }>[];
  lastLine(): Waypoint[];
}

function rig(): Rig {
  const fake = createFake();
  const plan = createAlignmentTool({ anchors: () => ANCHORS, geologyOf: fake.geologyOf });
  const host = createToolHost({
    world: fake.world,
    services: () => fake.services,
    tools: [plan, createStationTool(), createDigTool(), createDriveTool()],
  });
  const setAlignments = (): Extract<GameCommand, { t: 'setAlignment' }>[] =>
    fake.commands.filter((c): c is Extract<GameCommand, { t: 'setAlignment' }> => c.t === 'setAlignment');
  return {
    fake,
    host,
    plan,
    frame(dt = 1 / 60) {
      fake.apply();
      host.update(dt);
    },
    click: (x, y) => host.handle({ type: 'tool.primary', x, y }),
    setAlignments,
    lastLine() {
      const all = setAlignments();
      if (all.length === 0) throw new Error('no setAlignment was sent');
      return all[all.length - 1].waypoints;
    },
  };
}

/** A three-point line with gentle geometry: 500, 1500, 2500 along z = 500. */
function drawLine(r: Rig): void {
  r.host.port.activate('plan');
  r.click(500, 500);
  r.click(1500, 500);
  r.click(2500, 500);
  r.frame();
}

function readout(r: Rig, id: string): { value: string; bad: boolean } {
  const x = r.host.port.status.get().readouts.find((o) => o.id === id);
  if (x === undefined) throw new Error(`no readout ${id}`);
  return x;
}

test('clicks add waypoints on the picked ground point at the depth option; the second one creates the project', () => {
  const r = rig();
  r.host.port.activate('plan');
  expect(r.host.port.status.get().id).toBe('plan');
  expect(r.host.port.status.get().hint).toMatch(/first waypoint/);
  expect(r.click(500, 500)).toBe(true);
  // One waypoint is not a line: nothing is sent, the preview shows the lone handle.
  expect(r.fake.commands).toEqual([]);
  expect(r.plan.draft()?.waypoints).toHaveLength(1);
  expect(r.plan.draft()?.estimate).toBeNull();
  expect(r.click(1500, 500)).toBe(true);
  expect(r.fake.commands).toEqual([
    {
      t: 'setAlignment',
      projectId: 'portal',
      name: 'The Portal',
      waypoints: [
        { x: 500, y: GROUND_Y - 20, z: 500, geology: 'rock' },
        { x: 1500, y: GROUND_Y - 20, z: 500, geology: 'rock' },
      ],
    },
  ]);
  // East of x = 2000 the ground is Bay Mud: the geology comes from the voxel at the axis.
  r.frame();
  r.click(2500, 500);
  expect(r.lastLine()[2]).toEqual({ x: 2500, y: GROUND_Y - 20, z: 500, geology: 'bayMud' });
  // Once the project exists, commands do not rename it.
  expect(r.setAlignments()[1].name).toBeUndefined();
  r.frame();
  const preview = r.fake.previews[r.fake.previews.length - 1];
  expect(preview?.kind).toBe('alignment');
  if (preview?.kind !== 'alignment') throw new Error('expected an alignment preview');
  expect(preview.alignment.state).toBe('preview');
  expect(preview.alignment.points).toHaveLength(3);
  expect(preview.alignment.segmentIssues).toEqual([null, null]);
  expect(preview.alignment.vertexIssues).toEqual([null, null, null]);
  expect(readout(r, 'length')).toEqual({ id: 'length', label: 'Length', value: '2.00 km', bad: false });
  expect(readout(r, 'cost').value).toBe('$2.00B');
  expect(readout(r, 'ratio').value).toMatch(/^8\.0x/);
  expect(r.fake.cues.filter((c) => c === 'tool.place')).toHaveLength(3);
  // A click on the sky is not consumed, a click outside the site is refused with a reason.
  r.fake.skyBelowX = 50;
  expect(r.click(10, 10)).toBe(false);
  r.fake.skyBelowX = 0;
  expect(r.click(3000, 4500)).toBe(true);
  expect(r.host.port.status.get().hint).toMatch(/outside the map/);
  expect(r.fake.cues[r.fake.cues.length - 1]).toBe('tool.invalid');
  expect(r.setAlignments()).toHaveLength(2);
});

test('the first and last waypoint snap to scenario anchors in range, taking the anchor level when it has one', () => {
  const r = rig();
  r.host.port.activate('plan');
  r.click(130, 80);
  expect(r.plan.draft()?.waypoints[0]).toEqual({ x: 100, y: GROUND_Y - 20, z: 100, geology: 'rock' });
  expect(r.host.port.status.get().hint).toBe('Snapped to 4th and King.');
  // 61 m and more from the anchor: no snap.
  r.click(3000, 1061);
  expect(r.lastLine()[1].z).toBe(1061);
  r.click(2980, 1010);
  expect(r.lastLine()[2]).toEqual({ x: 3000, y: -8, z: 1000, geology: 'bayMud' });
  expect(r.host.port.status.get().hint).toBe('Snapped to Salesforce Transit Center.');
  // The message goes away by itself.
  r.frame(5);
  expect(r.host.port.status.get().hint).toMatch(/^Click to add/);
});

test('a click on a segment inserts a waypoint on the line and selects it; methods of a mixed plan survive', () => {
  const r = rig();
  r.host.port.activate('plan');
  r.host.port.invoke(TOOL_COMMANDS.planUseOfficial);
  expect(r.fake.commands).toEqual([{ t: 'useOfficialPlan' }]);
  r.frame();
  // The official plan arrived through the snapshot: the tool adopted it.
  expect(r.plan.draft()?.waypoints).toEqual(OFFICIAL);
  // 3 px off the first segment (z = 100), at x = 600.
  expect(r.click(600, 103)).toBe(true);
  const cmd = r.setAlignments()[0];
  expect(cmd.waypoints).toHaveLength(4);
  expect(cmd.waypoints[1]).toEqual({ x: 600, y: -10, z: 100, geology: 'rock' });
  // Cut-and-cover stays cut-and-cover on both halves of the split segment; the mined segment stays mined.
  expect(cmd.methods).toEqual(['cutAndCover', 'cutAndCover', 'mined']);
  expect(r.plan.draft()?.selected).toBe(1);
  expect(r.host.port.status.get().options.map((o) => o.key)).toEqual([TOOL_KEYS.planDepthM, TOOL_KEYS.planWaypointDepthM]);
  expect(r.host.port.status.get().values[TOOL_KEYS.planWaypointDepthM]).toBe(20);
});

test('pressing a handle claims the gesture; the drag moves the waypoint at its depth and commits once on release', () => {
  const r = rig();
  drawLine(r);
  const before = r.setAlignments().length;
  // Empty ground: the press stays with the camera.
  expect(r.host.handle({ type: 'pointer.down', x: 900, y: 900, button: 0 })).toBe(false);
  // The right button never drags.
  expect(r.host.handle({ type: 'pointer.down', x: 1500, y: 500, button: 2 })).toBe(false);
  // Pressed 4 px off the handle centre: the handle keeps that offset, it does not jump under the cursor.
  expect(r.host.handle({ type: 'pointer.down', x: 1504, y: 500, button: 0 })).toBe(true);
  expect(r.host.handle({ type: 'pointer.drag', x: 1504, y: 600 })).toBe(true);
  expect(r.host.handle({ type: 'pointer.drag', x: 1604, y: 700 })).toBe(true);
  expect(r.plan.draft()?.waypoints[1]).toEqual({ x: 1600, y: GROUND_Y - 20, z: 700, geology: 'rock' });
  // Live estimate while dragging, nothing sent yet.
  expect(r.setAlignments()).toHaveLength(before);
  expect(readout(r, 'length').value).not.toBe('2.00 km');
  expect(r.host.handle({ type: 'pointer.up', x: 1604, y: 700 })).toBe(true);
  expect(r.setAlignments()).toHaveLength(before + 1);
  expect(r.lastLine()[1]).toEqual({ x: 1600, y: GROUND_Y - 20, z: 700, geology: 'rock' });
  r.frame();
  // A press and release without movement only selects.
  r.host.handle({ type: 'pointer.down', x: 500, y: 500, button: 0 });
  r.host.handle({ type: 'pointer.up', x: 500, y: 500 });
  expect(r.plan.draft()?.selected).toBe(0);
  expect(r.setAlignments()).toHaveLength(before + 1);
  // Escape in the middle of a drag puts the waypoint back and sends nothing.
  r.host.handle({ type: 'pointer.down', x: 2500, y: 500, button: 0 });
  r.host.handle({ type: 'pointer.drag', x: 2600, y: 900 });
  expect(r.plan.draft()?.waypoints[2].z).toBe(900);
  expect(r.host.handle({ type: 'tool.cancel' })).toBe(true);
  expect(r.plan.draft()?.waypoints[2]).toEqual({ x: 2500, y: GROUND_Y - 20, z: 500, geology: 'bayMud' });
  r.host.handle({ type: 'pointer.up', x: 2600, y: 900 });
  expect(r.setAlignments()).toHaveLength(before + 1);
  expect(r.host.active()?.id).toBe('plan');
});

test('dragging an end onto an anchor snaps it', () => {
  const r = rig();
  drawLine(r);
  r.host.handle({ type: 'pointer.down', x: 2500, y: 500, button: 0 });
  r.host.handle({ type: 'pointer.drag', x: 2990, y: 1020 });
  r.host.handle({ type: 'pointer.up', x: 2990, y: 1020 });
  expect(r.lastLine()[2]).toEqual({ x: 3000, y: -8, z: 1000, geology: 'bayMud' });
  // An interior waypoint does not snap.
  r.frame();
  r.host.handle({ type: 'pointer.down', x: 1500, y: 500, button: 0 });
  r.host.handle({ type: 'pointer.drag', x: 110, y: 110 });
  r.host.handle({ type: 'pointer.up', x: 110, y: 110 });
  expect(r.lastLine()[1]).toMatchObject({ x: 110, z: 110 });
});

test('right-click and Delete remove waypoints; below two waypoints the project is removed', () => {
  const r = rig();
  drawLine(r);
  expect(r.host.handle({ type: 'tool.secondary', x: 900, y: 900 })).toBe(false);
  expect(r.host.handle({ type: 'tool.secondary', x: 1502, y: 498 })).toBe(true);
  expect(r.lastLine().map((w) => w.x)).toEqual([500, 2500]);
  r.frame();
  // Delete needs a selection.
  expect(r.host.handle({ type: 'tool.delete' })).toBe(false);
  r.click(2500, 500);
  expect(r.plan.draft()?.selected).toBe(1);
  expect(r.host.handle({ type: 'tool.delete' })).toBe(true);
  expect(r.fake.commands[r.fake.commands.length - 1]).toEqual({ t: 'removeProject', projectId: 'portal' });
  r.frame();
  expect(r.fake.project()).toBeUndefined();
  expect(r.plan.draft()?.waypoints.map((w) => w.x)).toEqual([500]);
  // The last handle goes too; with nothing left there is nothing more to send.
  const sent = r.fake.commands.length;
  r.host.handle({ type: 'tool.secondary', x: 500, y: 500 });
  expect(r.plan.draft()).toBeNull();
  expect(r.fake.commands).toHaveLength(sent);
  r.frame(2);
  expect(r.fake.previews[r.fake.previews.length - 1]).toBeNull();
  expect(r.host.port.status.get().hint).toMatch(/first waypoint/);
});

test('depth: per waypoint with a selection, the whole line without, by keys, by option and by the depth-all button', () => {
  const r = rig();
  drawLine(r);
  // No selection: , and . move the whole line and the default for new waypoints.
  expect(r.host.handle({ type: 'tool.adjust', delta: 1 })).toBe(true);
  expect(r.lastLine().map((w) => w.y)).toEqual([GROUND_Y - 21, GROUND_Y - 21, GROUND_Y - 21]);
  expect(r.host.port.status.get().values[TOOL_KEYS.planDepthM]).toBe(21);
  r.frame();
  // With a selection only that waypoint moves.
  r.click(1500, 500);
  r.host.handle({ type: 'tool.adjust', delta: -1 });
  r.host.handle({ type: 'tool.adjust', delta: -1 });
  expect(r.lastLine().map((w) => w.y)).toEqual([GROUND_Y - 21, GROUND_Y - 19, GROUND_Y - 21]);
  expect(r.host.port.status.get().values[TOOL_KEYS.planWaypointDepthM]).toBe(19);
  r.frame();
  r.host.port.setOption(TOOL_KEYS.planWaypointDepthM, 35);
  expect(r.lastLine()[1].y).toBe(GROUND_Y - 35);
  r.frame();
  // The line-wide option only changes the default; the button applies it to every waypoint.
  const sent = r.setAlignments().length;
  r.host.port.setOption(TOOL_KEYS.planDepthM, 12);
  expect(r.setAlignments()).toHaveLength(sent);
  r.host.port.invoke(TOOL_COMMANDS.planDepthAll);
  expect(r.lastLine().map((w) => w.y)).toEqual([GROUND_Y - 12, GROUND_Y - 12, GROUND_Y - 12]);
  expect(() => r.host.port.setOption(TOOL_KEYS.planDepthM, 500)).toThrow(/plan\.depthM must be a number in \[0, 80\], got 500/);
  expect(() => r.host.port.setOption('plan.nope', 1)).toThrow(/unknown option plan\.nope/);
  r.host.handle({ type: 'tool.cancel' });
  expect(() => r.host.port.setOption(TOOL_KEYS.planWaypointDepthM, 10)).toThrow(/needs a selected waypoint/);
});

test('curve radius and grade violations are flagged per vertex and per segment, in the readouts and in the preview', () => {
  const r = rig();
  r.host.port.activate('plan');
  r.click(500, 500);
  r.click(1500, 500);
  // A right angle with a 100 m leg: the vertex can hold R 50 m, the limit is 150 m.
  r.click(1500, 600);
  r.frame();
  let preview = r.fake.previews[r.fake.previews.length - 1];
  if (preview?.kind !== 'alignment') throw new Error('expected an alignment preview');
  expect(preview.alignment.vertexIssues).toEqual([null, 'radius', null]);
  expect(preview.alignment.segmentIssues).toEqual([null, null]);
  expect(readout(r, 'radius')).toEqual({ id: 'radius', label: 'Tightest curve', value: 'R 50 m (min 150)', bad: true });
  expect(readout(r, 'grade').bad).toBe(false);
  expect(readout(r, 'problem').value).toBe('Curve at waypoint 2: R 50 m, minimum 150 m');
  // Fix the curve by dragging the end out, then break the grade: 40 m of depth over the last 1000 m is 4 percent.
  r.host.handle({ type: 'pointer.down', x: 1500, y: 600, button: 0 });
  r.host.handle({ type: 'pointer.drag', x: 2500, y: 600 });
  r.host.handle({ type: 'pointer.up', x: 2500, y: 600 });
  r.frame();
  expect(readout(r, 'radius').bad).toBe(false);
  r.host.port.setOption(TOOL_KEYS.planWaypointDepthM, 60);
  r.frame();
  preview = r.fake.previews[r.fake.previews.length - 1];
  if (preview?.kind !== 'alignment') throw new Error('expected an alignment preview');
  expect(preview.alignment.segmentIssues).toEqual([null, 'grade']);
  expect(readout(r, 'grade')).toMatchObject({ value: '4.0% (max 3)', bad: true });
  expect(preview.alignment.selectedVertex).toBe(2);
  // Hover marks the vertex under the cursor.
  r.host.handle({ type: 'pointer.hover', x: 505, y: 505 });
  preview = r.fake.previews[r.fake.previews.length - 1];
  if (preview?.kind !== 'alignment') throw new Error('expected an alignment preview');
  expect(preview.alignment.hoveredVertex).toBe(0);
  r.host.handle({ type: 'pointer.leave' });
  preview = r.fake.previews[r.fake.previews.length - 1];
  if (preview?.kind !== 'alignment') throw new Error('expected an alignment preview');
  expect(preview.alignment.hoveredVertex).toBe(-1);
});

test('undo and redo walk the edit history; a new edit drops the redo branch', () => {
  const r = rig();
  drawLine(r);
  expect(r.host.undo()).toBe(true);
  expect(r.lastLine().map((w) => w.x)).toEqual([500, 1500]);
  r.frame();
  expect(r.host.undo()).toBe(true);
  // Back to a single waypoint: the project goes.
  expect(r.fake.commands[r.fake.commands.length - 1]).toEqual({ t: 'removeProject', projectId: 'portal' });
  r.frame();
  expect(r.plan.draft()?.waypoints).toHaveLength(1);
  expect(r.host.undo()).toBe(true);
  expect(r.plan.draft()).toBeNull();
  expect(r.host.undo()).toBe(false);
  expect(r.host.redo()).toBe(true);
  expect(r.host.redo()).toBe(true);
  expect(r.host.redo()).toBe(true);
  expect(r.host.redo()).toBe(false);
  expect(r.lastLine().map((w) => w.x)).toEqual([500, 1500, 2500]);
  r.frame();
  expect(r.fake.project()?.waypoints.map((w) => w.x)).toEqual([500, 1500, 2500]);
  // A drag is one step.
  r.host.handle({ type: 'pointer.down', x: 1500, y: 500, button: 0 });
  r.host.handle({ type: 'pointer.drag', x: 1500, y: 600 });
  r.host.handle({ type: 'pointer.drag', x: 1500, y: 700 });
  r.host.handle({ type: 'pointer.up', x: 1500, y: 700 });
  r.frame();
  r.host.port.invoke(PLAN_UNDO);
  expect(r.lastLine()[1].z).toBe(500);
  r.frame();
  // The buttons mirror the stacks.
  const cmd = (id: string): boolean => r.host.port.status.get().commands.find((c) => c.id === id)?.enabled === true;
  expect(cmd(PLAN_REDO)).toBe(true);
  r.click(3000, 500);
  expect(cmd(PLAN_REDO)).toBe(false);
  expect(() => r.host.port.invoke(PLAN_REDO)).toThrow(/plan\.redo is disabled: Nothing to redo/);
  expect(r.host.redo()).toBe(false);
});

test('a run of depth steps is one undo: holding the key cannot push the waypoint edits out of the history', () => {
  const r = rig();
  drawLine(r);
  // 80 steps down, 160 up: the first playtest lost every waypoint edit behind them (the history holds 100 steps).
  for (let i = 0; i < 80; i++) r.host.handle({ type: 'tool.adjust', delta: 1 });
  for (let i = 0; i < 160; i++) r.host.handle({ type: 'tool.adjust', delta: -1 });
  r.frame();
  expect(r.lastLine()[0].y).toBe(GROUND_Y);
  // One undo puts the depth back, three more take the waypoints away one by one.
  expect(r.host.undo()).toBe(true);
  expect(r.lastLine().map((w) => w.y)).toEqual([GROUND_Y - 20, GROUND_Y - 20, GROUND_Y - 20]);
  r.frame();
  expect(r.host.undo()).toBe(true);
  expect(r.lastLine().map((w) => w.x)).toEqual([500, 1500]);
  r.frame();
  expect(r.host.undo()).toBe(true);
  expect(r.host.undo()).toBe(true);
  expect(r.plan.draft()).toBeNull();
  expect(r.host.undo()).toBe(false);
  // A depth step on another selection is its own step again.
  const two = rig();
  drawLine(two);
  two.host.handle({ type: 'tool.adjust', delta: 1 });
  two.click(1500, 500);
  two.host.handle({ type: 'tool.adjust', delta: 1 });
  two.frame();
  expect(two.lastLine().map((w) => w.y)).toEqual([GROUND_Y - 21, GROUND_Y - 22, GROUND_Y - 21]);
  two.host.undo();
  expect(two.lastLine().map((w) => w.y)).toEqual([GROUND_Y - 21, GROUND_Y - 21, GROUND_Y - 21]);
  two.frame();
  two.host.undo();
  expect(two.lastLine().map((w) => w.y)).toEqual([GROUND_Y - 20, GROUND_Y - 20, GROUND_Y - 20]);
});

test('the official alignment does not silently replace a line the player drew: the button asks once', () => {
  const r = rig();
  // Nothing drawn: one click is enough.
  r.host.port.activate('plan');
  r.host.port.invoke(TOOL_COMMANDS.planUseOfficial);
  expect(r.fake.commands).toEqual([{ t: 'useOfficialPlan' }]);
  r.frame();
  r.host.port.activate(null);
  r.fake.commands.length = 0;
  // A drawn line: the first click only warns, with the button saying so; the second does it.
  const own = rig();
  drawLine(own);
  own.fake.commands.length = 0;
  const label = (): string => own.host.port.status.get().commands.find((c) => c.id === TOOL_COMMANDS.planUseOfficial)?.label ?? '';
  expect(label()).toBe('Use the official alignment');
  own.host.port.invoke(TOOL_COMMANDS.planUseOfficial);
  expect(own.fake.commands).toEqual([]);
  expect(own.host.port.status.get().hint).toMatch(/replaces the line you drew/);
  expect(label()).toBe('Click again: this replaces your line');
  expect(own.plan.draft()?.waypoints).toHaveLength(3);
  own.host.port.invoke(TOOL_COMMANDS.planUseOfficial);
  expect(own.fake.commands).toEqual([{ t: 'useOfficialPlan' }]);
  own.frame();
  expect(own.plan.draft()?.waypoints).toEqual(OFFICIAL);
  // The question lapses: four seconds later the button is back and a click asks again.
  own.fake.commands.length = 0;
  own.host.port.invoke(TOOL_COMMANDS.planUseOfficial);
  for (let i = 0; i < 300; i++) own.frame();
  expect(label()).toBe('Use the official alignment');
  own.host.port.invoke(TOOL_COMMANDS.planUseOfficial);
  expect(own.fake.commands).toEqual([]);
});

test('the opening date in the readouts reads as a month and a year, like the rest of the interface', () => {
  const r = rig();
  drawLine(r);
  expect(readout(r, 'opens').value).toBe('May 2032');
});

test('clear removes the line and can be undone; an unknown command throws', () => {
  const r = rig();
  drawLine(r);
  r.host.port.invoke(TOOL_COMMANDS.planClear);
  expect(r.fake.commands[r.fake.commands.length - 1]).toEqual({ t: 'removeProject', projectId: 'portal' });
  r.frame();
  expect(r.plan.draft()).toBeNull();
  expect(r.host.undo()).toBe(true);
  r.frame();
  expect(r.fake.project()?.waypoints).toHaveLength(3);
  expect(() => r.host.port.invoke('plan.nope')).toThrow(/unknown command plan\.nope/);
});

test('a change the sim refuses is rolled back after a second, with the reason in the hint', () => {
  const r = rig();
  drawLine(r);
  r.fake.rejectAlignments = true;
  r.click(3000, 500);
  expect(r.plan.draft()?.waypoints).toHaveLength(4);
  for (let i = 0; i < 30; i++) r.frame();
  // Half a second: still waiting.
  expect(r.plan.draft()?.waypoints).toHaveLength(4);
  for (let i = 0; i < 40; i++) r.frame();
  expect(r.plan.draft()?.waypoints).toHaveLength(3);
  expect(r.host.port.status.get().hint).toBe('The change was refused: the design is frozen.');
  expect(r.fake.cues[r.fake.cues.length - 1]).toBe('tool.invalid');
  expect(r.host.undo()).toBe(false);
});

test('a frozen design cannot be edited: every edit is refused with the reason', () => {
  const r = rig();
  drawLine(r);
  r.fake.mutate((s) => {
    s.projects[0].designFrozen = true;
  });
  r.frame();
  const sent = r.fake.commands.length;
  expect(r.host.port.status.get().hint).toBe('The design went to tender. The alignment is fixed.');
  r.click(3000, 500);
  r.host.handle({ type: 'tool.secondary', x: 500, y: 500 });
  r.host.handle({ type: 'tool.adjust', delta: 1 });
  expect(r.host.handle({ type: 'pointer.down', x: 1500, y: 500, button: 0 })).toBe(true);
  r.host.handle({ type: 'pointer.drag', x: 1500, y: 900 });
  r.host.handle({ type: 'pointer.up', x: 1500, y: 900 });
  expect(r.fake.commands).toHaveLength(sent);
  expect(r.plan.draft()?.waypoints.map((w) => w.z)).toEqual([500, 500, 500]);
  expect(r.fake.cues.filter((c) => c === 'tool.invalid').length).toBeGreaterThanOrEqual(4);
  const off = r.host.port.status
    .get()
    .commands.filter((c) => !c.enabled)
    .map((c) => c.id);
  expect(off).toContain(TOOL_COMMANDS.planUseOfficial);
  expect(off).toContain(TOOL_COMMANDS.planClear);
  expect(() => r.host.port.invoke(TOOL_COMMANDS.planClear)).toThrow(/The design is frozen/);
});

test('Escape drops the selection first and leaves the tool second; Enter and Finish leave it keeping the line', () => {
  const r = rig();
  drawLine(r);
  r.click(1500, 500);
  expect(r.host.handle({ type: 'tool.cancel' })).toBe(true);
  expect(r.host.active()?.id).toBe('plan');
  expect(r.plan.draft()?.selected).toBe(-1);
  expect(r.host.handle({ type: 'tool.cancel' })).toBe(true);
  expect(r.host.active()).toBeNull();
  expect(r.host.port.status.get().id).toBeNull();
  expect(r.fake.previews[r.fake.previews.length - 1]).toBeNull();
  expect(r.fake.project()?.waypoints).toHaveLength(3);
  r.host.port.activate('plan');
  expect(r.plan.draft()?.waypoints).toHaveLength(3);
  expect(r.host.handle({ type: 'tool.confirm' })).toBe(true);
  expect(r.host.active()).toBeNull();
  r.host.port.activate('plan');
  r.host.port.invoke(TOOL_COMMANDS.planFinish);
  expect(r.host.active()).toBeNull();
  expect(r.fake.commands.some((c) => c.t === 'removeProject')).toBe(false);
});

test('switching tools in the middle of a drag or with a lone waypoint leaves the sim untouched', () => {
  const r = rig();
  drawLine(r);
  const sent = r.fake.commands.length;
  r.host.handle({ type: 'pointer.down', x: 1500, y: 500, button: 0 });
  r.host.handle({ type: 'pointer.drag', x: 1500, y: 900 });
  r.host.port.activate('dig');
  expect(r.host.active()?.id).toBe('dig');
  // The pointer.up of the abandoned drag goes to the dig tool, which has no stroke.
  r.host.handle({ type: 'pointer.up', x: 1500, y: 900 });
  r.frame();
  expect(r.fake.commands).toHaveLength(sent);
  expect(r.fake.project()?.waypoints[1].z).toBe(500);
  r.host.port.activate('plan');
  expect(r.plan.draft()?.waypoints.map((w) => w.z)).toEqual([500, 500, 500]);
  // History does not survive a tool switch.
  expect(r.host.undo()).toBe(false);
  // A lone waypoint is dropped when the tool goes away.
  const r2 = rig();
  r2.host.port.activate('plan');
  r2.click(500, 500);
  r2.host.port.activate('dig');
  r2.host.port.activate('plan');
  expect(r2.plan.draft()).toBeNull();
  expect(r2.fake.commands).toEqual([]);
});

test('the smoothed centreline is drawn as an overlay item and removed with the tool', () => {
  const r = rig();
  r.host.port.activate('plan');
  r.click(500, 500);
  r.click(1500, 500);
  expect(r.fake.overlayItems).toHaveLength(0);
  expect(r.plan.centreline()).toEqual([]);
  r.click(2500, 1500);
  expect(r.fake.overlayItems).toHaveLength(1);
  const item = r.fake.overlayItems[0];
  expect(item.spec.kind).toBe('polyline');
  const line = r.plan.centreline();
  expect(line.length).toBeGreaterThan(10);
  expect(line[0]).toEqual({ x: 500, y: GROUND_Y - 20, z: 500 });
  expect(line[line.length - 1]).toEqual({ x: 2500, y: GROUND_Y - 20, z: 1500 });
  r.click(3200, 1500);
  expect(r.fake.overlayItems).toHaveLength(1);
  expect(item.updates).toBeGreaterThan(0);
  r.host.port.activate(null);
  expect(item.removed).toBe(true);
});

test('smoothCentreline: arcs are tangent to both legs, hold the radius, and shrink where a leg is short', () => {
  const wps: Waypoint[] = [
    { x: 0, y: 0, z: 0 },
    { x: 1000, y: -10, z: 0 },
    { x: 1000, y: -20, z: 1000 },
  ];
  const line = smoothCentreline(wps, 150, 5);
  // Tangent points 150 m either side of the corner (R tan 45 degrees).
  const onFirstLeg = line.filter((p) => Math.abs(p.z) < 1e-9);
  expect(Math.max(...onFirstLeg.map((p) => p.x))).toBeCloseTo(850, 6);
  // Every arc point is 150 m from the centre (850, 150).
  const arc = line.filter((p) => p.x > 850 + 1e-9 && p.z < 150 - 1e-9);
  expect(arc.length).toBeGreaterThan(20);
  for (const p of arc) expect(Math.hypot(p.x - 850, p.z - 150)).toBeCloseTo(150, 6);
  // No kinks: consecutive direction changes stay small, and elevation is monotonic through the corner.
  for (let i = 2; i < line.length; i++) {
    const a = Math.atan2(line[i - 1].z - line[i - 2].z, line[i - 1].x - line[i - 2].x);
    const b = Math.atan2(line[i].z - line[i - 1].z, line[i].x - line[i - 1].x);
    expect(Math.abs(b - a)).toBeLessThan(0.05);
    expect(line[i].y).toBeLessThanOrEqual(line[i - 1].y + 1e-9);
  }
  // A 100 m leg holds a tangent of 50 m at most: the radius drops to 50 m and the curve stays inside the polygon.
  const tight = smoothCentreline(
    [
      { x: 0, y: 0, z: 0 },
      { x: 1000, y: 0, z: 0 },
      { x: 1000, y: 0, z: 100 },
    ],
    150,
    5,
  );
  expect(Math.max(...tight.filter((p) => Math.abs(p.z) < 1e-9).map((p) => p.x))).toBeCloseTo(950, 6);
  // Straight lines and short inputs pass through; bad arguments fail loudly.
  expect(smoothCentreline(wps.slice(0, 2), 150)).toEqual([wps[0], wps[1]]);
  expect(smoothCentreline([], 150)).toEqual([]);
  const straight = smoothCentreline(
    [
      { x: 0, y: 0, z: 0 },
      { x: 10, y: 0, z: 0 },
      { x: 20, y: 0, z: 0 },
    ],
    150,
  );
  expect(straight).toHaveLength(3);
  expect(() => smoothCentreline(wps, 0)).toThrow(/radius and step must be positive/);
});

test('the estimate is recomputed on edits and snapshot changes, not on every frame', () => {
  const r = rig();
  drawLine(r);
  const n = r.fake.estimates;
  for (let i = 0; i < 20; i++) r.host.update(1 / 60);
  r.host.handle({ type: 'pointer.hover', x: 900, y: 900 });
  expect(r.fake.estimates).toBe(n);
  // A reform changes the snapshot: prices are asked again.
  r.fake.mutate(() => {});
  r.host.update(1 / 60);
  expect(r.fake.estimates).toBe(n + 1);
});

test('the tool adds what the sim cannot see: waypoints outside the site and an axis above ground', () => {
  const r = rig();
  // A line whose last point is outside the 4 km site, as an official plan may be.
  r.fake.services.sim.command({
    t: 'setAlignment',
    projectId: 'portal',
    waypoints: [
      { x: 500, y: GROUND_Y - 20, z: 500 },
      { x: 2500, y: GROUND_Y + 4, z: 500 },
      { x: 4500, y: GROUND_Y - 20, z: 500 },
    ],
  });
  r.fake.apply();
  r.host.port.activate('plan');
  const preview = r.fake.previews[r.fake.previews.length - 1];
  if (preview?.kind !== 'alignment') throw new Error('expected an alignment preview');
  expect(preview.alignment.vertexIssues).toEqual([null, 'depth', 'bounds']);
  expect(readout(r, 'problem')).toMatchObject({ value: 'Waypoint 2 is 4.0 m above ground', bad: true });
  // The outside waypoint can be selected, but has no depth to edit until it is dragged onto the map.
  r.click(4500, 500);
  expect(r.plan.draft()?.selected).toBe(2);
  expect(r.host.port.status.get().options.map((o) => o.key)).toEqual([TOOL_KEYS.planDepthM]);
  const sent = r.fake.commands.length;
  r.host.handle({ type: 'tool.adjust', delta: 1 });
  expect(r.fake.commands).toHaveLength(sent);
  expect(r.host.port.status.get().hint).toBe('Waypoint 3 is outside the site. Drag it onto the map first.');
  r.host.handle({ type: 'pointer.down', x: 4500, y: 500, button: 0 });
  r.host.handle({ type: 'pointer.drag', x: 3500, y: 500 });
  r.host.handle({ type: 'pointer.up', x: 3500, y: 500 });
  expect(r.lastLine()[2]).toEqual({ x: 3500, y: GROUND_Y - 20, z: 500, geology: 'bayMud' });
  // Lowering the middle waypoint clears the depth issue.
  r.frame();
  r.click(2500, 500);
  r.host.port.setOption(TOOL_KEYS.planWaypointDepthM, 20);
  r.frame();
  const after = r.fake.previews[r.fake.previews.length - 1];
  if (after?.kind !== 'alignment') throw new Error('expected an alignment preview');
  expect(after.alignment.vertexIssues).toEqual([null, null, null]);
  expect(r.host.port.status.get().readouts.some((o) => o.id === 'problem')).toBe(false);
});

test('a waypoint dropped on its neighbour goes back: the sim refuses points closer than 1 m', () => {
  const r = rig();
  drawLine(r);
  const sent = r.fake.commands.length;
  r.host.handle({ type: 'pointer.down', x: 1500, y: 500, button: 0 });
  r.host.handle({ type: 'pointer.drag', x: 500.5, y: 500 });
  r.host.handle({ type: 'pointer.up', x: 500.5, y: 500 });
  expect(r.fake.commands).toHaveLength(sent);
  expect(r.plan.draft()?.waypoints[1].x).toBe(1500);
  expect(r.host.port.status.get().hint).toBe('Waypoints 1 and 2 are on top of each other.');
  expect(r.host.undo()).toBe(true);
  // That undo was the third click, not the refused drag.
  expect(r.lastLine()).toHaveLength(2);
});
