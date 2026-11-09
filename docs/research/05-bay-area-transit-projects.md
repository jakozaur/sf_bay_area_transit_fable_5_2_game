# 05: Bay Area transit projects, network baseline, campuses, campaign

Research date: 2026-11-09. Scope: scenario catalog for the game. Costs are sponsor figures in the price basis the sponsor uses (mostly year-of-expenditure, YOE); do not mix them without normalising.

Method notes:

- Source keys `[Sx]` resolve to URLs in the Sources section.
- `UNVERIFIED` = not confirmed against a source in this pass (from memory, or secondary source only).
- The shared web-search budget ran out mid-pass. Items not refreshed are listed under Open questions. Direct fetches of primary PDFs (SFCTA, VTA/PMOC, CHSRA, LAO) were done and are the basis for the headline numbers.
- All lat/lon are approximate (3-4 decimals). Those marked `(wiki)` come from the cited Wikipedia infobox; all others are from memory and UNVERIFIED. Resolve every one against OSM (Nominatim/Overpass) at data-build time; do not ship these as ground truth.
- Derived $/km figures are my arithmetic on sponsor cost and length, not sponsor numbers.

## 1. Headline findings

- Regional funding measure passed (early returns): Measure RTM at 61.5% yes, SF Prop H (Muni parcel tax) at 72.5% yes, election of 2026-11-03. Operations money, not capital. Not certified yet [S1].
- The Portal: 1.3 mi, indicative cost $7.57B (July 2025), FTA share $3.38B, remaining gap about $2.2B, FFGA target July 2027, service 2036 [S2].
- BART Silicon Valley Phase II: 6.0 mi, 5 mi single bore of 53 ft diameter, adopted budget $12.746B, baseline revenue date Feb 2039, TBM still stored in Germany as of June 2026 [S3].
- Link21: standard gauge chosen (BART and CCJPA boards, June 2025), now run by CCJPA with CalSTA; crossing $18-30B (2023$); no alignment, no dates [S4][S5].
- CHSRA 2026 Business Plan: Phase 1 $126.1B (optimised) vs $231.3B (full dedicated buildout); SF to Gilroy "blended" scope cut to $1.29B; Gilroy to Central Valley Wye (Pacheco) $18.9B; Merced to Bakersfield service 2033 [S6][S7].
- Geary/19th subway strategic case (June 2026): about 10 mi, 5-6 stations, $20-30B in 2026$ [S8].
- Dumbarton rail is effectively shelved in favour of a 5-mile busway study; construction after 2031 [S9].
- Sponsor costs per km span two orders of magnitude (Caltrain electrification about $30M/km and SMART Healdsburg about $33M/km surface vs The Portal about $3.6B/km). That spread is the core of the game's cost model.

## 2. Existing network baseline

### 2.1 Rail and fixed-guideway operators

| System | Gauge | Traction | Route length | Stations | Ridership (latest found) | Notes | Src |
|---|---|---|---|---|---|---|---|
| BART (main) | 5 ft 6 in (1,676 mm) | 1,000 V DC third rail | 131.4 mi total system | 50 | FY26: 59.5M exits; Sept 2026 avg weekday 223,280 (both UNVERIFIED in fact-check: bart.gov returned 403; Wikipedia/APTA gives 204,800 avg weekday for Q2 2026 and 55.5M for 2025); pre-pandemic about 410,000 | Max 80 mph, typical 70 mph. Non-standard gauge and loading gauge: no interoperability with anything else | [S10][S11] |
| BART eBART (Pittsburg/Bay Point to Antioch) | standard | Diesel DMU (Stadler GTW) | 9.1 mi | 3 | 5,200 weekday (Q2 2026) | Cross-platform transfer, incompatible with main BART | [S12] |
| BART Oakland Airport Connector | cable-hauled AGT (Doppelmayr) | cable | 3.2 mi | 2 | about 1,000 weekday (Q2 2026) | $6 base fare | [S13] |
| Caltrain | standard | 25 kV 60 Hz AC overhead, SF to Tamien (about 51 mi); diesel Tamien to Gilroy | 77.2 mi | 30 | FY26: over 12.5M; avg weekday above 40,000 | Stadler KISS EMUs, 79 mph. PCJPB owns SF to San Jose; UP owns Tamien to Gilroy | [S14][S15] |
| Muni Metro | standard | 600 V DC overhead | 38.9 mi | 117 | about 125,100 weekday (Q2 2026) | 7 lines; Market St subway (1980), Twin Peaks Tunnel (1917), Central Subway (2022/23) | [S16] |
| Muni (all modes) | n/a | n/a | n/a | n/a | 555,000 avg weekday (Sept 2026), about 84% of pre-pandemic | | [S11] |
| VTA light rail | standard | 750 V DC overhead | 42.2 route-mi, 81.6 track-mi (track-mi UNVERIFIED) | 60 | 15,597 weekday (Mar 2026); 17,700 (Q2 2026) | Slow, low ridership per km | [S17] |
| SMART | standard | Diesel DMU (Nippon Sharyo) | Larkspur to Windsor, 48 mi | 14 | FY25: 1.1M+; FY26 tracking 1.4M (+31%) | Fastest post-pandemic recovery in region | [S17] |
| Capitol Corridor | standard | diesel loco-hauled | Auburn/Sacramento to San Jose (length UNVERIFIED, about 170 mi) | UNVERIFIED | FFY25: 1.14M | Runs on UP track; CCJPA now also manages Link21 | [S17][S4] |
| ACE | standard | diesel loco-hauled | 85-86 mi Stockton to San Jose | 10 | 763,800 (2025); about 2,900 weekday | 4 weekday round trips, UP-owned track, avg 39 mph | [S18] |
| SF Bay Ferry (WETA) | n/a | diesel, electrifying | n/a | n/a | 3.25M (FY26); 8,358 avg weekday transbay (Jan 2026) | Above 2019 levels | [S17] |
| AC Transit (bus) | n/a | n/a | n/a | n/a | 136,138 weekday (FY24-25) | | [S17] |

Golden Gate Transit/Ferry and SamTrans figures: not collected (see Open questions).

### 2.2 Incompatibility matrix (drives gameplay rules)

| | BART | Caltrain / HSR / Capitol Corridor / ACE | Muni Metro / VTA LRT | eBART / SMART |
|---|---|---|---|---|
| Gauge | 1,676 mm | 1,435 mm | 1,435 mm | 1,435 mm |
| Power | 1 kV DC third rail | 25 kV AC (Caltrain, HSR) or diesel | 600 V DC overhead (Muni) | diesel |
| Through-running with mainline | No | Yes among themselves, subject to FRA rules, platform height, signalling | No (light rail vehicles) | Mainline-compatible in principle |

