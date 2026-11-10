/**
 * Social media backlash: one post every time the player spends political capital. Satire: every handle and
 * every post is invented, no real person or account is meant. The post is picked by a generator seeded from
 * the sim seed and the post number, so the same seed and commands give the same posts and the event dice
 * (state.rng) are not touched.
 */
import { createRng, nextInt } from '@bayvox/core';
import type { SimState, SocialPost } from './types.ts';

/** How many posts the state keeps (newest last). */
export const SOCIAL_POSTS_KEPT = 20;

/** Invented accounts. The digits and the phrasing are there so that none reads as a real one. */
export const SOCIAL_HANDLES: readonly string[] = [
  '@ParkingSpot4Ever_94107',
  '@ConcernedOfRinconHill',
  '@MyViewMyRules_2nd',
  '@ShadowStudyEnjoyer',
  '@Process_Is_Sacred',
  '@NeighbourhoodCharacter1906',
  '@TownsendStDriveway',
  '@SevenHourPublicComment',
  '@ConsultantOfConsultants',
  '@HistoricGasMain',
  '@NotAgainstTrainsBut',
  '@BayMudTruther',
  '@ChangeOrderNo47',
  '@EIR_Volume_Nine',
  '@OneManOneParkingSpot',
  '@StudyItSomeMore',
];

/**
 * Post templates by cause group. `{what}` is the thing the capital was spent on, in the words of the reform
 * tree or the event card. A cause without a group of its own falls back to `any`.
 */
export const SOCIAL_TEMPLATES: Readonly<Record<string, readonly string[]>> = {
  specustawa: [
    'A SPECIAL ZONE where permits do not exist?? Ugly little dictator. I had a 400-page comment letter ready.',
    'So the act IS the permit now. Tyrant. In my day a railway waited eleven years like everybody else.',
    'They drew a line on a map and called it law. This is how tyrants start. First no permits, then trains.',
    'Specustawa. I cannot pronounce it and I am against it. Dictator with a ruler and a highlighter.',
    'Who voted for a zone where nobody may sue? I sue recreationally. Ugly, ugly behaviour.',
    'Imported a law from Poland to skip MY hearing. Emperor of Townsend Street, this one.',
  ],
  permitting: [
    '"{what}". Translation: the tyrant has decided my objections are too long.',
    'Just heard about "{what}". The tyrant killed democracy today, between the scoping meeting and the second scoping meeting.',
    '{what}? I was promised nine more years of review. Dictator. Ugly one too.',
    'They passed "{what}" without asking the people who would have said no. Petty despot energy.',
    'With "{what}" a railway might actually be approved. Is that what we want? A tyrant who approves things?',
    'I do not oppose trains. I oppose "{what}", the train, the tunnel and this ugly autocrat personally.',
  ],
  procurement: [
    '"{what}": so the consultants who supervise the consultants are out of work. Heartless tyrant.',
    'Ugly dictator announces "{what}". My cousin bills by the hour and he is devastated.',
    '{what}. Sure. Next the despot will want to know what things cost BEFORE buying them.',
    'Read the fine print of "{what}": the lowest bidder is sad now. Who speaks for the lowest bidder? Not this tyrant.',
    'First they came for the change orders. "{what}" is the work of a cold, ugly little tsar.',
    'Three shifts? Bidders from abroad? "{what}" is how a tyrant says hello.',
  ],
  design: [
    '"{what}". The dictator has cancelled the mezzanine I was never going to use. I am grieving.',
    "So the station will be the size of a train. {what}. Ugly, cheap and efficient: a tyrant's taste.",
    'Our city deserved a cathedral with platforms. Instead: "{what}". Small-minded despot.',
    '{what}?? What about the trains that may come in forty years? Nobody thinks of them. Dictator.',
    'A standard station. Standard! "{what}" is an attack on bespoke tile. Ugly inside and out.',
    'They call it "{what}". I call it a tyrant with a tape measure.',
  ],
  tunnelling: [
    '"{what}": the autocrat now tells machines how to dig. Ugly business.',
    'Heard the despot spent favours on "{what}". The mud was fine as it was.',
  ],
  eventSettle: [
    'The dictator SETTLED. "{what}". My driveway and I were ready to go to the Supreme Court.',
    'Paid off a lawsuit instead of waiting four years for it: "{what}". Impatient, ugly tyrant.',
    'Rule by handshake. "{what}" was decided in a room I was not in. Despot.',
  ],
  eventFunding: [
    'Where did the money come from? "{what}". Favours! The tyrant runs this town on favours.',
    'Somebody in Sacramento owes the dictator a lot. "{what}". Ugly, ugly politics.',
    'A hole in the budget, closed in a day: "{what}". Only a despot fixes things that fast.',
    'Called in every favour for a TRAIN. "{what}". Ugly. The worst use of power I have seen this week.',
  ],
  any: [
    'Political capital spent on "{what}". The dictator is at it again. Also, ugly.',
    '"{what}" and nobody asked me. Tyrant.',
    'I leave town for one weekend and the despot does "{what}".',
    'Another decree: "{what}". The ugly autocrat of public transport strikes again.',
    'At this rate the tyrant will finish the railway. "{what}" was the warning sign.',
    'Has anyone checked whether "{what}" is even allowed? Asking as a victim of a dictator.',
  ],
};

/** How many distinct templates there are. */
export const SOCIAL_TEMPLATE_COUNT = Object.values(SOCIAL_TEMPLATES).reduce((n, list) => n + list.length, 0);

/** Why capital was spent: `cause` is stored on the post, `group` picks the templates, `what` fills them in. */
export interface SocialCause {
  cause: string;
  group: string;
  what: string;
}

/**
 * Appends the post for one spend of political capital. Pure in the state: the choice depends on the seed and
 * on how many posts were written before, nothing else.
 */
export function pushSocialPost(state: SimState, why: SocialCause): SocialPost {
  const id = state.nextSocialId ?? 1;
  // Seeds are safe integers; fold to 32 bits so the product stays one.
  const rng = createRng((state.seed >>> 0) * 4096 + (id % 4096));
  const list = SOCIAL_TEMPLATES[why.group] ?? SOCIAL_TEMPLATES.any;
  const posts = state.socialPosts ?? [];
  const last = posts[posts.length - 1];
  let handle = SOCIAL_HANDLES[nextInt(rng, SOCIAL_HANDLES.length)];
  let text = list[nextInt(rng, list.length)].replaceAll('{what}', why.what);
  // Two posts in a row from the same account or with the same words read as a bug: take the next one.
  if (last && last.handle === handle) handle = SOCIAL_HANDLES[(SOCIAL_HANDLES.indexOf(handle) + 1) % SOCIAL_HANDLES.length];
  if (last && last.text === text && list.length > 1) {
    const at = list.findIndex((t) => t.replaceAll('{what}', why.what) === text);
    text = list[(at + 1) % list.length].replaceAll('{what}', why.what);
  }
  const post: SocialPost = { id, tick: state.tick, handle, text, cause: why.cause };
  posts.push(post);
  while (posts.length > SOCIAL_POSTS_KEPT) posts.shift();
  state.socialPosts = posts;
  state.nextSocialId = id + 1;
  return post;
}
