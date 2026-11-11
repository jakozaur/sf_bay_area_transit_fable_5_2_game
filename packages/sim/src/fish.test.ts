/** The wildlife card: every project draws it once construction starts; the Specustawa is the free way out. */
import { describe, expect, test } from 'vitest';
import { autopilotCommands, eventHazardPerYear } from './engine.ts';
import { type EVENTS, eventById } from './events.ts';
import { profileFor } from './reforms.ts';
import { createSim, type GameSim, loadSim } from './sim.ts';
import { TEST_DESIGN, TEST_PROJECT, testScenario } from './test-scenario.ts';

const FISH = eventById('distantFish') as (typeof EVENTS)[number];

/** Plays the test line until the fish card is on the table, answering every other card by its default. */
function untilFish(seed: number, reforms: string[] = []): GameSim | null {
  const scenario = testScenario();
  const sim = createSim({ ...scenario, start: { ...scenario.start, policies: reforms } }, seed);
  sim.dispatch(TEST_DESIGN);
  sim.run(365 * 40, (s) => {
    if (s.state.pendingEvents.some((e) => e.defId === 'distantFish') || s.state.projects[0].status === 'open') return false;
    return autopilotCommands(s.state);
  });
  return sim.state.pendingEvents.some((e) => e.defId === 'distantFish') ? sim : null;
}

describe('the fish, 100 miles away', () => {
  test('every project draws it once, half way through construction, and no reform keeps it away', () => {
    const sim = createSim(testScenario(), 1);
    sim.dispatch([...TEST_DESIGN, { t: 'approveProject', projectId: TEST_PROJECT }]);
    const p = sim.state.projects[0];
    const hazard = (reforms: string[]) => eventHazardPerYear(FISH, p, profileFor(reforms));
    expect(p.phase).toBe('planning');
    expect(hazard([])).toBe(0);
    p.phase = 'construction';
    expect(FISH.certainAt).toBe(0.5);
    for (const reforms of [[], ['railSpecustawa'], ['specustawa']]) expect(hazard(reforms)).toBeGreaterThan(0);
    p.eventCounts.distantFish = 1;
    expect(hazard([])).toBe(0);
    for (const seed of [1, 2, 3]) {
      const drawn = untilFish(seed);
      if (drawn === null) throw new Error(`seed ${seed}: the line opened without the fish card`);
      expect(drawn.state.projects[0].phase).toBe('construction');
      expect(drawn.state.projects[0].phaseProgress).toBeGreaterThanOrEqual(0.5);
      expect(drawn.state.projects[0].phaseProgress).toBeLessThan(0.6);
    }
  });

  test('pay costs money, stop costs 150 days, the exemption costs political capital, and silence pays the fine', () => {
    const sim = untilFish(1);
    if (sim === null) throw new Error('the fish card was not drawn on the test line');
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
    // Without the Specustawa its way out is not on the card and cannot be taken by command.
    const refused = answer('specustawa');
    expect(refused.state.pendingEvents.some((e) => e.uid === card.uid)).toBe(true);
    expect(refused.snapshot().notices.at(-1)?.reason).toMatch(/needs the reform "specustawa"/);

    sim.run(31);
    expect(sim.state.eventLog.find((e) => e.uid === card.uid)).toMatchObject({ optionId: 'pay', byDefault: true });
  });

  test('with the Specustawa enacted the card has a fourth way out that costs nothing', () => {
    const sim = untilFish(1, ['specustawa']);
    if (sim === null) throw new Error('the fish card was not drawn on the test line under the Specustawa');
    const card = sim.snapshot().events.find((e) => e.id === 'distantFish');
    if (card === undefined) throw new Error('the fish card is pending and not in the snapshot');
    expect(card.options.map((o) => o.id)).toEqual(['pay', 'stop', 'exempt', 'specustawa']);
    const free = card.options[3];
    expect([free.costCents, free.delayDays, free.pc]).toEqual([0, 0, 0]);
    const before = { ...sim.state.projects[0], spent: { ...sim.state.projects[0].spent } };
    const capital = sim.state.politicalCapital;
    sim.dispatch([{ t: 'resolveEvent', eventId: card.uid, optionId: 'specustawa' }]);
    expect(sim.state.pendingEvents.some((e) => e.uid === card.uid)).toBe(false);
    expect(sim.state.projects[0].spent.events).toBe(before.spent.events);
    expect(sim.state.projects[0].delayDays).toBe(before.delayDays);
    expect(sim.state.politicalCapital).toBe(capital);
  });
});
