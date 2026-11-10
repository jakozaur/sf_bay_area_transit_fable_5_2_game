/** A housing option with backlash templates of its own draws on them as well as on the general housing ones. */
import { describe, expect, test } from 'vitest';
import { createSim, type GameCommand, type HousingOptionDef, SOCIAL_TEMPLATES } from './index.ts';
import { testScenario } from './test-scenario.ts';

describe('backlash for a housing option', () => {
  test('a housing option with templates of its own draws its first post from them or from the general housing ones', () => {
    const option = (id: string): HousingOptionDef => ({
      id,
      title: `Homes at ${id}`,
      blurb: 'A synthetic site for the tests.',
      hectares: 1,
      homesPerHectare: 100,
      capitalCost: 5,
      at: { x: 20_000, z: -65_000 },
      source: 'test',
    });
    const narrow = SOCIAL_TEMPLATES['housing.saltWorks'];
    expect(narrow.length).toBeGreaterThanOrEqual(2);
    let fromNarrow = 0;
    for (let seed = 1; seed <= 40; seed++) {
      const sim = createSim(
        testScenario({ housing: [option('saltWorks'), option('elsewhere')], start: { ...testScenario().start, politicalCapital: 100 } }),
        seed,
      );
      const house = (optionId: string): GameCommand => ({ t: 'enactHousing', optionId });
      sim.dispatch([house('saltWorks')]);
      const first = (sim.snapshot().socialPosts ?? [])[0];
      expect(first.cause).toBe('housing:saltWorks');
      const template = first.text.replaceAll('Homes at saltWorks', '{what}');
      expect([...narrow, ...SOCIAL_TEMPLATES.housing], `seed ${seed}`).toContain(template);
      if (narrow.includes(template)) fromNarrow++;
      // An option without a group of its own draws from the general ones only.
      sim.dispatch([house('elsewhere')]);
      const posts = sim.snapshot().socialPosts ?? [];
      const second = posts.find((p) => p.cause === 'housing:elsewhere');
      expect(SOCIAL_TEMPLATES.housing, `seed ${seed}`).toContain(second?.text.replaceAll('Homes at elsewhere', '{what}'));
    }
    expect(fromNarrow).toBeGreaterThan(0);
  });
});
