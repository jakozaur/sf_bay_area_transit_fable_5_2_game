/**
 * Social media backlash: a pile-on of 2 to 4 posts every time the player spends political capital. Satire: every
 * handle and every post is invented, no real person or account is meant, and the target is the player. The posts
 * are picked by a generator seeded from the sim seed and the id of the first post of the pile-on, so the same seed
 * and commands give the same posts and the event dice (state.rng) are not touched.
 */
import { createRng, nextInt } from '@bayvox/core';
import type { SimState, SocialPost } from './types.ts';

/** How many posts the state keeps (newest last). */
export const SOCIAL_POSTS_KEPT = 40;

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
  '@SaltPondSentinel_1901',
  '@BrineShrimpCaucus',
  '@ViewOfTheEvaporator',
  '@LeafBlowerLibertarian',
  '@FourHourDesignReview',
  '@RecallEverybody2027',
  '@CulDeSacCassandra',
  '@FreeParkingOrDeath',
  '@HeightLimit_35ft',
  '@AngryAtHoles_650',
  '@TrafficStudyTruth',
  '@MyDrivewayMyCastle',
  '@OpposedSince1987',
  '@WhatAboutThePigeons',
  '@SetbackEnthusiast',
  '@GoldenShovelWatch',
];

/**
 * Post templates by group. A spend draws a pile-on (pushSocialBurst): the first post comes from the group of the
 * cause (a cause without one falls back to `any`), the second is a cost comparison (`compare`, or `money` when
 * cash was spent too), the rest come from `personal` and `pileOn`.
 * Placeholders: `{what}` the thing the capital was spent on, in the words of the reform tree or the event card;
 * `{pc}` the political capital spent; `{x:N}` that capital times N; `{usd}` the cash spent ("$60M");
 * `{div:N}` the cash in dollars divided by N. `money` templates are only drawn when cash was spent.
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
    'A tyrant with a drill. "{what}". The worms had a neighbourhood plan and nobody consulted them.',
    '"{what}"?? I have lived above undisturbed dirt for thirty years and I intend to die above it. Tyrant.',
    'So the dictator found a faster way to dig a hole to put my taxes in. "{what}". Uglier than the hole.',
  ],
  smallBore: [
    'A TUNNEL FOR CARS. In a tube. One lane. The tyrant has invented the road, but worse, and underground.',
    'The dictator bought a sewer pipe and is calling it transit. "{what}". I have seen bigger straws.',
    'So it does not fit a train. The despot dug a railway tunnel that does not fit a RAILWAY. Ugly and also narrow.',
    'Pods. PODS. We asked for nothing and the tyrant gave us pods in a drainpipe.',
    'No launch pit? Where am I supposed to stand and object? "{what}" is an attack on my hobby, dictator.',
    'It is a 3.7 metre hole. My ego does not fit in that and neither does that of the dictator.',
  ],
  housing: [
    'HOMES?! The tyrant wants PEOPLE to live near a TRAIN. "{what}". Where will the empty land live?',
    '"{what}". Thousands of new neighbours and not one of them asked my permission to exist. Dictator.',
    'I moved here in 1987 for the uninterrupted view of nothing in particular and this ugly despot wants to put families in it.',
    'Upzoning. The tyrant said the U word. "{what}". My property value just looked at me with fear.',
    'First a railway, now people to ride it. "{what}". This is how a dictator manufactures consent: with tenants.',
    'A six-storey building casts a shadow. A shadow! "{what}" will cast THOUSANDS. The emperor of shade.',
    'Who will think of the neighbourhood character? It is mostly parking, and it is beautiful. "{what}" is the work of a tyrant.',
    'They will build homes so the train has riders so the train looks like a good idea. "{what}". Diabolical. Ugly. Efficient.',
    'I am not against housing. I am against "{what}", housing near me, housing far from me, and this despot.',
    'The brine shrimp of the Bay were here first. "{what}". Not one shrimp was invited to the hearing, tyrant.',
  ],
  compare: [
    'For {pc} political capital you could have renamed {x:3} bridges after yourself, tyrant. Instead: "{what}".',
    '{pc} favours burned on "{what}". That is {x:12} ribbon cuttings we will never get to boo at, tyrant.',
    'Do you know what {pc} political capital buys? {x:40} stern letters from a supervisor. The dictator spent it on "{what}".',
    'With {pc} political capital a normal person commissions {x:2} feasibility studies of a feasibility study. This despot: "{what}".',
    '{pc} political capital. For that you could have had {x:7} listening sessions and one very long apology. Ugly priorities.',
    'I did the math. {pc} political capital is {x:25} photo ops with a golden shovel. Wasted on "{what}". The despot is worse than the shovel.',
    'For the price of "{what}" ({pc} political capital) the tyrant could have bought {x:9} blue-ribbon commissions. I sit on four.',
    '{pc} political capital on "{what}"?? That is {x:150} parking spaces worth of goodwill, gone. Monster. Tyrant.',
    'Could have spent {pc} political capital on {x:5} task forces to study the pigeons. Chose "{what}". The dictator is worse than the pigeons.',
    'For {pc} political capital you get {x:60} minutes of my undivided outrage, dictator. Clock starts now. "{what}".',
    '"{what}" cost {pc} political capital. For that money you could have painted {x:4} bike lanes and then removed them after I complained, despot.',
    'The despot blew {pc} political capital. That is {x:18} proclamations declaring a Day in my honour. I checked.',
    '{pc} political capital for "{what}". A decent autocrat would have built {x:2} statues of the dictator. This one is ugly AND cheap.',
    'For {pc} political capital the city could have held {x:30} community visioning workshops with sticky notes. I love sticky notes. Tyrant.',
  ],
  money: [
    '{usd} on "{what}". For that money you could have bought {div:12} burritos. I counted. Dictator.',
    '{usd}!! That is {div:900000} median parking spaces the tyrant will never build me.',
    'For {usd} you could have mailed every resident a strongly worded letter {div:4000000} times. Instead, the tyrant chose "{what}".',
    '"{what}" cost {usd}. That is {div:65} jars of artisanal bay salt. Think about that, despot.',
    '{usd} is {div:250000} consultant hours. Real families bill those hours. The dictator gave them to a machine.',
    'With {usd} I could have sued this project {div:500000} times. "{what}". Ugly use of a budget.',
    '{usd} for "{what}"? You could have bought {div:3} lottery tickets and had the same odds, tyrant.',
    'For {usd} the despot could have hired {div:80000} people to stand in the road holding SLOW signs for a year. That is a transit plan.',
  ],
  personal: [
    'Worse than a leaf blower at 7 a.m. on a Sunday. I said it. The dictator is worse.',
    'This tyrant has the charm of a wet parking ticket and half the legitimacy.',
    'I have met potholes with more empathy than this despot. Deeper, too.',
    'Ugly. Uglier than the back of a strip mall. And at least the strip mall has parking.',
    'A dictator. A tyrant. A person who, I am told, walks on escalators.',
    'The tyrant is worse than a raccoon in a compost bin. The raccoon at least holds public office hours.',
    'History will remember this autocrat next to the person who invented the roundabout.',
    'I would call the tyrant a clown but clowns travel many to a car and that is basically transit.',
    'This despot has the face of someone who has never once attended a four-hour design review. Smooth. Unbothered. Ugly.',
    'This despot is worse than a group project. Worse than the person in the group project who does all the work and tells everyone.',
    'A normal tyrant at least has the decency to run late. This dictator has a schedule and KEEPS it.',
    'The emperor of the excavator. The sultan of spoil. The ugliest shovel in the shed.',
    'Somewhere a seagull is choking on a french fry and it is still having a better day than this tyrant deserves.',
    'I do not say this lightly: the dictator is worse than the airport. Worse than both airports.',
  ],
  pileOn: [
    'Came here to say this. Dictator. Ugly. Also I have not read what happened.',
    'This. All of this. And another thing: tyrant.',
    'Finally someone is saying it. I have been saying it. Nobody listens to me. Despot.',
    'Adding my name to the list of people who are angry. It is a long list. I made it. Dictator.',
    'Unfollowed the dictator. Followed again to see what comes next. Unfollowed. Ugly.',
    'My whole street is furious. I asked both of the other people. Tyrant.',
    'Screenshotting this for the recall petition, tyrant.',
    'I was neutral on tyrants until today.',
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

/** Fewest and most posts one spend draws. */
export const SOCIAL_BURST_MIN = 2;
export const SOCIAL_BURST_MAX = 4;

