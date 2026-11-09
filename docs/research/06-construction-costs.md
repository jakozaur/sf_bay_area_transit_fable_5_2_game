# 06. Construction costs: Bay Area vs Poland vs world, TBM tech, game cost model

Research date: 2026-11-09. All "derived" figures are my arithmetic on cited inputs. "UNVERIFIED" means I could not confirm against a primary source in this pass (the session web-search budget ran out before sections 2.4, 3.3 and 6 were fully closed; gaps are listed in Open questions).

Source shorthand:
- **TCP-DB**: Transit Costs Project database (NYU Marron), Google Sheet linked from https://transitcosts.com/data/ (sheet: https://docs.google.com/spreadsheets/d/16GoHcbW-eVzHUUP_XCWVXS1s_i3ZBnmZh4kvdSX7muU/). Downloaded 2026-11-09, 1,152 usable rows. Columns used: `Cost/km (Millions)` (PPP USD at construction midpoint) and `Cost/km (2025 dollars)` (same, inflated with US CPI). Costs exclude rolling stock in principle; exceptions flagged.
- **TCP-FR**: TCP final report, https://transitcosts.com/transit-costs-study-final-report/
- **TCP-PRES**: TCP conclusion slides, https://pedestrianobservations.com/wp-content/uploads/2023/03/transit-costs-project-conclusion-presentation.pdf
- **HS2-TG**: "HS2: A guide to tunnelling costs" (2Q2011 GBP), https://assets.publishing.service.gov.uk/media/5a819fe740f0b623026984f5/HS2_Guide_to_Tunnelling_Costs.pdf
- **ECA-2018**: European Court of Auditors Special Report 19/2018 on HSR, http://op.europa.eu/webpub/eca/special-reports/high-speed-rail-19-2018/en/

## 1. Headline numbers

| Benchmark (urban rail, >=80% tunnel) | n | km | Median $M/km (2025 PPP) | Length-weighted $M/km |
|---|---|---|---|---|
| United States | 12 | 50 | 1,088 | 1,425 |
| Poland | 5 | 22 | 256 | 383 |
| Poland excluding M2 central section (derived) | 4 | 16 | ~252 | ~248 |
| Spain | 13 | 111 | 148 | 173 |
| Italy | 29 | 149 | 178 | 219 |
| South Korea | 25 | 458 | 147 | 141 |
| Turkey | 24 | 340 | 140 | 172 |
| France | 16 | 258 | 281 | 326 |
| Germany | 20 | 61 | 296 | 435 |
| China | 368 | 8,761 | 235 | 249 |
| Sweden | 5 | 35 | 353 | 367 |
| Whole database (all tunnel shares) | 1,152 | 23,759 | 223 | 248 |

Source: derived from TCP-DB. TCP's own published weighted average is $252.28M/km over 20,809 km (https://transitcosts.com/new-data/).

- US tunnelled median / Poland tunnelled median = **4.3x**. US weighted / Poland-ex-central weighted = **5.7x**. This is the data backing for "Bay Area status quo = several times Polish prices".
- Bay Area specifically (section 3): Central Subway 3.3x, BART SV Phase II 5.0x, The Portal ~14x the Polish ~$250M/km line.
- TCP: US is the 6th most expensive country; the costlier ones build >65% tunnel, the US only 37% (TCP-FR). NYC is a "factor of 8 to 12" over a Italy/Sweden/Turkey composite baseline; "New York spends $2b/km where $200m/km is more normal" (TCP-PRES).
- Poland is not a cheap-tier builder (Spain/Korea/Turkey/Italy at $140-180M/km are). It is mid-table, roughly at the database median. "Polish prices" is a credible, non-utopian reform target; a later tech/policy tier can aim at Madrid/Seoul levels (~0.6x Poland).

### PPP vs market exchange rate (important for how the game labels money)