- Platform heights, signalling (BART CBTC programme, Caltrain PTC/CBOSS history, Muni ATCS) and FRA vs FTA regulatory regime differ per operator: not researched here.
- Transbay Tube: 3.6 mi immersed tube, max 135 ft below sea level, 57 sections, opened 1974, about $180M in 1970$ [S19]. The single transbay rail link and BART's capacity bottleneck (headways down to 2.5 min) [S19].

## 3. Project catalog

### 3.1 The Portal (DTX) and Pennsylvania Avenue Extension (PAX)

| Field | Value | Src |
|---|---|---|
| Sponsor | TJPA lead; six-party MOU with Caltrain, CHSRA, MTC, CCSF, SFCTA | [S2] |
| Status | FTA CIG Engineering phase since May 2024; no main construction; PDB civil/tunnel procurement (40-CT) under way since Dec 2025 | [S2] |
| Alignment | 4th and King, under Townsend St, curve to 2nd St, into the existing Salesforce Transit Center trainbox at 1st and Mission | [S2][S20] |
| Length | 1.3 mi (2.09 km). TJPA materials also quote 2.2 mi "construction length" and 1.5 mi of tunnel: conflicting, reconcile against the SEIS/SEIR | [S2][S20] |
| Structure | Cut-and-cover plus mined tunnel under Townsend and 2nd; 3-track tunnel; 6 tracks and 3 island platforms at the Transit Center; overhead 25 kV | [S20] |
| Stations | 4th and Townsend (underground, concourse at level -1, platforms at level -2); Salesforce Transit Center (trainbox already built in Phase 1, opened 2018) | [S20] |
| Cost | $8.25B (Aug 2023, incl. $0.73B already-built trainbox); indicative update $7.57B, or $6.84B excluding trainbox (July 2025) | [S2] |
| Funding | FTA CIG New Starts $3.38B; remaining need about $2.2B, of which about $1.05B planned from state (TIRCP/cap-and-invest); rest local, incl. land-based sources | [S2] |
| Schedule | FFGA target July 2027; open for use Q1 2036; MTC material said 2035 | [S2] |
| Delivery | PDB for civil/tunnel, CMGC for station fit-out and track/systems, DBB for advance works | [S2] |
| Cost history | about $600M (1999), about $6B (2018), $8.25B (2023) | [S20] |
| Controversies | 2018 SF supervisors suspended funds and governance review after Transit Center beam cracks; pedestrian connector to Embarcadero BART/Muni cancelled; PAX and railyard decisions unresolved; CHSRA may not arrive for decades | [S20] |

PAX:

- Follow-on tunnel from near 22nd St station to the Portal alignment, removing the 16th St and Mission Bay Dr at-grade crossings. SFCTA lead [S21].
- 2022 Project Initiation Report: three alignments of 5,600 / 6,300 / 7,800 ft; $2.0-2.5B excluding stations; long option forces 22nd St station replacement [S21].
- March/April 2026: SFCTA awarding a two-year, $1.05M "Bridging Study" (HNTB) to cut cost and risk; PAX follows The Portal [S21].

Approx. coordinates (UNVERIFIED): 4th and King 37.7766, -122.3947; 4th and Townsend 37.7770, -122.3955; Salesforce Transit Center 37.7897, -122.3966; 22nd St 37.7575, -122.3924; 16th St crossing 37.7665, -122.3990.

Derived: $7.57B / 2.09 km = about $3.6B/km (about $3.3B/km excluding trainbox).

### 3.2 Link21 (second transbay rail crossing)

- Sponsor: originally BART + CCJPA; since the June 2025 standard-gauge votes, CCJPA runs it day to day under CalSTA leadership, BART is a stakeholder [S4][S5].
- Decision: standard-gauge regional rail, not BART gauge. Combined BART + regional rail tube not advanced. Now in the State Rail Plan and the federal Corridor ID programme [S4][S5].
- Cost: $29B YOE in Plan Bay Area 2050; later $18-30B (2023$) for crossing infrastructure only, plus network investments. Based on 1-2% design [S4].
- Schedule: "benefits by 2040 where possible"; build decision "several years" away; still in Project Identification (since mid-2022); environmental review comes in Project Selection phase [S4][S5].
- Alignment: not fixed. Concepts terminate at Salesforce Transit Center on the SF side; East Bay landings studied via Alameda or Port of Oakland to Oakland/Jack London (secondary source, UNVERIFIED) [S22].
- Geary/19th study assumes a possible standard-gauge through-run from the crossing; notes depth and curve-radius problems connecting at the Transit Center [S8].
- Controversies: gauge choice strands BART's transbay capacity problem; BART demoted; cost; no funding.
- Approx. coordinates (UNVERIFIED): Salesforce TC 37.7897, -122.3966; Alameda Point 37.785, -122.300; Jack London Sq 37.7936, -122.2717; Oakland 12th St 37.8037, -122.2717; Emeryville 37.8405, -122.2916.

### 3.3 BART Silicon Valley Phase II (BSVII)

| Field | Value | Src |
|---|---|---|
| Sponsor | VTA builds and owns; BART operates | [S3] |
| Alignment | Berryessa/North San José to Santa Clara via downtown San José | [S3] |
| Length | 6.0 mi; 5 mi single-bore tunnel, 53 ft diameter (Wikipedia says 45 ft: conflicting, likely inner vs excavated) | [S3][S23] |
| Stations | 28th St/Little Portugal, Downtown San José, Diridon (all underground); Santa Clara (at grade); Newhall yard | [S3] |
| Cost history | $9.318B (2022 New Starts basis), $12.237B (Oct 2023), $12.746B (after FTA risk review 2024, adopted). Includes $1.657B unallocated contingency | [S3] |
| Funding | FTA New Starts forecast $5,098M (original plan $6,296M); TIRCP $750M; other state $750M; RM3 $375M; 2000 Measure A $2,062M + $502M supplemental; 2016 Measure B $2,512M; gap $564M | [S3] |
| Schedule | Baseline revenue service Feb 2039 (FTA P65); earlier VTA date Oct 2036; VTA public messaging 2037. FFGA target Nov 2027 | [S3][S24] |
| Status (June 2026 PMOC) | Early works at West Portal TBM launch site; TBM stored at Herrenknecht in Germany, delivery est. H2 2027; VTA repackaging into six contracts (CP1 to CP6); the KST (Kiewit Shea Traylor) CP2 off-ramp was authorised June 2025 but never executed: the contract was instead amended and restated in June 2026 as a reduced-scope target-price deal ($400M authorised for pre-tunnelling, Stage 2 not to exceed about $2.44B, total cap about $3.55B), with VTA not obliged to use KST for the bore; "Scenario 1" configuration approved Oct 2025; VTA has not shared revised cost estimate with PMOC | [S3] |
| Controversies | Single bore with deep stations vs BART's preferred twin bore; 2025 twin-bore review found up to +$600M and no earlier opening (figure UNVERIFIED: not in the cited ENR/ABC7 pieces; the PMOC's $400-600M and 20 months refer to re-procuring the tunnel contract); KST off-ramp initiated June 2025, not executed, contract renegotiated June 2026 [S3]; Santa Clara County grand jury report on VTA oversight; schedule slip from 2026 to 2037-2039 | [S23][S24] |

