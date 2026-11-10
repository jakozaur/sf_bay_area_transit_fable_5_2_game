# 12. Real opposition comments: Bay Area housing and California rail

Source material for the backlash posts in `packages/sim/src/social.ts`. Every post template there carries the id of the
item or pattern below that it adapts (`H30`, `R26`, `A14`); a unit test checks that each id exists in this file. The
posts are adaptations bent onto game events, not quotations, and the accounts that post them are invented.

Collected 2026-11-10 by web search and page fetch.

## Method and caveats

- Marks: **V** = returned as an exact quote from a page that was fetched. The fetch tool relays quotes through a
  summariser capped at about 125 characters, so some V quotes are fragments of longer sentences: spot-check against the
  URL before using anything as a literal quotation. **P** = close paraphrase from a fetched page. **S** = seen only in
  a search-result snippet, page not fetched or blocked (403/429): unverified.
- Names of private individuals are left out; speakers are given by type only. Where a sign named an elected official,
  the name is replaced by the role in square brackets.
- Dashes inside quotes were replaced with commas (punctuation only).
- Not found or not verified: 1846 Grove hearing quotes (snippet only), Redwood City Saltworks resident quotes, Dumbarton
  and Portal neighbour quotes (thin), the Berkeley mayor's SB 827 "declaration of war" line (snippet only), the origin
  of "train to nowhere".
- Not used in the game on purpose: comments aimed at poor, homeless, mentally ill or addicted people, at "what kind of
  people" would move in, or about crime by future residents (H6, H12, H15, H16, H17, H42, H43, H46). They are recorded
  because they are part of the record; the game's joke is on the complainer, never on a vulnerable group.

Format: quote | mark | context | speaker type | argument | source.

## Housing

### Atherton multifamily overlay, 2022 (letters to the town on the housing element)

H1. "I am writing this letter to communicate our IMMENSE objection to the creation of multifamily overlay zones in Atherton" | V | resident letter | venture capitalist couple | blanket objection | https://fortune.com/2022/08/13/atherton-california-housing-market-single-family-zoning-silicon-valley-andreessen-nimby-yimby/

H2. "They will MASSIVELY decrease our home values, the quality of life of ourselves and our neighbors" ... "and IMMENSELY increase the noise pollution and traffic" | V | same letter | same | property values, noise, traffic | same Fortune URL, and https://nzherald.co.nz/business/tech-titans-v-townhouses-a-nimby-battle-in-silicon-valleys-poshest-town/FF7VYLDJOJFVOXRL7LB5OP5ZPI

H3. "Please IMMEDIATELY REMOVE all multifamily overlay zoning projects from the Housing Element" | V | same letter | same | process, demand | Fortune URL

H4. "a town that is no longer suburban in nature but urban, which is not why its residents moved there" | V | letter | investment firm founding partner and spouse | character | NZ Herald URL

H5. Town should meet its state housing target by "counting all the pool houses" | P (fragment V) | letter | unnamed technology executive | "we already have housing" | NZ Herald URL

H6. Robberies and larceny already so bad that many families, including his, employ private security | P | letter | fintech chief executive | crime, safety | NZ Herald URL

H7. "very concerned" about traffic, tree removal, light and noise pollution, and school resources | P (fragment V) | letter | streaming company communications chief | traffic, trees, light, schools | NZ Herald URL

H8. "If you're going to have to do something, ask the neighbourhood what they want" | V | comment to reporter | investor | process | NZ Herald URL

H9. "I don't want Atherton to change" and "It is just heartbreaking and sickening to think we're facing this from the state." | V | council meeting dropping townhouses, July 2022 | town council member | character, local control | https://www.almanacnews.com/news/2022/07/21/atherton-council-dumps-townhouses-from-its-state-mandated-housing-plan/

H10. New zoning would "destroy the character of the community" and be a "grave mistake that Atherton would regret forever" | S | resident comments, 2023 | residents | character | https://therealdeal.com/sanfrancisco/2023/05/01/development-fight-heats-up-in-countrys-richest-city

### Woodside, 2022

H11. "Given that Woodside - in its entirety - is habitat for a candidate species" (so no parcel is eligible for SB 9 duplexes; the species is the mountain lion) | V | planning memo, Jan 2022 | town planning director | environmental, wildlife | https://abc7news.com/amp/post/woodside-ca-mountain-lions-california-affordable-housing-laws-sb-9-projects/11535724/

### 2550 Irving Street, Sunset, 100% affordable, 2021 to 2023

