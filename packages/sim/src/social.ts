/**
 * Social media backlash: a pile-on of 2 to 4 posts every time the player spends political capital. Satire: every
 * handle and every post is invented, no real person or account is meant, and the target is the player: wounded
 * residents taking a reform as a personal catastrophe. The posts
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
 * cause (a cause without one falls back to `any`), the second is personal ruin (`ruin`, or `money` when cash was
 * spent too), the rest come from `personal` and `pileOn`.
 * The voice: wounded residents catastrophising about trivial losses, aimed at the player ("you"). No post names
 * the game's currency or any other mechanic; SOCIAL_BANNED is the test for that.
 * Placeholders: `{what}` the thing that was decided, in the words of the reform tree or the event card;
 * `{usd}` the cash spent ("$60M"); `{div:N}` the cash in dollars divided by N. `money` templates are only drawn
 * when cash was spent.
 */
export const SOCIAL_TEMPLATES: Readonly<Record<string, readonly string[]>> = {
  specustawa: [
    'You drew a zone on a map and now my 400-page comment letter is a hobby. How dare you. I laminated it.',
    'Nobody may sue? I sue recreationally. It is my cardio. {what} has destroyed my life and my resting heart rate.',
    'Are you stupid? Now the railway does not wait eleven years. My father waited eleven years. HIS father waited eleven years.',
    'I cannot pronounce {what} and it has ruined me. I had the whole decade planned around the hearings.',
    'No permits inside the zone. I LIVE inside the zone. Am I even permitted now? You have made me a peasant in my own cul-de-sac.',
    'You imported a law from Poland to skip MY hearing. I bought a blazer for that hearing, you ugly little tyrant.',
    'How can you do this to me. {what}. I was going to object in person, in writing and in interpretive dance.',
  ],
  permitting: [
    'How dare you. {what}. I was promised nine more years of review and I have nothing else going on.',
    '{what}?? My objection was 212 pages. What do I do with it now? Read it to my children? They have heard it.',
    'You are stupid. {what} has destroyed my life and I have not read what it is.',
    'Because of {what} the scoping meeting is cancelled. That meeting was where I saw my friends. I have no friends now. Happy?',
    'I do not oppose trains. I oppose {what}, the train, the tunnel and you personally. You have ruined my Tuesday evenings forever.',
    '{what}. So things just get approved now? We will live like peasants, with no second scoping meeting to our name.',
    'Dictator. I had a folding chair with my name on it at the planning commission. {what} has made it an ordinary chair.',
    'My therapist says to name the feeling. The feeling is {what}. How can you destroy me like this?',
  ],
  procurement: [
    '{what}. My cousin supervises the consultants who supervise the consultants. He cried at dinner. Into the good soup. How dare you.',
    'Are you stupid? {what} means somebody will know what things cost BEFORE buying them. That is not how I was raised.',
    'You have destroyed my life. {what}. I had a fourth study lined up. It was going to study the third study.',
    'How dare you. Because of {what} my brother-in-law bills by the job now. By the JOB. We will have to eat the boat.',
    '{what}?? I was going to send my daughter to college on change orders. Now she will have to be interesting instead.',
    'First you came for the change orders. Then {what}. I am a simple man with eleven subcontracts and you have made me poor.',
    'Bidders from abroad. Three shifts. {what}. Who is going to stand around the site with a clipboard now? Me? I have a bad knee, tyrant.',
    'We will be peasants. {what} took the contingency, and the contingency was where my family kept its hopes.',
  ],
  design: [
    'How dare you. We will be peasants. Poor people without even a THIRD TRACK that we might need in two years. {what}.',
    'You have destroyed my life. {what}. I had plans for that mezzanine. I was going to stand on it and feel important.',
    'Are you stupid? Who will need a third track in two years? ME. I will. {what} has left my family with two.',
    'Two tracks?? What if I want to look at a third one. {what}. You have ruined me.',
    '{what}. So the station will be the size of a train. Where does my sense of grandeur go? In a locker? There are no lockers.',
    'Our city deserved a cathedral with platforms. You gave us {what}. My grandchildren will ask what a mezzanine was and I will have to draw one.',
    'A standard station. STANDARD. {what}. I am not standard. My tile was going to be bespoke. You are ugly inside and out.',
    'I was going to be poor in a normal way. Thanks to {what} I am poor next to a small, sensible station.',
    '{what}?? What about the trains that may come in forty years? I will be 109 and I will have NOWHERE to put them, tyrant.',
  ],
  tunnelling: [
    '{what}. I have lived above undisturbed dirt for thirty years. It was MY dirt. How can you destroy me from below?',
    'How dare you. {what}. The worms had a neighbourhood plan. I helped them write it.',
    'You are stupid and you are under my house. {what}. My wine glasses will tremble once, in 2031, and I will never recover.',
    'A faster hole. {what}. I had ten good years of complaining about the slow hole ahead of me and you took them.',
    '{what}?? Do you know what is in that mud? My childhood. Probably. You have drilled through my childhood, despot.',
    'Because of {what} the machine works at night. I do not hear it. I do not feel it. But I KNOW. You have ruined sleep for me.',
    'We will be like peasants, with a tunnel. {what}. In my day a hole took a generation and we were grateful.',
  ],
  smallBore: [
    'A TUNNEL FOR CARS. In a tube. One lane. You have invented the road, but worse, and you did it to ME.',
    'Are you stupid? It does not fit a train. You dug a railway tunnel that does not fit a RAILWAY. My model trains are humiliated.',
    'Pods. PODS. I asked for nothing and you gave me pods in a drainpipe. How dare you destroy my life.',
    '{what}. I have seen bigger straws. We will be peasants in a pipe, one behind another, forever.',
    'No launch pit? Where am I supposed to stand and object? {what} has taken my hobby and my view of a pit.',
    'It is a 3.7 metre hole. My ego does not fit in that. My hat barely fits in that. You have ruined me, dictator.',
    'I told everyone at the club we were getting a real tunnel. {what}. I can never go back to the club.',
  ],
  housing: [
    'HOMES?! {what}. You want PEOPLE to live near a TRAIN. Where will the empty land live? Did you think about the empty land?',
    'How dare you. {what}. Thousands of new neighbours and not one of them asked my permission to exist.',
    'I moved here in 1987 for the uninterrupted view of a parking lot. {what} puts families in it. You have destroyed my life.',
    'You are stupid. A six-storey building casts a shadow. On my HEDGE. {what}. The hedge was all I had.',
    '{what}. My property value looked at me with fear this morning. We will be peasants. Peasants with only one guest bathroom.',
    'Who will think of the neighbourhood character? It is mostly parking and it is beautiful. {what}. I am in mourning.',
    'I am not against housing. I am against {what}, housing near me, housing far from me, and you.',
    'The brine shrimp were here first. {what}. Not one shrimp was invited to the hearing. I speak for them. They are furious, tyrant.',
    'Because of {what} a child might one day wave at me from a window. I did not consent to waving. You have ruined my street.',
    'New people will park where I look at parking. {what}. How can you do this to a man and his view?',
    '{what}?? I was the newest person on this block for thirty-eight years. It was my whole identity.',
    'Are you stupid? If people live near the station they will USE it. Then it will be full of people. {what}. My life is over.',
  ],
  ruin: [
    'We will be like peasants. Poor people. All because of {what}. How dare you destroy my life?',
    'You are stupid. How can you destroy me with {what}? I had a whole decade of meetings planned.',
    'I was going to be poor in a normal way. Now I am poor near a train. {what} did this.',
    'My grandchildren will ask what I did when {what} happened. I will say: I posted. I posted so hard.',
    'I have not slept since I read about {what} four minutes ago. You have destroyed my life.',
    'How dare you. {what} is the worst thing that has happened to me, and I once missed a ferry.',
    'Are you stupid? I read about {what} out loud and my dog could tell I was upset. Now the dog is upset. You have ruined a dog.',
    'Because of {what} I will have to move somewhere with worse trains, out of spite. I hope you are happy, dictator.',
    'I showed {what} to my mother. She said she did not understand it. Then she wept. Look what you have done.',
    'So it is {what}. This is how it ends for my family: on time and under budget, like animals.',
    'You have taken everything from me. Well. {what} took one thing from me. It FELT like everything.',
    'I had one thing to look forward to this decade and it was this project being late. Then came {what}. How dare you.',
    'Stupid. Ugly. Wrong. {what} has cost me my peace, my parking and my faith in delay.',
    'After {what} we will be living in huts. Huts near a railway. Is that what you wanted for us, tyrant?',
  ],
  money: [
    '{usd} on {what}. That is {div:12} burritos. I counted. Not one of them was for me. How dare you.',
    '{usd}!! That is {div:900000} parking spaces you will never build me. I had names for them.',
    '{what} cost {usd}. That is {div:65} jars of artisanal bay salt taken from the table of my family.',
    'With {usd} I could have sued this project {div:500000} times. {what}. You have destroyed my retirement plan.',
    '{usd} for {what}? You could have bought me {div:3} lottery tickets. I would have won. Now we will be peasants.',
    'For {usd} you could have hired {div:80000} people to hold SLOW signs for a year. I love those signs. You are stupid.',
    '{usd} is {div:250000} consultant hours. Real families bill those hours. Mine did. You gave them to a machine.',
  ],
  personal: [
    'Worse than a leaf blower at 7 a.m. on a Sunday. I said it. You are worse.',
    'You have the charm of a wet parking ticket.',
    'I have met potholes with more empathy than you. Deeper, too.',
    'Ugly. Uglier than the back of a strip mall. And the strip mall has parking.',
    'I am told you walk on escalators. That is the kind of person we are dealing with.',
    'You are worse than a raccoon in a compost bin. The raccoon at least looks sorry.',
    'History will remember you next to whoever invented the roundabout.',
    'I would call you a clown but clowns travel many to a car and that is basically transit.',
    'You have the face of someone who has never sat through a four-hour design review. Smooth. Unbothered. Stupid.',
    'You are worse than a group project. Worse than the one in the group project who does all the work and tells everyone.',
    'A normal tyrant has the decency to run late. You have a schedule and you KEEP it.',
    'Somewhere a seagull is choking on a french fry and it is still having a better day than you deserve.',
    'I do not say this lightly: you are worse than the airport. Worse than both airports.',
    'How do you sleep at night? I do not. I am up composing this.',
    'My wife says I should let it go. My wife is on your side now. You have destroyed my marriage.',
    'Stupid, stupid, stupid. I typed it three times so you would feel it.',
  ],
  pileOn: [
    'Came here to say this. I have not read what happened. My life is ruined too.',
    'This. All of this. And another thing: how dare you.',
    'Finally someone is saying it. I have been saying it. Nobody listens to me. Nobody ever has.',
    'Adding my name to the list of people who are angry. It is a long list. I made it.',
    'Unfollowed. Followed again to see what comes next. Unfollowed. You did this to me.',
    'My whole street is furious. I asked both of the other people.',
    'Screenshotting this for my grandchildren, who will be peasants.',
    'I was neutral on tyrants until today.',
    'Same. Destroyed. Completely destroyed. I am typing this from the floor.',
    'I do not know what this is about but I have not been this hurt since they moved the bus stop.',
  ],
  eventSettle: [
    'You SETTLED. {what}. My driveway and I were ready to go to the Supreme Court. We had outfits.',
    '{what}. Four years of lawsuit, gone. What am I supposed to talk about at Thanksgiving now? How dare you.',
    'Decided in a room I was not in. {what}. I am always in the room. You have destroyed the one thing I had, despot.',
    'Are you stupid? {what}. A lawsuit is a family tradition. My son was going to inherit that lawsuit.',
  ],
  eventFunding: [
    'Where did the money come from? {what}. I was enjoying the hole in the budget. It was the only hole I trusted.',
    '{what}. Fixed in a DAY. I had cleared my whole spring to be worried about it. How dare you.',
    'One phone call and there is a train again. {what}. I had told everyone it was dead. You have made me a liar.',
    'How can you do this to me? {what}. The project was finally on its knees and I had a speech ready.',
  ],
  any: [
    '{what} and nobody asked me. Nobody ever asks me. How dare you.',
    'I leave town for one weekend and you do {what}. I can never leave town again. You have made me a prisoner.',
    'At this rate you will finish the railway. {what} was the warning sign. What will I be against then?',
    'Has anyone checked whether {what} is even allowed? Asking as a victim.',
    'You are stupid. I do not know what {what} does but I felt it in my hip.',
    'After {what} we will be like peasants. Peasants who get places.',
  ],
};

