/** The wildlife card: drawn during construction only, off the shared random stream, three ways out. */
import { describe, expect, test } from 'vitest';
import { autopilotCommands, eventHazardPerYear } from './engine.ts';
import { type EVENTS, eventById } from './events.ts';
import { profileFor } from './reforms.ts';
import { createSim, type GameSim, loadSim } from './sim.ts';
import { TEST_DESIGN, TEST_PROJECT, testScenario } from './test-scenario.ts';

const FISH = eventById('distantFish') as (typeof EVENTS)[number];

/** Plays the test line until the fish card is on the table, answering every other card by its default. */
function untilFish(seed: number): GameSim | null {
  const sim = createSim(testScenario(), seed);
  sim.dispatch(TEST_DESIGN);
  sim.run(365 * 40, (s) => {
    if (s.state.pendingEvents.some((e) => e.defId === 'distantFish') || s.state.projects[0].status === 'open') return false;
    return autopilotCommands(s.state);
  });
  return sim.state.pendingEvents.some((e) => e.defId === 'distantFish') ? sim : null;
}

describe('the fish, 100 miles away', () => {
  test('only a project under construction can draw it, and the two special acts make it rarer and then impossible', () => {
    const sim = createSim(testScenario(), 1);
    sim.dispatch([...TEST_DESIGN, { t: 'approveProject', projectId: TEST_PROJECT }]);
    const p = sim.state.projects[0];
    const hazard = (reforms: string[]) => eventHazardPerYear(FISH, p, profileFor(reforms));
    expect(p.phase).toBe('planning');
    expect(hazard([])).toBe(0);
    p.phase = 'construction';
    expect(hazard([])).toBeCloseTo(0.2, 9);
    expect(hazard(['railSpecustawa'])).toBeCloseTo(0.1, 9);
    expect(hazard(['specustawa'])).toBe(0);
    p.eventCounts.distantFish = 1;
    expect(hazard([])).toBe(0);
  });

  test('pay costs money, stop costs 150 days, the exemption costs political capital, and silence stops the work', () => {
    let seed = 1;
    let sim = untilFish(seed);
    while (sim === null && seed < 40) sim = untilFish(++seed);
    if (sim === null) throw new Error('no seed under 40 draws the fish card on the test line');
    const card = sim.snapshot().events.find((e) => e.id === 'distantFish');
    if (card === undefined) throw new Error('the fish card is pending and not in the snapshot');
    expect(card.title).toBe('A Fish, 100 Miles Away');
    expect(card.options.map((o) => o.id)).toEqual(['pay', 'stop', 'exempt']);

    const answer = (optionId: string): GameSim => {
      const copy = loadSim(sim.save());
      copy.dispatch([{ t: 'resolveEvent', eventId: card.uid, optionId }]);
      return copy;
    };
    const before = sim.state.projects[0];
    const pay = answer('pay').state;
    expect(pay.projects[0].spent.events).toBeGreaterThan(before.spent.events);
    expect(pay.projects[0].delayDays).toBe(before.delayDays);
    expect(pay.politicalCapital).toBe(sim.state.politicalCapital);
    const stop = answer('stop').state;
    expect(stop.projects[0].spent.events).toBe(before.spent.events);
    expect(stop.projects[0].delayDays).toBe(before.delayDays + 150);
    const exempt = answer('exempt').state;
    expect(exempt.projects[0].spent.events).toBe(before.spent.events);
    expect(exempt.projects[0].delayDays).toBe(before.delayDays);
    expect(exempt.politicalCapital).toBe(sim.state.politicalCapital - 15);

    sim.run(31);
    expect(sim.state.eventLog.find((e) => e.uid === card.uid)).toMatchObject({ optionId: 'stop', byDefault: true });
  });
});