- TCP PPP factors for Poland: 0.557-0.576 USD per PLN (i.e. ~1.75-1.80 PLN per PPP-USD) for 2012-2020 midpoints (TCP-DB).
- OECD (page returned 403 on 2026-11-09, UNVERIFIED in the fact-check): PPP 1.99 PLN/USD and market rate 3.98 PLN/USD for 2023 (https://www.oecd.org/en/publications/oecd-economic-surveys-poland-2025_483d3bb9-en/full-report/basic-statistics-of-poland-2024_4b1812d4.html). CEIC reports an OECD-sourced PPP of 1.879 for 2023 (https://ceicdata.com/en/poland/exchange-rate-oecd-member-annual); the two do not match, treat PPP as 1.9-2.0.
- Market rate about 3.65 PLN/USD in Oct 2025 (https://www.ceicdata.com/en/indicator/poland/exchange-rate-against-usd).
- Consequence: a 350M PLN/km metro extension is ~$95M/km at market FX but ~$195M/km at TCP PPP and ~$250M/km in 2025 PPP dollars. At market FX the Bay Area gap roughly doubles (9-13x instead of 4-6x). Recommendation in section 8: run the game economy in 2025 PPP USD.

## 2. Poland

### 2.1 Warsaw Metro

| Section | Years | km | Stations | Cost (nominal PLN) | M PLN/km (derived) | $M/km PPP nominal / 2025$ (TCP-DB) | Source |
|---|---|---|---|---|---|---|---|
| M2 central (Rondo Daszynskiego - Dworzec Wilenski), under the Vistula | 2010-2015 | 6.5 | 7 | 5,900M incl. rolling stock (TCP); ~4,400M total per press at the time | 677 (on 4.4bn) to 908 (on 5.9bn) | 505.6 / 709.3 | TCP-DB; https://transitcosts.com/warsaw-line-2/ ; https://www.money.pl/wiadomosci/metro-w-warszawie.html |
| M2 east to Trocka | 2015-2019 | 3.1 | 3 | 1,070M | 345 | 198.8 / 261.3 | TCP-DB |
| M2 west to Ksiecia Janusza | 2015-2020 | 3.4 | 3 | 1,148M | 338 | 194.5 / 255.6 | TCP-DB |
| M2 north-east to Brodno | 2018-2022 | 4.0 | 3 | 1,400M | 350 | 199.9 / 248.7 | TCP-DB; https://transitcosts.com/warsaw-line-2-extension-to-brodno/ |
| M2 west to Bemowo (Ulrychow, Bemowo) | contract Nov 2018, opened 30 June 2022 | 2.7 per Railway Gazette (other figures ~2.1, UNVERIFIED) | 2 | 959M, 70% EU-funded | ~355 (on 2.7 km) to ~455 | n/a | https://www.railwaygazette.com/metro/warszawa-metro-extension-opens/62093.article |
| M2 west Bemowo - Karolin (+ depot works, scope UNVERIFIED) | under construction, 2026-2027 | 3.9 | 3 | 1,620M | 415 | n/a | same Railway Gazette article; status https://en.wikipedia.org/wiki/M2_(Warsaw) |

- Pattern for the game: first-of-kind central section cost ~2x per km the later extensions (deep stations, river crossing, one consortium learning on the job); extensions then held flat at ~340-350M PLN/km nominal for 7 years. That is a learning-curve mechanic backed by data.
- TBMs: two 6.3 m EPB machines on the Bemowo-Karolin section (Anna, Krystyna) bored 5,688 m and placed 3,792 rings between 14 Aug 2024 (start date and 6.3 m diameter UNVERIFIED: not found in the cited article on re-fetch) and 21 May 2025 (https://inzynierbudownictwa.pl/pod-ziemia-pod-miastem-pod-presja-budowa-ii-linii-metra-w-warszawie/). Derived: ring length 1.5 m; ~10 m/day per machine averaged over the whole period (depends on the unverified start date). Typical quoted pace 10-12 m/day; central-section machine "Maria" averaged 18 m/day with a 36 m best day; "almost 30 m/day" quoted as a record by the mayor (https://www.gazetaprawna.pl/biznes/artykuly/10689406,ii-linie-metra-draza-30-metrow-dziennie.html and Polish trade papers via search; the 18/36 figure is UNVERIFIED against the original paper).
- M3 (Stadion Narodowy - Goclaw, first stage ~8.1 km, 6 stations): design contract ~78M PLN gross, design to finish 2027, construction start planned 2028, first section ~2032 (https://eurobuildcee.com/news/57607-blizej-trzeciej-linii-metra ; https://www.pap.pl/aktualnosci/warszawskie-metro-kto-zaprojektuje-trzecia-linie). Cost statements range from 2.5bn PLN excl. depot (earlier) to "about 5bn PLN" (mayor, 2024) (https://forsal.pl/artykuly/1433687,trzaskowski-budowa-iii-linii-metra-bedzie-mozliwa-jedynie-dzieki-wsparciu-ue.html ; https://demagog.org.pl/obietnice/rozpoczecie-budowy-iii-linii-metra/). Derived: 310-620M PLN/km. No official 2026 figure found: UNVERIFIED.
- M4: only pre-design budget found, 56M PLN (search summary of https://antyweb.pl/iv-linia-metra-m4-warszawa). Construction cost UNVERIFIED.
- Krakow metro planning figure: ~0.5bn PLN/km (https://krakow.pl/aktualnosci/286101,29,komunikat,prezydent_przedstawil_plan_budowy_metra_w_krakowie.html).

### 2.2 Lodz cross-city tunnel (tunel srednicowy, PKP PLK): the cautionary tale

- Scope: Lodz Fabryczna to Lodz Kaliska / Zabieniec, a double-track bore (large TBM "Katarzyna") plus four single-track tunnels totalling 4.5 km (small TBM "Faustyna"), new underground stops Srodmiescie, Polesie, Koziny (PLK material via https://multimedia.plk-sa.pl ; https://tvn24.pl/lodz/lodz-budowa-tunelu-kolejowego-pod-miastem-opozniona-o-rok-st8300463). TCP-DB lists 5.25 km, 2 stations, 1,760M PLN, $188M/km PPP ($234M/km 2025$).
- Money: tender ceiling 2.17bn PLN (Nov 2016); winning offer ~1.59bn PLN; contract signed 28 Dec 2017 with Energopol Szczecin + PBDiM (https://en.wikipedia.org/wiki/%C5%81%C3%B3d%C5%BA_Cross-City_Line). Estimated at 1.6bn PLN at start, ~2bn PLN already spent, about 1bn PLN over (https://forsal.pl/transport/kolej/artykuly/9746745,dlaczego-tunel-srednicowy-w-lodzi-bedzie-drozszy-o-miliard-zlotych-re.html ; https://www.money.pl/gospodarka/kluczowa-inwestycja-drozsza-o-miliard-zlotych-sa-opoznienia-7129362607725472a.html). PLK quotes ">1.8bn PLN net". EU co-financing around EUR 411M was at risk (https://www.money.pl/mobility/ministerstwo-zdecydowalo-co-z-dotacja-dla-wielkiego-tunelu-oto-gdzie-ma-trafic-7314835304888384a.html).
- Timeline: lead contractor Energopol bankrupt (filed June 2019); construction started Aug 2019; TBMs arrived 2020; originally expected 2022-2023 (Wikipedia above). Sept 2024: a tenement on al. 1 Maja partially collapsed above TBM Katarzyna (https://tvn24.pl/lodz/lodz-katastrofa-budowlana-w-kamienicy-podczas-drazenia-tunelu-st8075812); the TBM has stood idle since 10 Nov 2024, having bored 1,496 m in 4.5 years at 17.5% utilisation per PLK (inzynierbudownictwa.pl article below). Schedules slid to Dec 2026, then Aug 2028. Feb 2026: PKP PLK terminated the contract with PBDiM (https://inzynierbudownictwa.pl/plk-sa-odstapily-od-umowy-z-wykonawca-budowy-tunelu-srednicowego-w-lodzi/ ; https://spidersweb.pl/2026/02/budowa-tunelu-pod-lodzia-decyzja-pkp-plk.html). TBM restart "at the earliest Q1 2027" after re-tendering (https://spidersweb.pl/2026/05/lodz-tunel-srednicowy-data-wznowienia.html).
- Game use: event cards "lowest-bid contractor goes bankrupt", "settlement damage under historic buildings", "EU grant deadline". Poland's baseline is cheap on the median, not immune to failure. Lowest-price award is the failure mode TCP warns about.

### 2.3 CPK / Port Polska high-speed rail (Warsaw - Lodz, the "Y" line)

- Status Nov 2026 (latest sources mid-2026): no line-section construction contract found as signed. Kotowice - airport node (13 km) design-build tender launched 29 Dec 2025, two-stage, at most six bidders admitted to stage two (applications were due 2 Mar 2026); airport node - Bolimow (14.3 km, 55 structures, 350 km/h design) in competitive dialogue with eight applicants, "optimise and build" formula (https://www.bankier.pl/wiadomosc/Jest-przetarg-na-pierwszy-odcinek-Kolei-Duzych-Predkosci-Trasa-na-Mazowszu-9061694.html ; https://inzynieria.com/drogi/wiadomosci/100825,cpk-osmiu-wykonawcow-walczy-o-budowe-odcinka-kdp-warszawalodz-do-lotniska ; https://www.money.pl/mobility/cpk-ma-problem-z-przetargami-na-szybka-kolej-chcialoby-sie-zeby-to-dzialo-sie-szybciej-7344959489231296a.html). Traction substation dialogue applications due June 2026. Target opening Warsaw - Lodz (about 130 km): 2032; Poznan and Wroclaw branches 2035.
- Lodz HSR tunnel (Retkinia - Lodz Fabryczna, 4.6 km, two tracks, up to 160 km/h): PORR, bid 1.761bn PLN, contract reported at ~2.2bn PLN gross, completion 2029; launch-chamber site handed over Aug 2025, main works phase from Feb 2026 (https://superbiz.se.pl/wiadomosci/cpk-podpisalo-kontrakt-na-tunel-pod-lodzia-za-2-2-mld-zl-bedzie-najdluzszy-w-polsce-aa-1Auz-5j2e-A9zH.html ; https://inzynierbudownictwa.pl/inwestycja-cpk-w-lodzi-jest-wykonawca-tunelu-kolei-duzych-predkosci/ ; https://inzynierbudownictwa.pl/budowa-tunelu-dalekobieznego-cpk-w-lodzi-wykonawca-przejal-komore-startowa-retkinia/). Derived: 383M PLN/km (net) to 478M PLN/km (gross) for a mainline double-track bored tunnel (~14 m diameter per the superbiz article) without stations. These are the same price without and with 23% VAT (1.761bn x 1.23 = 2.166bn), not a bid-to-contract escalation; use the net figure for comparisons.
- Programme money: ~76.8bn PLN for the HSR component out of ~131.7bn PLN CPK programme to 2032; Y line ~480 km (https://xyz.pl/szybka-kolej-zdominuje-inwestycje-cpk-linia-y-coraz-blizej/ ; https://biznes.interia.pl/gospodarka/news-co-z-budowa-kdp-minister-wprost-to-juz-nie-sa-flamaster-plan,nId,7932406). Derived upper bound: ~160M PLN/km (~$44M/km at market FX, ~$80M/km PPP). Scope of the 76.8bn (rolling stock? tunnels? stations?) UNVERIFIED, so treat as order of magnitude. Individual sections were described as "about 3bn PLN" each.
- No official per-km estimate for Warsaw - Lodz found: UNVERIFIED.

### 2.4 Conventional rail, roads, trams (Poland)

| Item | Figure | Derived unit cost | Source |
|---|---|---|---|
| Rail Baltica E75 Czyzew - Bialystok, upgrade to 200 km/h, ~76 km | 3.3-3.4bn PLN net | ~44M PLN/km | https://www.plk-sa.pl/files/user_upload/PLK_inf.pfas._Rail_Baltica_ruszaja_prace_na_odcinku_Czyzew-Bialystok_17.09.2020.docx |
| Rail Baltica Bialystok - Elk, 96-103 km, second track | 4.0-4.24bn PLN net (5.2bn gross); award contested at KIO | ~41M PLN/km | https://forsal.pl/transport/kolej/artykuly/10616891,plan-inwestycyjny-pkp-plk-na-2026-r-powrot-kolei-do-lomzy-i-umowa-na-modernizacje-odcinka-rail-baltica-bialystok-elk.html ; https://www.biznesradar.pl/a/141027,konsorcjum-mirbud-i-torpol-wybrane-do-realizacji-projektow-rail-baltica-za-ponad-4-5-mld-zl |
| PKP PLK portfolio: 24 contracts, 546 km | >6.5bn PLN | ~12M PLN/km (mix of revitalisation and modernisation) | https://nbi.com.pl/content/uploads/assets/NBI-pdf/2023/4_109_2023/Pdf/3-Ireneusz-Merchel-PLK.pdf |
| 2007-13 modernisations | 14-16M PLN/km | as stated | https://zm.org.pl/wp-content/uploads/2023/02/raport-06-4-pois.pdf (OCR quality poor, UNVERIFIED) |
| NIK audit of 2017-2024 modernisations | 8,336M PLN sample overran by 390M PLN (4.7%) | n/a | https://www.nik.gov.pl/kontrole/wyniki-kontroli-nik/pobierz,lpo~p_24_081_202407111530231720704623~id1~01,typ,kj.pdf |
| Expressways (S roads), GDDKiA average | 44.37M PLN/km (2023), 39.82M (2024), 44.74M (year unclear, likely 2025) | as stated | Sejm interpellation answer https://api.sejm.gov.pl/sejm/term10/interpellations/attachment/ATTDSWJ49/i15689-o1.pdf |
| Motorways | 47.8M PLN/km average (year not stated); A2 east contracts 29.3-41.2M PLN/km | as stated | https://www.auto-swiat.pl/wiadomosci/aktualnosci/ile-kosztuje-budowa-kilometra-drogi-w-polsce/kqljm7q ; https://www.auto-swiat.pl/wiadomosci/aktualnosci/ile-kosztuje-kilometr-nowej-drogi-szybkiego-ruchu-w-polsce/86qrjcx |
| S1 Wegierska Gorka bypass (tunnels, viaducts) | 161.7M PLN/km | as stated | same auto-swiat article |
| Warsaw tram to Wilanow, 6.5-8 km double track, 12 stops, opened 2024 | 685.4M PLN line; 1.19bn PLN with trams and depot | 86-105M PLN/km | https://inzynierbudownictwa.pl/tramwaj-do-wilanowa-umowa-na-budowe-podpisana/ ; https://www.railwaygazette.com/urban-rail/warszawa-tramway-extension-contract-signed/61351.article |
| Torun tram to Jar, 5.5 km | 190M PLN | 35M PLN/km | https://torun.pl/pl/print/pdf/node/67973 |
| Wroclaw tram Ksieze Wielkie, 1.8 km | 100M PLN | 55M PLN/km | https://www.wroclaw.pl/inwestycje-wroclaw/tramwaj-na-ksieze-wielkie |
| Wroclaw tram Klecina, ~6 km (estimate) | 830M PLN excl. land and trams | 138M PLN/km | https://www.wroclaw.pl/komunikacja/miliardy-na-nowe-tramwaje-torowiska-i-zajezdnie |

- Rule of thumb for Poland 2020s (derived): upgrade of a double-track main line to 160-200 km/h ~40-45M PLN/km; greenfield expressway ~40-45M PLN/km; big-city tram 50-100M PLN/km (street rebuild dominates); metro 340-420M PLN/km; mainline bored tunnel 380-480M PLN/km.
- No official PKP PLK "average cost per km" figure found: UNVERIFIED.

## 3. Bay Area and United States

### 3.1 Bay Area projects

| Project | Scope | Cost | $M/km (derived unless noted) | Source |
|---|---|---|---|---|
| Central Subway (SFMTA) | 1.7 mi / 2.7 km, 4 stations (3 underground), twin 20 ft bores, opened Nov 2022 (4 years late) | Baseline $1.578B, final $1.95B | 722 nominal; TCP-DB: 618 PPP on $1.67B, 842 in 2025$ | https://missionlocal.org/2025/03/sf-central-subway-closed/ ; https://sfstandard.com/transportation/san-francisco-central-subway-375-million-over-budget-union-square-chinatown/ ; TCP-DB |
| BART Silicon Valley Phase II (VTA) | 6 mi / 9.6 km, ~5 mi single-bore tunnel ~53 ft (16 m) diameter, 4 stations | $12.1-12.5B (VTA, Dec 2025); $12.7B (VTA's latest estimate as cited by the county grand jury, June 2026; opening 2037 per VTA, 2039 per FTA's PMOC); TCP-DB $12.2B | 1,271 (TCP-DB) | https://abc7news.com/post/silicon-valley-bart-extension-construction-remains-time-budget-west-portal-site/18265543/ ; https://santaclara.courts.ca.gov/system/files/civil/vtas-management-and-oversight-bart-silicon-valley-phase-ii.pdf ; https://vtabart.org/wp-content/uploads/2026/04/2026-02-CA-BSVII-OP25-Project-Monitoring-Report-040726-V2.pdf |
| The Portal / DTX (TJPA) | 1.3 mi / 2.1 km from 4th & King to Salesforce Transit Center; cut-and-cover + mined (SEM) tunnel, one new underground station (4th & Townsend) + fit-out of existing trainbox; 20+ utilities relocated first; 7 buildings demolished | $8.25B (Aug 2023); $7.57B indicative (July 2025), $6.84B excl. the already-built trainbox; FTA CIG share $3.38B; FFGA targeted July 2027; civil/tunnel contract award Q2 2029; open for use Q1 2036 (Sept 2025 Master Schedule, subject to funding) | ~3,600 on $7.57B; ~3,270 excl. trainbox | SFCTA memo, Jan 2026: https://www.sfcta.org/sites/default/files/2026-01/SFCTA_CAC_Item9_TJPAPortalProjectFiscalYear2026MEMO_2026-01-28.pdf |
| Caltrain electrification (PCEP) | 51 mi / 82 km, incl. EMU fleet and signalling | $2.44B final ($462M over original) | ~30 whole programme; electrification infrastructure only was $697M / 80 km = $8.5M/km in 2018, before overruns | https://www.caltrain.com/news/cost-caltrain-electrification-increases-project-track-2024 ; https://pedestrianobservations.com/2018/05/22/construction-costs-electrification/ |
| California HSR, Merced - Bakersfield | 162-171 mi | $36.75B (Aug 2025), $34.76-35.66B (2026 reduced scope: shorter route, single-track sections, temporary termini, so not like-for-like per km; IG says it omits $3.6-6.6B financing and ~$3.7B of other costs), $47.65B (SB 198 full estimate) | ~130-175 | IG review via https://kmph.com/resources/pdf/0ccb4f42-f2a7-4557-bb1c-001762e9fa95-OIGHSRReviewof2026BusinessPlanA11Y.pdf ; https://www.railwayage.com/passenger/high-performance/chsra-issues-draft-2026-business-plan/ |
| California HSR, Phase 1 SF - LA/Anaheim | 494 mi / 795 km | $126.2B and $231.3B both reported from the draft 2026 Business Plan (different scopes/escalation; not reconciled, UNVERIFIED which is the headline; neither figure appears in the two sources cited here on re-fetch; last range confirmed independently is $89-128B from the 2024 Business Plan, https://en.wikipedia.org/wiki/California_High-Speed_Rail) | 159-291 | https://railway-news.com/california-high-speed-rail-cost-estimate-reduced-by-1-7-billion/ ; https://kmph.com/news/local/inspector-general-finds-california-high-speed-rail-business-plan-incomplete |
| Link21 second transbay crossing | Single tunnel; standard-gauge regional rail recommended Nov 2024; BART board approved plan June 2025 | cost UNVERIFIED in this pass | n/a | https://en.wikipedia.org/wiki/Link21 |

- BART SV Phase II single-bore vs twin-bore: a Mott MacDonald twin-bore vs single-bore analysis presented to VTA's oversight committee on 11 Sept 2025 reaffirmed single bore (grand jury report, section 3.1 source; the VTA blog linked here dates from Dec 2021 and calls the two options "generally cost neutral"); critics claim twin bore would be cheaper and safer; VTA attributes twin-bore cost to downtown cut-and-cover stations (https://www.vta.org/blog/single-bore-tunnel-remains-best-option-bart-silicon-valley-phase-ii-project ; https://localnewsmatters.org/2024/06/11/next-phase-of-bart-silicon-valley-extension-to-break-ground-as-critics-assail-major-flaws/). Good in-game design choice: "avoid street disruption" (deep single bore, very deep stations) vs "cheap and shallow" (cut-and-cover).
- Electrification comparators per km of double track: France ~$1.5M, Israel ~$1.25M, Auckland ~$0.7M, UK Great Western $6-10M, Amtrak New Haven - Boston ~$3.5M inflation-adjusted (https://pedestrianobservations.com/2018/05/22/construction-costs-electrification/). Caltrain infrastructure-only is "well into the teens of millions per kilometer" after overruns (https://pedestrianobservations.com/2025/07/31/how-one-bad-project-can-poison-the-entire-mode/). Ratio Caltrain/Europe: ~6-10x.

### 3.2 Other US tunnelled projects (TCP-DB)

| Project | Years | km | Stations | Cost $M | $M/km PPP | $M/km 2025$ |
|---|---|---|---|---|---|---|
| NY 7 extension | 2007-2014 | 1.6 | 1 | 2,400 | 1,500 | 2,216 |
| NY Second Avenue Subway Phase 1 | 2007-2016 | 2.7 | 3 | 4,601 | 1,704 | 2,440 |
| NY Second Avenue Subway Phase 2 | 2019-2029 | 2.6 | 3 | 6,949 | 2,673 | 2,673 |
| NY East Side Access | 2007-2022 | 2.8 | 1 | 11,000 | 3,929 | 5,339 |
| NY Gateway (Hudson Tunnel) | 2019-2026 | 5.3 | 0 | 9,500 | 1,792 | 1,895 |
| LA Purple Line Phase 1 / 2 / 3 | 2014-2027 | 6.3 / 4.2 / 4.2 | 3 / 2 / 2 | 2,800 / 2,400 / 3,600 | 444 / 571 / 857 | 570 / 679 / 906 |
| LA Regional Connector | 2014-2022 | 3.1 | 3 | 1,756 | 567 | 727 |
| Seattle U-Link | 2009-2016 | 5.1 | 2 | 1,756 | 344 | 483 |
| Seattle Ballard (43% tunnel) | 2028-2038 | 12.4 | 9 | 22,600 | 1,823 | 1,823 |
| SF Central Subway | 2010-2021 | 2.7 | 4 | 1,670 | 618 | 842 |
| BART to San Jose (83% tunnel) | 2024-2036 | 9.6 | 4 | 12,200 | 1,271 | 1,271 |

- US cost escalation within one programme: LA Purple Line 444 -> 571 -> 857 $M/km across three phases in a decade, the opposite of the Warsaw learning curve.
- Non-tunnel US: Silver Line (DC) $159-167M/km at 0-4% tunnel; Boston GLX $301M/km at-grade in an existing rail corridor; Honolulu elevated $355M/km (TCP-DB).

### 3.3 Where the US money goes (TCP findings)

Second Avenue Subway Phase 1 vs composite low-cost baseline (Italy, Sweden, Turkey), from TCP-FR and TCP-PRES:

| Factor | Multiplier | Mechanism |
|---|---|---|
| Station overbuilding | 2.06x | Stations = 77% of SAS hard costs. Station boxes 2-2.6x platform length (96th St: 2.6x a 187 m platform; 72nd/86th digs 400 m / 300 m) vs 3-20% over platform length in comparison cases. Full-length mezzanines, back-of-house space per agency fiefdom, bespoke design per station. Mined stations cost 1.5x per unit volume vs cut-and-cover. |
| Systems and finishes, no standardisation | 1.35x on hard costs (systems alone 2.3x) | SAS systems+finishes : tunnels+station civils = 46.5 : 53.5; Paris about 15 : 40. |
| Labour | 1.5x overall (3x on labour) | Labour 40-60% of hard cost in NY vs 19-30% in low-cost cases. SAS TBM staffing 46 per shift (20 TBM crew + 26 support) vs 30 feasible (13 + 17); 138 vs 90 over three shifts. White-collar: GLX had 1 supervisor per 1.8 trades workers vs 2.5-3 norm. NY overtime 2x incl. weekends; France 1.25-1.5x. TCP cautions wages are not the problem: NY wages/benefits match Stockholm. |
| Procurement | 1.85x | Design-build with privatised risk, fixed price, consultants supervising consultants, lowest bid. Low-cost countries: technical score 50-80% of award, itemised (pre-priced) change orders (10-20% savings), in-house supervision. Contractors price 15-20% "red tape premium"; "agency factor" ~20%. |
| Soft costs | 1.2x | SAS 21% of hard costs vs 5-10% (France, Italy, Istanbul; commonly 7-8%). |
| Product | 2.06 x 1.35 x 1.5 x 1.85 x 1.2 = 9.3 (derived; TCP states 9.34, range 8-12) | |

Other documented drivers:
- Contingency: US estimates carry 25% allocated + 7% unallocated at 10% design (GLX), sometimes 40-50%; "all money in the budget will be spent" (TCP-FR, TCP-PRES). Istanbul caps overruns at 20% of contract.
- TBM utilisation only 20-40% of the time (TCP-FR). Work-hour limits on SAS forced a $20-30M muck storage cavern and tripled truck count (TCP-PRES).
- Other People's Money: $15M paid to NYC Parks to use a playground as a staging site (TCP-PRES).
- Industry view (US tunnelling contractors): US transit tunnel totals split ~35% soft costs, ~10% third-party, ~55% construction; within construction labour 40-50%, permanent materials 15-18%, temporary works and consumables 10-12%, equipment and TBMs 18-20%. Billed tunnel labour: California ~$70/h, New York >$100/h, Germany ~$30/h. NY face crews up to 4x comparable European ones. Per mile: NY $1.5-2.5B, other US/Australia $600-900M, Europe/Middle East $250-500M, India/China/SE Asia $100-200M (https://tunnelingonline.com/why-tunnels-in-the-us-cost-much-more-than-anywhere-else-in-the-world). Turkey: $12-15/h incl. overheads (TCP-FR).
- SAS contract outcomes: design contract $187M -> $451M (+142%), consultant construction management $81M -> $204M (+152%); civil contracts mostly +0-34% (TCP-PRES). The soft-cost lines overran far more than the dig.
- Madrid counter-example: 56 km and 37 stations in 1995-99 at ~EUR 28.2M/km (underground section ~EUR 41.3M/km incl. rolling stock); eight TBMs running 24 h/day; environmental approval ~5 months vs 2+ years in UK/US; a core team of nine in-house engineers; standardised copy-paste stations; bids scored 30% price / 20% time / 50% technical; station-location decisions within 24 hours; 3 weeks from end of construction to opening (https://worksinprogress.co/issue/how-madrid-built-its-metro-cheaply/ ; https://www.railwaygazette.com/25116.article). TCP-DB shows Madrid programmes at $35-92M/km PPP for 1995-2015 and $101-123M/km for the two current projects (71-147 in 2025$).

## 4. High-speed rail comparisons

| Line / country | Cost per km | Notes | Source |
|---|---|---|---|
| Spain: Madrid - Barcelona - French border | EUR 15.2M (initial estimate 11.0M, +38.5%) | | ECA-2018 Table 5 |
| Spain: Eje Atlantico / Madrid - Leon / Madrid - Galicia | EUR 15.7M / 15.7M / 13.7M | | ECA-2018 |
| France: LGV Est / Rhin-Rhone | EUR 16.5M / 18.8M (+28% / +26%) | | ECA-2018 |
| Italy: Turin - Salerno / Milan - Venice | EUR 31.9M / 43.4M | mountainous, urban penetrations | ECA-2018 |
| Germany: Berlin - Munich / Stuttgart - Munich | EUR 21.9M (+76%) / 49.7M (+622%) | heavy tunnelling | ECA-2018 |
| EU audited average | EUR 25M | overruns: 78% at line level; ~16 years from works start to opening | ECA-2018 |
| China, 350 km/h | $17-21M | high viaduct share, standardised designs | World Bank 2014: https://www.worldbank.org/en/news/press-release/2014/07/10/cost-of-high-speed-rail-in-china-one-third-lower-than-in-other-countries (URL returned 404 on 2026-11-09; the three World Bank rows are UNVERIFIED in the fact-check) |
| Europe, >=300 km/h (World Bank range) | $25-39M | | same |
| California (2014 view) | ~$56M | | same |
| California Merced - Bakersfield (2026) | ~$130-175M (derived) | flat Central Valley, mostly viaduct/at-grade | section 3.1 |
| Poland Y line (programme-level, derived) | ~160M PLN (~$44M market, ~$80M PPP) | scope UNVERIFIED | section 2.3 |

- CAHSR Central Valley at $130-175M/km vs Spain/France at EUR 15-19M/km (2018 prices, roughly $25-30M today, derived): ~5-7x for the easiest terrain. Same order as the urban rail gap.

## 5. Cost structure of a tunnelled line

### 5.1 Low-cost baseline hard-cost split (TCP-PRES "physical structures" diagram, Italy/Sweden/Turkey)

Derived from the diagram's proportions (tunnels x, stations 1.1x; civils y, systems/finishes 0.4y):

| Component | Share of hard cost, baseline | Share, Second Avenue Subway (4.3x wide, 1.9y tall diagram) |
|---|---|---|
| Running tunnels (civil) | ~34% | ~12% |
| Station civils | ~37% | ~41% |
| Line systems (track, power, signals) | ~14% | ~11% |
| Station finishes and MEP | ~15% | ~36% |

- Soft costs on top: 7-10% baseline; 21% SAS; ~35% of total per US industry (section 3.3).
- Read: in a healthy project the tunnel is one third of the money; in the US the tunnel is a rounding error and stations + soft costs are the game. The game should make stations, not TBM metres, the main cost sink, and make station depth/size the main lever.

### 5.2 Bored tunnel cost structure (HS2-TG, twin 8.8 m ID tunnels, 400 mm segments, 2Q2011 GBP)

| Item | Rate |
|---|---|
| TBM purchase | GBP 16M each (slurry), GBP 18M each (EPB) |
| Tunnelling support, fixed (site setup, launch, segment plant) | GBP 45M (slurry) / 35M (EPB) |
| Tunnelling support, time-related | GBP 1.1M per week |
| Tunnel construction (segments, labour, consumables) | GBP 25,000 (slurry) / 22,000 (EPB) per route-metre of twin tunnel |
| Spoil disposal | GBP 4,500 per route-m (commercial tip) / 3,000 (sustainable placement) |
| Portal | GBP 20-65M each |
| Ventilation/intervention shaft, every ~3 km, 45 x 25 m plan | GBP 10-30M each (urban costlier) |
| Tunnel M&E | GBP 4,000 per route-m |
| Planning productivity | 80 m/week per TBM boring, 400 m/week clear-out |
| Worked example: 7 km twin tunnel | GBP 491M total; GBP 33.1M per single-tunnel km civil only |

- Structure = fixed (machines, setup, portals) + time-related (weekly burn) + per-metre (lining, spoil, M&E) + per-shaft. This is exactly the shape the game needs: faster TBMs cut the weekly-burn term, reuse of TBMs cuts the fixed term, long drives amortise the fixed term. In the example, time-related cost is 24% of the total, per-metre 48%, fixed 28% (derived).

## 6. TBM facts

### 6.1 Types and when to use them

| Type | Ground | Notes | Bay Area relevance (my mapping, design guidance not sourced geology) |
|---|---|---|---|
| EPB (earth pressure balance) | soft cohesive soil, clays, silts; face pressure < ~7 bar | muck itself supports the face; screw conveyor; default metro machine (Warsaw, Central Subway) | alluvium, clays, Bay Mud at moderate depth |
| Slurry / Mixshield | water-bearing sands and gravels, high water pressure | bentonite slurry face support, needs separation plant on surface; not suited to pure clays/silts | under-bay crossings, saturated sands |
| Variable density / multi-mode | heterogeneous, mixed face | switches EPB / slurry / open mode in the tunnel | mixed alluvium to Franciscan transitions |
| Open gripper (main beam) | competent hard rock | grippers thrust off tunnel walls; no segment lining needed in good rock | hard rock ridges |
| Single shield | weak or fractured rock | thrusts off segments; bore and ring-build alternate | Franciscan melange |
| Double shield | rock stable enough to grip | grippers allow ring building during boring: near-continuous advance | long rock drives |
| Sequential excavation / NATM (not a TBM) | short, non-circular, caverns, stations | slow per metre, flexible; used for The Portal's mined section and station caverns | station caverns, short links |
| Cut-and-cover (not a TBM) | shallow, under streets | cheapest per volume, most surface disruption and utility conflict | stations, shallow lines in wide streets |

Sources: https://en.wikipedia.org/wiki/Tunnel_boring_machine ; Herrenknecht product pages https://www.herrenknecht.com/en/products/productdetail/variable-density-tbm/ , https://www.herrenknecht.com/en/products/productdetail/double-shield-tbm/ , https://www.herrenknecht.com/en/products/productdetail/multi-mode-tbm/

### 6.2 Diameters

- Herrenknecht ranges: Mixshield 3.7-19 m; Variable Density 1.7-16 m; gripper ~2-12.5 m (Herrenknecht product pages above; brochure figures differ slightly).
- Largest built: Mixshield S-880 "Qin Liangyu" 17.63 m (Guinness, as of June 2023); largest EPB "Bertha" 17.45 m (Seattle SR 99, ~$80M machine: https://www.constructionbriefing.com/news/feature-tunnelling-challenges/1096347.article); largest hard-rock 15.62 m (Wikipedia TBM article).
- Reference bores: Warsaw metro 6.3 m EPB, single track per bore; Central Subway ~20 ft (6.1 m) twin bores (https://www.sfmta.com/node/13937); Madrid 9.4 m single bore carrying two tracks (https://www.railwaygazette.com/25116.article); HS2 8.8 m ID twin bores for 360 km/h; BART SV Phase II ~16 m single bore with stacked/side-by-side tracks and platforms inside the bore.
- Boring Company Loop tunnels: ~12 ft (3.7 m) ID, UNVERIFIED in the sources fetched; fits a car, not a mainline train with catenary.

### 6.3 Advance rates

| Case | Rate | Source |
|---|---|---|
| HS2 planning assumption, 8.8 m ID | 80 m/week (~11 m/day) | HS2-TG |
| Warsaw M2, 6.3 m EPB, typical | 10-12 m/day; ~10 m/day per machine averaged over the 2024-25 Bemowo drives (derived) | section 2.1 |
| Warsaw M2 central, TBM Maria | 18 m/day average, 36 m best day (UNVERIFIED) | section 2.1 |
| Central Subway, ~6.1 m EPB | planned ~40 ft/day (12 m); peaks to 130 ft/day (40 m); each TBM drove 8,500 ft | https://www.enr.com/articles/10664-stealthy-tunnelers-bore-through-underground-maze ; https://www.sfmta.com/node/13937 |
| Prague metro EPB | 12 m/day expected average, 18.5 m record day | search summary of tunnelsandtunnelling.com, UNVERIFIED |
| Chengdu metro, 6.26 m EPB | up to 24 m/day | https://tunneltalk.com/TBM-Recorder-May10-Robbins-record-in-Chengdu.php |
| Eurasia Tunnel, 13.7 m mixshield | 7 m/day average, 12 m best day | https://www.robbinstbm.com/esme-world-records/ |
| Esme-Salihli rail tunnel, 13.77 m Crossover (record for >13 m) | best day 28.5 m, week 133.2 m, month 455.4 m (Robbins, June 2021); later press cites 32.4 m / 178.2 m / 721.8 m | Robbins page above; https://www.khl.com/news/robbins-crossover-xre-breaks-record-as-world-s-fastest-tbm/8016289.article |
| General ceilings | rock TBMs >700 m/week, soft-ground >200 m/week | Wikipedia TBM article |
| LVCC Loop, conventional small EPB | ~15 m/day (49 ft); first 4,475 ft bore took Nov 2019 to Feb 2020 | https://en.wikipedia.org/wiki/Las_Vegas_Convention_Center_Loop |

- Design reality: average is 20-40% of instantaneous capability because the machine only bores 20-40% of the time (TCP-FR): ring build, cutter changes, muck logistics, shift limits. Speed tech in the game should mostly raise utilisation, not cutterhead speed.

### 6.4 Crew, lining, shafts, machine cost

- Crew: SAS 20 on the TBM + 26 support per shift (46), TCP-proposed 13 + 17 (30) (TCP-PRES). Typical European per-shift numbers not found in a primary source: UNVERIFIED (secondary claims of 9-15 on the machine).
- Lining: precast segmental rings; Warsaw 1.5 m rings (derived from 5,688 m / 3,792 rings); universal ring of ~6 segments + key for a ~6 m metro bore, 1.4-1.6 m long (secondary: https://railwaynews.net/wiki/what-is-a-tunnel-boring-machine-tbm-the-mole-of-railway-construction); HS2 400 mm thick segments for 8.8 m ID (HS2-TG).
- Shafts: launch and reception shafts or station boxes at drive ends; vent/intervention shafts every ~3 km at GBP 10-30M each (HS2-TG); cross passages between twin bores are mined by hand and are a known cost/risk item (HS2-TG). Portals GBP 20-65M each.
- Machine price: GBP 16-18M for an ~9.6 m OD machine in 2011 (HS2-TG); Bertha 17.5 m ~$80M (2014); general range EUR 10-40M (secondary). A 6-7 m metro EPB price was not found in a primary source: UNVERIFIED (assume $12-20M).

### 6.5 The Boring Company: claims vs record

| Item | Claim | Achieved / documented |
|---|---|---|
| Cost | target "< $5M per mile" all-in for Loop tunnel; earlier ~$10M/mile tunnel-only | LVCC Loop: $48.7M contract (May 2019), ~$53M at opening, for ~1.7 mi of tunnel (two ~0.85 mi bores) + 3 stations: ~$29-31M per tunnel-mile (~$18-19M/km) all-in (derived). Expansion segment costs are not published. |
| Speed | Prufrock: 1 mile/week (230 m/day); "medium-term" 7 miles/day; conveyor supports up to 4 miles/week | LVCC bores ~15 m/day with a conventional machine. Prufrock-2 completed a 2.28-mile continuous drive (10 Mar 2026), duration not published. Third-party estimate: Prufrock 3/4 mine ~11 h/day (UNVERIFIED: not found in the listed sources on re-fetch). A 2023 tally: ~2.4 miles bored in the company's first seven years. No independently measured sustained mile-per-week. |
| Method | Continuous mining (liner erected while mining), "porpoising" (launch from surface off a truck within 24 h, no launch pit; exit onto a trailer), zero people in tunnel (remote operation), all-electric, Prufrock-MB hard-rock variant using rock as liner | Porpoising and remote operation are demonstrated in company footage; Prufrock-MB1/MB2 mining limestone in Nashville in 2026. |
| Capacity | >90,000 passengers/hour system-wide (Vegas Loop) | 4,400/h in a 2021 test; 1,355/h observed peak (July 2021). Stations open by late 2026: 9 to ~14 depending on source (Wikipedia LVCC Loop infobox 9, tesorb tracker 11, Wikipedia TBC article ~14): UNVERIFIED; 4M+ passengers total; 68 miles approved. |
| Delivery record | DC-Baltimore, Chicago O'Hare, LA Dugout Loop, San Jose, Fort Lauderdale, San Antonio | all dropped or dormant; Dubai 6.4 km pilot contract (2026), Nashville under construction |

Sources: https://www.boringcompany.com/prufrock ; https://boringcompany.com/projects/las-vegas-loop ; https://en.wikipedia.org/wiki/Las_Vegas_Convention_Center_Loop ; https://en.wikipedia.org/wiki/The_Boring_Company ; https://tesorb.com/vegas-loop-tracker/ ; https://www.reviewjournal.com/local/traffic/boring-co-s-vegas-loop-announces-approval-of-19-additional-stations-bringing-total-to-123-3869704/

- Why TBC's number is low, in cost-model terms: ~3.7 m bore (excavated area ~1/3 of a 6.3 m metro bore, ~1/19 of BART SV's 16 m), no rail systems, no platform-length stations (surface or shallow car bays), minimal ventilation/egress, private right-of-way deals, no federal process. It is evidence for "small diameter + trivial stations + no soft costs = cheap", not for a 100x better TBM.

### 6.6 Other innovation with evidence

- Continuous advance on segment-lined shield machines: Herrenknecht states up to 1.6x daily advance vs stop-and-go; fitted on two variable-density TBMs for HS2 Phase 1 (https://www.tunnel-online.info/en/artikel/automation-digitalization-and-continuous-advance-with-tunnel-boring-machines-4128444.html ; https://www.taylorfrancis.com/chapters/oa-edit/10.1201/9781003348030-308/). Manufacturer figure, not independently verified.
- Automated segment handling in the backup and robotic ring erection: delivered on several ~10 m machines per Herrenknecht (same tunnel-online article). Crew reduction numbers UNVERIFIED.
- Double-shield continuous boring in rock (segments placed while gripping): standard product (Herrenknecht double shield page).
- Institutional "innovation" with the largest measured effect: standardised stations, shallow cut-and-cover, 24/7 working, in-house client team, technical-merit awards, itemised contracts (Madrid, TCP; section 3.3). Measured factors are 1.2-2x each; TBM tech factors are 1.2-1.6x on a component that is one third of cost.

## 7. Proposed parametric cost model

Units: 2025 PPP USD. "Reformed baseline" (R) = Polish metro-extension performance (Warsaw M2 extensions: ~$250M/km all-in at ~0.85 stations/km, 100% tunnel, twin 6.3 m bores). All coefficients below are **design proposals calibrated to the cited data**, not sourced unit rates, unless a source is named.

### 7.1 Calibration of the baseline

- Target: $250M/km total (TCP-DB, Warsaw extensions 249-261).
- Soft costs + owner costs 10% of hard (TCP baseline 7-10%) -> hard ~$227M/km.
- Hard split per section 5.1 -> running tunnels ~$77M/km, line systems ~$31M/km, stations ~$119M/km.
- At 0.85 stations/km -> ~$140M per standard underground station (civil ~$100M, finishes/MEP ~$40M). UNVERIFIED against actual Warsaw station contracts; it is the TCP split applied to Warsaw totals.
- Cross-check: HS2-TG gives ~GBP 66M per route-km (2011) for twin 8.8 m ID civil works; scaling by excavated area to 6.3 m OD bores (x ~0.43) and inflating/converting lands in the $60-90M/km range. Consistent.

### 7.2 Formula

```
total = (TUNNEL + STATIONS + SYSTEMS + SURFACE + LAND_UTIL)
        * (1 + soft) * (1 + contingency) * M_procurement * M_labour_rules

TUNNEL (per drive) =
      tbm_capex(d) * (1 - reuse_credit)            // fixed
    + launch_site_fixed(method)                      // fixed: launch shaft or portal, segment plant
    + weekly_burn(d) * weeks                         // time-related
    + length_m * per_m(d, geology, method)           // lining, consumables, spoil
    + n_vent_shafts * shaft_cost(depth, urban)       // 1 per 3 km
    + n_cross_passages * xp_cost(geology)            // twin bore only, 1 per ~250-500 m (assumption)

weeks = length_m / (7 * rate_m_per_day(d, geology, tbm_tech) )
rate_m_per_day = peak_rate(type, geology) * utilisation(tech, work_hours_policy)

STATIONS = sum over stations of
      base_station * size_factor(box_length / platform_length, mezzanine)
                   * depth_factor(depth_m) * method_factor(cut_and_cover | mined | in-bore)
                   * bespoke_factor(standardised?)

SYSTEMS  = length_km * systems_per_km(mode) * standardisation_factor
SURFACE  = at-grade / elevated / trench segments * unit rates
LAND_UTIL = parcels + utility_relocation(method, street_class)
```

### 7.3 Reformed-baseline coefficients (R)

| Parameter | Value (2025 PPP USD) | Basis |
|---|---|---|
| tbm_capex, 6.3 m EPB | $18M | assumption; HS2-TG GBP 16-18M (2011) for larger machine |
| tbm_capex scaling | x (d / 6.3)^1.5; 16 m ~ $75M | Bertha $80M at 17.5 m |
| reuse_credit | 50% on second and later drives | assumption; Warsaw reused named machines across sections |
| launch_site_fixed | $25M per launch (shaft); $40M per portal | HS2-TG GBP 35-45M fixed per twin drive, portals GBP 20-65M |
| weekly_burn, one 6.3 m TBM | $0.6M/week | HS2-TG GBP 1.1M/week for two 9.6 m machines |
| per_m, single 6.3 m bore, good soft ground | $16,000/m (so twin = $32k per route-m) | HS2-TG GBP 22-25k per route-m twin 8.8 m, area-scaled |
| per_m diameter scaling | x (d / 6.3)^1.7 | excavation ~d^2, lining ~d^1.3 (assumption) |
| spoil | included above; +15% if no reuse site | HS2-TG GBP 3-4.5k per route-m |
| vent shaft | $20M rural, $45M urban | HS2-TG GBP 10-30M |
| peak_rate EPB soft ground / utilisation | 30 m/day x 0.35 = ~10.5 m/day | Warsaw 10-12 m/day; TCP 20-40% utilisation |
| standard underground station, 2-track, 120-140 m platform, 15-20 m deep, cut-and-cover | $140M | section 7.1 |
| line systems (track, power, signalling), metro | $31M/km | section 7.1 |
| soft | 10% | TCP 7-10% |
| contingency | 10% | TCP: keep limited; Istanbul caps overruns at 20% |
| at-grade double track in existing corridor | $25M/km | Polish 200 km/h upgrades ~44M PLN/km -> ~$23M PPP |
| electrification, double track | $2M/km | France $1.5M, Israel $1.25M |
| greenfield HSR, flat terrain | $30M/km | ECA-2018 Spain/France EUR 14-19M (2018) |
| elevated viaduct, metro | $90M/km | assumption, UNVERIFIED |
| surface tram in street | $35M/km | Polish trams 35-105M PLN/km -> $18-55M PPP |

Check: 1 km twin bore inside a 6 km drive: 2 x (16,000 x 1,000) = $32M per-m + weekly burn 2 x $0.6M x (1,000 / 73.5 m/week = 13.6 weeks) = $16M + amortised capex/launch/shafts ~ $20M -> ~$68M/km tunnel civil vs $77M target. Within 15%; tune per_m.

### 7.4 Modifiers

| Modifier | Values (proposal) | Evidence |
|---|---|---|
| Geology on per_m / on rate | soft clay/alluvium 1.0 / 1.0; saturated sand or Bay Mud (slurry needed) 1.3 / 0.8; mixed face 1.5 / 0.6; competent rock with gripper/double shield 0.9 / 1.5; fault zone or melange 1.8 / 0.4 | qualitative only (TBM type suitability, section 6.1); numeric values are game tuning, UNVERIFIED |
| Wrong machine for the ground | rate x 0.3, random stoppage events | Lodz collapse, Seattle Bertha stoppage (qualitative) |
| Station depth_factor | 1.0 at <=20 m; +4% per extra metre; 2.0 at 45 m | assumption; volume and vertical circulation scale with depth; BART SV deep single-bore stations are the cost driver per VTA debate |
| Station method_factor | cut-and-cover 1.0; mined cavern 1.5; platforms inside a 16 m bore 1.2 plus tunnel d-scaling | TCP: mined 1.5x per volume vs cut-and-cover |
| Station size_factor | box = 1.05-1.2x platform: 1.0; box = 2x platform with full mezzanine: 2.06 | TCP station overbuilding factor |
| bespoke_factor | standard catalogue station 1.0; signature station 1.35 | TCP systems/finishes standardisation 1.35 |
| Mainline/HSR station (400 m platforms, 4-6 tracks) | 4-6x standard metro station | assumption from platform length x track count; The Portal's cost is dominated by this |
| Utility relocation, cut-and-cover in old downtown street | +$30-60M per km of open cut | assumption; The Portal relocates 20+ utilities in an advance contract |
| Learning curve | first project of a type 2.0x; -15% per completed project to floor 1.0 | Warsaw central 677-908M PLN/km vs 340-350 on extensions |
| TBM tech: utilisation | 0.35 base; continuous advance 0.55 (x1.6); robotic ring erection + automated logistics 0.65; "Prufrock-class" surface launch removes launch_site_fixed | Herrenknecht 1.6x claim; TBC porpoising claim |
| 24/7 work permit | utilisation x 1.3 vs daytime-only muck haul | Madrid 24 h; SAS work-hour constraint cost $20-30M |

### 7.5 Bay Area status-quo multipliers (the red-tape tree)

Status quo (SQ) total multiplier over R: **4.5x default** (US tunnelled median / Poland = 4.3x; BART SV II = 5.0x; Central Subway = 3.3x). Proposed decomposition, shaped like TCP's NY factors but scaled from 9.3x down to 4.5x (the scaling is a design choice):

| Lever (policy tech) | SQ factor | Reformed | TCP NY reference | Unlock flavour |
|---|---|---|---|---|
| Station right-sizing and standard catalogue | 1.60 | 1.0 | 2.06 x part of 1.35 | "Madrid station catalogue", "no full-length mezzanines" |
| Systems standardisation | 1.15 | 1.0 | part of 1.35 | "one signalling system", "off-the-shelf everything" |
| Labour rules and staffing | 1.35 | 1.0 | 1.5 | "TBM crew 30 not 46", "overtime reform"; keep wages unchanged |
| Procurement and in-house capacity | 1.50 | 1.0 | 1.85 | "hire 9 in-house engineers", "itemised contracts", "technical-merit awards", "public-sector risk" |
| Soft costs | 1.20 | 1.0 | 1.2 | soft 30% -> 10% |
| Product | 4.47 | 1.0 | 9.3 | |

Separate from the multiplier, model time:
- Environmental review + federal funding process: SQ 4-8 years before construction (The Portal: environmental cleared 2019, FFGA targeted 2027, construction award 2029, service 2036; BART SV II: FFGA application planned by end of 2026, award date UNVERIFIED and described as "highly uncertain" by the county grand jury); reformed 6-12 months (Madrid ~5 months). Charge escalation and standing-army cost per year of delay (suggest 3-4%/year of project cost: assumption).
- Contingency: SQ 30-40% held and always spent; reformed 10%.
- Per-project overrides for missions: The Portal SQ ~14x (mainline-size six-track throat, mined + cut-and-cover under downtown, 17-year process from 2019 environmental clearance to 2036 opening); NYC-style megastation projects 8-12x. Let the player see the real-world price tag as the "status quo quote" and beat it.
- Beyond-baseline tier: "Madrid/Seoul mode" 0.6x R (Spain/Korea/Turkey medians $140-150M/km vs Poland $256M/km).

### 7.6 Sanity targets the model should reproduce

| Scenario | Model should give | Real figure |
|---|---|---|
| R: 4 km twin-bore metro, 3 standard stations | ~$1.0B | Brodno: $995M (2025 PPP, TCP-DB) |
| SQ: Central Subway (2.7 km, 3 deep mined/cut stations + 1 surface) | ~$2.0-2.3B | $2.27B (2025$, TCP-DB) |
| SQ: BART SV II (9.6 km, 16 m single bore, 4 stations, 3 very deep) | ~$12B | $12.1-12.7B |
| SQ: The Portal (2.1 km, HSR-size station + throat) | ~$7-8B | $7.57B |
| R: The Portal | ~$0.6-0.9B (derived: Lodz-class mainline tunnel + one large station) | n/a; Lodz HSR tunnel 4.6 km contract ~2.2bn PLN gross (~$1.1B PPP) without stations |
| R: Caltrain-style electrification 82 km | ~$165M + trains | France/Israel rates; real PCEP $2.44B with trains and signalling |

## Recommendations for the game

1. **Currency and anchor**: run the economy in 2025 PPP USD. Reformed baseline R = $250M/km for a twin-bore metro with a station every ~1.2 km (Warsaw M2 extensions). Show a toggle or tooltip with PLN at market FX (~$95M/km) as flavour; do not base balance on market FX, it makes the gap 9-38x and is not an apples-to-apples claim.
2. **Status quo = 4.5x R**, decomposed into five independent policy levers (stations 1.6, systems 1.15, labour rules 1.35, procurement 1.5, soft costs 1.2). Each lever is a branch of the red-tape tree, each backed by a TCP finding. Mission-specific overrides: The Portal ~14x.
3. **Make stations the main cost object**. In the voxel world, station box volume (length beyond platform, mezzanine levels, depth) should drive cost directly; this is both true to the data (stations = 52% of baseline hard cost, 77% in NYC) and naturally "voxel".
4. **Tunnel cost = fixed + weekly burn + per-metre**, per HS2-TG. Speed tech reduces weeks; TBM reuse and long drives amortise fixed cost; diameter scales per-metre cost at ~d^1.7. This makes small-bore "Loop" tunnels, twin 6.3 m metro bores and 16 m mega-bores honest trade-offs instead of skins.
5. **TBM speed tiers**: 10 m/day (today, Warsaw) -> 16 m/day (continuous advance, 1.6x) -> 25 m/day (24/7 logistics + robotic ring build) -> 50+ m/day speculative ("Prufrock claims", clearly labelled as unproven: 230 m/day is a company target with no independent measurement). Model as utilisation 0.35 -> 0.55 -> 0.65 -> 0.9.
6. **Learning curve**: first project of each type costs 2x, converging over ~5 projects (Warsaw central vs extensions). Reverse learning (LA Purple Line +93% per km over three phases) can be an SQ penalty when procurement reform is not unlocked.
7. **Time is a cost**: charge standing costs and escalation during review/funding phases; SQ pre-construction is 4-8 years, reformed 6-12 months. Red-tape techs should cut calendar time first, money second.
8. **Failure events drawn from Lodz and Central Subway**: contractor bankruptcy after lowest-bid award, settlement damage under old buildings (TBM stop 2+ years), grant deadline loss, contract termination and re-tender. Probability falls with "technical-merit award", "in-house engineers", "ground investigation" techs. Poland is the baseline, not a fairy tale.
9. **Method choice per segment**: cut-and-cover (cheapest per volume, needs wide street, utility relocation cost, surface disruption meter), bored (depth-independent, fixed costs), mined/SEM (1.5x per volume, for caverns and short awkward links), immersed tube (bay crossings; costs not researched here).
10. **Non-metro unit rates** for the Caltrain/HSR/campus-branch missions: at-grade double track in existing corridor $25M/km, electrification $2M/km, greenfield HSR on flat land $30M/km, mainline bored tunnel without stations ~$200-250M/km PPP (Lodz HSR tunnel: 383-478M PLN/km), all x4.5 (or project-specific) under status quo. CAHSR's $130-175M/km in the Central Valley and Caltrain's ~$15M+/km electrification are the SQ reference quotes.
11. **Label speculative tech** in the UI. Sourced and achieved: continuous advance, double shield, standard stations, 24/7 work. Claimed only: sub-$5M/mile, mile-per-week, 7 miles/day.

## Open questions

- TCP-DB aggregates here are my own grouping (>=80% tunnel, 2025$ column). Decide whether to ship a trimmed copy of the dataset with the game as "real-world quotes"; check the NYU dataset licence first (https://doi.org/10.58153/9wnjp-kez15).
- Warsaw station-level contract prices and the tunnel/station/system split for M2 extensions: not found. The $140M standard station is derived from TCP's composite split. Polish trade papers (Nowoczesne Budownictwo Inzynieryjne) likely have it.
- Official 2026 cost estimates for Warsaw M3 and M4, and length/scope of the 959M PLN Bemowo contract: UNVERIFIED.
- CPK HSR Warsaw - Lodz: per-km estimate and any line-section contract awards after mid-2026: not found; the 76.8bn PLN / 480 km figure has unverified scope.
- PKP PLK official average cost per km by work type: not found; figures here are derived from individual contracts.
- Lodz tunnel: total length is reported inconsistently (TCP 5.25 km; PLK 4.5 km of single-track bores plus the double-track bore); Katarzyna's diameter and the Nov 2026 re-tender status were not confirmed.
- California HSR Phase 1 headline: $126.2B vs $231.3B both attributed to the draft 2026 Business Plan; needs the plan itself.
- Link21, Dumbarton, Caltrain grade separations, Valley Link, SMART: cost estimates not gathered (search budget exhausted). Needed for mission "status quo quotes".
- The Portal cost breakdown by FTA standard cost category (guideway, stations, systems, ROW, professional services, contingency): not extracted; the TJPA July 2025 board presentation should have it. Length is 1.3 mi in the 2026 SFCTA memo; older press says 2.2 mi (includes approach tracks?).
- Eno Center cost database findings (US soft-cost share, tunnel premium) were not fetched; the 35% soft-cost figure here is from an industry article, not Eno.
- Typical European TBM crew per shift, 6-7 m EPB purchase price, and cut-and-cover vs bored cost per km in comparable ground: no primary source found. Diameter exponent (1.5-1.7) and all geology multipliers are tuning assumptions; HS2-TG references an Infrastructure UK diameter/cost chart worth digitising.
- Bay Area geology multipliers need the geology researcher's input (Bay Mud, Colma formation, Franciscan complex, groundwater, fault crossings) before the per_m and rate factors are trusted.
- Immersed-tube and long under-bay bored tunnel unit costs (Link21, Dumbarton) not researched.
- Does the game want operating economics (fares, ridership, O&M)? Not covered here; only capital cost.

## Corrections (2026-11-09 fact-check)

Confirmed without change: all section 1 TCP-DB aggregates and the section 2.1/3.2 TCP rows (recomputed from a fresh download of the sheet: 1,152 rows, 23,759 km), TCP's $252.28M/km over 20,809 km, every HS2-TG rate and the 7 km worked example, the TCP-FR factors (2.06 / 1.35 / 1.5 / 1.85 / 1.2 = 9.34), ECA-2018 Table 5, The Portal cost figures and CIG share, Caltrain $2.44B, Central Subway $1.578B to $1.95B, BART SV II $12.1-12.5B, the tunnelingonline splits, the Robbins records, Boring Company targets and the 2.28-mile drive.

- The Portal service date: "fall 2035" changed to Q1 2036, and the process length from 16 to 17 years (sections 3.1, 7.5). Source: SFCTA memo of 23 Jan 2026 already cited in section 3.1, Attachment 5 milestones table.
- BART SV II FFGA: "FFGA 2027" changed to "application planned by end of 2026, award date UNVERIFIED" (section 7.5). The $12.7B is VTA's own estimate quoted by the grand jury, not a grand jury estimate; opening 2037 (VTA) or 2039 (PMOC) added. Source: Santa Clara County Civil Grand Jury report, 17 June 2026 (cited in section 3.1).
- BART single bore: "VTA's Aug 2025 report" changed to the Mott MacDonald analysis presented 11 Sept 2025; the linked VTA blog is from Dec 2021. Source: same grand jury report.
- Lodz cross-city tunnel: work did not stop at the Sept 2024 collapse; the TBM has been idle since 10 Nov 2024 (1,496 m in 4.5 years, 17.5% utilisation). Source: inzynierbudownictwa.pl, 10 Feb 2026 (cited in section 2.2).
- Lodz HSR tunnel: 383 vs 478M PLN/km is net vs gross of one price, not bid vs contract; ~14 m diameter added. Source: arithmetic on the cited figures; superbiz.se.pl, 27 June 2025.
- Warsaw M2 Bemowo section length: 2.7 km per the cited Railway Gazette article. TBM start date (14 Aug 2024) and the derived ~10 m/day marked UNVERIFIED: the cited article gives only the 5,688 m, 3,792 rings and the 21 May 2025 finish.
- Vegas Loop: "14 stations open" replaced by a 9 to ~14 range marked UNVERIFIED (Wikipedia LVCC Loop, tesorb tracker and Wikipedia TBC disagree). The "~11 h/day" mining estimate marked UNVERIFIED.
- Madrid in TCP-DB: "$35-94M/km" changed to $35-92M/km (1995-2015) and $101-123M/km (current projects). Source: TCP-DB.
- California HSR: reduced-scope caveat and the IG's omitted-cost list added to Merced - Bakersfield; Phase 1 $126.2B / $231.3B stay UNVERIFIED (absent from both cited sources), with the 2024 Business Plan $89-128B as the last confirmed range. Sources: kmph.com, 11 Aug 2026; Wikipedia.
- CPK Kotowice section: "six consortia" changed to "at most six bidders admitted to stage two". Source: the cited bankier.pl article, 29 Dec 2025.
- World Bank 2014 HSR figures and the OECD PPP figures marked UNVERIFIED: source URLs returned 404 and 403.

