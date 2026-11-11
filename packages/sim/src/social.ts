/**
 * Social media backlash: a pile-on of 2 to 4 posts every time the player spends political capital. Satire, and the
 * target is the player. Every post is an adaptation of a real public comment made against housing in the Bay Area
 * or against California rail, bent onto the game event that drew it; the comments, their context and their sources
 * are in docs/research/12-opposition-comments.md, and each template carries the id of the item it adapts. The posts
 * are not quotations of anyone and the accounts are invented: no real person, organisation or account is meant.
 * Comments aimed at vulnerable people are in the record and deliberately not used (see that file).
 * The posts are picked by a generator seeded from the sim seed and the id of the first post of the pile-on, so the
 * same seed and commands give the same posts and the event dice (state.rng) are not touched.
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
  '@ZucchiniNeedsSunlight',
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
  '@WhatAboutTheOwls',
  '@SetbackEnthusiast',
  '@HeritageTreeCounter',
];

/** One template: the id of the item or pattern in docs/research/12-opposition-comments.md it adapts, and the text. */
type Sourced = readonly [source: string, text: string];

/**
 * Post templates by group. A spend draws a pile-on (pushSocialBurst): the first post comes from the group of the
 * cause (a cause without one falls back to `any`; a housing option with a group of its own, `housing.<id>`, draws
 * from both), the second is personal ruin (`ruin`, or `money` when cash was spent too), the rest come from
 * `personal` and `pileOn`.
 * The voice is the public comment period: residents taking a railway or a block of flats as a personal catastrophe,
 * aimed at the player ("you"). No post names the game's currency or any other mechanic; SOCIAL_BANNED is the test.
 * Placeholders: `{what}` the thing that was decided, in the words of the list or the event card; `{usd}` the cash
 * spent ("$60M"); `{div:N}` the cash in dollars divided by N. `money` templates are only drawn when cash was spent.
 */