- Phase I for calibration: 10 mi, $2.3B, opened 2020-06-13 [S23]. Derived: about $144M/km (mostly surface/trench).
- Derived Phase II: $12.746B / 9.66 km = about $1.32B/km.
- Approx. coordinates (UNVERIFIED): Berryessa 37.3684, -121.8746; 28th St/Little Portugal 37.3497, -121.8640; Downtown SJ 37.3365, -121.8905; Diridon 37.3297, -121.9020; Santa Clara 37.3532, -121.9366.

### 3.4 Caltrain: electrification (done), business plan, grade separations

- PCEP: 25 kV electrification SF to Tamien, about 51 mi, $2.44B, electric service from 2024-08-11, full from 2024-09-21 [S14].
- Result: FY26 ridership over 12.5M; average weekday above 40,000 (+36.9% YoY); weekend ridership about 150% of pre-pandemic; overall ridership rose from 64.4% of pre-pandemic at the start of FY26 to 81.5% at year-end [S15].
- 2040 Long Range Service Vision (adopted 2019): about $23B programme; grade separations quoted at $7.8B, $9.4B, or $8.5-11.1B depending on document; terminal improvements $3.3B; 2040 opex about $370M/yr [S25].
- Crossings: 41 vehicular + 2 ped/bike at-grade crossings on Caltrain-owned track; 28 more on UP track Tamien to Gilroy [S14][S26].
- Grade-separation cost inflation: Burlingame Broadway went from $151.9M (2023 state award listing, UNVERIFIED) to $316M (UNVERIFIED) to $615M / $653M (March 2025 estimate for a 2026 / 2028 construction start) to $662M at 65% design for the pared-down no-station, no-shoofly version (June 2026); Caltrain also quotes about $380M for bare construction; construction no earlier than Nov 2028. Rengstorff (Mountain View) is in design as a road underpass. SMCTA rewrote its grade-separation funding policy in Feb 2026 in response to costs [S26].
- Game relevance: grade separations are the cheap-looking, politically slow unit of work; good "red tape" content.

### 3.5 Dumbarton Rail Corridor

- Owner: SamTrans (bought the ROW for $6.9M in 1994) [S27].
- Rail concept: 20.5 mi, Union City to Redwood City via the 1910 Dumbarton rail bridge; proposed stations Union City, Fremont Centerville, Newark, Willow Road (Meta), Marsh/North Fair Oaks, Redwood City [S27].
- Cost history: $50M (1998), $129M (2001), $313M to $600M (2006), $700M (2010), $1.6B phased (2017) [S27].
- Bridge: swing spans in poor condition, foundations degraded (2008), trestle fires 1998 and 2019; replacement needed [S27].
- Facebook/Plenary "Cross Bay Transit Partners" (2018), Facebook floated $1B (2019), wound down 2020-21 [S27].
- Current: "Reimagine Dumbarton" feasibility study (fall 2025 to spring 2027) for a 5-mile zero-emission busway + trail, Redwood City Transit Center to University Ave in East Palo Alto; 9 bus stations; construction after 2031; "does not preclude" future rail; no cost published. Advocates object to dropping rail [S9][S28].
- Approx. coordinates (UNVERIFIED): Redwood City Caltrain 37.4854, -122.2319; Willow Rd/Meta 37.4800, -122.1500; west bridge approach 37.4900, -122.1300; Newark 37.5200, -122.0400; Union City BART 37.5906, -122.0173.

### 3.6 Valley Link

- Sponsor: Tri-Valley - San Joaquin Valley Regional Rail Authority (AB 758, 2017); SJRRC to operate [S29].
- Alignment: Dublin/Pleasanton BART east in the I-580 median, former transcontinental ROW over Altamont Pass, to Mountain House; long term to North Lathrop (ACE). 26 mi to Mountain House. Stations: Dublin/Pleasanton, Isabel, Southfront Rd, (Vasco Rd), Mountain House [S29].
- Technology: hydrogen multiple units, switched to battery-electric in 2025 [S29].
- Cost: $1.88-3.21B to North Lathrop (2019); phase 1 at $4.4B by 2025. Board truncated phase 1 to Dublin/Pleasanton to Vasco Rd (June 2025) [S29].
- Schedule: 2027-28 originally; 2035 (2024); construction "as early as 2028". PA&ED late; CTC deadline extension to 2027-06-30 requested May 2026 [S29][S30].
- Origin: BART board rejected a Livermore BART extension in 2018 [S29].
- Approx. coordinates (UNVERIFIED): Dublin/Pleasanton 37.7017, -121.8992; Isabel 37.700, -121.815; Vasco Rd 37.700, -121.720; Mountain House 37.74, -121.54; North Lathrop 37.83, -121.28.

### 3.7 Capitol Corridor South Bay Connect

- Sponsor: CCJPA. Moves Capitol Corridor from the UP Niles Subdivision to the UP Coast Subdivision between Oakland and Newark; new Ardenwood station at the SR-84 park-and-ride (Fremont/Newark border); no added frequency [S31].
- Cost: $700-900M (June 2024 fact sheet) [S31]. An older MTC appendix figure of $237M also circulates; treat as superseded [S28].
- Status: Final EIR certified, NOD posted 2025-03-27 [S28]. Completion "around 2030" is forum hearsay, UNVERIFIED.
- Game relevance: Ardenwood is the natural east anchor for any Dumbarton crossing.
- Approx. coordinates (UNVERIFIED): Ardenwood 37.556, -122.050; Oakland Coliseum 37.7537, -122.1969; Newark junction 37.520, -122.040.

### 3.8 SMART extensions

- Windsor opened 2025-05-31. Healdsburg extension: agency page says "roughly nine miles of track", but the route is about 5 mi (KQED: "nearly five miles"; OSM straight line Windsor depot to Healdsburg depot site is 7.9 km); $269M in grants secured, design Sept 2025 to Dec 2026, construction Jan 2027 to Nov 2028, service Dec 2028 [S32]. $190.5M contract to Stacy and Witbeck/Herzog [S28]. Wikipedia cites a March 2026 groundbreaking under a $21.7M early contract; agency and KQED say main construction from spring 2027.
- Cloverdale (about 18 mi further) unfunded; Geyserville platform approved by SMART board [S28][S32].
- Derived: $269M / about 8 km = about $33M/km (single-track surface on existing ROW; was $19M/km on the 9 mi figure).
- Approx. coordinates (UNVERIFIED): Larkspur 37.946, -122.509; Windsor 38.547, -122.816; Healdsburg 38.611, -122.869; Cloverdale 38.805, -123.017.