/** Words for the player as a ruler. One joke: at most one post of a pile-on uses it, and at most a quarter of the templates. */
export const SOCIAL_RULER_WORDS = /dictator|tyrant|despot|autocrat|emperor|tsar/i;

/** What no post may say: the game's currency or any other mechanic. The posts are residents, not system messages. */
export const SOCIAL_BANNED = /political capital|\bPC\b|\bpoints\b/i;

/** How many distinct templates there are. */
export const SOCIAL_TEMPLATE_COUNT = Object.values(SOCIAL_TEMPLATES).reduce((n, list) => n + list.length, 0);

/** Fewest and most posts one spend draws. */
export const SOCIAL_BURST_MIN = 2;
export const SOCIAL_BURST_MAX = 4;

/**
 * What drew the pile-on: `cause` is stored on the post, `group` picks the templates of the first post, `what` fills
 * them in, `cents` is the cash the dollar comparisons quote.
 */
export interface SocialCause {
  cause: string;
  group: string;
  what: string;
  /** Cash spent with it, integer cents; 0 or absent when no cash was spent. */
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
    .replaceAll('{usd}', cash(cents))
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
  // Post 1 is about the thing itself, post 2 is the ruin it brought (in dollars when cash was spent), then it gets personal.
  const lists: (readonly string[])[] = [
    lead,
    cents > 0 && nextInt(rng, 2) === 0 ? SOCIAL_TEMPLATES.money : SOCIAL_TEMPLATES.ruin,
    SOCIAL_TEMPLATES.personal,
    SOCIAL_TEMPLATES.pileOn,
  ];
  const usedHandles = new Set<string>();
  const last = posts[posts.length - 1];
  if (last) usedHandles.add(last.handle);
  const usedTexts = new Set(posts.map((p) => p.text));
  const out: SocialPost[] = [];
  let ruler = false;
  for (let k = 0; k < count; k++) {
    const list = lists[k];
    // A repeated account or the same words twice among the kept posts read as a bug: take the next free one.
    let h = nextInt(rng, SOCIAL_HANDLES.length);
    for (let tries = 0; tries < SOCIAL_HANDLES.length && usedHandles.has(SOCIAL_HANDLES[h]); tries++) h = (h + 1) % SOCIAL_HANDLES.length;
    let t = nextInt(rng, list.length);
    let text = fillSocialTemplate(list[t], why);
    // So does a second "tyrant" in one pile-on: the template is tested, not the title that fills it.
    const taken = (): boolean => usedTexts.has(text) || (ruler && SOCIAL_RULER_WORDS.test(list[t]));
    for (let tries = 1; tries < list.length && taken(); tries++) {
      t = (t + 1) % list.length;
      text = fillSocialTemplate(list[t], why);
    }
    ruler ||= SOCIAL_RULER_WORDS.test(list[t]);
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