const TABLE: Readonly<Record<string, readonly Sourced[]>> = {
  specustawa: [
    [
      'H68',
      'A special zone with no permits. This is Sacramento overreach, except you did it from Warsaw. You cannot blow up our neighbourhoods and bury them beneath a statute.',
    ],
    ['H8', 'If you are going to have to do something, ask the neighbourhood what they want. We want hearings. You took the hearings.'],
    [
      'H69',
      'A zone where nobody may object is a declaration of war against our neighbourhoods. Mine is mostly a parking structure and I will defend it.',
    ],
    ['R10', 'We were hoodwinked. I voted for the railway. I did not vote for the railway being BUILT, here, in a zone, this decade.'],
    ['H51', 'Your special zone is a document responding to a mandate for numbers without a vision. My vision was eleven years of scoping.'],
    [
      'R28',
      'It is amazing to me that you moved this railway through a whole zone without any input from me or any of my neighbours. I had input. I had 400 pages of input.',
    ],
    [
      'R32',
      'We do not even belong in the state of California anymore. Nobody answers us. You answered once, with a zone, and it was worse.',
    ],
    [
      'H9',
      'I do not want my town to change. It is just heartbreaking and sickening to think we are facing a zone with no permits from you.',
    ],
    [
      'H37',
      'Inside your zone nobody will assess the noise impacts of loud student parties near the tracks. A court once cared about that. You do not.',
    ],
  ],
  permitting: [
    ['H1', 'Please IMMEDIATELY REMOVE {what} from everything. I am writing to communicate my IMMENSE objection to it and to you.'],
    [
      'H11',
      '{what}?? Our town, in its entirety, is habitat for the mountain lion. Every parcel. Also the tracks. You cannot permit anything here in 90 days or in 90 years.',
    ],
    ['H23', 'You know there was an old marsh here. Under {what} nobody will study the marsh for six more years. I liked the marsh study.'],
    ['H72', 'The traffic was not properly studied. Under {what} it gets studied in a WEEK, which is not properly, and you know it.'],
    [
      'H27',
      'I do not see how you can see a 63 percent increase in shadow as insignificant. {what} means no second shadow study. I only trusted the second one.',
    ],
    ['R31', '{what} is ill-conceived and free of common sense. Common sense is a seven-year review and you know it.'],
    ['R17', '{what}. I am actually shocked. This is why we are not friendly to you.'],
    [
      'H21',
      'My consultant found an imminent and substantial endangerment in the soil, the air and the font of the notice. {what} gives him 90 days to find another. He bills by the decade.',
    ],
    ['H73', 'Solving the problems of the region is not our responsibility. You made it our responsibility with {what}. How dare you.'],
    [
      'R21',
      '{what} is causing the unnecessary destruction of mature paperwork bordering on the right-of-way. Some of those binders were forty years old.',
    ],
  ],
  procurement: [
    [
      'R6',
      '{what}? Where is the rest of the money coming from? Santa Claus? Oh. It costs LESS now. Then where is the rest of the money GOING? Answer me.',
    ],
    ['R35', 'It was a crazy pork-barrel project and with {what} you have taken out the pork. Now it is just a barrel. A laughingstock.'],
    [
      'R4',
      'This is a boondoggle, and if you cannot do it right do not do it at all. {what} is you doing it right. I did not expect that and I resent it.',
    ],
    ['R3', 'Here comes {what}. There goes the neighbourhood. There goes the money for schools. I do not know how. I have a sign.'],
    ['R5', '{what} is a monster that will destroy this city. A cheaper monster than the one planned, which makes it sneakier.'],
    [
      'H56',
      'I am absolutely appalled by {what}, both from a design perspective and from the sheer greed on display. Whose greed? Yours. Probably.',
    ],
    [
      'H58',
      'Our politicians are selling us down the river. With {what} you are selling us down the river at a fair, itemized price, which is worse.',
    ],
    [
      'R37',
      'An extravagance ill-suited to present realities. That was my line about this railway. After {what} it is a bargain and you have taken my line.',
    ],
    ['H44', 'With {what} my street becomes a funnel of death. It is a cul-de-sac. The funnel has one end. You have doomed us.'],
    ['R34', 'When you come in with {what} you put a cloud on my land. A small cloud, shaped like an invoice that adds up.'],
  ],
  design: [
    [
      'R8',
      '{what}. The difference between a full mezzanine and a compact station is the difference between Park Avenue and blight. Is there recourse, or do we all just have to lie down on the tracks?',
    ],
    [
      'R13',
      'The worst is having this albatross above us. It is a tunnel, so it is below us. An albatross BELOW us. {what}. You think that looks good?',
    ],
    [
      'R2',
      '{what} is the equivalent of a seven-lane freeway through our corridor. It is two tracks in a tube. I measured it with my feelings.',
    ],
    ['R7', '{what} is a Berlin Wall, underground, where nobody can see it dividing us. You have split this city in a way I cannot locate.'],
    ['R1', 'There is no wrong side of the trains in this town and we intend to keep it that way. {what} gives the trains two sides. TWO.'],
    [
      'H40',
      'You cannot build a standard station and make it look like the Arc de Triomphe. {what}. I was promised a triumphal arch with platforms.',
    ],
    ['H41', '{what} looks like a Russian gulag. I have not seen the drawings. I have seen the word "standard".'],
    ['H14', 'Why can you not make it three or four tracks? Why can you not make it in scale with the rest of the overdesign? {what}.'],
    ['H59', '{what}? That is too small. Whatever you propose, I want it one notch different. You said compact. I say: too compact.'],
    [
      'R15',
      'To divide our community with {what} would be appalling. Has a tunnel even been discussed? It IS a tunnel? Has a deeper one been discussed?',
    ],
    [
      'H45',
      '{what} is not something that fits the scale of the city. It is not the kind of railway everybody is used to. Everybody is used to none.',
    ],
    ['R22', 'An amazing number of trees need to be removed for {what}. It is underground? An amazing number of ROOTS, then. You monster.'],
    [
      'R20',
      'We oppose {what} and anything that results in a structure. Also list every heritage tree and replace it three to one. Start with mine.',
    ],
  ],
  tunnelling: [
    [
      'R36',
      'I cannot imagine anyone, especially horses, enjoying {what} racing underneath. It would spook every horse and rider. I do not have a horse. I might GET a horse.',
    ],
    ['R12', 'Just by the rumour of {what}, the property values have gone down. Mine went up. That is how I know it is a trick, and yours.'],
    [
      'R9',
      'I have my back against the rail and I am going to keep on fighting {what}. I am like a mother bear with her cubs. The cubs are my hedges.',
    ],
    ['R24', '{what} gives off EMF and it is hazardous to our health. So does my router. I am against you both.'],
    [
      'R25',
      'Do you want {what} staring at your house? It is 30 metres down and cannot stare. It is not so much a NIMBY thing as it is common sense.',
    ],
    [
      'R19',
      'Before {what}, did you study modern diesel options? A modern diesel boring machine. Or no machine. Has "no machine" been studied?',
    ],
    [
      'R26',
      '{what} goes right under the dairy. It splits the cows in half. There will be cows on one side of the tunnel and cows on the other side. You did not think about the cows.',
    ],
    [
      'R29',
      'So you are saying the mud that gets {what} is more important than us? You are. You are saying the mud is more important than us.',
    ],
    [
      'R38',
      'I would not want {what} thundering under my neighbourhood forevermore either. It will take five weeks. That is basically forevermore.',
    ],
    [
      'R23',
      'The dirt under my house was a major visual buffer to the railway. {what} goes through the buffer. You cannot see it. That is not the same as fine.',
    ],
    [
      'R40',
      'You will regret {what}. You will regret not tunnelling slower. Everyone who ever tunnelled fast regretted it. I have no examples.',
    ],
  ],
  smallBore: [
    [
      'R4',
      'If you cannot do it right, do not do it at all. {what} does not fit a train. You dug a RAILWAY tunnel that does not fit a RAILWAY.',
    ],
    ['R35', '{what}: from a car park to a car park, in a pipe. You will be a laughingstock in Congress and at my club.'],
    [
      'R39',
      'I am really happy that it is going to be pods, because pods will be quieter than the rail. Wait. You wanted me to be happy? Then I object to {what}.',
    ],
    [
      'R13',
      'You think one lane of cars in a tube looks good? {what}. I do not know one person who would not rather see the whole thing be a real train, or nothing.',
    ],
    [
      'R37',
      'This town does not need a tiny subway that only goes from one thing to another thing. {what}. That is what all subways do and I am against all of them.',
    ],
    [
      'R42',
      '{what}. I just think it is time we stick a fork in it and call it good. The fork is 3.7 metres wide. It does not fit a train either.',
    ],
    [
      'R6',
      'Do not run this dangerous, quiet, cheap pod magnet through MY community. {what}. Who pays for the rest of the railway? Santa Claus?',
    ],
  ],
  housing: [
    [
      'H2',
      'I am writing to communicate our IMMENSE objection to {what}. It will MASSIVELY decrease our home values and IMMENSELY increase the number of other people.',
    ],
    ['H5', '{what}?? You could meet the whole housing target by counting all the pool houses. I have three. One is for the pool.'],
    [
      'H30',
      'I brought a zucchini, because I love to garden. And in order to garden, you need sunlight. This zucchini exists because {what} did not exist yet. Look at it. LOOK at it.',
    ],
    [
      'H26',
      '{what} will put my deck in shade. Will kids want to play in moisture? Not even my dogs want to lay out on the deck when it is wet. Ask them.',
    ],
    [
      'H39',
      'It is not a question of being a NIMBY. It is a question of saving the hill. There is no hill. It is a question of saving the flat. {what}.',
    ],
    [
      'H13',
      '{what} is just too big, too high, too many apartments, too many people, too little parking. And too close to a train, which is where you put it on purpose.',
    ],
    [
      'H57',
      'If you make it eight storeys, it will fit in the neighbourhood, okay? You made it eight? Then four. {what}. That is too tall.',
    ],
    ['H55', 'Do you want the whole bay ringed with homes? Because {what} is how it begins.'],
    [
      'H56',
      'On the bright side, with {what} so near the water, maybe the new neighbours will be able to sail away when the water rises. I will wave. From my hill.',
    ],
    [
      'H49',
      'This is the Peninsula, this is not Miami Beach. {what}. I do not want it to be like Hong Kong, where people live near where they are going.',
    ],
    [
      'H50',
      'I should not have to feel guilty for wanting to raise my son in a single-family home next to an empty lot the size of a town. {what} makes me feel guilty. Stop it.',
    ],
    [
      'H53',
      'We are not anti-housing, we are anti THIS housing: {what}. Also the last one, the next one, and the one you have not thought of yet.',
    ],
    ['H67', 'There is no land left, absolutely no land left. You found some? Next to the station? {what}. That land was busy being empty.'],
    ['H60', 'I do not know who needs these houses. {what} is out of character, for one, in terms of people having somewhere to live.'],
    [
      'H4',
      'With {what} you are making a town that is no longer suburban in nature but urban, which is not why I moved here in 1987 and closed the door behind me.',
    ],
    [
      'H52',
      'This region does not have a zoning problem. {what} is a major overreach. The problem is economic. The economic problem is that I got here first.',
    ],
    ['H66', '{what}. You will not get people out of their cars. I will personally stay in mine, in the station car park, to prove it.'],
    [
      'H19',
      'We struggle for parking on a daily basis; with {what} it will be worse. It also blocks the sunshine. My car likes the sunshine.',
    ],
    [
      'H47',
      'Time for a wall around this town, because of {what}. The next town over will be mainly paying for it. We have a big problem with all these people coming through on trains.',
    ],
    [
      'H70',
      'When we heard you wanted to build homes we were actually very excited. Then we heard it was {what}, here. Whoa. That will turn our street into a thoroughfare.',
    ],
    [
      'H18',
      '{what}? Put folks in units presently vacant. Build without changing the footprint of anything. Build it inside the existing air.',
    ],
    ['H34', '{what} is a dangerous assault on neighbourhood character. The character is a frontage road and a fence, and it is OURS.'],
    [
      'H7',
      'Very concerned about {what}: the traffic, the tree removal, the light and noise pollution, and the school resources. I listed all four so you know I mean none in particular.',
    ],
    ['H33', '{what} sets a precedent for what I believe is out-of-scale development. The scale I believe in is the one I already have.'],
  ],
  'housing.saltWorks': [
    ['H23', 'You know there was an old marsh here. Then a salt works. Now {what}. I liked it better as an old marsh, which I never saw.'],
    ['H11', 'The salt works, in its entirety, is habitat. For salt. With {what} you displace a candidate mineral.'],
    [
      'H21',
      'Sampling at the site indicates an imminent and substantial amount of salt. {what}. Have you no shame, building on a seasoning?',
    ],
    [
      'H74',
      '{what} is a Luxury Condo Project on open space. The open space is an evaporation pond behind a fence. I have never been. It is precious to me.',
    ],
  ],
  'housing.northBayshore': [
    [
      'H35',
      'This is really a line in the sand for the birds. {what} means residents. Residents have cats. The burrowing owls would be gone forever, and so would my best argument.',
    ],
    [
      'H36',
      'I am not interested in creating an enclave of dense apartment blocks isolated from the rest of the city, next to forty thousand jobs. {what}. Resolve the traffic first. All of it. Everywhere.',
    ],
  ],
  'housing.sanAntonioCenter': [
    [
      'H62',
      'That shopping centre car park has a lot of historic significance, which is at the core of why some of us bought homes near it. {what}. We rely on the light from it.',
    ],
    [
      'H63',
      '{what} will be a super-clean and super-modern type of complex. It just does not fit in with the neighbourhood, which is a car park with a store in it.',
    ],
  ],
  'housing.metaBayfront': [
    [
      'H54',
      'It feels like a village here, separate from everything, in a business park. And along comes this behemoth right on the bay front. {what}.',
    ],
    ['H71', '{what} is another wall on the waterfront, plain and simple. Do you want a bay front that looks like people live there?'],
  ],
  ruin: [
    [
      'H2',
      '{what} will MASSIVELY decrease the quality of life of ourselves and our neighbours. I have not asked the neighbours. I am being IMMENSE on their behalf.',
    ],
    [
      'H9',
      'It is just heartbreaking and sickening to think we are facing {what} from you. I do not want anything to change. I said so in 1987.',
    ],
    ['H10', '{what} is a grave mistake that this town will regret forever. I have started regretting it early, to get ahead.'],
    [
      'H33',
      '{what} sets a precedent. Today this. Tomorrow something else gets finished. You are destroying the character of the community, which was waiting.',
    ],
    [
      'R27',
      'We love this land. We feel betrayed by what you plan to do to it with {what}. What you plan is to go under it and leave it exactly as it was. BETRAYED.',
    ],
    ['H58', 'With {what} you are going to make our own neighbourhood unlivable. I will continue to live in it, loudly.'],
    [
      'R16',
      'We do not want to have our modest and quaint neighbourhood destroyed by {what}. It has gates, a hedge fund and a hedge. Modest. Quaint.',
    ],
    [
      'H22',
      '{what} directly affects neighbours who will now have no natural sunlight, in the sense that I am indoors all day writing to you about it.',
    ],
    ['R3', 'Here comes {what}. There goes the neighbourhood. You did this.'],
    ['H29', 'Because of {what}, any wet surfaces around here will continue to be wet, damp, and cold for a longer period. Including me.'],
    ['H65', '{what}?? Come and see who lives in my neighbourhood. It is me. I live here. I object.'],
    ['R30', 'We are not opposed to the train. We are just opposed to {what}, and to the way you are making the train go through places.'],
  ],
  money: [
    ['R6', '{usd} for {what}? And where is the other {usd} coming from? Santa Claus?'],
    [
      'R37',
      'This city does not need {what} for {usd}. An extravagance. For that you could have bought {div:900000} parking spaces and left me alone.',
    ],
    [
      'R3',
      '{usd} on {what}. There goes the money for schools. I do not have children. It is the principle, and the principle is that it was yours.',
    ],
  ],
  personal: [
    ['H41', 'Your whole plan looks like a Russian gulag. I have not seen the plan.'],
    ['H56', 'I am absolutely appalled, both from a design perspective and from the sheer you on display.'],
    ['H40', 'You can build 132,000 square feet of anything and you still cannot make it look like the Arc de Triomphe. That is on you.'],
    ['R17', 'I am actually shocked. This is why we are not friendly.'],
    ['H31', 'When people come and say that I am opposed to everything, that is not what I am. I am opposed to you.'],
    ['R25', 'It is not so much a NIMBY thing as it is common sense. Common sense says no. To you. Specifically.'],
    ['R42', 'I just think it is time we stick a fork in you and call it good.'],
    ['R35', 'You will be a laughingstock in Congress. I will see to it. I have written to both of my senators and one of somebody else.'],
    ['H8', 'If you are going to have to exist, ask the neighbourhood what they want. We want less of you.'],
    ['R31', 'You are ill-conceived and free of common sense.'],
    ['R9', 'I am like a mother bear with her cubs and you are standing between me and my parking.'],
    ['R13', 'You are an albatross above us. You think you look good?'],
    ['H20', 'Be kind to the adjacent community. That is me. I am the adjacent community. You were not kind.'],
    ['R5', 'You are a monster that will destroy this city. On schedule, which is the monstrous part.'],
  ],
  pileOn: [
    ['R3', 'Boondoggle! Boondoggle! Boondoggle! (I am chanting. Join in.)'],
    ['H20', 'Recall everybody. Recall you. Recall whoever comes next. I have the clipboard.'],
    ['R41', 'Opposition on my street is vociferous and near unanimous. One of us is undecided. He is new.'],
    ['H57', 'Too big, too everything.'],
    ['H55', 'This is how it begins.'],
    ['R10', 'Opposing this is a no-brainer. I have brought no brain to it.'],
    ['H60', 'I do not want to look out my front window and see this monstrosity every day. I will, though. Every day. With binoculars.'],
    ['R11', 'If I had known that voting for it meant putting it HERE. I voted for it, but not here. Not now. Not like this.'],
    ['H33', 'Protect Our Community. From what? Unclear. From you. I have the lawn sign.'],
    ['A1', 'I am not against it, but. That is the whole post. But.'],
    ['H73', 'Not our responsibility. Whatever it is.'],
    ['R18', 'The impacts will be significant and this town will continue to oppose you.'],
  ],
  eventSettle: [
    [
      'R14',
      '{what}. Our fallback was always a stacked tunnel under the right of way, paid for by you, and failing that, court. You took court.',
    ],
    ['R4', 'You settled? If you cannot fight a lawsuit right, do not fight it at all. {what}. I had a former county supervisor ready.'],
    [
      'R8',
      'Is there recourse, or do we all just have to lie down on the tracks? {what}. There was recourse. It was the lawsuit. You ended it.',
    ],
    ['R18', '{what}. The impacts on our town will be significant, and the town will continue to oppose the thing it just agreed to.'],
    ['R9', 'I had my back against the rail and I was going to keep on fighting. {what}. Now my back is just against a rail.'],
  ],
  eventFunding: [
    ['R6', '{what}. So where did that money come from? Santa Claus? It came from YOU? I liked it better as a question.'],
    [
      'R35',
      '{what}. They said it ran from a dairy to a state prison, a train to nowhere. Now it is funded all the way to somewhere. You have ruined a perfectly good nickname.',
    ],
    ['R42', 'I just thought it was time we stick a fork in it and call it good. Then {what}. You pulled the fork out.'],
    [
      'R37',
      '{what}?? This city does not need a subway that only goes from the station to the other station. That is where the people are. Suspicious.',
    ],
  ],
  any: [
    ['H8', '{what}, and nobody asked the neighbourhood what it wants. It wants to be asked. Then it wants to say no.'],
    [
      'R28',
      'It is amazing to me that you did {what} without any input from me or any of my neighbours. I was at the wrong meeting. On purpose. Still.',
    ],
    ['A1', 'I am not opposed to {what}. I am just opposed to the way you are doing it, the place, the timing, and it.'],
    ['A15', '{what}. If you cannot do it right, do not do it at all. If you CAN do it right, also do not.'],
    ['H51', '{what} is a response to a mandate for numbers without a vision. My vision is a blank map.'],
    ['R10', 'We were hoodwinked. {what}. I was in the room and I voted yes, which is how I know.'],
  ],
};

function column(i: 0 | 1): Readonly<Record<string, readonly string[]>> {
  return Object.fromEntries(Object.entries(TABLE).map(([group, list]) => [group, list.map((row) => row[i])]));
}

/** The texts by group. */
export const SOCIAL_TEMPLATES: Readonly<Record<string, readonly string[]>> = column(1);

/** For each text of SOCIAL_TEMPLATES, in the same order, the id in docs/research/12-opposition-comments.md it adapts. */
export const SOCIAL_TEMPLATE_SOURCES: Readonly<Record<string, readonly string[]>> = column(0);

/** Words for the player as a ruler. At most one post of a pile-on uses one, and at most a quarter of the templates. */
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
  /** A second, narrower group whose templates join those of `group` for the first post, when it exists. */
  also?: string;
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
  const own = SOCIAL_TEMPLATES[why.group] ?? SOCIAL_TEMPLATES.any;
  const narrow = why.also === undefined ? undefined : SOCIAL_TEMPLATES[why.also];
  const lead = narrow === undefined ? own : [...narrow, ...own];
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