### 3.9 Muni: Central Subway, North Beach/Fisherman's Wharf, Geary/19th, train control

Central Subway (built):

- 1.7 mi incl. 0.4 mi tail tracks; twin TBM bores, 20 ft diameter, 8,500 ft each; Chinatown station by SEM; stations 4th and Brannan (surface), Yerba Buena/Moscone, Union Square/Market St, Chinatown [S33].
- Budget $1.578B, final about $1.891B; FTA $942.2M. Target Dec 2018, full service 2023-01-07 [S33].
- Early ridership "tepid": about 3,000 daily boardings at the three subway stations (Feb 2023) [S33].
- Derived: $1.891B / 2.74 km = about $690M/km.

Extension north:

- TBMs were driven past Chinatown and extracted at Columbus and Powell (Pagoda Palace site), so tunnels already reach North Beach [S33].
- Older estimates: $440M to $1.4B for North Beach + Fisherman's Wharf [S33].
- 2026: SFCTA/SFMTA relaunched as a one-station "Central Subway North Beach Extension Study", $650,700 budget, mid-2026 to mid-2028, final report by May 2028. SFMTA is in a fiscal crisis [S28].
- Approx. coordinates (UNVERIFIED): Chinatown 37.7947, -122.4081; Washington Square 37.8005, -122.4101; Fisherman's Wharf 37.8080, -122.4177.

Geary/19th Ave Subway (SFCTA Strategic Case, board approved June 2026):

- About 10 mi dual-track subway under Geary Blvd and 19th Ave to the Daly City BART area; "approximately 5-6 stations" in the executive summary while the body assumes 0.5-1 mi stop spacing: internally inconsistent, check before modelling [S8].
- $20-30B in 2026$, excluding support facilities, ROW, financing, escalation [S8].
- Ridership: 162,000-182,000 daily boardings SF-only; 310,000-314,000 with a regional connection [S8].
- Technology undecided: BART gauge, standard-gauge regional rail (through-run with Link21), or automated light metro [S8].
- Derived: $20-30B / 16 km = about $1.25-1.9B/km.
- Approx. coordinates (UNVERIFIED): Geary/Van Ness 37.7855, -122.4215; Geary/Masonic 37.7823, -122.4470; Geary/Park Presidio 37.7806, -122.4723; 19th/Judah 37.7620, -122.4770; SF State 37.7219, -122.4750; Daly City BART 37.7061, -122.4690.

Muni Metro modernisation:

- Train Control Upgrade Project: Hitachi CBTC contract about $212M (Jan 2025), support options up to $114M (2032-42) and $238M (2042-52), programme about $700M, phased 2028 to about 2032-34; up to 20% capacity gain [S28].
- Replaces the 1990s ATCS (the "floppy disk" system) and extends control to surface running [S28].

### 3.10 VTA: Eastridge to BART Regional Connector (EBRC)

- Light rail from Alum Rock to Eastridge Transit Center, elevated in the Capitol Expressway median; elevated Story Rd station, at-grade Eastridge terminal [S34].
- Cost $653M total; construction contract about $437M (MCM/RailWorks, 2024) [S28].
- Under construction; about 40% complete Sept 2025 (UNVERIFIED); construction complete 2028, revenue service 2029 [S28][S34].
- Length 2.4 mi [S28]. Derived: about $170M/km (elevated light rail).
- Approx. coordinates (UNVERIFIED): Alum Rock 37.366, -121.828; Story 37.336, -121.819; Eastridge 37.327, -121.811.

### 3.11 Diridon station and SJC airport connector

- Diridon: partner agencies (Caltrain, VTA, San José, CHSRA, MTC) selected the at-grade alternative on 2025-05-21; elevated option was up to $4B more; earlier range $2.5-13B (2023$); environmental review 3-4 years; a 2026 CEQA exemption bill could cut about a year [S28].
- Airport connector: Diridon to SJC Terminal B with autonomous pods on a dedicated guideway (Glydways + Plenary, P3); council moved it to Phase 2a in March 2025; $500M+; a 2024 CTC slide listed 4.4 mi, 9 stations, 2029 opening; council sceptical on ridership and wants outside funding. No 2026 update found [S28].
- Approx. coordinates (UNVERIFIED): Diridon 37.3297, -121.9020; SJC Terminal B 37.3639, -121.9289.

### 3.12 California High-Speed Rail (2026 Business Plan, revised draft 2026-05-28, board approved about 2026-06-01)

| Scope (YOE) | 2026 plan | Notes | Src |
|---|---|---|---|
| Merced to Bakersfield (171 mi), total incl. programme support and bookends | $35.66B | $15.04B spent through Feb 2026; service 2033 | [S6][S7] |
| SF to Gilroy to Bakersfield | $61.23B | Launch about 2039 | [S6][S35] |
| SF to Palmdale | $96.87B | | [S6] |
| Phase 1 SF to LA/Anaheim, optimised | $126.08B | Completion 2039, full service 2040 | [S6] |
| Phase 1 full dedicated buildout, bottom-up re-estimate | $231.3B | The 2024 plan scope repriced | [S6] |

Line items that matter for Bay Area scenarios [S6]:

- SF to Gilroy "blended approach": $1.29B (was $15.14B in the 2024 plan). HSR rides Caltrain; almost no new Peninsula infrastructure.
- San José to Gilroy: not in the totals. "Shared benefit" electrification/upgrade of the UP corridor, $2-5B (table value $2.03B).
- Gilroy to Central Valley Wye (Pacheco Pass): $18.87B. Tunnels: 13.5 mi main bore plus about 1.5 mi second tunnel (secondary sources) [S28]. Initial single track with civil works sized for double is reported for the plan as a whole by [S35]; not found in the plan text for Pacheco specifically (UNVERIFIED).
- Palmdale to Burbank dedicated alignment would need 26 mi of tunnel; plan substitutes upgraded Metrolink Antelope Valley Line.

Status and politics:

- Central Valley: 81 guideway miles and 61 structures complete and ready for rail on the 119-mile segment; southern railhead in Kern County finished; track laying about to start [S6].
- Funding: $1B/yr cap-and-invest 2030-2045 (SB 840, Sept 2025); federal government rescinded $4B in July 2025 and CHSRA stopped contesting in Dec 2025; about $90B of Phase 1 unfunded (Table 0.0 net cost $90.41B = $126.08B less the $35.7B Merced to Bakersfield funded from cap-and-invest) [S6]; P3 partner solicitation Dec 2025 [S36][S7].
- LAO: funding likely insufficient even for Merced to Bakersfield once borrowing costs are counted (about $2B gap) [S36]. Inspector General criticised the plan as incomplete [S28].
- CHSRA asks the Legislature for CEQA and permitting streamlining, binding third-party review timelines, dedicated court resources, land-use authority near stations, sales-tax exemption on materials, and repeal of the SB 198 Merced to Bakersfield-first rule [S36]. This is a ready-made policy tree.
- Approx. coordinates (UNVERIFIED): Gilroy 37.0045, -121.5666; Pacheco tunnel west portal 37.02, -121.33; east portal 37.06, -121.10; Merced 37.307, -120.482.

### 3.13 ACE / Altamont

- Valley Rail: extension south to Ceres then Merced and north to Sacramento (Natomas); $500.5M state award in 2018; Ceres originally 2023, now 2026 or later; Merced 2030 [S18].
- Altamont Corridor Vision: $9.7B programme; shared tunnel under Altamont Pass with Valley Link sought, unfunded [S18]. A local column cites a 3.5-mile tunnel and 125 mph Tracy to Livermore: UNVERIFIED [S28].

### 3.14 Built projects useful as cost calibration

| Project | Length | Cost | Opened | Derived $/km | Type | Src |
|---|---|---|---|---|---|---|
| eBART | 9.1 mi | $463M | 2018 | about $32M | DMU in freeway median | [S12] |
| Oakland Airport Connector | 3.2 mi | $484M | 2014 | about $94M | elevated cable AGT | [S13] |
| BART Berryessa (SVBX Phase I) | 10 mi | $2.3B | 2020 | about $144M | surface/trench heavy rail | [S23] |
| Central Subway | 1.7 mi | $1.891B | 2022/23 | about $690M | twin-bore LRT subway | [S33] |
| Caltrain electrification | about 51 mi | $2.44B | 2024 | about $30M | OCS + EMUs, no civil | [S14] |

OAC controversy: lost $70M federal money in 2009 over a Title VI equity analysis failure; fare $6 [S13].

### 3.15 Ferries

- WETA 2050 Service Vision adopted; Tier 1 new routes: Berkeley, Mission Bay, Redwood City, Treasure Island; target 14 routes; later Carquinez/Foster City/Marin links; electric vessel programme with deliveries from 2027 [S28].
- Current status of each terminal not confirmed in this pass.

### 3.16 2026 funding measures

- Measure RTM (authorised by SB 63, citizen-initiative route, qualified 2026-07-01 with 305,000+ signatures vs 186,000 required): 0.5% sales tax in Alameda, Contra Costa, San Mateo, Santa Clara; 1.0% in San Francisco; 14 years; about $1B/yr for operations at BART, Muni, AC Transit, Caltrain and others [S1][S28].
- Early returns: 61.5% yes. Article does not state the passage threshold (simple majority for a citizen initiative is my understanding, UNVERIFIED). Money flows from 2027 after an SB 63 efficiency review [S1].
- SF Prop H: parcel tax for Muni, 15 years, about $184M/yr; 72.5% yes in early returns [S1].
- Capital expansion is not funded by either. In-game: the measure prevents the "death spiral" fail state; it does not pay for tunnels.

## 4. Cost spread summary (derived, sponsor numbers, mixed price years)

| Project | $/km | Mode of construction |
|---|---|---|
| Caltrain electrification | about $30M | wires and trains only |
| eBART | about $32M | median DMU |
| SMART Healdsburg | about $33M | single-track surface, existing ROW |
| OAC | about $94M | elevated AGT |
| BART Berryessa | about $144M | surface/trench |
| VTA EBRC | about $170M | elevated LRT |
| Central Subway | about $690M | bored LRT subway |
| BSV Phase II | about $1.32B | 53 ft single bore, deep stations |
| Geary/19th | about $1.25-1.9B | subway, concept |
| The Portal | about $3.6B | cut-and-cover + mined, 3-track, downtown |

- Transit Costs Project database average: $252M/km (PPP, 2025$), all projects worldwide [S37]. Polish benchmark values were not pulled here (their page did not expose per-project rows); take them from the cost research doc or the TCP spreadsheet [S37].
- Implication: status-quo Bay Area subway is roughly 3x to 14x the global average. "Several times Polish prices" is conservative for the worst cases.

## 5. Employer campuses and anchors (fantasy-line targets)

| Anchor | Approx. lat, lon | Headcount / scale | Nearest rail today | Src |
|---|---|---|---|---|
| Googleplex, Mountain View | 37.422, -122.084 (wiki) | Site headcount not published in sources found; 3.5M sq ft in Mountain View (2012) | Mountain View Caltrain/VTA about 3 km S (UNVERIFIED) | [S38] |
| Google Bay View (Moffett) | 37.421, -122.064 (UNVERIFIED) | 1.1M sq ft campus | none | [S38] |
| Meta HQ, Menlo Park | 37.485, -122.148 (wiki) | Company total 66,775 (Sept 2026); campus count not found | Dumbarton ROW adjacent; Menlo Park Caltrain about 4 km (UNVERIFIED) | [S39][S27] |
| Oracle, Redwood Shores | 37.529, -122.266 (UNVERIFIED) | HQ moved to Austin (2020), then Nashville announced (2024); company total about 141,000 (mid-2026); campus count not found | San Carlos/Belmont Caltrain about 3 km (UNVERIFIED) | [S40] |
| Apple Park, Cupertino | 37.3349, -122.0090 (wiki) | Built for 12,000+ (infobox: 15,000+); about 11,000+ parking spaces; criticised for poor transit access | none; Sunnyvale/Lawrence Caltrain about 5-6 km (UNVERIFIED) | [S41] |
| Nvidia HQ, Santa Clara | 37.371, -121.967 (UNVERIFIED) | Company total 42,000 (FY26); campus count not found | Lawrence Caltrain about 2 km (UNVERIFIED) | [S42] |
| Stanford | 37.4275, -122.1697 (UNVERIFIED) | 17,314 students, 2,402 faculty (autumn 2025); staff count not found | Palo Alto Caltrain at campus edge | [S43] |
| Salesforce Tower / Transit Center | 37.7897, -122.3966 (UNVERIFIED) | not collected | Portal terminus; Embarcadero/Montgomery BART | [S2] |
| Genentech, South San Francisco | 37.657, -122.379 (wiki) | about 12,100 employees (2026) | SSF Caltrain about 2 km, SSF ferry (UNVERIFIED) | [S44] |
| Tesla Fremont | 37.495, -121.9425 (wiki) | about 20,000-22,000 (2022-23) | Warm Springs/South Fremont BART adjacent | [S45] |
| SFO | 37.616, -122.392 (UNVERIFIED) | not collected | BART spur; Millbrae Caltrain | n/a |
| OAK | 37.713, -122.213 (UNVERIFIED) | not collected | OAC | [S13] |
| SJC | 37.364, -121.929 (UNVERIFIED) | not collected | none (bus to Metro/Airport LRT, Santa Clara Caltrain) | [S28] |

