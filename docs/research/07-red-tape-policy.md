# 07. Red tape, governance and policy mechanics

Research date: 2026-11-09. Scope: institutional causes of cost and delay in Bay Area / California / US transit delivery, low-cost comparators (Spain, Italy, France, Poland), and a mapping to game mechanics.

Conventions:
- Every number carries a source link. `UNVERIFIED` = not confirmed against a source in this research pass (recalled, derived by me, or seen only in a secondary summary).
- "Derived" = my arithmetic on sourced inputs.
- Game numbers in sections 4 to 6 are design proposals calibrated to the evidence, not facts.

## 1. Headline calibration

| Datum | Value | Source |
|---|---|---|
| BART Silicon Valley Phase II | $12.2B for 9.6 km, about $1.3B/km; soft costs $2.78B on $7B hard costs (about 40%) | [Pedestrian Observations 2024](https://pedestrianobservations.com/2024/04/30/quick-note-what-the-hell-is-going-on-in-san-jose/) |
| Same project, later figure | $12.75B YOE, 6 miles, 4 stations; CIG share capped at $5.1B (40%); FFGA targeted July 2027; revenue service quoted anywhere from 2036 to 2039 | [ENR](https://enr.com/articles/58909-bechtel-picked-as-cm-for-127b-single-bore-bart-extension), [Metro Magazine](https://www.metro-magazine.com/news/feds-commit-5-1-billion-to-bart-silicon-valley-phase-ii-extension), [PMOC report, March 2026](https://vtabart.org/wp-content/uploads/2026/05/2026-03-CA-BSVII-OP25-ProjectMonitoringReport-051926-v1-1.pdf) |
| The Portal (DTX) | $8.25B (2023 estimate), about 2.2 miles of construction; derived about $2.3B/km including station fit-out | [Caltrain board deck](https://www.caltrain.com/media/35836/download), [TJPA](https://www.tjpa.org/portaldtx/about-portal) |
| The Portal, 2026 status | "$7.5B to complete", over two thirds funded, $750M state cap-and-invest share in doubt, trains "in 2035" if funding holds; train box finished 2018 and still empty | [Streetsblog Cal, 2026-06-04](https://cal.streetsblog.org/2026/06/04/dream-of-a-grand-central-station-for-the-west-at-risk-of-further-delay) |
| Warsaw M2 west extension (3.4 km, 3 stations, 2015-2020) | 1,148M PLN (incl. rolling stock), $731M real PPP total, $215M/km PPP (corrected 2026-11-09: $215M is TCP's per-km figure, not the total) | [Transit Costs Project](https://transitcosts.com/warsaw-line-2-extension-to-kj/) |
| Warsaw M2 Bródno extension (4.0 km, 3 stations, 2018-2022) | 1,400M PLN, $837M real PPP total, $209M/km PPP (corrected 2026-11-09: $209M is per km, not the total). At market exchange rate roughly $90M/km (derived, about 4 PLN/USD, UNVERIFIED rate) | [Transit Costs Project](https://transitcosts.com/warsaw-line-2-extension-to-brodno/) |
| Madrid 1995-1999 programme | 56 km, 37 stations, about $2.8B in 2024 prices; derived about $50M/km | [Works in Progress](https://worksinprogress.co/issue/how-madrid-built-its-metro-cheaply/) |
| Italy, all metro since 1940s | average about $120M/km; range $22M/km (Milan M2 at grade) to $645M/km (Naples L1 centre) | [TCP Italian case](https://transitcosts.com/?p=10601) |
| Country tiers (PPP 2022) | France/Germany/China $250-350M/km; Anglosphere $600M+/km; New York $2B+/km | [Levy, NBER slides 2023](https://conference.nber.org/confer/2023/EIIs23/LevySlides.pdf) |
| SPUR per-mile chart | Barcelona L9/L10 $246M/mile vs SVBX Phase I $1,083M/mile vs DTX $1,375M/mile | [SPUR, More for Less, fig. 4](https://www.spur.org/sites/default/files/2021-05/SPUR_More_For_Less_Report.pdf) |

Implication for the "Polish prices" premise:
- Real ratio of Bay Area tunnelled rail to Warsaw metro is about 6x per km in PPP terms (derived: $1.3B vs $209-215M), so "several times" holds for BART SV II. The Portal is about 11x ($2.3B/km). At market exchange rates instead of PPP the Warsaw figure is roughly $90M/km and the ratio about 15x (derived). Corrected 2026-11-09: an earlier draft said 20x, from misreading TCP per-km figures as totals. Levy's low-cost tier of $150-200M/km (NBER slides, PPP 2022) is consistent with the corrected Warsaw numbers.
- "Several times" is right if the status-quo multiplier is applied to a Polish base that is first adjusted for Bay Area geology, seismic design, station depth and US wage levels. Recommended split: physical multipliers (owned by other research docs) times institutional multiplier (this doc). Section 4 budgets the institutional product at about 5x to 7x. Caveat (2026-11-09): against a PPP base of about $210M/km that product alone reproduces or exceeds the whole observed BART SV II gap (about 6x), leaving no room for physical multipliers; either use a market-exchange-rate Polish base (about $90M/km) or scale the section 4 factors down.

## 2. Mechanisms: evidence

### 2.1 Environmental review (CEQA + NEPA)

- Federally funded California projects do both: CEQA EIR and NEPA EIS. [SPUR p.38](https://www.spur.org/sites/default/files/2021-05/SPUR_More_For_Less_Report.pdf)
- NEPA EIS duration, notice of intent to record of decision, 2010-2018, 1,276 EISs: mean 4.5 years, median 3.5; quartiles 2.2 and 6.0 years. [CEQ 2020](https://ceq.doe.gov/docs/nepa-practice/CEQ_EIS_Timeline_Report_2020-6-12.pdf)
- Newer CEQ series (NOI to final EIS, different endpoint): median 2.8 years for 2019 onward, 2.4 years for 2021-2024. [CEQ 2025](https://ceq.doe.gov/docs/nepa-practice/CEQ_EIS_Timeline_Report_2025-1-13.pdf)
- Fiscal Responsibility Act 2023: 2-year EIS and 1-year EA deadlines, 150-page EIS limit (300 for extraordinary complexity), 75-page EA; applicants may petition a court over missed deadlines. Appendices are excluded, so bulk migrates there. [nepa.gov](https://nepa.gov/content/fiscal-responsibility-act-2023-fra-amendments-nepa), [ICF](https://www.icf.com/insights/environment/new-nepa-amendments-fiscal-responsibility-act-2023)
- 2025 federal shifts: CEQ rescinded its NEPA regulations effective 2025-04-11; Seven County Infrastructure Coalition v. Eagle County (2025-05-29, a rail case) narrowed the effects agencies must study and raised judicial deference. [Vermont JEL](https://vjel.vermontlaw.edu/top-ten/2026/01/nepa-without-ceq-environmental-review-under-trump-and-seven-county/), [Eno](https://enotrans.org/article/in-seven-county-ruling-a-new-approach-to-nepa-again/)
- CEQA litigation: appeals "regularly take six months", lawsuits "can take years"; a suit can also put federal grant eligibility at risk. [SPUR p.36](https://www.spur.org/sites/default/files/2021-05/SPUR_More_For_Less_Report.pdf)
- 2010-2012 CEQA suits: transit was the most frequently challenged public infrastructure type; 49% of suits targeted public projects with no private sponsor. Holland & Knight is advocacy research and critics note only four or five transit projects were in the sample. [H&K 2015](https://www.hklaw.com/publications/in-the-name-of-the-environment-litigation-abuse-under-ceqa-august-2015/), [CA Fwd summary](https://cafwd.org/news/new-study-finds-infill-public-transit-projects-caught-up-in-ceqa-net/)
- Bay Area cases (all [SPUR pp.9, 37](https://www.spur.org/sites/default/files/2021-05/SPUR_More_For_Less_Report.pdf)):
  - SF bicycle plan: one individual's suit over parking and traffic froze 34 miles of bike lanes for four years.
  - East Bay BRT: 17 years to deliver; Berkeley segment dropped after a single business owner threatened a CEQA suit over parking.
  - Geary BRT: similar pattern.
- High-speed rail: 2014 appeals court held the Authority to CEQA; Atherton sued the Authority and later Caltrain electrification (2015); Kings County and Tos suits ran through 2018. [Perkins Coie](https://perkinscoie.com/insights/blog/ceqa-lawsuit-fails-slow-high-speed-rail), [Streetsblog SF](https://sf.streetsblog.org/2015/02/17/atherton-joins-hsr-opponents-to-sue-caltrain-menlo-park-drops-its-suit), [Eno](https://enotrans.org/article/california-supreme-court-ruling-may-delay-high-speed-rail/)
- Comparators: Madrid environmental sign-off within about 5 months; Line 11 assessment 19 pages. Ontario abridged transit assessment about six months. Germany: transit coordinator can self-certify most projects. [Works in Progress](https://worksinprogress.co/issue/how-madrid-built-its-metro-cheaply/), [SPUR p.38](https://www.spur.org/sites/default/files/2021-05/SPUR_More_For_Less_Report.pdf)

### 2.2 California reform status, as of November 2026

| Law | What it does | Status | Source |
|---|---|---|---|
| AB 130 (signed 2025-06-30) | Statutory CEQA exemption for code-compliant infill housing, urban sites up to 20 acres; no labor or affordability strings for most projects under 85 ft; "unusual circumstances" exception does not apply | In effect | [Venable](https://www.venable.com/insights/publications/2025/07/from-red-tape-to-green-light-ceqa-reforms-fast), [Manatt](https://www.manatt.com/insights/newsletters/client-alert/major-ceqa-reform-bills-exempt-variety-of-residential-and-nonresidential-projects) |
| SB 131 (signed 2025-06-30) | "Near miss" projects reviewed only for the one disqualifying condition; exempts housing-element rezonings; exempts HSR maintenance facilities within 1 mile of ROW and HSR station modifications (PRC 21080.70); narrows the administrative record (drops internal staff emails) | In effect; AB 1083 (pending as of early 2026, final outcome UNVERIFIED) would largely restore the broader record | [Paul Hastings](https://www.paulhastings.com/insights/client-alerts/california-pushes-abundance-agenda-with-major-ceqa-reforms-for-housing-and-select-infrastructure), [Beveridge & Diamond](https://www.bdlaw.com/publications/ceqa-reforms-2025-enactments-and-2026-proposals/) |
| SB 71 (ch. 742, signed 2025-10-13) | Extends the SB 288 / SB 922 transit exemption: zero-emission, rail and cable-car projects to 2040-01-01; near-zero-emission bus projects to 2032; permanent exemptions for service redesigns, route changes, bike and pedestrian plans. Lead agency must certify a skilled and trained workforce. Supporters credit the original exemption with 92 projects since 2021 | In effect | [Beveridge & Diamond](https://www.bdlaw.com/publications/ceqa-reforms-2025-enactments-and-2026-proposals/), [CARB](https://ww2.arb.ca.gov/2025-senate-bill-71-weiner-scott-california-environmental-quality-act-exemptions-transit-projects), [Streetsblog](https://sf.streetsblog.org/2025/09/09/legislation-to-streamline-environmental-review-for-transit-bike-and-ped-projects-passes-assembly) |
| SB 79 (signed 2025-10-10) | Overrides local zoning near qualifying stops, tiered by distance (quarter to half mile) and service level, up to about nine stories; transit agencies may set zoning on their own land | Effective 2026-07-01. Sacramento and Berkeley took no deferrals. Los Angeles adopted a phased ordinance aiming to delay to 2030. SANDAG sued over its maps. Californians for Homeownership sued three cities in August 2026 | [Holland & Knight](https://www.hklaw.com/en/insights/publications/2025/10/california-gov-gavin-newsom-signs-sb-79), [H&K tracker 2026-06](https://www.hklaw.com/en/insights/publications/2026/06/tracking-sb-79-implementation-before-the-train-leaves-the-station), [Allen Matkins](https://www.allenmatkins.com/real-ideas/the-city-of-los-angeles-seeks-to-delay-implementation-of-senate-bill-79-sb-79-until-2030.html), [Mass Transit](https://www.masstransitmag.com/management/news/55406081/ca-sandag-wanted-less-housing-by-some-north-county-train-stations-now-its-got-a-legal-fight-on-its-hands), [CAR](https://341.car.org/aboutus/mediacenter/newsreleases/2026releases/CARgroupsues3cities) |
| SB 445 (2025) | HSR third-party permits and utility agreements: deadlines for third parties, master permitting concept | Passed Senate; held on the Assembly Appropriations suspense file 2025-08-29 (died; confirmed via CalMatters 2026-11-09). Whether a 2026 successor bill passed is UNVERIFIED | [CalMatters](https://calmatters.org/politics/2025/08/high-speed-rail-fails-suspense-file/), [Streetsblog](https://cal.streetsblog.org/2025/02/19/wiener-introduces-legislation-to-speed-up-permitting-for-major-transit-projects-including-high-speed-rail) |
| SB 63 (signed 2025-10-13) | Authorized the five-county transit sales tax measure | See 2.11: Measure RTM passed 2026-11-03 (unofficial) | [CBS](https://www.cbsnews.com/amp/sanfrancisco/news/sb63-bay-area-transit-tax-measure-newsom-signs) |
| "Building an Affordable California Act" initiative | CalChamber ballot initiative: deadlines for agency action, limits on court-ordered delay for "essential" projects | Filed October 2025; whether it qualified or passed is UNVERIFIED | [Beveridge & Diamond](https://www.bdlaw.com/publications/ceqa-reforms-2025-enactments-and-2026-proposals/) |

Game-relevant reading:
- New subway tunnels are not cleanly covered by SB 71 in the way bus lanes and light rail in existing ROW are; megaprojects with federal money still run NEPA. Treat "transit megaproject CEQA certification" (SPUR recommendation 9: 270-day judicial review cap) as a still-unlocked reform. [SPUR p.40](https://www.spur.org/sites/default/files/2021-05/SPUR_More_For_Less_Report.pdf)
- Streamlining arrives with labor strings attached (skilled and trained workforce in SB 71; none in AB 130 under 85 ft). That trade is a real mechanic: cheaper politically, more expensive per km.

### 2.3 Agency fragmentation

- 27 transit agencies across nine counties, each with its own fares, discounts, signage and maps. [Assembly Transportation analysis of SB 917](https://atrn.assembly.ca.gov/sites/atrn.assembly.ca.gov/files/SB%20917%20%28Becker%29.pdf), [MTC fare coordination](https://mtc.ca.gov/operations/transit-regional-network-management/transit-fare-coordination-integration)
- Plus nine county congestion management agencies; MTC behaves as a "project selector rather than a regional transportation planner". For Plan Bay Area 2050, agencies nominated 93 projects; fewer than a dozen had benefits above costs. [SPUR pp.10, 15, 20](https://www.spur.org/sites/default/files/2021-05/SPUR_More_For_Less_Report.pdf)
- Federal money is only 11% of Bay Area transportation dollars, so nearly everything rides on local ballot measures and their logrolls (MTC Resolution 3434, 2001: $10.5B of politically nominated rail expansions). [SPUR p.9](https://www.spur.org/sites/default/files/2021-05/SPUR_More_For_Less_Report.pdf)
- One megaproject per agency per generation: Muni's first subway in 40 years, Caltrain's first major capital programme since 1987, single-purpose authorities (TJPA, Valley Link) that dissolve after delivery. [SPUR p.28](https://www.spur.org/sites/default/files/2021-05/SPUR_More_For_Less_Report.pdf)
- Fragmentation resolved by building more concrete:
  - San Jose Diridon: Caltrain and CHSRA differing requirements produced a planned HSR aerial structure over the station, dropped in 2018 for an at-grade design. [SPUR p.16](https://www.spur.org/sites/default/files/2021-05/SPUR_More_For_Less_Report.pdf)
  - BART Berkeley Hills tunnel seismic work, 2015: option A $284M and just over 4 years with a track outage and bus bridge; board chose option B, $918M and almost 10 years, to avoid disrupting service. [SPUR p.16](https://www.spur.org/sites/default/files/2021-05/SPUR_More_For_Less_Report.pdf)
- Link21: scaled back so the new crossing serves either BART or regional rail, not both; programme page states standard-gauge regional rail was selected (page undated, so UNVERIFIED as current). No official 2026 cost found; "$30 to 40B" is an advocate's figure. [CBS](https://cbsnews.com/sanfrancisco/news/link21-plan-2nd-transbay-rail-crossing-scaled-back-over-cost-concerns), [Link21](https://link21program.org/en/program/planning-activities), [Seamless Bay Area on governance](https://www.seamlessbayarea.org/blog/link21-governance-needs)
- The Portal sits between TJPA (builder), Caltrain and CHSRA (operators) and other partner agencies; a Caltrain/TJPA master cooperative agreement was still "under development, due fall 2026". [TJPA](https://www.tjpa.org/portaldtx/about-portal), [Caltrain update](https://www.caltrain.com/media/37845/download)

### 2.4 Fare and schedule integration

- SB 917 (2022) would have mandated a common fare structure, one map, coordinated schedules by mid-2024; died in committee. [Streetsblog](https://cal.streetsblog.org/2022/08/18/fare-integration-takes-one-step-forward-one-step-back)
- MTC Blue Ribbon task force adopted a 27-action Transit Transformation Action Plan in July 2021 (27 actions, coincidentally also 27 agencies). [Mass Transit](https://www.masstransitmag.com/management/press-release/21232167/metropolitan-transportation-commission-mtc-mtcs-blue-ribbon-task-force-approves-actions-to-guide-postpandemic-future-of-bay-area-transit-network), [Seamless Bay Area](https://www.seamlessbayarea.org/blog/2021/9/12/the-transformation-action-plan-is-the-the-blueprint-we-need-for-a-rider-first-seamless-transit-system)
- Next-generation Clipper: free/discounted interagency transfers were "delayed indefinitely" in 2024; system went live 2025-12-10 with open payments and transfer discounts up to $2.85; Cubic contract $393M at 2018 award, grown to $436M (KQED; an earlier draft said $461M); 20 major outages (over an hour, averaging about five hours) between 2025-12-10 and 2026-08-10; about 15% of roughly 15M cards converted as of 2026-07-16 (KQED). Earlier draft figures of 1.7M of 10M+ cards and 45% of trips on the new platform by late May 2026 are UNVERIFIED (Mobility Payments source is paywalled). [Streetsblog 2024](https://cal.streetsblog.org/2024/05/21/free-transit-transfers-and-clipper-ii-rollout-delayed-indefinitely), [Streetsblog 2025](https://sf.streetsblog.org/2025/12/10/hooray-direct-payment-finally-comes-to-bay-area-transit), [KQED](https://www.kqed.org/news/12096240/exclusive-errors-plagued-clipper-2-0-long-before-botched-launch-records-reveal), [Mobility Payments](https://www.mobility-payments.com/2026/03/09/special-report-san-franciscos-mtc-and-cubic-battle-through-problem-plagued-launch-of-clipper-2-0/)

### 2.5 Consultant-heavy delivery, thin in-house staff

- Design plus project-management contracts as a share of construction: New York 21%; France 5-10% (7-8% typical); Italy and Istanbul about 10%; Spain about 5% for private design. [TCP final report](https://transitcosts.com/transit-costs-study-final-report/)
- BART Silicon Valley II: about 40% soft costs on hard costs. [Pedestrian Observations](https://pedestrianobservations.com/2024/04/30/quick-note-what-the-hell-is-going-on-in-san-jose/)
- Boston Green Line Extension: first iteration managed by 4 to 6 full-time MBTA staff; the rescued project had 83. Craft-to-supervisor ratio 1.8 vs an expected 2.5 to 3. [TCP final report](https://transitcosts.com/transit-costs-study-final-report/)
- New York in-house capital team: about 1,600 down to about 120 (UNVERIFIED: not found in the fetched part of the cited page). [TCP](https://transitcosts.com/?p=14795)
- California HSR: the "rail delivery partner" consultant had 485 staff on the project in June 2018; State Auditor attributed billions in overruns to starting construction early and weak contract management. [State Auditor 2018-108](https://information.auditor.ca.gov/reports/2018-108/summary.html)
- Civil service pay is not competitive for delivery specialists. [SPUR p.29](https://www.spur.org/sites/default/files/2021-05/SPUR_More_For_Less_Report.pdf)
- Madrid: in-house team of 9 engineers including 4 geotechnical experts designed and supervised; no external project manager; station siting decisions "often within 24 hours". [Works in Progress](https://worksinprogress.co/issue/how-madrid-built-its-metro-cheaply/), [Railway Gazette](https://www.railwaygazette.com/25116.article)
- Counter-example worth keeping honest: Société du Grand Paris was found "manifestly" understaffed by the Cour des comptes while cost rose to €38.5B (Cour des comptes, January 2018: €35B for the network plus €3.4B contributions to other projects). The €22B (2010) baseline and the derived +75% are UNVERIFIED; French Wikipedia cites 2009-2013 estimates between €20.5B and €29.9B depending on scope. Low-cost countries fail the same way when the client is hollow. [Sénat](https://www.senat.fr/rap/r20-044/r20-0448.html), [Assemblée question](https://www.assemblee-nationale.fr/dyn/15/questions/QANR5L15QOSD163.pdf)

### 2.6 Procurement

- California default: lowest responsible bidder; design-build authority for transit agencies since 2001, granted case by case; best-value pilots for UC and Caltrans sunsetted (2015, 2014). [SPUR pp.28-35](https://www.spur.org/sites/default/files/2021-05/SPUR_More_For_Less_Report.pdf)
- Technical-merit weight in award: Sweden 50%, France 60%, Spain 70% (incl. speed), Italy 70-80%, California 30%. Madrid: price 30%, time 20%, technical and experience 50%. [TCP final report](https://transitcosts.com/transit-costs-study-final-report/), [Works in Progress](https://worksinprogress.co/issue/how-madrid-built-its-metro-cheaply/)
- TCP decomposition of the New York premium: procurement 1.85x; best vs worst procurement practice 2x; contractors price an "agency factor" of about 20% for a difficult client; pre-priced itemized change lists save an estimated 10-20%; contingencies of 40-50% are excessive. [TCP final report](https://transitcosts.com/transit-costs-study-final-report/), [TCP conclusion deck](https://pedestrianobservations.com/wp-content/uploads/2023/03/transit-costs-project-conclusion-presentation.pdf)
- Madrid contracts: lump sum plus bill of quantities for extras; many small contracts; 8 TBMs at once. Eno's Chile example: break tunnels into smaller contracts ($135M/mile tunnelled average). [Works in Progress](https://worksinprogress.co/issue/how-madrid-built-its-metro-cheaply/), [Railway Age on Eno](https://www.railwayage.com/?p=73517)
- Progressive design-build is not a cure: VTA awarded BART SV II tunnelling to Kiewit Shea Traylor as two-stage PDB in May 2022; in June 2025 the board voted to seek a new contractor after proposals VTA said exceeded the budget (reported as more than twice), with up to about $1B owed for early works; by July 2026 VTA had authorized $400M of early work under a restructured KST target-price contract (Railway News, 2026-07-17). The "more than twice" and "$1B owed" figures were not in the fetched sources: UNVERIFIED. [Metro Magazine](https://www.metro-magazine.com/news/vta-board-approves-contractor-change-for-bart-silicon-valley-extension), [KQED](https://kqed.org/news/12043328/vta-officials-want-to-ditch-contractor-on-south-bay-bart-extension), [Railway News](https://railwaynews.net/?p=283957)
- P3 risk: Maryland Purple Line concessionaire walked with a $250M settlement. [TCP final report](https://transitcosts.com/transit-costs-study-final-report/)
- Low bid with change-order warfare: Central Subway contractor dispute. [Construction Dive](https://www.constructiondive.com/news/federal-monitor-cites-contractor-relationship-as-major-cause-of-san-francis/559398)

### 2.7 Over-built stations

- Second Avenue Subway: station oversizing is a 2.06x factor on station cost; 96th Street dig is 2.6x its 187 m platform; comparator digs are 3-20% longer than the platform; mined stations cost 1.5x cut-and-cover per unit volume. [TCP final report](https://transitcosts.com/transit-costs-study-final-report/)
- Non-standard systems: 1.35x on hard costs. [TCP final report](https://transitcosts.com/transit-costs-study-final-report/)
- San Jose: large-diameter single bore chosen to avoid street disruption; VTA's August 2025 twin-bore study concluded twin bore would cost more because of large cut-and-cover stations and redesign time. Levy attributes cost to dig size and oversized station entrances. [Mass Transit](https://www.masstransitmag.com/rail/infrastructure/press-release/55309132/santa-clara-valley-transportation-authority-vta-santa-clara-vta-releases-cost-report-for-tunneling-method-for-bart-silicon-valley-phase-ii-project), [Pedestrian Observations](https://pedestrianobservations.com/2024/04/30/quick-note-what-the-hell-is-going-on-in-san-jose/)
- Portal: 160,000 sq ft train box with mezzanine, six tracks, three platforms. [Streetsblog Cal](https://cal.streetsblog.org/2026/06/04/dream-of-a-grand-central-station-for-the-west-at-risk-of-further-delay)
- Madrid: copy-paste station designs; Melis: design for users, not architectural beauty or exotic materials. London Bridge Jubilee station £217M vs at most £60M per Madrid station (2024 terms). [Works in Progress](https://worksinprogress.co/issue/how-madrid-built-its-metro-cheaply/)

### 2.8 Utilities, permits, third-party betterments

- Van Ness BRT: concept 1995, service 2022; $346M, $37M over; civil grand jury found delays "foreseeable and avoidable" because utility work got too little attention and too little exploratory potholing was done. [Grand jury report](https://sf.gov/sites/default/files/2024-03/2021%20CGJ%20Report_Van%20Ness%20Avenue%20-%20What%20Lies%20Beneath.pdf), [CBS](https://www.cbsnews.com/sanfrancisco/news/report-delays-in-san-franciscos-van-ness-project-were-forseeable-and-avoidable/)
- Central Subway: $647M estimate in 2001; $1.6B at federal agreement; opened 2023, about four years late; cost described as near $2B in a 2026 hearing. Muni blamed PG&E for a train-control power upgrade rising from $11.3M to over $15M. [SPUR p.11](https://www.spur.org/sites/default/files/2021-05/SPUR_More_For_Less_Report.pdf), [Axios](https://www.axios.com/local/san-francisco/2026/01/28/central-subway-extension-funding-transit), [SF Standard](https://sfstandard.com/transportation/muni-blames-pge-for-spiraling-15m-costs-years-of-delays-in-train-upgrade-struggle/)
- Caltrain electrification: $1.98B to $2.3B (+$333M) and 2022 to 2024, with unmarked utilities at pole foundations, signal system trouble and a scope dispute with the contractor. Final budget $2.44B (set December 2021, $462M over the original) and full electric service from 2024-09-21: confirmed 2026-11-09 via [Wikipedia](https://en.wikipedia.org/wiki/Caltrain_Modernization_Program). [Caltrain](https://www.caltrain.com/caltrain/news/caltrain-electrification-delayed-2024), [Mass Transit](https://masstransitmag.com/rail/infrastructure/article/21225469/caltrain-electrification-project-delayed-until-2024-costs-rise-333-million)
- HSR: Inspector General (Feb 2025) found persistent delay in third-party agreements, attributed both to Authority process and to utility owners not engaging; the Authority proceeds with relocation design before owner approval, inviting redesign. 83% of utilities relocated on the 119-mile segment as of the 2025 update; 88% (1,604 of 1,826) as of July 2025 per the [CHSRA status report](https://hsr.ca.gov/wp-content/uploads/2025/10/CVSR-2025-10-Data-2025-07-FINAL-V0-A11Y.pdf). [OIG](https://hsr.ca.gov/wp-content/uploads/2025/02/Early-Works-Engagement-FINAL-A11Y.pdf), [2025 Project Update](https://hsr.ca.gov/communications-outreach/reports/project-update-reports/2025-project-update-report/chapter-2)
- New York: utilities place their own supervisors in the tunnel at MTA expense; $15M paid to NYC Parks for a playground staging site ("other people's money"). [TCP conclusion deck](https://pedestrianobservations.com/wp-content/uploads/2023/03/transit-costs-project-conclusion-presentation.pdf)
- Berkeley CLEE recommendation: grant "master" permitting authority (street closure, engineering permits) to agencies building priority rail projects; avoid non-essential betterments. [Legal Planet](https://legal-planet.org/2022/01/19/new-report-how-to-reduce-rail-transit-construction-costs-and-timelines/), [Berkeley Law](https://www.law.berkeley.edu/spotlight/clee-report-california-rail-transit/)

### 2.9 Right-of-way and eminent domain

- HSR Central Valley: 2,276 of an estimated 2,294 parcels delivered (99.2%) as of July 2025, more than eight years after acquisition began; construction contracts were let before the land was in hand. [CHSRA status report](https://hsr.ca.gov/wp-content/uploads/2025/10/CVSR-2025-10-Data-2025-07-FINAL-V0-A11Y.pdf), [State Auditor](https://information.auditor.ca.gov/reports/2018-108/summary.html)
- California eminent domain procedure (resolution of necessity, order of possession timing): not researched to primary source in this pass. UNVERIFIED.
- City of San José sold land next to Diridon that had been identified for a better rail alignment. [SPUR p.16](https://www.spur.org/sites/default/files/2021-05/SPUR_More_For_Less_Report.pdf)

### 2.10 Labor, Buy America, federal process, railroads

Labor:
- New York labor is 40-60% of hard costs vs 20-30% in Italy, Sweden, Turkey; overall labor factor about 1.5x. Staffing is the driver, not wages: SAS TBM shift ran 46 workers plus 29 management where 30 could do it; Swedish miners earn about $90,000/year. TBMs run only 20-40% of the time. [TCP final report](https://transitcosts.com/transit-costs-study-final-report/)
- Madrid tunnelled 24/7 and cut construction from about 8 years to 3; Dublin Port Tunnel was limited to 13 hours a day in places and opened two years late. [Works in Progress](https://worksinprogress.co/issue/how-madrid-built-its-metro-cheaply/)
- Bay Area-specific staffing ratios: none found. UNVERIFIED that the New York factor transfers.

Buy America:
- Rolling stock domestic content above 70% since FY2020; waiver only if domestic sourcing raises cost by more than 25%. [FTA](https://www.transit.dot.gov/about/news/fta-issues-final-buy-america-policy-phased-increase-domestic-content-procurement-transit), [CRS R44266](https://www.everycrsreport.com/files/20190702_R44266_c977f9e07d70209101bb134c850752577cb20517.html)
- CRS: data too thin to quantify cost and delay. AAF (advocacy) estimated WMATA could have saved $700,000 per 7000-series car at overseas prices. [CRS](https://www.everycrsreport.com/files/20190702_R44266_c977f9e07d70209101bb134c850752577cb20517.html), [Roads & Bridges](https://roadsbridges.com/transit-study-indicates-buy-america-rules-are-taking-toll-transit)

FTA Capital Investment Grants:
- New Starts development took 3 to 14 years (GAO-14-472); FTA says the award step alone averages 2 to 4 years; most of 66 sponsors reported delays (GAO-20-512). [GAO-14-472](https://www.gao.gov/products/gao-14-472), [GAO-20-512](https://www.gao.gov/products/gao-20-512)
- Portal: FTA commitment of $3.4B announced 2024-05-20 (year confirmed; same article gives $8.25B total and revenue operations in 2035). [Smart Cities Dive](https://www.smartcitiesdive.com/news/fta-grant-san-francisco-downtown-commuter-rail-tunnel-transit-center/717176/)
- BART SV II: first identified 1982; FFGA still pending in 2026. [SPUR fig. 1](https://www.spur.org/sites/default/files/2021-05/SPUR_More_For_Less_Report.pdf), [PMOC](https://vtabart.org/wp-content/uploads/2026/05/2026-03-CA-BSVII-OP25-ProjectMonitoringReport-051926-v1-1.pdf)

FRA rules:
- Caltrain obtained an FRA waiver in 2010 to mix lighter EMUs with conventional trains (secondary source), and has needed repeated component-level waivers for its Stadler KISS fleet (dockets FRA-2018-0067, 2023 extension, 2025 brake-interval petition). [Federal Register 2025](https://www.govinfo.gov/content/pkg/FR-2025-06-02/html/2025-09914.htm), [Federal Register 2023](https://www.govinfo.gov/content/pkg/FR-2023-09-19/pdf/2023-20203.pdf)
- FRA 2018 rule added alternative Tier I crashworthiness and Tier III (220 mph, shared track up to 125 mph); FRA's own estimate: $284.8M to $541.9M net savings over 30 years at 7%. [Federal Register 2018](https://www.govinfo.gov/content/pkg/FR-2018-11-21/html/2018-25020.htm), [FRA 2023 NPRM](https://www.govinfo.gov/content/pkg/FR-2023-04-03/html/2023-05576.htm)

Freight railroad ownership:
- Union Pacific owns the tracks south of Tamien; Caltrain to Gilroy runs on trackage rights; UP retains freight and intercity rights on the Peninsula under the 1991 agreement. [San José Spotlight fact brief](https://sanjosespotlight.com/fact-brief-does-caltrain-own-the-southbound-right-of-way-near-tamien-station/), [CPUC](https://docs.cpuc.ca.gov/PublishedDocs/Published/G000/M168/K141/168141812.PDF)
- Capitol Corridor South Bay Connect: contract award delayed primarily by negotiation with UP as property owner; in February 2026 UP said the Agnew siding agreement alone needs about 18 months. [CTC, May 2026](https://catc.ca.gov/-/media/ctc-media/documents/ctc-meetings/2026/2026-05/142-2-8b4-a11y.pdf)
- Dumbarton: SamTrans owns the bridge corridor; East Bay connections need UP track. [Wikipedia](https://en.wikipedia.org/wiki/Dumbarton_Rail_Corridor)

### 2.11 Funding, veto points, fiscal cliff

- Regional Measure 3 (bridge tolls, about 55% yes, about $4.5B): Howard Jarvis Taxpayers Association sued in 2018; toll revenue sat in escrow for years until the California Supreme Court let the appellate ruling stand. [Bay Crossings](https://www.baycrossings.com/rm3-funds-now-on-hold/), [CBS](https://cbsnews.com/sanfrancisco/news/millions-in-paid-bay-area-bridge-tolls-unlocked-after-lengthy-litigation)
- Voter thresholds as a mechanic: RTM needed a simple majority of the combined five-county vote (citizen-initiative style route under SB 63); SF Prop H parcel tax also needed only a simple majority per KQED's voter guide (corrected 2026-11-09; an earlier draft said two thirds). Two thirds remains the threshold for special taxes placed on the ballot by an agency. [KQED Prop H](https://www.kqed.org/voterguide/sanfrancisco/proposition-h) [KQED](https://www.kqed.org/voterguide/california/regional-measure-rtm), [Mission Local](https://missionlocal.org/2026/11/san-francisco-election-results-transit-proposition-h-rtm/)
- Fiscal cliff:
  - BART FY27 deficit $376M per the BART citation (page blocked in the fact-check; Bay City News reports $367M, so the exact figure is UNVERIFIED); structural gap $350M to $400M/year; contingency plan: service hours cut 63% from January 2027, cumulative 70% from July 2027, up to 15 station closures. The 1,200 layoffs figure is UNVERIFIED. [BART](https://www.bart.gov/news/articles/2026/news20260226-0), [Local News Matters](https://localnewsmatters.org/2026/02/27/bart-board-passes-drastic-contingency-plan-to-close-367m-deficit-slash-service-by-70/)
  - Four big operators' combined FY26/27 gap about $800M. [Senate press release](https://sd07.senate.ca.gov/node/299)
  - State bridge loan $590M (BART share $285M UNVERIFIED; the MTC release gives only the $590M total, agreed 2026-01-30). [MTC](https://mtc.ca.gov/news/agreement-reached-loan-bay-area-transit-agencies)
- Measure RTM, 2026-11-03: 14 years, 0.5% sales tax in Alameda, Contra Costa, San Mateo, Santa Clara and 1% in San Francisco, about $980M/year from 2027. Passing with about 57% (KQED count of 2026-11-06) to 62% (early returns). Prop H at 74.2% yes (KQED count of 2026-11-09). Results uncertified as of this writing. SB 63 attaches a financial efficiency review to the money. [KQED results](https://www.kqed.org/voterguide/california/regional-measure-rtm), [KQED](https://www.kqed.org/news/12107133/death-spiral-averted-bay-area-transit-taxes-rtm-and-prop-h-declare-victory), [SF Standard](https://sfstandard.com/2026/11/03/bay-area-transit-tax-bart-caltrain/)
- Delay itself is a cost: construction escalation 3-5%/year; high first estimates slow funding, which raises cost further. Transbay Transit Center finished 40% above initial estimate. [SPUR pp.17-18](https://www.spur.org/sites/default/files/2021-05/SPUR_More_For_Less_Report.pdf)

## 3. Low-cost comparators: how they procure and staff

| | Client capacity | Contracting | Approvals and land | Money | Caveat |
|---|---|---|---|---|---|
| Madrid (Melis era, 1995-2007) | Small senior in-house team (9 engineers) owns design and supervision; no external PM | Lump sum plus bill of quantities; price weight 30%; many small lots; 8 TBMs; 24/7 work; proven tech (fixed-block signalling); 3 weeks from construction end to opening | Environmental sign-off about 5 months; political decisions within 24 hours; whole programme fits a 4-year electoral term | Regional budget; network grew from 114 km by about 203 km in 12 years per Works in Progress (the 317 km total was my sum and is likely overstated: Wikipedia gives 296.6 km for the metro as of 2025, so the 203 km probably includes light rail; UNVERIFIED) | Speed was tied to electoral deadlines; Line 7B subsidence damage in San Fernando de Henares is the standard counter-example (UNVERIFIED in this pass). [Works in Progress](https://worksinprogress.co/issue/how-madrid-built-its-metro-cheaply/) |
| Italy | Public engineering firms (Metropolitana Milanese since the 1950s); Turin shows value of building in-house capacity | Technical score 70-80%; design/PM about 10% | Archaeology is the main time risk | State plus EU | 1970s-80s cost explosion tied to bribery, costs fell after mani pulite. [TCP](https://transitcosts.com/?p=10601), [NBER slides](https://conference.nber.org/conf_papers/f189970.slides.pdf) |
| France | RATP / SNCF engineering arms; maîtrise d'oeuvre 5-10% | Technical score 60%; overtime capped at 10 h/day, 6 days/week | Déclaration d'utilité publique | State, region, dedicated taxes | Grand Paris Express: hollow client, +75% cost. [TCP](https://transitcosts.com/transit-costs-study-final-report/), [Sénat](https://www.senat.fr/rap/r20-044/r20-0448.html) |
| Poland | PKP PLK and Metro Warszawskie as clients with contract engineers supervising | Design-and-build common; price still the dominant or only criterion in many PLK tenders | Rail specustawa (chapter in the Railway Transport Act): voivode issues one location decision on PLK's application; can be made immediately enforceable; title passes to the State Treasury by law when the decision is final; handover date set in the decision | EU CEF up to 85% of eligible cost in cohesion countries (typical TEN-T grants 30-50%) | Poland has its own red tape: KIO bid protests void awards (Rail Baltica 2026); price indexation clauses lag inflation. Specustawa is criticized on property-rights grounds (UNVERIFIED, no source collected). [2015 amending act](https://www.infor.pl/akt-prawny/DZU.2015.029.0000200,ustawa-o-zmianie-ustawy-o-transporcie-kolejowym-oraz-niektorych-innych-ustaw.html), [Rail Journal](https://www.railjournal.com/financial/port-polska-project-seeks-european-union-funding/), [Batory Foundation](https://www.batory.org.pl/wp-content/uploads/2022/03/The-Integrity-Pact.-A-Civil-Society-Monitoring-of-Public-Projects.-An-Overview-of-the-Investment-and-the-Pilot-Project.pdf) |

Polish unit prices for the cost table (hand-off to the economics doc):
- Metro, bored with stations: $209-220M/km PPP per TCP (M2 extensions to Bródno, Księcia Janusza, Trocka; corrected 2026-11-09 from $52-63M/km). The M2 central section is $597M/km PPP including rolling stock. Market-exchange-rate equivalent for the extensions is roughly $90M/km (derived, UNVERIFIED rate).
- Mainline modernization: about €9.5M/km on Line 12 including a major Vistula bridge. [Railway News](https://railwaynews.net/?p=283781)
- Mountain rail with tunnels: Gdów-Szczyrzyc tender €575M for 16 km, derived about €36M/km. [Railway News](https://railwaynews.net/pkp-plk-launches-eur-575-million-tender-for-gdow-szczyrzyc.html)
- HSR "Y" network: about €18B for about 480 km, derived about €37.5M/km (UNVERIFIED as a per-km figure; programme-level arithmetic). [Railmarket](https://railmarket.com/news/business/28077-cpk-to-launch-almost-eur10-billion-tenders-in-2026)

## 4. Proposed model: institutional multipliers

Cost = Polish base x physical multiplier (other docs) x product of institutional factors below. Duration = build time + pre-construction queue.

Status-quo cost factors (proposal; evidence in brackets):

| Factor | Status quo | Reformed | Evidence anchor |
|---|---|---|---|
| Station scope | 1.5 | 1.0 | TCP 2.06x on station cost; stations are a large share of total |
| Procurement and risk pricing | 1.6 | 1.0 | TCP 1.85x; best vs worst 2x |
| Soft costs (consultants, PM) | 1.3 | 1.0 | 40% (San Jose) vs 5-10% (Europe): 1.40 / 1.075 |
| Site staffing and work hours | 1.3 | 1.0 | TCP labor 1.5x in New York; discounted because Bay Area evidence is missing |
| Utilities and third parties | 1.2 | 1.0 | TCP agency factor about 20% |
| Buy America (rolling stock and systems only) | 1.15 | 1.0 | Waiver threshold 25%; no solid premium estimate |
| Delay escalation | 1.04 per year of pre-construction delay | same rate, fewer years | SPUR 3-5%/year |

Product without escalation: 1.5 x 1.6 x 1.3 x 1.3 x 1.2 = 4.9x. With 8 years of avoidable queueing at 4%: about 6.7x. That lands on "several times Polish prices" for the institutional layer alone. Note (2026-11-09): the observed BART SV II to Warsaw gap is itself only about 6x in PPP terms (section 1), so these factors need rescaling or a market-rate base before physical multipliers are stacked on top.

Status-quo time adders (years before a TBM launches):

| Stage | Status quo | Reformed | Evidence anchor |
|---|---|---|---|
| Planning and project selection | 5-15 | 1-2 | BART SV: 1982 to FFGA pending in 2026; Van Ness: 1995 to 2022 |
| Environmental review (CEQA + NEPA) | 3.5-4.5 | 0.5 | CEQ median 3.5 / mean 4.5; Madrid 5 months |
| Litigation, if triggered | +1 to +4 | +0.75 max | SF bike plan 4 years; SPUR 270-day cap proposal |
| Federal grant (CIG) | 2-4 for award; 3-14 total | 1 | FTA testimony; GAO-14-472 |
| ROW and utilities | 2-8 | 1 | HSR parcels 8+ years; specustawa |
| Construction, per comparable scope | 8 | 3 | Madrid 24/7 claim |

## 5. Reform tree

Three meters:
- Political capital (PC): spent to pass reforms and override vetoes; earned by opening stations on time, winning measures, ridership.
- Public trust (0-100): drives ballot-measure pass probability; drops on overruns and outages.
- State capacity (in-house staff level 0-5): gates reforms; decays if no project is under construction ("one project per generation" penalty).

| ID | Reform | Real analogue | Effect | PC cost | Prereq / side effect |
|---|---|---|---|---|---|
| E1 | Transit CEQA exemption (surface) | SB 288 / 922 / 71 | BRT, bike, light rail in existing ROW: env review 3.5 y to 0.25 y | Already unlocked at game start (2026) | Requires skilled-and-trained workforce: staffing factor +0.05 |
| E2 | Megaproject certification | SPUR rec. 9; AB 900 precedent | Litigation delay capped at 0.75 y | 30 | Requires business-case gate (G2) |
| E3 | NEPA assignment and page limits | FRA 2023; Seven County | EIS 3.5 y to 2 y | 15 (federal lobbying) | Random federal reversal event |
| E4 | Narrow administrative record | SB 131 | Litigation trigger probability x0.8 | 10 | Can be repealed by an AB 1083 event |
| G1 | Regional network manager | Seamless Bay Area agenda, SB 917 | Fare and schedule integration: ridership +10 to 15% (UNVERIFIED magnitude, tune in playtest); transfer penalty removed | 40 | Each of the 27 agencies has a veto card; buy out or outvote |
| G2 | Stage gates and business cases | SPUR rec. 3-4 | Initial estimate error halves; cancels "optimism bias" events | 15 | Slows first project by 0.5 y |
| G3 | Infrastructure Bay Area (single delivery agency) | SPUR rec. 6 | State capacity no longer resets between projects; unlocks S1-S3 | 50 | Agencies resist ceding control |
| S1 | In-house engineering corps | Madrid, Milan MM | Soft-cost factor 1.3 to 1.05; decisions per month x3 | 25 + ongoing salary line | Needs civil-service pay reform (S2) to reach level 4-5 |
| S2 | Competitive pay bands | SPUR p.29 | Staff attrition halves | 20 | Tabloid event "bureaucrat earns more than governor" |
| S3 | Standard station catalogue | Madrid copy-paste | Station scope factor 1.5 to 1.0; design time per station -75% | 15 | Each city asks for an "iconic" station: decline costs 3 PC each |
| P1 | Best-value award (50%+ technical) | TCP; Madrid 30/20/50 | Procurement factor 1.6 to 1.3; change-order event rate -50% | 20 | State law change |
| P2 | Itemized contracts with pre-priced changes | TCP; Italy, Spain | Procurement factor a further -0.15; disputes resolve in weeks | 10 | Requires S1 level 3 (someone must be able to read the bill of quantities) |
| P3 | Small lots, many contractors | Madrid, Chile | Unlocks more simultaneous TBMs; bid prices -10% | 10 | Interface risk if S1 below level 3 |
| P4 | Progressive design-build | VTA 2022 | Reduces design-risk events; but 25% chance of "target price doubles" card if S1 below level 3 | 5 | Trap option on purpose |
| U1 | Utility relocation statute with deadlines | SB 445 concept; CLEE | Utilities factor 1.2 to 1.05; ROW/utilities time -50% | 25 | PG&E-style lobbying event |
| U2 | Master permitting authority | CLEE rec. | Cities cannot hold street permits hostage; betterment demands -70% | 30 | Local trust -5 per city |
| U3 | Pothole first | Van Ness grand jury | Removes "unmarked utilities" event; costs 1% of budget upfront | 0 | Pure competence, no politics |
| R1 | Rail specustawa | Poland | ROW time 2-8 y to 1 y; possession on final decision | 45 | Trust -10 in affected tiles; compensation budget +20% |
| R2 | Buy the railroad | Caltrain 1991 purchase precedent | Removes UP veto on a corridor; one-off capital cost | 20 + cash | UP sets the price; alternative is an 18-month wait per agreement |
| F1 | Buy America flexibility | FTA waiver rule | Rolling stock factor 1.15 to 1.0; delivery -1 y | 20 (federal) | Loses a labor endorsement |
| F2 | FRA alternative compliance | 2018 rule; Caltrain waivers | Off-the-shelf European trainsets allowed on mixed track | 10 | Already largely real; tutorial unlock |
| F3 | Skip CIG, fund locally | Madrid regional budget | Removes 2-4 y federal grant stage; lose up to 40% federal share | 0 | Needs ballot measure |
| L1 | 24/7 tunnelling and lean crews | Madrid; TCP staffing | Construction time 8 y to 3 y; staffing factor 1.3 to 1.1 | 25 | Negotiated with trades: pay a wage premium (+5% labor) to keep endorsement; noise complaints in surface tiles |
| M1 | Ballot measure | RM3, RTM, Prop H | Revenue stream; simple majority via citizen-initiative route vs two-thirds otherwise | Campaign cost scales with (100 - trust) | Lawsuit event can escrow funds for 2-4 y |

Design notes:
- Reforms multiply, and the tree should reward capacity before procurement tricks: P2-P4 backfire without S1 (matches GLX 4-6 staff, SGP, VTA PDB).
- Several reforms are already won in the 2026 start state (E1, E4, F2, SB 79 upzoning, RTM funding). The opening tutorial can be "use what Sacramento already gave you".
- SB 79 hook: stations in upzoned tiles gain ridership over time; cities that adopted delay ordinances (Los Angeles is the real example) give the mechanic a "local resistance" state per city.

## 6. Event cards

| Card | Trigger | Effect | Real basis |
|---|---|---|---|
| One Man and His Parking Spot | Any surface project without E1 | 4-year injunction unless you spend 10 PC | SF bike plan |
| The Berkeley Truncation | BRT through a city with low local trust | Lose the last third of the route or pay 8 PC | East Bay BRT |
| What Lies Beneath | Cut-and-cover without U3 | +3 years, +12% cost | Van Ness BRT |
| The Twice-Priced Tunnel | P4 chosen with low capacity | Contractor price returns at 2x budget; re-procure (+1.5 y) or pay | BART SV II / KST |
| Wrong Kind of Rail | Random, low-bid contractor | Station opening slips, rework | Central Subway wrong-spec track ([ABC7](https://abc7news.com/post/opening-of-sf-subway-station-delayed-after-wrong-track-laid-down/3455117/)) |
| Empty Box | Build a station shell before the tunnel is funded | Asset sits idle; trust -1 per year | Salesforce Transit Center train box, empty since 2018 |
| The Railroad Will Call You Back | Any route touching UP track without R2 | +18 months per agreement | South Bay Connect / Agnew siding |
| Escrow | After a won measure | Funds frozen 2-4 years by a taxpayer suit; 30% chance | RM3 |
| Do Not Disturb | Maintenance or seismic retrofit choice | Option A: cheap, fast, service outage. Option B: 3x cost, 2.5x time, no outage. Board AI picks B unless trust is high | BART Berkeley Hills, $284M vs $918M |
| Aerial Over Diridon | Two operators share a station without G1 | Station cost +50% from duplicate structures | Diridon HSR aerial plan |
| Cap-and-Invest Renegotiation | Random, state budget stress | A committed 10% funding slice is "under review"; opening slips 1-3 years | Portal, 2026 |
| Fiscal Cliff | Operating reserve below zero | Choose: 70% service cut, emergency loan (repay from next measure), or emergency ballot | BART 2026 |
| Tap Fail | Launch regional fare system without capacity level 3 | Outages for 2 quarters, trust -8, vendor "fix in 60 days" timer | Clipper 2.0 |
| Kill Fee | P3 concession collapses | Pay 2-3% of contract value, re-procure | Purple Line |
| Playground Rent | Staging on another agency's land without U2 | One-off payment and precedent: next agency asks too | Marx Brothers Playground, $15M |
| Phased Implementation Ordinance | After SB 79-type upzoning | A city delays compliance to 2030; ridership growth there paused; sue (costs PC) or wait | Los Angeles 2026 |
| Ribbon Before the Election | Reformed mode, project opens inside the 4-year term | PC +15, trust +5 | Madrid electoral cycle |
| Subsidence | Rushed tunnelling under housing with skipped geotech | Demolitions, trust -20, compensation | Madrid Line 7B (UNVERIFIED) |

## 7. Sensitivities (satirical but fair)

- CEQA and community process exist because of real harm: freeways and redevelopment cut through Black and immigrant neighborhoods with no recourse. SPUR itself says reform must address "process disempowerment". Mechanic: reforms that remove veto points should require early engagement (G2) or cost trust in affected tiles; never model residents as pure obstacles.
- Labor: evidence blames staffing rules and site productivity, not wages (Swedish miners about $90,000). Keep L1 as a negotiated trade with a wage premium, not union-busting.
- Eminent domain: R1 is the strongest reform in the tree and the most ethically loaded. Show displaced households and pay compensation explicitly.
- Poland, Spain, Italy are not utopias: KIO protest loops, indexation disputes, mani pulite, Line 7B, Grand Paris. Include failure cards in "reformed" mode so the comparison stays honest.
- "Polish prices" ignores wage PPP and seismic design. Label the baseline as a target, show the physical multiplier separately.
- Satirize institutions and incentives, not named living people. Use real project names for scenarios; avoid attributing motives to named contractors (KST, Tutor Perini, Cubic) beyond documented facts; contractor disputes have two sides (Tutor Perini blamed SFMTA design; SFMTA blamed PG&E).
- Holland & Knight CEQA statistics and AAF Buy America numbers are advocacy products; they are cited here with that label and should not become in-game "facts" without it.
- Tech campuses as destinations (Oracle, Meta, Google): avoid implying corporate capture is the reform path; private contributions can be a funding card with a governance cost.
- Election results (RTM, Prop H) are uncertified as of 2026-11-09.

## Recommendations for the game

1. Split cost into Polish base x physical x institutional, and let this doc own only the institutional product (about 4.9x static, about 6.7x with delay escalation; rescale per the section 1 caveat so the full stack matches the observed 6x to 11x PPP gap). Show the multiplier stack in the UI as a receipt.
2. Make time, not money, the primary pain: status-quo pre-construction queue of 12-25 years vs 3-4 reformed. The player should feel the calendar before the first voxel is dug.
3. State capacity is the root of the tree. Procurement and delivery reforms without in-house staff must misfire (P4 trap, GLX, SGP).
4. Start state 2026 = real 2026: SB 71, SB 131, AB 130, SB 79 in effect; RTM just passed; Clipper 2.0 half-migrated; Portal and BART SV II stuck pre-FFGA. First mission (The Portal) teaches funding slices, the empty train box, and the Caltrain/TJPA/CHSRA agreement mechanic.
5. Use event cards drawn from documented cases (section 6) with a citation tooltip each; this is what keeps satire fair.
6. Give every reform a visible cost to someone (trust in tiles, labor endorsement, city relations). No free lunches except U3 (pothole first), which is the joke.
7. Model veto points as countable objects on the map: 27 operators, 9 county agencies, cities along the alignment, UP corridors. Reforms reduce the count or the per-veto delay.
8. Ballot measures as a mini-game: threshold (majority vs two thirds), trust-driven pass probability, post-win escrow risk.
9. Keep "reformed mode" failure cards so Poland/Madrid are benchmarks, not fairy tales.

## Open questions

- Final certified results for Measure RTM and SF Prop H; whether any post-election challenge is filed (RM3 precedent).
- Fate of AB 1083 and of the CalChamber "Building an Affordable California Act" initiative in 2026.
- Final status of SB 445; whether any 2026 bill created utility/third-party deadlines or master permitting for transit megaprojects.
- Exact SB 71 conditions for large rail projects (cost thresholds, business-case requirements) from the chaptered text; LegiScan blocked automated fetch.
- Current Portal numbers: $8.25B (2023) vs "$7.5B to complete" (2026), opening 2032 vs 2035, status of the federal FFGA and of the $750M state share.
- Current BART SV II baseline cost, contractor arrangement and revenue date after the 2025-2026 KST restructuring.
- Link21: current cost range, technology decision date, environmental schedule.
- California eminent domain timelines (resolution of necessity to possession) from primary sources, for a fair R1 comparison with the Polish specustawa; Polish critique sources for specustawa.
- Bay Area-specific labor staffing and soft-cost data (TCP has no Bay Area case); whether the New York 1.5x transfers.
- A defensible Buy America premium for railcars after the 70% rule.
- Ridership effect size for fare/schedule integration (G1), e.g. from MTC's Fare Coordination and Integration Study business case.
- Madrid Line 7B facts and any quantified critique of Melis-era quality.
- How to split the observed gap (about 6x PPP for BART SV II, about 11x for the Portal, about 15x at market exchange rates) between institutional and physical multipliers, and whether the Polish base is quoted in PPP or market dollars.

## Corrections (2026-11-09 fact-check)

- Warsaw M2 costs: $215M and $209M are TCP per-km PPP figures, not totals (totals $731M and $837M). Polish metro base is about $209-220M/km PPP, not $52-63M/km; Bay Area ratio is about 6x (BART SV II) to 11x (Portal), not 20x. Sections 1, 3, 4, recommendation 1 and open questions amended. West-extension link fixed (old link pointed at the central section, $597M/km). Source: transitcosts.com project pages (fetched directly); Levy NBER slides.
- Prop H threshold: simple majority, not two thirds; latest count 74.2%. Source: KQED voter guide, 2026-11-09.
- Clipper 2.0: Cubic contract $393M grown to $436M, not $461M; card migration restated (15% of about 15M as of 2026-07-16); earlier migration and trip-share numbers marked UNVERIFIED. Source: KQED.
- BART contingency plan: 63% then 70% service-hour cut, up to 15 station closures; $376M vs $367M deficit and 1,200 layoffs marked UNVERIFIED. Source: Local News Matters 2026-02-27 (bart.gov returned 403).
- Madrid network: "114 km to 317 km" replaced by the sourced "+203 km"; 317 km was derived and conflicts with Wikipedia's 296.6 km.
- Grand Paris Express: €38.5B confirmed; €22B (2010) baseline and +75% marked UNVERIFIED. Source: fr.wikipedia.org/wiki/Grand_Paris_Express.
- SB 445: confirmed dead on suspense file 2025-08-29 (CalMatters). HSR utilities: added 88% as of July 2025 (CHSRA status report).
- UNVERIFIED tags removed after confirmation: Caltrain electrification $2.44B and 2024-09-21 service; Portal FTA $3.4B on 2024-05-20; VTA $400M early works (July 2026).
- UNVERIFIED tags added: New York in-house staff 1,600 to 120; BART share of the $590M loan; KST "more than twice" and "$1B owed".
- Checked and confirmed without change: BART SV II $12.2B/9.6 km and $12.746B, $5.1B (40%) CIG cap, FFGA July 2027, RSD February 2039 (PMOC); Portal $8.25B, 2.2 miles, $7.5B/2035/$750M at risk; SPUR figures (fig. 4, Berkeley Hills $284M vs $918M, 93 projects, 11%, Res. 3434, Central Subway, 270 days, 3-5%); TCP factors (1.85, 2.06, 1.35, 21%, GLX 4-6 vs 83, Purple Line $250M); Madrid 56 km/37 stations/$2.8B; Italy $120M/km and range; SB 71, SB 79, AB 130, SB 131 dates and sunsets; RTM rates, term, majority threshold, 57-62%; $590M loan; HSR parcels 2,276 of 2,294; FRA 2018 savings; GAO 3-14 years; Line 12 and Gdów-Szczyrzyc figures; RM3 suit.
- Not checked (search budget exhausted): CEQ EIS statistics, H&K CEQA shares, Buy America details, Capitol Corridor/UP 18 months, Polish specustawa and CEF rates, CPK "Y" cost, SB 79 litigation items, Link21 scale-back.