/**
 * Why capital was spent: `cause` is stored on the post, `group` picks the templates of the first post, `what` fills
 * them in, `pc` and `cents` are the amounts the cost comparisons quote.
 */
export interface SocialCause {
  cause: string;
  group: string;
  what: string;
  /** Political capital spent. */
  pc: number;
  /** Cash spent with it, integer cents; 0 or absent when the spend was capital only. */
  cents?: number;
}

function whole(n: number): string {
  return Math.round(n).toLocaleString('en-US');
}

/** "$60M", "$1.2B", "$450,000". */
function cash(cents: number): string {
  const usd = cents / 100;
  if (usd >= 1e9) return `$${(usd / 1e9).toFixed(1).replace(/\.0$/, '')}B`;
  if (usd >= 1e6) return `$${(usd / 1e6).toFixed(1).replace(/\.0$/, '')}M`;
  return `$${whole(usd)}`;
}

/** Fills the placeholders of a template (see SOCIAL_TEMPLATES). */
export function fillSocialTemplate(template: string, why: SocialCause): string {
  const cents = why.cents ?? 0;
  return template
    .replaceAll('{what}', why.what)
    .replaceAll('{pc}', String(why.pc))
    .replaceAll('{usd}', cash(cents))
    .replace(/\{x:(\d+)\}/g, (_m, n: string) => whole(why.pc * Number(n)))
    .replace(/\{div:(\d+)\}/g, (_m, n: string) => whole(cents / 100 / Number(n)));
}