Observations for line design:

- Meta sits on the Dumbarton ROW; Googleplex/Bay View, Apple Park, Nvidia and Oracle are each 2-6 km off the Caltrain spine. A bayside "campus loop" (Redwood Shores, Meta, Bay View, Googleplex, Nvidia, SJC) and a Cupertino spur are the obvious fantasy alignments. Distances above are UNVERIFIED; compute from OSM.
- Oracle's Redwood Shores relevance is shrinking (HQ left). Keep it per the owner's brief but flag in scenario text.
- Site-level headcounts are mostly unpublished; use LEHD LODES job counts per census block as the demand source rather than employer numbers (not researched here; see Open questions).

## 6. Recommendations for the game

### 6.1 Campaign ordering (11 scenarios)

| # | Scenario | Real basis | New mechanic taught | Status-quo budget / date to beat |
|---|---|---|---|---|
| 0 | Tutorial: North Beach stub | Central Subway tunnels already reach Columbus/Powell | Dig a station box, fit out, open; one TBM-less job | $440M-1.4B older range [S33] |
| 1 | The Portal | 4th and King to Salesforce TC, 2.1 km | Cut-and-cover vs mined under streets, utilities, existing trainbox as goal | $7.57B, 2036 [S2] |
| 2 | Pennsylvania Avenue Extension | PAX twin bore, 1.7-2.4 km | First TBM launch, portal placement, removing two grade crossings | $2.0-2.5B [S21] |
| 3 | Peninsula grade separations | Caltrain's 41 crossings | Surface works, city-by-city permitting, repeatable units | Broadway alone $615M [S26] |
| 4 | Eastridge and the airport hop | VTA EBRC + SJC connector | Elevated guideway, light vs heavy modes | $653M / $500M+ [S28] |
| 5 | BART to Silicon Valley | BSVII | Big single bore vs twin bore decision, deep stations, contractor management | $12.75B, 2039 [S3] |
| 6 | Dumbarton crossing | Redwood City to Newark/Union City, Meta on route, Ardenwood tie-in | Water crossing (bridge rebuild vs tube), bay mud, wetlands permits | $1.6B (2017 phased) [S27] |
| 7 | Campus connector (fantasy) | Oracle, Meta, Bay View, Googleplex, Nvidia, Apple Park | Free-form alignment, employer co-funding, demand-driven routing | none; player-set |
| 8 | Geary/19th subway | SFCTA strategic case | Long urban subway, technology/gauge choice with network effects | $20-30B [S8] |
| 9 | Second transbay crossing | Link21 | Immersed tube vs deep bore under the Bay, gauge decision, through-running bonus | $18-30B (2023$) [S4] |
| 10 | Over Altamont | Valley Link + ACE shared tunnel | Mountain tunnel, megaregion commuters | $4.4B phase 1 [S29] |
| 11 | Endgame: High-Speed Rail to the Bay | Pacheco Pass tunnels + SJ to Gilroy + blended Peninsula | 13.5 mi tunnel, state-level politics, cash-flow from cap-and-invest | $18.9B Pacheco; $126B Phase 1 [S6] |

- Scenarios 1 and 2 share geometry; ship them as one map with two missions.
- Optional side missions: SMART to Healdsburg/Cloverdale (cheap surface rail, teaches that not everything needs a tunnel), ferry terminals, Muni train control (systems-only upgrade), South Bay Connect.
- Score each scenario against the real sponsor budget and opening date shown above; the "Polish price" target is the gold medal.

### 6.2 Systems to model, grounded in the catalog

- Gauge/power compatibility as a hard rule: BART track cannot accept Caltrain trains and vice versa. Link21 and Geary both hinge on this choice [S4][S8].
- Funding gates: FTA Engineering phase, then FFGA only when all non-federal money is committed (Portal and BSVII are both stuck here) [S2][S3]. Model as a milestone that unlocks the federal share.
- Delivery method as a player choice: PDB, CMGC, DBB with different risk/cost profiles [S2][S3]. Contractor near-break-up and renegotiation to target price (KST) as an event.
- Idle TBM: BSVII's machine has sat in storage for years [S3]. Charge storage cost per month until launch.
- Red-tape tree taken straight from CHSRA's legislative asks: CEQA streamlining, binding third-party review timelines, dedicated court capacity, station-area land-use authority, materials sales-tax exemption [S36]. Add Title VI analysis failure (OAC lost $70M) as a risk card [S13].
- Scope-cut options that real agencies used: single track in double-track civil works (CHSRA plan-wide per [S35]; Pacheco-specific UNVERIFIED), blended operations on existing track (Peninsula, Antelope Valley), station deletion (Burlingame Broadway), phase truncation (Valley Link), mode downgrade (Dumbarton rail to bus) [S6][S26][S29][S9].
- Operations money is separate from capital: RTM/Prop H keep service running and should be a prerequisite, not a build budget [S1].

### 6.3 Data handling

- Encode each project as a scenario record: id, sponsor, status, polyline (from OSM where built, hand-traced where planned), stations, sponsor cost + price basis + year, sponsor date, sources. Keep price basis explicit.
- Planned alignments are not in OSM. Trace from EIR figures (Portal SEIS/SEIR, BSVII SEIS, South Bay Connect EIR, Valley Link EIR, CHSRA project-section EIRs). Link21 and Geary have no alignment: author plausible ones and label them fictional.

## 7. Open questions

- RTM and Prop H certified results and county splits; RTM passage threshold.
- The Portal after Aug 2026: outcome of the FTA environmental re-evaluation, PDB contractor selection, any state funding award. Exact tunnel lengths by method (1.3 vs 1.5 vs 2.2 mi figures conflict).
- BSVII: revised cost estimate promised to FTA in Q3 2026 (not public as of the June 2026 PMOC report); tunnel depth and station depths; 45 ft vs 53 ft diameter.
- Link21: any official 2026 concept alignment or East Bay landing; a May 2026 CCJPA press release is reported only second-hand.
- CHSRA: final adopted plan vs the 2026-05-28 revised draft used here; Pacheco tunnel lengths and portals from the San José to Merced EIR; SF to San José section details (Brisbane light maintenance facility, passing tracks) now that blended scope is cut to $1.29B.
- Dumbarton: preferred busway alternative (due late 2026) and cost; whether rail returns.
- Campus-level headcounts (Google Mountain View, Meta Menlo Park, Oracle Redwood Shores, Nvidia Santa Clara, Stanford staff, Salesforce SF) and airport passenger volumes: not obtained. Better: use LEHD LODES job data; needs its own research item.
- SMART Healdsburg exact route length (agency "nine miles of track" vs about 5 mi route).
- SamTrans and Golden Gate ridership.
- Ferry terminal status (Treasure Island, Mission Bay, Berkeley, Redwood City).
- SJC connector 2026 status.
- Polish and other European per-km benchmarks to pair with section 4: belongs to the cost research doc.
- All coordinates need OSM resolution.