H12. "No Slums In The Sunset." / "7-story, 100-unit high-rise slum" / would "become the best place in San Francisco to buy heroin." | V | anonymous flyers in mailboxes, Jan 2021 | anonymous flyer | crime, character | https://preview-prod.w.sfchronicle.com/bayarea/article/slum-charges-fly-in-fracas-over-affordable-15880321.php

H13. "It's just too big, too high, too many apartments, too many people, too little parking." | V | Chronicle interview | long-time neighbour, association founder | scale, parking | same URL

H14. "Why can't you make it three or four stories? Why can't you make it in scale with the rest of the neighborhood?" | V | same | same | too tall | same URL

H15. "What kind of apartment building needs a full-time social worker? Not one for families" | V | same | resident since 1974 | "those people" | same URL

H16. "no one wants to live next to mentally ill and drug addicts in this neighborhood" | V | chat of virtual community meeting, Jan 2021 | meeting participant | crime, "those people" | https://richmondsunsetnews.com/2021/02/03/affordable-housing-project-polarizes-sunset-district-neighbors/

H17. Signs: "Sunset belongs to Sunset residents" / "[the district supervisor] destroys our community." | V | protest outside the site, Jan 2021 | protesters | outsiders, character | same URL

H18. "Put folks in units presently vacant. Build and remodel without changing the footprint of the existing building." | V | meeting chat | same-block resident | vacancy, "build elsewhere" | same URL

H19. "It blocks the sunshine for the neighboring residents" / "We struggle for parking on a daily basis; with the construction of this building it will be worse." | V | neighbourhood rally, 2021 | retired city worker, neighbour | shadow, parking | https://preview-prod.w.sfchronicle.com/sf/article/Sunset-residents-continue-to-push-back-against-16288567.php

H20. Signs: "The Right To Light For All Neighborhoods." / "Tell the Supervisors To Stop Toxic Waste" / "Be Kind To The Adjacent Community"; chant "Recall [the district supervisor]" | V | same rally | attendees | shadow, toxic soil | same URL

H21. Soil vapor sampling "indicate[s] an imminent and substantial endangerment to the public health" | V (fragment) | Board of Appeals demolition appeal, 2023 | geologist hired by neighbourhood association | toxic soil | https://missionlocal.org/2023/02/2550-irving-street-affordable-housing-environmental-appeal-mid-sunset-toxins-pce-demolition-permit/

H22. "This project directly affects neighbors who will now have no natural sunlight." | V | online comment under that article | resident across the street | shadow | same URL

### 469 Stevenson (Nordstrom valet lot), Board of Supervisors, Oct 2021

H23. "You know there was an old marsh here" | V | CEQA appeal hearing | president of appellant nonprofit | seismic, soil | https://sfist.com/2021/10/27/supes-shoot-down-27-story-soma-residential-tower-over-earthquake-displacement-concerns

H24. "the potential for this project to further gentrification and displacement" in "this extremely vulnerable community." | V | same hearing | supervisor | market-rate housing causes displacement | same URL

H25. The neighbouring building becomes "a prime target for investors to buy, for investors to declare they need to move the residents out." | V | same | appellant | displacement | same URL

### 2918 Mission ("historic laundromat"), Planning Commission, Sept 2018

H26. "Will kids want to play in moisture? Not even my dogs want to lay out on the deck when it's wet." | V | hearing on shadow over a preschool yard | planning commissioner | shadow | https://missionlocal.org/2018/09/sf-missions-historic-laundromat-development-delayed-again-over-shadow-study/

H27. "I don't see how you can see a 63 percent increase as insignificant." | V | same | planning commissioner | shadow study | same URL

Context (P): the Board had earlier voted unanimously to study whether the laundromat was a historic resource; a 137-page study found it was not.

### Folsom and Russ (SoMa), shadow on a park, 2018 to 2019

H28. "this isn't a meaningless shadow on someone's backyard." | V | Board of Supervisors, 2019 | supervisor | shadow on park | https://reason.com/2019/04/11/housing-starved-san-francisco-shoots-dow/

H29. "any wet surfaces in the park that are shaded will continue to be wet, damp, and cold for a longer period" / "The scale and size of the project seems to be monstrous" | V | Planning Commission, Dec 2018 | community organisation member | shadow, scale | same URL

### Berkeley small infill, 2016 to 2017

H30. "I brought a zucchini, because I love to garden" / "And in order to garden, you need sunlight." / "But this zucchini exists because I don't have a big two-story house next door to me right now." | V | Berkeley City Council, 2017, two houses replacing one | next-door neighbour holding a zucchini | shadow on garden | https://www.wlrn.org/2018-08-08/yes-in-my-backyard-movement-yimby-grows-as-bay-area-housing-tightens