/**
 * Appends the pile-on for one spend of political capital: SOCIAL_BURST_MIN to SOCIAL_BURST_MAX posts from
 * different accounts, all with the same `burst`. Pure in the state: the choice depends on the seed and on how
 * many posts were written before, nothing else. Returns the new posts, oldest first.
 */
export function pushSocialBurst(state: SimState, why: SocialCause): SocialPost[] {
  const first = state.nextSocialId ?? 1;
  // Seeds are safe integers; fold to 32 bits so the product stays one.
  const rng = createRng((state.seed >>> 0) * 4096 + (first % 4096));
  const posts = state.socialPosts ?? [];
  const count = SOCIAL_BURST_MIN + nextInt(rng, SOCIAL_BURST_MAX - SOCIAL_BURST_MIN + 1);
  const cents = why.cents ?? 0;
  const lead = SOCIAL_TEMPLATES[why.group] ?? SOCIAL_TEMPLATES.any;
  // Post 1 is about the thing itself, post 2 is what it cost, then it gets personal.
  const lists: (readonly string[])[] = [
    lead,
    cents > 0 && nextInt(rng, 2) === 0 ? SOCIAL_TEMPLATES.money : SOCIAL_TEMPLATES.compare,
    SOCIAL_TEMPLATES.personal,
    SOCIAL_TEMPLATES.pileOn,
  ];
  const usedHandles = new Set<string>();
  const last = posts[posts.length - 1];
  if (last) usedHandles.add(last.handle);
  const usedTexts = new Set(posts.map((p) => p.text));
  const out: SocialPost[] = [];
  for (let k = 0; k < count; k++) {
    const list = lists[k];
    // A repeated account or the same words twice among the kept posts read as a bug: take the next free one.
    let h = nextInt(rng, SOCIAL_HANDLES.length);
    for (let tries = 0; tries < SOCIAL_HANDLES.length && usedHandles.has(SOCIAL_HANDLES[h]); tries++) h = (h + 1) % SOCIAL_HANDLES.length;
    let t = nextInt(rng, list.length);
    let text = fillSocialTemplate(list[t], why);
    for (let tries = 1; tries < list.length && usedTexts.has(text); tries++) {
      t = (t + 1) % list.length;
      text = fillSocialTemplate(list[t], why);
    }
    const likes = 40 + nextInt(rng, 9000);
    const post: SocialPost = {
      id: first + k,
      tick: state.tick,
      handle: SOCIAL_HANDLES[h],
      text,
      cause: why.cause,
      likes,
      reposts: nextInt(rng, Math.floor(likes / 3) + 1),
      burst: first,
    };
    usedHandles.add(post.handle);
    usedTexts.add(text);
    posts.push(post);
    out.push(post);
  }
  while (posts.length > SOCIAL_POSTS_KEPT) posts.shift();
  state.socialPosts = posts;
  state.nextSocialId = first + count;
  return out;
}