## Sources

- [S1] KQED, 2026-11-04 (updated 11-06), RTM and Prop H results: http://www.kqed.org/news/12107133/death-spiral-averted-bay-area-transit-taxes-rtm-and-prop-h-declare-victory
- [S2] SFCTA CAC memo, The Portal FY2026 allocation, 2026-01-28: https://www.sfcta.org/sites/default/files/2026-01/SFCTA_CAC_Item9_TJPAPortalProjectFiscalYear2026MEMO_2026-01-28.pdf
- [S3] FTA PMOC monthly monitoring report, BSVII, June 2026: https://vtabart.org/wp-content/uploads/2026/08/2026-06-CA-BSVII-OP25-ProjectMonitoringReport-1-1.pdf
- [S4] Link21 FAQ: https://link21program.org/en/about/faqs
- [S5] Link21 planning activities: https://link21program.org/en/program/planning-activities ; BART release on standard-gauge vote: https://www.bart.gov/node/44176
- [S6] CHSRA 2026 Business Plan, revised draft 2026-05-28 (Ch. 2, Appendix B tables B.1-B.5): https://themercedfocus.org/wp-content/uploads/2026/06/2026-Revised-Draft-Business-Plan-052826-A11Y.pdf
- [S7] KALW, 2026-06-03, business plan approved: https://www.kalw.org/bay-area-news/2026-06-03/high-speed-rail-business-plan-approved-envisions-passenger-service-by-2033
- [S8] SFCTA, Geary/19th Ave Subway and Regional Connections Study Strategic Case, final report 2026-06-23: https://www.sfcta.org/sites/default/files/2026-06/SFCTA_Geary-19th_Subway_and_Regional_Connections_Study_Final_Report_2026-06-23.pdf
- [S9] SamTrans, Reimagine Dumbarton: https://www.samtrans.com/projects/reimagine-dumbarton
- [S10] Wikipedia, Bay Area Rapid Transit: https://en.wikipedia.org/wiki/Bay_Area_Rapid_Transit
- [S11] BART monthly ridership snapshot Sept 2026: https://www.bart.gov/sites/default/files/2026-10/202609%20Monthly%20Ridership%20Snapshot.pdf ; BART June 2026 release: https://www.bart.gov/node/45516 ; SFMTA Sept 2026 ridership: https://www.sfmta.com/en/node/45991
- [S12] Wikipedia, eBART: https://en.wikipedia.org/wiki/EBART
- [S13] Wikipedia, Oakland Airport Connector: https://en.wikipedia.org/wiki/Oakland_Airport_Connector
- [S14] Wikipedia, Caltrain: https://en.wikipedia.org/wiki/Caltrain
- [S15] Caltrain FY26 ridership: https://www.caltrain.com/news/caltrain-ridership-remains-strong-through-fy26
- [S16] Wikipedia, Muni Metro: https://en.wikipedia.org/wiki/Muni_Metro
- [S17] VTA 2025 TSMP highlights: https://www.vta.org/programs/congestion-management-agency/2025-tsmp/highlights ; VTA light rail (Wikipedia): https://en.wikipedia.org/wiki/VTA_light_rail ; SMART GM report 2026-07-15: https://sonomamarintrain.org/sites/default/files/Documents/GM%20Report%207.15.26.pdf ; Amtrak FY25 fact sheet: https://media.amtrak.com/wp-content/uploads/2025/11/FY25-Year-End-Ridership-Fact-Sheet.pdf ; SF Bay Ferry record release: https://sanfranciscobayferry.com/all-time-ridership-record/ ; AC Transit ridership: https://www.actransit.org/ridership
- [S18] Wikipedia, Altamont Corridor Express: https://en.wikipedia.org/wiki/Altamont_Corridor_Express
- [S19] Wikipedia, Transbay Tube: https://en.wikipedia.org/wiki/Transbay_Tube
- [S20] Wikipedia, The Portal (San Francisco): https://en.wikipedia.org/wiki/The_Portal_(San_Francisco) ; TJPA about page: https://www.tjpa.org/portaldtx/about-portal
- [S21] SFCTA PAX Project Initiation Report (2022): https://www.sfcta.org/sites/default/files/2022-06/Item%206%20-%20Pennsylvania%20Avenue%20Extension%20Project%20Initiation%20Report.pdf ; PAX Bridging Study contract memo 2026-03-25: https://www.sfcta.org/sites/default/files/2026-03/SFCTA_CAC_Item7_PennsylvaniaAveExtensionContractAwardMEMO_2026-03-25.pdf
- [S22] Link21 concept exploration: https://www.Link21Program.org/node/394
- [S23] Wikipedia, Silicon Valley BART extension: https://en.wikipedia.org/wiki/Silicon_Valley_BART_extension
- [S24] ENR, single-bore retained: https://www.enr.com/articles/61798-single-bore-tunnel-method-chosen-for-bart-silicon-valley-phase-ii ; ABC7 Dec 2025: https://abc7news.com/post/silicon-valley-bart-extension-construction-remains-time-budget-west-portal-site/18265543/ ; Santa Clara County civil grand jury report: https://santaclara.courts.ca.gov/system/files/civil/vtas-management-and-oversight-bart-silicon-valley-phase-ii.pdf
- [S25] Caltrain Long Range Service Vision: https://www.caltrain.com/projects/business-plan/caltrain-2040/long-range-service-vision
- [S26] Caltrain Burlingame Broadway project: https://www.caltrain.com/projects/burlingame-broadway-grade-separation-project ; Rep. Mullin release 2026-06-09: https://kevinmullin.house.gov/2026/06/09/burlingame-broadway-rail-crossing-plan-gets-funding-boost/ ; SMCTA grade separation programme: https://www.smcta.com/funding-programs/grade-separation
- [S27] Wikipedia, Dumbarton Rail Corridor: https://en.wikipedia.org/wiki/Dumbarton_Rail_Corridor
- [S28] Search-result summaries only (page not read in full; treat as secondary): Streetsblog on Dumbarton https://cal.streetsblog.org/2026/01/22/samtrans-survey-abandons-dumbarton-rail ; South Bay Connect CEQAnet https://ceqanet.lci.ca.gov/2020060655/8 ; KQED on SMART Healdsburg https://www.kqed.org/news/12105834/smart-awards-190-million-contract-for-healdsburg-extension-seeks-input-on-new-station ; SFCTA North Beach study memo https://www.sfcta.org/sites/default/files/2026-06/SFCTA_Board_Item9_CentralSubwayNorthBeachExtensionStudyMEMO_2026-06-23.pdf ; SFMTA/Hitachi train control https://www.sfmta.com/en/node/43725 ; ENR on EBRC contract https://www.enr.com/articles/58311-mcm-railworks-wins-653m-california-light-rail-extension ; Diridon updates https://www.diridonsj.org/project-updates ; SJC connector https://sanjosespotlight.com/san-jose-officials-question-feasibility-cost-of-autonomous-transit-airport-connector-sjc-diridon-train-station/ ; Pacheco tunnels https://sfist.com/2022/03/01/13-5-mile-tunnel-drives-up-cost-estimate-for-bay-area-high-speed-rail-link ; OIG review of 2026 plan https://kmph.com/news/local/inspector-general-finds-california-high-speed-rail-business-plan-incomplete ; WETA 2050 vision https://sanfranciscobayferry.com/service-vision-and-business-plan/ ; RTM qualification https://contracosta.news/2026/07/01/connect-bay-area-ballot-measure-to-save-public-transit-officially-qualifies-for-november-2026-election/ ; Altamont column https://www.mantecabulletin.com/opinion/local-columns/zipping-over-altamont-at-125-mph-but-first-get-ready-to-hop-aboard-ace-in-downtown-manteca
- [S29] Wikipedia, Valley Link: https://en.wikipedia.org/wiki/Valley_Link
- [S30] CTC May 2026 item (Valley Link deadline extension): https://catc.ca.gov/-/media/ctc-media/documents/ctc-meetings/2026/2026-05/136-2-8d15-a11y.pdf
- [S31] South Bay Connect fact sheet, June 2024: https://www.southbayconnect.com/documents/SBC_FactSheet_June2024.pdf
- [S32] SMART Healdsburg extension: https://www.sonomamarintrain.org/healdsburg
- [S33] Wikipedia, Central Subway (San Francisco): https://en.wikipedia.org/wiki/Central_Subway_(San_Francisco)
- [S34] VTA EBRC project page: https://www.vta.org/projects/eastridge-bart-regional-connector
- [S35] High Speed Rail Alliance summary of the 2026 plan: https://www.hsrail.org/blog/california-high-speed-rail-pitches-new-path-forward-with-2026-business-plan/
- [S36] LAO handout, Oversight of the CA High-Speed Rail Project, 2026-03-02: https://lao.ca.gov/handouts/transportation/2026/Oversight-of-the-CA-High-Speed-Rail-Project-030226.pdf
- [S37] Transit Costs Project, data page and spreadsheet: https://transitcosts.com/new-data/ ; https://docs.google.com/spreadsheets/d/16GoHcbW-eVzHUUP_XCWVXS1s_i3ZBnmZh4kvdSX7muU/edit#gid=1828904092
- [S38] Wikipedia, Googleplex: https://en.wikipedia.org/wiki/Googleplex
- [S39] Wikipedia, Meta Platforms: https://en.wikipedia.org/wiki/Meta_Platforms
- [S40] Wikipedia, Oracle Corporation: https://en.wikipedia.org/wiki/Oracle_Corporation
- [S41] Wikipedia, Apple Park: https://en.wikipedia.org/wiki/Apple_Park
- [S42] Wikipedia, Nvidia: https://en.wikipedia.org/wiki/Nvidia
- [S43] Stanford Facts: https://facts.stanford.edu/
- [S44] Wikipedia, Genentech: https://en.wikipedia.org/wiki/Genentech
- [S45] Wikipedia, Tesla Fremont Factory: https://en.wikipedia.org/wiki/Tesla_Fremont_Factory