H31. "When the YIMBYs come and say that I'm opposed to affordable housing, that's not what I am" | V | interview | same neighbour | "not against housing, but" | same URL

H32. "When you completely shadow all of the open space, you really impact the ability for anybody to possibly grow food in this community." | V | 1310 Haskell St hearing (three houses on one lot) | zoning board member | shadow, food growing | https://reallyducksoup.blogspot.com/2017/12/the-great-american-single-family-home.html (blog repost of a NYT feature)

H33. "This project sets a precedent for what I believe is out-of-scale development"; signs "Protect Our Community" and "Reject 1310 Haskell Permit!"; garden "on which I and my neighbors depend for food." | V | same case | council member; neighbours | scale, precedent | same URL

H34. A duplex described as a "dangerous assault on neighborhood character" | P (letter as recalled by the advocate who received it) | SF, 2014 | nearby homeowner letter | character | WLRN URL above

### Mountain View North Bayshore, 2012 general plan vote (housing near Google removed 4-3)

H35. "We feel this is really a line in the sand for the birds" (burrowing owls "would be gone forever"; residents' cats were the stated threat, per coverage summary) | V (cats detail S) | council debate | bird conservation society representative | wildlife | https://www.mv-voice.com/news/2012/07/06/council-may-kill-google-housing-in-general-plan-vote-tuesday

H36. "I am not interested in creating an enclave of dense apartment blocks isolated from the rest of Mountain View" / "I don't want to move forward with intensification until we resolve traffic issues" | V | same | council member | character, traffic first | same URL

### UC Berkeley

H37. The university "failed to assess potential noise impacts from loud student parties in residential neighborhoods near the campus" | V | appellate ruling on People's Park student housing, Feb 2023 (later overturned by legislation and the state Supreme Court) | court of appeal, in a suit by neighbourhood groups | noise, "people as pollution" | https://www.courthousenews.com/appellate-court-blocks-uc-berkeleys-plan-to-transform-historic-park-into-student-housing/

H38. "This is about preserving Berkeley's culture and diversity."; houses becoming "mini dorms" | V | enrolment-cap CEQA suit, 2022 | neighbourhood group president | character | https://alumni.berkeley.edu/california-magazine/2022-summer/berkeley-v-berkeley/

### Forest Hill senior affordable housing, SF, 2016

H39. "is not a question of being a NIMBY. It's a question of saving the hill" | V | Chronicle interview | attorney leading the opposition | "not a NIMBY, but", geology | https://preview-prod.w.sfchronicle.com/bayarea/article/In-a-wealthy-SF-neighborhood-residents-fight-10617213.php

H40. "You can't build 132,000 square feet and make it look like the Arc de Triomphe" | V | same | same | scale, aesthetics | same URL

H41. "looks like a Russian gulag." | V | on the first design | homeowners' association board president | aesthetics | same URL

H42. "We don't know if there are going to be sex offenders living there." / "What resources are you going to provide to make sure my 11-year-old girl is safe?" | V | neighbourhood meeting | residents | safety, "those people" | same URL

H43. "I want my kids to be able to play outside, that's why we bought a house here." | V | same | parent | safety, entitlement | same URL

### Lafayette and Cupertino

H44. Deer Hill Road would be a "funnel of death." | V | Terraces of Lafayette (315 apartments) council hearing, 2020 | public speaker | traffic, evacuation | https://lamorindaweekly.com/archive/issue1414/Controversial-apartments-get-the-green-light.html

H45. "I just think this is not something that fits in the scale of the city" ... "it's not the kind of Cupertino that everybody is used to" | V | Vallco hearing, Sept 2018 | resident | character, scale | https://www.cbsnews.com/sanfrancisco/news/cupertino-vallco-housing-development-debate-day-2

H46. "I'm thinking about the traffic and I'm thinking about the schools." / "What kind of people, if it's a very low-income group feeding into the schools" | V | same | neighbour | traffic, schools, "those people" | same URL

H47. "This is the wall around Cupertino." / "San Jose will be mainly paying for it, so it's not coming out of our own taxes." / "We have a big problem with all these Teslas coming through our city from Saratoga"; slide: "Securing Our Borders With the Cupertino Wall" | V | State of the City speech, Jan 2019 (a joke) | mayor | traffic, outsiders | https://www.cbsnews.com/sanfrancisco/news/cupertino-mayor-jokes-build-wall-san-jose-pay-for-it

### SF upzoning (Family Zoning Plan), 2025

H48. Turning "Ocean Beach into Miami Beach" (recall-campaign line); "Why did you draft a state mandate to have every city upzone without any sensitivities to individual characters" | V | Sunset town hall, Oct 2025 | recall campaigners; audience member | Manhattanization (Miami variant), character | https://sfist.com/2025/10/09/sf-elected-officials-get-an-earful-over-luries-rezoning-plans-everyone-uses-miami-beach-as-a-boogeyman

H49. "I don't want it to be like Hong Kong" | V | Planning Commission public comment, Sept 2025 | commenter via interpreter | Manhattanization | https://missionlocal.org/2025/09/sf-upzoning-plan-passes-commission/

H50. "I shouldn't have to feel guilty for wanting to raise my son in a single-family home" | V | same | commenter | character | same URL

H51. "It is a document primarily responding to a mandate for numbers without a vision." | V | same | planning commissioner | process | same URL

H52. San Francisco "does not have a zoning problem. The builders of San Francisco have economic problems, and zoning will not fix it."; "a major overreach" | V | upzoning hearing, Apr 2025 | former president of a hill neighbourhood association | "zoning is not the problem" | https://missionlocal.org/2025/04/sf-upzoning-hearing-bernal-heights/

### Marina Safeway tower (25 storeys), 2025 to 2026

H53. "We're not anti-housing, we're anti this development." | V | protest, Apr 2026 | neighbourhood association president | "not against housing, but" | https://sfist.com/2026/04/02/residents-protest-proposed-25-story-marina-safeway-redevelopment/

H54. "It feels like a village separate from the city in many ways." / "And along comes this behemoth right on the waterfront." | V | Chronicle | same | character, scale | https://preview-prod.w.sfchronicle.com/sf/article/safeway-tower-housing-marina-21224148.php

H55. "Do you want the whole waterfront ringed with towers, because this is how it begins." | V | same | neighbouring association president | slippery slope | same URL

H56. "This is another wall on the waterfront, plain and simple." / "I am absolutely appalled, both from a design perspective and from the sheer greed on display" / "On the bright side, maybe they will be able to sail away when the water rises" | V | same | former supervisor; preservation architect; shopper | views, greed, sea level | same URL

H57. "This is San Francisco, this is not Miami Beach." / "Too big, too everything" / "If they make it eight stories, it will fit in the neighborhood, okay? But not 25 stories" | V | TV interviews, Dec 2025 | shoppers, neighbours | too tall | https://www.cbsnews.com/sanfrancisco/news/san-franciscos-marina-district-safeway-housing-proposal-controversy

H58. "We're going to make our own neighborhood unlivable, and our politicians are selling us down the river" / "The idea that this is being sold as affordable housing is just a joke." | V | protest | resident; protester | betrayal, "luxury" | SFist URL in H53

### 2700 Sloat (Outer Sunset), 2022 to 2024

H59. "That's too tall" (about an eight-storey affordable plan that replaced the 50-storey proposal); "I'm not against what they're trying to do" ... "but the question is do we have the capacity?" | V | interview, 2024 | neighbourhood group president | too tall, infrastructure | https://thefrisc.com/thats-too-tall-affordable-homes-not-a-notorious-50-story-tower-are-still-too-much-for-some-sf-neighbors/

H60. "I don't know who needs these houses, especially when we have such a high rate of vacancy already." / "It's out of character, for one, in terms of high-density." | V | 2022 | neighbour and opposition organiser | vacancy, character | https://richmondsunsetnews.com/2022/04/09/opponents-organize-against-sloat-blvd-project/

Extras from the same pages (reader comments, V): "I don't want to look out my front window and see this monstrosity every day."; "We are a small city, and as such, we are limited as to how many people can safely and comfortably live here."; petition phrase "urban renewal 2.0". S only: opponents argued a 12-storey building would interfere with zoo animals across the street and cause "negative psychological effects" on neighbours.

### Additional housing items

H61. Flyer "BERNAL PUBLIC SAFETY ALERT!": "PROPOSED DEVELOPMENT PUTS LUXURY HOUSING AHEAD OF PUBLIC SAFETY"; two homes inside "the 600-foot Radius Blast/Fire Zone"; "A 26-inch PG&E gas pipeline runs through it, the same type that blew up in San Bruno." | V | two houses at 3516/3526 Folsom, 2014 | neighbourhood flyer | safety, explosion | https://socketsite.com/archives/2014/04/the_bernal_heights_blast_zone.html

H62. "Grubstake has a lot of historic and LGTBQ significance which is at the core of why some of us bought homes in The Austin" / "Residents of this community rely on light from the north facing windows" | V | 1525 Pine St, letters to Planning Commission, 2021 | owners in the neighbouring condo tower | historic (a diner), light | https://reason.com/?p=8109293

H63. "a super-clean and super-modern type of complex ... it just doesn't fit in with the neighborhood." (the bar also objected to shade on its beer garden, P) | V | Valencia St, 2016 | bar operations manager | character, shadow | https://thefrisc.com/please-dont-take-my-sunshine-away-2596d7fc3b59/

H64. Group housing is "anti-family" and "anti-community" (headline elsewhere: fear of "tech dorms", S) | V | 450 O'Farrell, Board vote 11-0, Oct 2021 | Board president | wrong kind of housing | https://socketsite.com/archives/2021/10/supervisors-reject-plans-for-group-housing-switcheroo.html

H65. "Come and see who lives in my neighborhood" | V | SF Board resolution against SB 50, 2019 | supervisor | character, displacement | https://preview-prod.w.sfchronicle.com/bayarea/article/SF-supervisors-oppose-Wiener-s-new-13743143.php

H66. "colonization, where the East Bay is the housing for the three big cities" / "You won't get people out of their cars" | V | SB 50, 2019 | suburban mayor | local control, cars | https://preview-prod.w.sfchronicle.com/bayareahousingcrisis/article/Wealthy-Bay-Area-suburbs-could-have-a-whole-new-13834033.php

H67. "There's no land left, absolutely no land left." / "Many of us still consider this a suburb" / "Let's actually build some nice housing." | V | SB 50, 2019 | town councilman; slow-growth group leader; mayor | "we're full", character | same URL

H68. SB 827 would "destroy the city." / "we also can't blow up our neighborhoods and bury it beneath the Sacramento overreach" | V | LA council vote, Mar 2018 | council members | local control | https://la.streetsblog.org/2018/03/27/los-angeles-city-council-votes-unanimously-to-oppose-s-b-827

H69. SB 827 is "a declaration of war against our neighborhoods." | S (Planetizen page blocked) | 2018 | Berkeley mayor | local control | https://www.planetizen.com/news/2018/02/97084-berkeley-mayor-condemns-legislation-increase-housing-density-transit

H70. "Whoa, that's going to transform the neighborhood into a thoroughfare and totally change it and make it unsafe for our kids."; "When we heard that they wanted to build new housing on [the site], we were actually very excited about that" | V | Menlo Park Measure V (teacher housing on a closed school site), 2022 | homeowner, campaign co-leader | traffic, kids, "we were excited, but" | https://www.kqed.org/news/11929505/from-menlo-park-to-laguna-beach-residents-turn-to-ballot-box-to-fight-new-california-housing-mandates

H71. "Do you want a San Francisco waterfront that looks like Miami Beach?"; slogan "wall on the waterfront" | V | 8 Washington ballot fight, 2013 | former city attorney in a campaign mailer; campaign | views, Manhattanization | https://preview-prod.w.sfchronicle.com/bayarea/article/8-washington-condo-project-loses-big-in-s-f-4958982.php

H72. "Housing that size in our neighborhood, I just find [it] inappropriate" / "The lots are very small." / "The traffic was not properly studied." | V | Palo Alto Maybell senior housing referendum, 2013 | former planning commissioner | scale, traffic study | https://stanforddaily.com/2013/10/17/controversial-palo-alto-housing-project-set-for-nov-5-vote/

H73. Solving the region's housing crisis is not our responsibility | P | Brisbane Baylands council meeting, c. 2017 | residents at public comment | "not our job" | https://www.bisnow.com/news/san-francisco/construction-development/how-one-small-bay-area-town-is-pushing-back-against-housing-77506

H74. Four homes on a landlocked lot called a "Luxury Condo Project"; vote should be postponed like other gatherings due to COVID | S | 1846 Grove, Planning Commission packet, 2020 | "Save SF Open Space" presentation | open space, process | https://commissions.sfplanning.org/cpcpackets/2018-011441CUA.pdf (not fetched)

## Rail

### Peninsula high-speed rail, 2009 to 2011

R1. "There is no wrong side of the trains in Burlingame and we intend to keep it that way" | V | "High Speed Boondoggle" rally at Burlingame station, Nov 2010 | mayor | division of town | https://www.mv-voice.com/news/2010/11/08/more-than-500-attend-high-speed-boondoggle-rally

R2. "An elevated structure is the equivalent of a seven-lane freeway through our Caltrain corridor." | V | same | mayor | viaduct, visual | same URL

R3. Signs: "Here comes high-speed rail. There goes the neighborhood" / "There goes $$ for schools."; chant "Boondoggle!" | V | same rally | crowd | character, cost | same URL

R4. "This is a boondoggle, and if they can't do it right don't do it at all" | V | same | attorney for the plaintiffs, former county supervisor | "do it right or not at all" | same URL

R5. The above-ground route is a "monster" that "will destroy the city of Burlingame" | V | Rail Authority board meeting, Apr 2010 | mayor | viaduct | https://sanjoseinside.com/news/04_09_10_high_speed_rail_meeting

R6. "Don't run this, dangerous, noisy, disruptive terrorism magnet through MY community." / "Where's the other $30 billion coming from? Santa Claus?" | V | reader comments on that article | anonymous commenters | noise, safety, cost | same URL

R7. Raised tracks as a "Berlin Wall" that would split the city | V (two-word phrase, widely reported) | Palo Alto, 2009 onward | city officials and residents | division | https://cahsr.blogspot.com/2009/02/of-lawsuits-tunnels-and-tall-trees.html (quoting local press)

R8. Tunnel versus elevated is "the difference between blight and Park Avenue" / "is there recourse or do we all just have to lie down on the tracks?" | V | Palo Alto meeting, 2009 | architectural review board member | visual, tunnel demand | same URL

R9. "I've got my back against the rail and I'm going to keep on fighting. I'm like a mother bear with her cubs." | V | Palo Alto, Oct 2009 | resident living along the tracks | property | https://cahsr.blogspot.com/2009/10/rampant-hsr-nimbyism-in-palo-alto.html (quoting local press)

R10. Poster: "No to rail wall."; "Opposing the above-ground option is a no-brainer"; "hoodwinked, like we were last November when we were voting on this." | V | Palo Alto council candidate forum, 2009 | council candidates | viaduct, "we were misled" | same URL

R11. "People were not aware, If I would have known that voting for that bond meant putting it on the Caltrain corridor,..." | V (truncated) | 2009 | Peninsula resident | "I voted for it, but not here" | https://cahsr.blogspot.com/2009/02/what-palo-alto-worry.html

R12. "Just by the rumor of this high-speed rail, the property values have gone down" | V | Palo Alto, 2010 | local realtor | property values | https://patch.com/california/paloalto/eminent-domain-an-imminent-threat-to-homeowners-alongb61c52debd

R13. "The worst is having this albatross above us, like BART. You think BART looks good in Oakland?" / "I don't know one person that wouldn't want to see the whole thing tunneled" | V | same | same | visual, tunnel demand | same URL

R14. Partial takings would cost "easily in excess" of the whole property's value; town's fallback is a stacked tunnel under its right of way | P (fragment V) | Atherton letter to the Rail Authority, 2007 | town government | property, tunnel demand | https://caltrain-hsr.blogspot.com/2009/11/focus-on-atherton.html

R15. "You would destroy downtown Gilroy with a trench that's 120 feet wide and divide our community more than it is now" / "To divide our community with a trench would be appalling. Has a tunnel even been discussed?" | V | Gilroy public meeting, 2009 | resident | division (even a trench is too much) | https://morganhilltimes.com/residents-voice-concern-with-bullet-train-plans

### Caltrain electrification (Atherton, Menlo Park, Burlingame, Mountain View)

R16. "don't want to have our modest and quaint neighborhood destroyed"; residents "strongly object" on behalf of "a quaint residential area of Atherton." | V | protest over 46-foot pole height, Dec 2017 | town rail committee member; residents' letter to Caltrain board | visual, character | https://www.almanacnews.com/news/2017/12/05/atherton-residents-protest-height-of-planned-caltrain-poles

R17. "I'm actually shocked" / "This is why we're not friendly." | V | same dispute | town council member | process, distrust | same URL

R18. "The impacts of high-speed rail in Atherton will be significant and the Town will continue to oppose the project" | V | letter to Caltrain, Jan 2015 | mayor | blanket opposition | https://sf.streetsblog.org/2015/02/04/menlo-park-and-atherton-threaten-lawsuits-against-caltrain-electrification

R19. Town asks Caltrain to study "modern diesel options" instead of electrifying, and wants centre-mounted poles to save trees | V (fragment) + P | same letter | town government | trees, alternative technology | same URL

R20. City opposes "any blended system that results in an elevated structure" and wants every heritage tree listed and replaced three to one | V (fragment) + P | Menlo Park demands, 2015 | city council | viaduct, trees | same URL

R21. Electrification is "causing the unnecessary destruction of mature trees bordering on the Caltrain right-of-way in Atherton" | V | lawsuit over bond funds, 2017 | coalition lawsuit including the town | trees | https://www.almanacnews.com/news/2017/06/10/atherton-continues-fight-against-caltrain-electrification-funds

R22. "An amazing number of trees need to be removed in electrification projects" (officials' one request per the article headline: bury the rails; "underground, and out of sight" is S) | V | 2009 | town public works director | trees, tunnel demand | https://barbaraslaton.blogspot.com/2009/03/bury-rails-say-local-officials.html (repost of a local paper article)

R23. Trackside trees are a "major visual buffer" to the railroad | V | city comment on the electrification EIR, 2014 | Mountain View city officials | trees, visual | https://padailypost.com/2017/06/05/1000-trees-to-fall-along-caltrain-line-will-history-repeat-itself/

R24. "These towers give off EMF and it's hazardous to our health." | V | Burlingame electrification tower dispute | neighbour | health | https://www.ktvu.com/news/tensions-build-between-caltrain-burlingame-residents-over-tall-electrification-tower

R25. "Do you wanna have an ugly, electrified tower staring at your house?" / "It's not so much a nimby thing as it is common sense." | V | same | neighbouring homeowner | visual, "not a NIMBY, but" | same URL

### Central Valley

R26. "It splits the cows in half. There will be cows on one side and cows on the other side." | V | Kings County meeting, c. 2011 | dairy operator | farmland severance | https://abc30.com/archive/8167823/

R27. "We love this land, we feel betrayed by what you plan to do to it." / "It's gonna tear up some good farmland." | V | same | dairy and farm owner; water district official | farmland | same URL

R28. "It's amazing to me that they've moved this rail across this farmland without any input from me or any of my neighbors" | V | Hanford | dairy owner | process | https://www.foxnews.com/us/proposed-california-high-speed-rail-route-cuts-through-farms-to-protect-birds

R29. "You're saying that the species that are protected in that preserve are more important than us?" | V | Hanford (route shifted off a bird preserve onto farms) | resident on the route | environment versus people | same URL

R30. "We aren't opposed to the train, we're just opposed to the way that they're making it go through people's properties." | V | Kings County, c. 2012 | ranch landowner | "not against it, but" | https://abc30.com/archive/8526628/

R31. The alignment "was ill-conceived, free of common sense" | V | same | county farm bureau representative | process | same URL

R32. "We don't even belong in the state of California anymore because we're not getting any response from anybody." | V | same | county supervisor | process, neglect | same URL

R33. "Well we would love them to go through Kings County by Kettleman and I-5 that would be perfect for us."; "The people are very passionate about their ground, very passionate about their lifestyles and they don't want it disrupted." | V | 2013 | county supervisor | "build it elsewhere" | https://abc7ny.com/archive/9052166/

R34. "When they come in with these routes they put a cloud on your land" | V | Chowchilla | farmer | property values | https://reason.com/?p=215383

R35. "Building the first segment from a dairy to a state prison doesn't help at all."; the line will be "a laughingstock in Congress"; "crazy, pork-barrel project" | V | first-segment decision, Dec 2010 ("train to nowhere" coverage) | planning journalist; rail nonprofit president; newspaper columnist | cost, "train to nowhere" | https://www.cp-dr.com/post/train-to-nowhere-might-derail-high-speed-dreams

### Southern California and San Francisco

R36. "I can't imagine anyone, especially horses, enjoying bullet trains racing overhead." / "It would spook every horse and rider, and make this equestrian area obsolete."; "the last intact equestrian community in the City of Los Angeles" | V | Palmdale to Burbank route, Shadow Hills, Jan 2015 | equine advisory committee president; property owners' association board member | noise, horses, character | https://news.horsetrader.com/2015/01/15/shooting-down-the-the-bullet

R37. San Francisco "doesn't need a $5 billion subway that only goes from the Salesforce Transit Center to the Caltrain station."; "an extravagance ill-suited to post-Covid realities" | V | Downtown Rail Extension / The Portal, op-ed, 2022 | think-tank policy analyst | cost | https://sfstandard.com/perspectives/perspective-sfs-proposed-downtown-railway-extension-is-an-unnecessary-boondoggle/

### Rail items seen only in search snippets (S, unverified)

R38. "I wouldn't want a diesel-spewing train thundering through my neighborhood forevermore either." | S | Dumbarton rail, Menlo Park forum, 2007 | resident | noise | https://n2v.almanacnews.com/square/2007/06/19/panel-of-contributors-nothing-to-fear-from-dumbarton-rail

R39. "I'm really happy that it's gonna be a bus, because it'll be quieter than the rail." | S | Dumbarton corridor redesign | resident (attribution unclear in snippet) | noise | https://sf.streetsblog.org/2026/01/22/samtrans-survey-abandons-dumbarton-rail

R40. "You will regret not tunneling the tracks." | S | Menlo Park grade separation, 2017 to 2018 | council member | tunnel demand | https://www.almanacnews.com/news/2017/10/11/menlo-park-council-splinters-on-grade-separations

R41. Neighbourhood opposition to a Palo Alto viaduct was "vociferous and near unanimous"; a design would "bisect the city" | S | citizen panel report 2021; resident 2020 | panel; resident | viaduct | https://n2v.paloaltoonline.com/news/2021/08/23/council-drops-exploration-of-train-viaduct-in-south-palo-alto

R42. "I just think it's time we stick a fork in it and call it good" | S | Kings County board resolution against any route, 2011 | county supervisor | blanket opposition | https://www.washingtonexaminer.com/?p=754986

## Recurring argument patterns

A1. "Not against housing, but": "We're not anti-housing, we're anti this development." / "is not a question of being a NIMBY" / "We aren't opposed to the train, we're just opposed to the way..." / "It's not so much a nimby thing as it is common sense."

A2. Too tall, too big, out of scale: "too big, too high, too many apartments, too many people" / "Too big, too everything" / "Why can't you make it three or four stories?" / "monstrous", "behemoth", "monstrosity". The acceptable height is always one notch below whatever is proposed (25 storeys: "make it eight"; eight storeys: "That's too tall").

A3. Neighbourhood character: "not the kind of Cupertino that everybody is used to" / "no longer suburban in nature but urban, which is not why its residents moved there" / "It feels like a village" / "quaint".

A4. Manhattanization by place name: Miami Beach, Hong Kong, "Russian gulag", "wall on the waterfront", "Berlin Wall", "like BART in Oakland".

A5. Shadow and sunlight: "The Right To Light" / "blocks the sunshine" / shaded playground stays "wet, damp, and cold" / the zucchini / "Not even my dogs want to lay out on the deck when it's wet."

A6. Parking and traffic: "too little parking" / "We struggle for parking on a daily basis" / "funnel of death" / "transform the neighborhood into a thoroughfare" / "the traffic was not properly studied".

A7. Property values: "MASSIVELY decrease our home values" / "just by the rumor... property values have gone down" / "put a cloud on your land".

A8. Those people (crime, safety, children): "What kind of people" / "no one wants to live next to..." / "make sure my 11-year-old girl is safe" / "slum" / private security. Recorded, not used in the game.

A9. Luxury housing causes displacement, or it is not really affordable: "further gentrification and displacement" / "prime target for investors" / "sold as affordable housing is just a joke" / "anti-family" group housing.

A10. We're full, vacancy, build it elsewhere: "There's no land left, absolutely no land left." / "Put folks in units presently vacant." / "I don't know who needs these houses" / "We are a small city" / "go through... by I-5, that would be perfect for us" / counting pool houses.

A11. Environmental and wildlife, people as pollution: whole town as mountain lion habitat / "a line in the sand for the birds" / student party noise as a CEQA impact / "spook every horse and rider" / "It splits the cows in half."

A12. Trees: "unnecessary destruction of mature trees" / heritage trees listed and replaced 3:1 / "major visual buffer" / "An amazing number of trees".

A13. Safety, toxics, seismic, health: "there was an old marsh here" / "Blast/Fire Zone" / "imminent and substantial endangerment" / "Stop Toxic Waste" / "towers give off EMF".

A14. Process and local control: "ask the neighbourhood what they want" / "without any input from me or any of my neighbors" / "hoodwinked" / "Sacramento overreach", "declaration of war", "colonization".

A15. Right idea, wrong design or cost, tunnel it or don't build it: "if they can't do it right don't do it at all" / "the difference between blight and Park Avenue" / "Has a tunnel even been discussed?" / "modern diesel options" / "Boondoggle!" / "from a dairy to a state prison" / "Where's the other $30 billion coming from? Santa Claus?"

Also recurring: historic-resource claims for a laundromat, a diner and a whole planned subdivision; and the slippery slope, "this is how it begins" / "sets a precedent".