## Corrections (2026-11-09 fact-check)

- BSVII / KST: the doc said VTA ended (terminated) the KST tunnel contract. The off-ramp was authorised 2025-06-27 but not executed; an amended and restated target-price agreement was approved June 2026 (cap about $3.55B). Source: [S3] sections 1.2-1.3 and contract history; VTA board release via https://www.masstransitmag.com/rail/infrastructure/press-release/55249807/
- BSVII twin-bore "+$600M" marked UNVERIFIED: absent from the cited ENR and ABC7 articles; the $400-600M in [S3] is the cost of re-procuring the tunnel contract.
- Caltrain FY26: 12.6M / +38% / about 40,800 replaced with "over 12.5M", weekday "+36.9%", "above 40,000", and 64.4% to 81.5% of pre-pandemic. Source: [S15].
- Burlingame Broadway: $615M was the March 2025 figure, not June 2026; current is $662M at 65% design. $151.9M and $316M not found in cited sources, marked UNVERIFIED. Source: [S26] Caltrain project page.
- SMART Healdsburg: route is about 5 mi, not 9 (agency counts "miles of track"); derived cost changed from $19M/km to about $33M/km, so it is no longer the cheapest row in section 4. Sources: KQED in [S28]; Nominatim lookup of both station sites. Windsor opening (2025-05-31), 48 mi, 14 stations, standard gauge, DMU filled in from https://en.wikipedia.org/wiki/Sonoma%E2%80%93Marin_Area_Rail_Transit
- VTA light rail: 60 stations (not 59), standard gauge, 750 V DC. Source: Wikipedia in [S17].
- VTA EBRC: revenue service 2029 (construction complete 2028), not 2028; 2.4 mi confirmed. Source: ENR in [S28]. Note Wikipedia lists $453M, conflicting with ENR's $653M total.
- CHSRA: "$87B unfunded for Phase 1" was a misread ($87B is the LAO-quoted 2025 cost of SF to Palmdale); plan Table 0.0 gives $90.41B net cost. Source: [S6], [S36].
- CHSRA Pacheco single track: not in the plan text for that segment; plan-wide per [S35]. Marked UNVERIFIED.
- BART FY26 and Sept 2026 ridership could not be re-fetched (bart.gov 403); marked UNVERIFIED.
- Confirmed against primary sources, no change: Portal figures [S2]; BSVII budget, dates, bore, TBM, funding table [S3]; CHSRA cost tables [S6]; Geary/19th cost and length [S8]; Link21 FAQ figures [S4]; RTM/Prop H early returns [S1]; Dumbarton busway [S9]; Transit Costs Project $252M/km [S37]. Web search budget was exhausted, so the RTM passage threshold and certified results remain open.
