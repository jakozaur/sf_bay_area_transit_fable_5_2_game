# 11. Polish road costs as the reformed baseline

Status: research note, 2026-11-09. Scope: Polish A/S road programme (track record, unit costs, tunnels, bridges), US/California comparators, transfer to rail and bored-tunnel game constants. Rail and metro costs proper live in `06-construction-costs.md`; only a cross-check here.

Conventions
- PLN contract values are as announced at signing. GDDKiA normally announces gross values (incl. 23% VAT); per-row gross/net status is UNVERIFIED. Net = gross / 1.23. US figures carry no VAT. Ratios below state which basis they use.
- USD at signing = NBP table A annual average for that year (2014 3.154, 2015 3.773, 2016 3.944, 2017 3.778, 2018 3.612, 2019 3.840, 2020 3.898, 2021 3.865, 2022 4.462, 2023 4.203, 2024 3.980, 2025 3.759, 2026 Jan to 9 Nov 3.71) [NBP].
- "2026 PLN" = value x Eurostat HICP Poland (2015 = 100: 2014 100.7, 2016 99.8, 2017 101.4, 2018 102.6, 2019 104.8, 2020 108.6, 2021 114.3, 2022 129.4, 2023 143.5, 2024 148.7, 2025 153.7) [HICP]. The 2026 index is ASSUMED at 158.3 (2025 + 3%), UNVERIFIED. "2026 USD" = 2026 PLN / 3.71.
- HICP is a consumer index. It overstates road price drift: 2024 contracts actually signed average 41.4 mln PLN/km (section 2.3), while HICP-inflated 2018 to 2020 contracts land at 57 to 70. Treat real 2024 to 2026 signings as the best "2026 price" anchor and the inflated column as an upper bound.
- PPP: World Bank GDP PPP factor for Poland 1.765 (2015), 1.698 (2020), 1.753 (2021), 1.920 (2023), 1.949 (2024), 1.970 (2025) PLN per international USD [WB-PPP]. Eurostat price level index 2024 (EU27 = 100): Poland GDP 71.9, Poland civil engineering works 83.1, US GDP 144.7 [PLI]. Civil engineering in Poland is 16% pricier relative to the EU than Polish GDP as a whole, so a civil-engineering PPP is about 1.97 x 83.1/71.9 = 2.28 PLN/USD (2025), ASSUMING the US civil-engineering price level equals its GDP price level (UNVERIFIED; Eurostat does not publish US construction PLIs in this table).
- Research limit: the session's web-search budget ran out part-way. Contract values for 2014 to 2020 therefore come from the Polish Wikipedia year-by-year tables [W], which compile GDDKiA signing announcements; spot checks against press/GDDKiA text matched (S1 989.75 mln, S7 968.87 mln, S1 1,378.95 mln, S19 2.2 mld, S61 values). Several US figures could not be re-verified against a primary source and are flagged.

## 1. Track record

### 1.1 Network and output

| Metric | Value | Source |
|---|---|---|
| Fast-road network 2002 (GDDKiA founded) | about 410 km A + 110 km S | [AS22] |
| Network at EU accession 2004 | "over 610 km" (other sources 720 to 759 km; definitions differ) | [AS22] |
| Network end 2024 | 5,205.5 km (A 1,884.6 + S 3,320.9) | [G24] |
| Network end 2025 | 5,465.7 km (A 1,894.5 + S 3,571.2) | [G25], [TVN26] |
| Network 3 Nov 2026 | A 1,959.2 km complete (93% of 2,105.5 planned); S 3,690.6 km dual + 144.5 km single carriageway (of 6,175 planned). Sum about 5,650 km dual | [W] |
| Planned for 2026 | 290.8 km openings | [TVN26] |
| Under construction end 2025 | 116 tasks, 1,373 km, 55.8 mld PLN (40.6 mln PLN/km) | [G25] |
| In tender end 2025 | 42 tasks, 566 km, est. 23.6 mld PLN (41.7 mln PLN/km) | [G25] |

Km of A + S opened per year. 2004 to 2017 from [W] (table totals); 2018 to 2023 from GDDKiA's own table [GSZ] (A + S only; GDDKiA also counts DK bypasses); 2024 [G24]; 2025 [G25].

| Year | A + S km | Year | A + S km | Year | A + S km |
|---|---|---|---|---|---|
| 2004 | 103.3 | 2012 | 639.1 | 2020 | 123.1 (+14.6 DK) |
| 2005 | 115.2 | 2013 | 297.7 | 2021 | 379.0 (+46.6 DK) |
| 2006 | 182.7 | 2014 | 278.9 | 2022 | 266.9 (+54.9 DK) |
| 2007 | 40.5 | 2015 | 33.5 | 2023 | 248.1 (+18.4 DK) |
| 2008 | 209.9 | 2016 | 123.1 | 2024 | 123.2 (+32.7 DK) |
| 2009 | 147.6 | 2017 | 294.0 | 2025 | 390.4 incl. DK (404.5 with A2 Swory section); 1 A, 20 S, 17 DK sections |
| 2010 | 137.7 | 2018 | 304.2 (+17.1 DK) | | |
| 2011 | 313.0 | 2019 | 431.3 (+28.6 DK) | | |

- 2004 to 2024 sum: about 4,790 km, mean 228 km/yr, peak 639 km (2012, Euro 2012 deadline), troughs 2007 and 2015 (gaps between EU budget periods).
- [W] and [GSZ] disagree for some years (2018: 342 vs 304; 2021: 263 vs 379). Cause not established; GDDKiA numbers are preferred where available.
- Output is lumpy because contracts are signed in waves tied to EU perspectives: contracts signed 2014 424 km, 2015 700 km, 2016 234 km, 2017 265 km, 2018 444 km, 2019 96 km, 2020 274 km [W]; 2024 456.5 km / 18.9 mld PLN [G24]; 2025 175.7 km / 5.1 mld PLN [G25].

### 1.2 Programmes and money

| Programme | Budget | Scope | Source |
|---|---|---|---|
| PBDK 2014 to 2023 (persp. 2025) | 105 mld PLN originally, limit 163.9 mld PLN after the June 2020 update | 3,768 km incl. about 255 km A, 3,090 km S | [AS22] |
| RPBDK to 2030 (persp. 2033), Council of Ministers resolution 253/2022 of 13 Dec 2022 | 294.4 mld PLN KFD spending; raised in 2023 from 299.5 to 302.1 mld PLN to fund indexation (second figure from a search-result summary of the 2023 progress report, source document not opened: UNVERIFIED) | about 2,000 km A + S | [RPBDK] |
| Programme of 100 bypasses (to 2030) | about 28 mld PLN | about 830 km | [AS22] |
| GDDKiA investment spending | about 17 mld PLN (2023), about 19 mld PLN forecast 2024, about 20 mld PLN/yr planned to 2030 | | [G24], [GOP] |
| Cumulative national-road investment 2002 to 2021 | over 208 mld PLN | | [AS22] |
| EU co-financing since 2004 | over 104 mld PLN, i.e. about half of all spend | | [AS22] |
| EU ERDF + Cohesion Fund for Polish roads | EUR 16.74 bn (2007 to 2013), EUR 14.60 bn (2014 to 2020; almost 50% of all EU road money) | 1,056 km of new motorway 2007 to 2013 at 85% co-financing | [ECA20] |
| FEnIKS 2021 to 2027 | about 18 mld PLN available to GDDKiA, nearly 5 mld PLN secured in 2024 | | [G24] |

### 1.3 Delivery model

- Projektuj i buduj (design and build, FIDIC Yellow Book based) is the default for A/S since about 2014. The contractor gets a concept and the environmental decision, then designs, obtains the ZRID, and builds for a lump sum.
- Standard recent contract clock [AS10], [AS11]: 10 months design and ZRID application, about 7 months for the voivode to issue ZRID, 22 months of works; winter (16 Dec to 15 Mar) is excluded from the works clock. Headline "39 months" contracts therefore run about 45 calendar months. S1 Oświęcim–Dankowice (2020): 33 months, winters excluded from works only [M-S1].
- GDDKiA is moving some large tasks back to traditional "Buduj" after the environmental decision (A2 Łódź–Warsaw widening, S7 north of Warsaw) [GOP].
- ECA 2013 on the audited Polish projects: five of the seven audited projects delivered at original contract price across the whole sample were Polish; "the Polish project management system is designed to reduce any risk of additional claims"; mean opening delay 3 months (16.5%) in Poland vs 9 months (41%) across DE/EL/PL/ES [ECA13]. The flip side is section 1.5.

### 1.4 Specustawa drogowa (Act of 10 April 2003, consolidated text Dz.U. 2024 poz. 311) [SPEC]

| Rule | Content | Article |
|---|---|---|
| One decision | ZRID (zezwolenie na realizację inwestycji drogowej) approves location, land subdivision, and the building design in one act; opinions gathered in the procedure replace other consents | 11d(3), 11f, 12(1) |
| Authority | Voivode for national and voivodeship roads, starosta for county and municipal roads | 11a(1) |
| Deadline | 90 days from application; 500 PLN fine per day of delay imposed on the authority | 11a(3), 11h(1) |
| Expropriation | Land inside the ZRID lines passes to the State Treasury (or local government) by operation of law on the day the ZRID becomes final. No per-parcel negotiation is required first | 12(4) |
| Compensation | Set by separate decision within 30 days of ZRID becoming final (60 days from the grant of immediate enforceability). Based on state at first-instance ZRID date, value at valuation date. +5% if the owner hands over within 30 days; +10,000 PLN for an occupied dwelling | 12(4a to 4g), 18(1), 18(1e), 18(1f) |
| Immediate enforceability | On the road authority's request; allows taking possession and starting works before appeals end | 17 |
| Appeals | Appeal decided within 30 days; court complaint decided within 2 months | 11g(2) |
| Limits on annulment | No annulment if requested more than 60 days after the ZRID became final and works have started; after that the court may only declare the decision unlawful (damages, not demolition). Exception: conflict with the environmental decision | 31 |

- Observed vs statutory: contracts budget about 7 months for ZRID against the 90-day rule [AS10]. S2 Ursynów: contract Dec 2015, ZRID Dec 2017 (24 months) [IB-S2]. Świnoujście: contract Sep 2018, design July 2019, ZRID Oct 2019 (13 months) [IB-SW]. GDDKiA names late ZRIDs as a main delay cause [GSZ].
- NIK (P/13/157): land acquisition was not a material barrier in 2008 to 2013, and ZRID was sometimes used where deadlines did not justify it (from a search-result summary, report not opened: UNVERIFIED) [NIK13].
- The environmental decision (DŚU) sits outside the specustawa and precedes the tender. Typical duration of the pre-contract phase (corridor study, DŚU, tender): UNVERIFIED, no primary source found in this pass. One data point: S2 Ursynów tender launched 2013, contract signed Dec 2015 [IB-S2].

### 1.5 Known failures

| Episode | Facts | Source |
|---|---|---|
| COVEC, A2 Łódź–Warsaw | COVEC-led consortia held sections A (29.2 km) and C (20.0 km); contracts with the consortia signed 28 Sep 2009; terminated 13 June 2011 for contractor default. Re-let within 7 weeks: Eurovia/Warbud 989 mln PLN (33.9 mln/km), DSS/Bögl a Krýsl 756.05 mln PLN (37.8 mln/km). Passable June 2012 for Euro 2012, works to Oct 2012. The widely quoted original COVEC price (about 1.3 mld PLN, roughly half the estimate) is UNVERIFIED here | [W-A2] |
| 2011 to 2014 contract collapses | [W] lists terminated contracts: A4 Brzesko–Tarnów (2011), A4 Rzeszów Zach.–Centr. and S19 (May 2012), A4 Tarnów–Dębica (July 2012), A1 Toruń–Kowal 64 km (Sept 2012), S5 Kaczkowo–Korzeńsko (2013), S69 Bielsko–Żywiec (Dec 2013), A4 Rzeszów–Jarosław 41 km and A1 Łódź–Tuszyn 37 km (Jan 2014). DSS handed its A2 contract to its partner in March 2012 over liquidity. Insolvencies of PBG, Hydrobudowa, Poldim, Alpine Bau: from memory, UNVERIFIED here | [W], [W-A2] |
| Cause | Lowest-price tenders at the 2009 to 2010 trough, lump-sum risk transfer, no indexation, then a materials price spike. ECA: Polish roadway unit costs were the highest of the four audited countries, attributed partly to the size of the simultaneous programme | [ECA13] |
| Re-tender premium | S61 Budzisko–Suwałki 24 km: Impresa Pizzarotti 605.6 mln PLN (June 2017), terminated; Budimex 1,037 mln PLN (Jan 2020), +71%, opened 22 Dec 2022. S61 Łomża Zach.–Kolno 13 km: 525.6 mln PLN (2018, terminated), re-let 713.4 mln PLN (May 2022), +36%. Three S19 Białystok contracts signed Nov to Dec 2020 also terminated | [W61], [W] |
| Post-2022 indexation | GDDKiA: over 5 mld PLN paid in contract indexation since 2022; 74 annexes to design contracts and 72 to supervision contracts in 2024. Cap changes (5% to 10% in 2022, later higher): UNVERIFIED | [G25], [G24] |
| Tunnel schedule slips | S1 Węgierska Górka planned Aug 2023, opened 23 Oct 2025. S3 Bolków–Kamienna Góra planned H2 2023, opened 31 July 2024. S19 Babica first TBM drive took 17 months against about 9 planned (flysch, methane found July 2023, machine breakdowns) | [F-S1], [WR-S3], [IB-S19] |
| Rail counter-example | Łódź cross-city rail tunnel: 1.59 mld PLN contract (Dec 2017), 7.5 km; lead contractor Energopol bankrupt July 2019; TBM stopped Sept 2024 after a tenement collapse and stuck since 2025; PKP PLK terminated the contract 4 Feb 2026; planned 2022, still unfinished | [W-LDZ] |

## 2. Unit costs

### 2.1 Contract table (55 contracts or contract groups)

Columns: value in mln PLN at signing; mln PLN/km; mln USD/km at that year's NBP rate; mln PLN/km and mln USD/km in 2026 prices (HICP method above, upper bound). All sections are dual carriageway 2x2 unless noted; motorways from 2018 on A1 are 2x3.

| Class | Road | Section | km | mln PLN | Year | PLN/km | USD/km | 2026 PLN/km | 2026 USD/km | Src |
|---|---|---|---|---|---|---|---|---|---|---|
| Motorway | A1 | Stryków–Tuszyn | 37 | 1,027.4 | 2014 | 27.8 | 8.8 | 43.7 | 11.8 | [W] |
| Motorway | A4 | Rzeszów Wsch.–Jarosław Zach. | 41 | 719.0 | 2014 | 17.5 | 5.6 | 27.6 | 7.4 | [W] |
| Motorway | A1 | Częstochowa Płn.–Częstochowa Zach. | 20.27 | 703.3 | 2015 | 34.7 | 9.2 | 54.9 | 14.8 | [W] |
| Motorway | A1 | Woźniki–Pyrzowice | 15.15 | 609.5 | 2015 | 40.2 | 10.7 | 63.7 | 17.2 | [W] |
| Motorway | A2 | Warszawa Lubelska–obw. Mińska Maz. | 14.6 | 502.5 | 2017 | 34.4 | 9.1 | 53.7 | 14.5 | [W] |
| Motorway | A1 | Tuszyn–Piotrków Tryb. Płd. (rebuild of DK1 to 2x3) | 15.9 | 478.9 | 2018 | 30.1 | 8.3 | 46.5 | 12.5 | [W] |
| Motorway | A1 | Kamieńsk–Radomsko (rebuild to 2x3) | 16.7 | 573.1 | 2018 | 34.3 | 9.5 | 52.9 | 14.3 | [W] |
| Motorway | A1 | Piotrków Tryb. Płd.–Kamieńsk (rebuild to 2x3) | 24.2 | 857.0 | 2019 | 35.4 | 9.2 | 53.5 | 14.4 | [W] |
| Motorway | A2 | Kałuszyn–Groszki | 12 | 499.8 | 2020 | 41.6 | 10.7 | 60.7 | 16.4 | [W] |
| Motorway | A2 | Siedlce Zach.–Siedlce Płd. | 12 | 559.2 | 2020 | 46.6 | 12.0 | 67.9 | 18.3 | [W] |
| Motorway | A2 | Kijowiec–Dobryń ("over 9 km", "almost 460 mln") | 9 | 460 | 2026 | 51.1 | 13.8 | 51.1 | 13.8 | [AS26] |
| Expressway, rural | S3 | Nowa Sól Płd.–Polkowice Płn. | 33.3 | 803.0 | 2014 | 24.1 | 7.6 | 37.9 | 10.2 | [W] |
| Expressway, rural | S5 | Poznań Zach.–Wronczyn | 16 | 529.0 | 2015 | 33.1 | 8.8 | 52.3 | 14.1 | [W] |
| Expressway, rural | S7 | Chęciny–Jędrzejów | 21.55 | 585.7 | 2015 | 27.2 | 7.2 | 43.0 | 11.6 | [W] |
| Expressway, rural | S6 | Goleniów–Nowogard | 19.2 | 343.9 | 2015 | 17.9 | 4.7 | 28.4 | 7.6 | [W] |
| Expressway, rural | S17 | obw. Garwolina–gr. woj. maz./lub. | 25.2 | 602.1 | 2015 | 23.9 | 6.3 | 37.8 | 10.2 | [W] |
| Expressway, rural | S5 | Wronczyn–Kościan Płd. | 19 | 360.0 | 2016 | 18.9 | 4.8 | 30.1 | 8.1 | [W] |
| Expressway, rural | S61 | Stawiski–Szczuczyn | 18 | 342.1 | 2017 | 19.0 | 5.0 | 29.7 | 8.0 | [W] |
| Expressway, rural | S7 | Mława–Strzegowo | 21.5 | 446.1 | 2017 | 20.7 | 5.5 | 32.4 | 8.7 | [W] |
| Expressway, rural | S19 | Lublin–Kraśnik Płd. (3 contracts) | 42 | 1,129.7 | 2018 | 26.9 | 7.4 | 41.5 | 11.2 | [W] |
| Expressway, rural | S61 | Szczuczyn–Ełk Płd. | 23 | 699.5 | 2018 | 30.4 | 8.4 | 46.9 | 12.6 | [W] |
| Expressway, rural | S6 | Szemud–Gdynia | 20 | 817.0 | 2018 | 40.9 | 11.3 | 63.0 | 17.0 | [W] |
| Expressway, rural | S11 | Koszalin–Zegrze Pomorskie | 16.8 | 579.8 | 2020 | 34.5 | 8.9 | 50.3 | 13.6 | [W] |
| Expressway, rural | S7 | Moczydło–Miechów | 18 | 752.9 | 2020 | 41.8 | 10.7 | 61.0 | 16.4 | [W] |
| Expressway, rural | S3 | Świnoujście–Dargobądz | 17.1 | 688.8 | 2020 | 40.3 | 10.3 | 58.7 | 15.8 | [W] |
| Expressway, rural | S17 | Zamość Płd.–Tomaszów Lub. Płn. | 18 | 822.5 | 2022 | 45.7 | 10.2 | 55.9 | 15.1 | [W17] |
| Expressway, rural | S10 | Stargard–Suchań | 13.8 | 450.4 | 2024 | 32.6 | 8.2 | 34.7 | 9.4 | [AS10] |
| Expressway, rural | S10 | Recz–Cybowo | 15.68 | 647.0 | 2024 | 41.3 | 10.4 | 43.9 | 11.8 | [AS10] |
| Expressway, rural | S17 | Krasnystaw Płn.–Izbica | 17.8 | 961.5 | 2024 | 54.0 | 13.6 | 57.5 | 15.5 | [W17] |
| Expressway, rural | S17 | Piaski Wsch.–Łopiennik | 15.9 | 810 | 2024 | 50.9 | 12.8 | 54.2 | 14.6 | [W17] |
| Expressway, rural | S16 | Knyszyn–Krynice | 8.5 | 314.7 | 2024 | 37.0 | 9.3 | 39.4 | 10.6 | [ASB] |
| Expressway, rural | S19 | Białystok Płn.–Dobrzyniewo | 9.5 | 321 | 2024 | 33.8 | 8.5 | 36.0 | 9.7 | [ASB] |
| Bypass (S class) | S61 | obw. Suwałk | 12.8 | 299.4 | 2015 | 23.4 | 6.2 | 37.0 | 10.0 | [W] |
| Bypass (S class) | S10 | obw. Wałcza | 17.8 | 430.5 | 2015 | 24.2 | 6.4 | 38.3 | 10.3 | [W] |
| Bypass (S class) | S6/S11 | obw. Koszalina i Sianowa | 20.1 | 645.6 | 2016 | 32.1 | 8.1 | 50.9 | 13.7 | [W] |
| Bypass (S class) | S11 | obw. Kępna | 7 | 122.7 | 2017 | 17.5 | 4.6 | 27.4 | 7.4 | [W] |
| Bypass (S class) | S17 | obw. Tomaszowa Lub. (single carriageway) | 9.6 | 193.5 | 2017 | 20.2 | 5.3 | 31.5 | 8.5 | [W] |
| Bypass (S class) | S61 | Łomża Płd.–Łomża Zach. | 7.18 | 218.1 | 2017 | 30.4 | 8.0 | 47.4 | 12.8 | [W] |
| Bypass (S class) | S11 | obw. Olesna | 24.8 | 667.6 | 2019 | 26.9 | 7.0 | 40.7 | 11.0 | [W] |
| Bypass (S class) | S61 | Łomża Zach.–Kolno (obw. Łomży, rebid) | 12.99 | 713.4 | 2022 | 54.9 | 12.3 | 67.2 | 18.1 | [W61] |
| Urban / metropolitan | S8 | Marki–Radzymin Płd. (Warsaw) | 15.4 | 737.5 | 2014 | 47.9 | 15.2 | 75.3 | 20.3 | [W] |
| Urban / metropolitan | S7 | Rybitwy–Igołomska (Kraków, Vistula bridge) | 4.5 | 528.9 | 2014 | 117.5 | 37.3 | 184.8 | 49.8 | [W] |
| Urban / metropolitan | S2 | POW Puławska–Lubelska (3 contracts: 2.3 km tunnel, 1.5 km Vistula bridge) | 18.5 | 2,541.3 | 2015 | 137.4 | 36.4 | 217.5 | 58.6 | [W] |
| Urban / metropolitan | S17 | Warszawa Zakręt–Lubelska | 2.5 | 224.9 | 2017 | 90.0 | 23.8 | 140.4 | 37.9 | [W], [W17] |
| Urban / metropolitan | S7 | Warszawa Lotnisko–Grójec (3 contracts) | 29.34 | 813.5 | 2017 | 27.7 | 7.3 | 43.3 | 11.7 | [W] |
| Urban / metropolitan | S14 | Łódź Lublinek–Łódź Teofilów | 12.2 | 561.8 | 2018 | 46.0 | 12.8 | 71.0 | 19.2 | [W] |
| Urban / metropolitan | S52 | Kraków Modlniczka–Mistrzejowice (2 cut-and-cover tunnels) | 12.3 | 1,428.0 | 2018 | 116.1 | 32.1 | 179.1 | 48.3 | [W] |
| Urban / metropolitan | S7 | Widoma–Kraków Nowa Huta | 18.3 | 1,072.5 | 2018 | 58.6 | 16.2 | 90.4 | 24.4 | [W] |
| Urban / metropolitan | S7 | Modlin–Czosnów (Warsaw north exit) | 9.7 | 598.8 | 2020 | 61.7 | 15.8 | 90.0 | 24.3 | [W] |
| Mountain / tunnel / hard ground | S7 | Naprawa–Skomielna Biała (2.06 km twin mined tunnel) | 3 | 968.8 | 2016 | 322.9 | 81.9 | 512.2 | 138.1 | [W] |
| Mountain / tunnel / hard ground | S7 | Lubień–Naprawa (mountain viaducts) | 7.5 | 615.0 | 2016 | 82.0 | 20.8 | 130.1 | 35.1 | [W] |
| Mountain / tunnel / hard ground | S3 | Bolków–Lubawka (2 contracts, 2.3 km NATM tunnel) | 31.4 | 2,380.0 | 2018 | 75.8 | 21.0 | 116.9 | 31.5 | [W] |
| Mountain / tunnel / hard ground | S1 | Przybędza–Milówka (two twin NATM tunnels) | 8.5 | 1,379.0 | 2019 | 162.2 | 42.2 | 245.1 | 66.1 | [W], [NBI-T] |
| Mountain / tunnel / hard ground | S1 | Oświęcim–Dankowice (mining-damage area) | 15 | 989.8 | 2020 | 66.0 | 16.9 | 96.2 | 25.9 | [W], [M-S1] |
| Mountain / tunnel / hard ground | S19 | Rzeszów Płd.–Babica (2.26 km twin TBM tunnel) | 10.3 | 2,230.0 | 2020 | 216.5 | 55.5 | 315.6 | 85.1 | [W], [G-S19] |

### 2.2 Averages and ranges (from the table)

| Class | n | Nominal mln PLN/km, range (median) | Nominal mln USD/km, range | 2026 mln PLN/km, range (median; length-weighted) | 2026 mln USD/km, median |
|---|---|---|---|---|---|
| Motorway | 11 | 17.5 to 51.1 (34.7) | 5.6 to 13.8 | 28 to 68 (53; 48) | 14.4 |
| Expressway, rural | 21 | 17.9 to 54.0 (33.1) | 4.7 to 13.6 | 28 to 63 (43; 44) | 11.6 |
| Bypass, S class | 8 | 17.5 to 54.9 (25.6) | 4.6 to 12.3 | 27 to 67 (39; 44) | 10.6 |
| Urban / metropolitan | 9 | 27.7 to 137.4 (61.7) | 7.3 to 37.3 | 43 to 218 (90; 108) | 24.4 |
| Mountain / tunnel | 6 | 66.0 to 322.9 (122) | 16.9 to 81.9 | 96 to 512 (188; 171) | 50.6 |

- Motorway and expressway cost the same per km once both are 2x2 on new alignment; GDDKiA says so itself [AS20].
- Urban is 2 to 3x rural; tunnel-heavy sections are 4 to 12x rural.

### 2.3 Published averages

| Figure | Value | Source |
|---|---|---|
| GDDKiA 2020: expressways under construction, average | about 41 mln PLN/km; about 35 mln PLN/km excluding the expensive outliers | [AS20] |
| GDDKiA 2020: range motorway / expressway | 34.6 to 50.6 / 35 to 41 mln PLN/km | [AS20] |
| GDDKiA 2020 outliers | S2 Ursynów tunnel section 282; S1 Przybędza–Milówka 160; S2 Vistula bridge section 123; S3 Bolków–Kamienna Góra 102 mln PLN/km | [AS20] |
| GDDKiA 2021 | A2 east of Mińsk Maz. contracts 29.3 to 41.2 (2020 estimate 41.4 to 44.8); S11 Olesno bypass about 26.9; A18 second carriageway rebuild 11.4 to 15.9 mln PLN/km | [AS21] |
| GDDKiA (undated, cited 2017) | motorway average EUR 9.6 mln/km; "about EUR 10 mln/km" for a fast road, 2012 | [MON17] |
| Portfolio averages, contracts signed | 2014 27.0; 2015 32.2; 2016 34.4; 2017 22.4; 2018 36.9; 2019 40.5; 2020 48.2 mln PLN/km | [W] (table totals) |
| Portfolio averages, GDDKiA | 2024: 41.4 mln PLN/km all (RPBDK 43.9; PB100 bypasses 22.6). 2025: 29.0 all (S 37.9; bypasses 25.8). Under construction end 2025: 40.6 | [G24], [G25] |
| ECA 2013, all audited projects (DE/EL/PL/ES) | total cost per km: motorway EUR 10.94 mln, express road EUR 6.23 mln, two-lane EUR 4.16 mln | [ECA13] |
| ECA 2013, per 1,000 m2 of road surface | total cost: DE 287,043; PL 445,129; ES 496,208 EUR. Roadway-only: Poland highest of four (163,370 EUR by chart reading, UNVERIFIED assignment), Germany lowest (87,217) | [ECA13] |
| ECA 2013 unit prices, Poland | bridge deck EUR 1,135/m2 (DE 1,332; EL 1,294; ES 697); deck concrete EUR 228/m3; safety barrier EUR 35/m | [ECA13] |

Working number for 2026: 40 to 45 mln PLN/km gross for a rural 2x2 expressway including design, structures, interchanges, service roads, noise walls (USD 11 to 12 mln/km at 3.71; about USD 9 to 10 mln/km net of VAT). Land, supervision and GDDKiA overhead are outside these contract values; S2 Ursynów shows the scale: works about 1.2 mld PLN, whole investment incl. documentation, land, supervision about 1.66 mld PLN (+38%) [NBI22].

## 3. Tunnels and bridges

### 3.1 Tunnel inventory

| Tunnel | Geometry | Method | Cost | Timeline | Source |
|---|---|---|---|---|---|
| S2 Ursynów, Warsaw | 2,335 m; one box 41.2 m wide (up to 50 m at bays), two 3-lane + shoulder naves and a service nave; under metro M1 | Cut and cover, top-down (metoda podstropowa): 125,000 m2 diaphragm walls, roof slab cast on grade, 1.3 mln m3 excavated beneath, 295,000 to 315,000 m3 concrete, 33,700 t steel | Section contract (4.6 km incl. tunnel) 1,222 mln PLN gross, Astaldi; works about 1.2 mld, whole investment about 1.66 mld PLN | Tender 2013; contract Dec 2015; ZRID Dec 2017; works start 2017; open 20 Dec 2021 (72 months from contract) | [IB-S2], [NBI-T], [NBI22] |
| S7 Naprawa–Skomielna Biała (Luboń Mały) | 2 x 2,058 m, 2 lanes + shoulder each; excavation width 17.3 to 18.3 m; max cover 93 m; 11 cross passages at 172.5 m | Mined, ADECO-RS full-face (Lunardi) in fractured Carpathian flysch; about 1.1 mln m3 rock excavated | Contract 968.87 mln PLN (3 km section), Astaldi. GDDKiA: drive + temporary lining 157 mln; with final lining 567 mln; tunnel total about 900 mln; 225 mln PLN per km of single tube | Contract 29 June 2016; breakthroughs 23 Oct 2019 ("2 years 5 months" of driving) and April 2020; open 12 Nov 2022 (76 months) | [NBI-T], [NBI-T22], [search summary of GDDKiA/IB pages] |
| Świnoujście (DK93, under the Świna) | 1,483.8 m bored + ramps (about 100 m Wolin, 200 m Uznam); total about 1,800 m; single tube, 2 lanes bidirectional; curve radius about 300 m | Slurry TBM "Wyspiarka" (Herrenknecht; articulated shield), cutterhead 13.46 m; 785 rings of 1.5 or 2 m; ramps top-down in diaphragm walls; cross-passage ground freezing | Contract about 793.2 mln PLN (PORR/Gülermak/Energopol), total investment 913.8 mln PLN, EU up to 775 mln. GDDKiA: 200 mln PLN per km of tunnel | Contract Sept 2018; design July 2019; ZRID Oct 2019; TBM start 5 March 2021; breakthrough Sept 2021; open 30 June 2023 (57 months) | [IB-SW], [NBI-T], [CD-SW], [PN-SW] |
| S3 Bolków–Kamienna Góra | TS-26: 2 x 2,300 m, 2 lanes + shoulder; TS-32: 2 x 320 m | TS-26 NATM (excavator with hammer/roadheader or blasting, four faces, 16 support classes); about 580,000 m3 muck. TS-32 cut and cover, about 220,000 m3 excavated, up to 12 m backfill | Section contract "over 1.5 mld PLN" (16.1 km), PORR; total investment nearly 1.9 mld PLN, EU 928 mln | Contract Oct 2018; drive start Dec 2020; open 31 July 2024 (69 months; planned H2 2023) | [NBI-T], [G-S3], [WR-S3] |
| S19 Rzeszów Płd.–Babica | 2 x 2,255 m, usable width 12.4 m (2 lanes + shoulder); up to 100 m cover; 15 cross passages | TBM "Karpatka", cutterhead 15.16 to 15.2 m, 114 m long, 4,400 t (type EPB/multi-mode: UNVERIFIED); 10-segment rings, about 1,100 rings per bore; Carpathian flysch, methane | Section contract about 2.2 mld PLN (10.3 km: 2,230 mln), Mostostal Warszawa / Acciona | Contract July 2020; site start April 2022; TBM start 11 July 2024; first bore through 10 Dec 2025 (17 months vs about 9 planned); U-turn early 2026 (about 3 months); section due Jan 2028 | [G-S19], [IB-S19], [G-S19b], [W] |
| S1 Węgierska Górka bypass | TD1: 834 + 807 m; TD2: 984 + 975 m; usable width 10.8 m, 2 lanes | NATM | Section contract 1,378.95 mln PLN (8.5 km), Mirbud/Kobylarnia. GDDKiA: 117.3 (TD1) and about 120 (TD2) mln PLN per km of single tube, fitted out | Contract Oct 2019; open 23 Oct 2025 (72 months; planned Aug 2023) | [NBI-T], [F-S1] |
| Gdańsk, under the Martwa Wisła | 2 tubes x 1,072.5 m bored + 305 m open cut; 1,377.5 m total; 2 lanes per tube; bored/lined 11 m inner working width; 7 cross passages by ground freezing | Slurry Mixshield "Damroka" (Herrenknecht), 12.56 m, 91 m, 2,200 t; 1,076 rings of 7 segments; cover as low as 7 m; 500,000 t muck | Construction 885.6 mln PLN (OHL; city had budgeted 510 mln); whole route investment 1.45 mld PLN, EU about 1.15 mld | Works Oct 2011; TBM start 29 May 2013; first tube 6 months, second half that; open 24 April 2016 | [GDMT], [W-GD] |
| S52 Kraków northern bypass | TS-04 653 m and TS-14 496 m; boxes 37 to 39 m wide, 3 lanes + shoulder per direction; below groundwater | Cut and cover in diaphragm walls | TS-04: 135 mln PLN structure, about 263 mln fitted out. TS-14: about 185 mln PLN per km complete | Contract Nov 2018 (section 12.3 km, 1,428 mln PLN) | [NBI-T], [W] |
| S69/S1 Laliki "Emilia" | 678 m, single tube | Mined + cut and cover | 391 mln PLN ("cost of this investment", probably the whole section) | Open 2009/2010 | [NBI-T] |
| Planned | S6 Szczecin western bypass, Odra tunnel about 5 km TBM twin; S19 Jawornik–Domaradz T-2 2,910 m and T-3 990 m (TBM vs NATM muck estimate 1.28 vs 1.13 mln m3); S7 Kiełpin–Warsaw 1,000 + 1,122 m top-down | | | | [NBI-T] |

### 3.2 Derived tunnel unit costs

Cross-sections: 13.46 m bore = 142.3 m2; 12.56 m = 123.9 m2; 15.2 m = 181.5 m2. "All-in" divides the whole contract (ramps, portals, fit-out, road deck) by bored volume, so it is an upper bound for boring itself. 2026 PLN by HICP from the mid-point of construction.

| Tunnel | Basis | Per km | Per m3 | 2026 PLN per m3 | 2026 USD per m3 (3.71) |
|---|---|---|---|---|---|
| Świnoujście, slurry TBM 13.46 m | GDDKiA "200 mln PLN/km" (tunnel structure) | 200 mln PLN per tube-km | 1,405 PLN | 1,950 | 525 |
| Świnoujście | All-in: 793.2 mln PLN / 211,000 m3 bored | 440 mln PLN per km of 1.8 km tunnel | 3,760 PLN | 5,200 | 1,400 |
| Gdańsk, slurry TBM 12.56 m | All-in: 885.6 mln PLN / 265,800 m3 bored | 413 mln PLN per tube-km | 3,330 PLN | 5,240 | 1,410 |
| S7 Luboń Mały, mined | GDDKiA 225 mln PLN per tube-km; about 900 mln PLN / 1.1 mln m3 | 225 mln PLN per tube-km | 820 PLN | 1,240 | 335 |
| S1 Węgierska Górka, NATM | GDDKiA 117 to 120 mln PLN per tube-km fitted out | 117 to 120 mln PLN per tube-km | n/a (volume not published) | n/a | n/a |
| S2 Ursynów, top-down box | Upper bound: whole 1,222 mln PLN section contract / 1.3 mln m3 | 523 mln PLN per km of 6-lane box | 940 PLN | 1,450 | 390 |
| S2 Ursynów | Same, per m2 of footprint (2,335 x 41.2 m) | | 12,700 PLN/m2 | 19,600 PLN/m2 | 5,280 USD/m2 |
| S52 TS-14, cut and cover | GDDKiA 185 mln PLN/km complete, 38 m wide | 185 mln PLN/km | 4,870 PLN/m2 footprint | 6,740 PLN/m2 | 1,820 USD/m2 |
| S52 TS-04, cut and cover | 263 mln PLN fitted out / 653 m, 37 m wide | 403 mln PLN/km | 10,890 PLN/m2 footprint | 15,080 PLN/m2 | 4,060 USD/m2 |

- Two independent large slurry drives (Gdańsk 2011 to 2016, Świnoujście 2018 to 2023) converge on about 5,200 PLN per bored m3 all-in in 2026 money. Structure-only is under half of that.
- Mined rock tunnels are 3 to 4x cheaper per m3 than slurry TBM under water. Cut and cover sits in between per m3 but is the most expensive per route-km because the box is wide.

### 3.3 Advance rates and durations

| Drive | Rate | Derivation | Source |
|---|---|---|---|
| Świnoujście 13.46 m slurry | start-up 1.5 to 3 m/day; target about 10 m/day reached April 2021; whole drive mean about 7.5 m/day | 1,484 m, 5 March to Sept 2021 (about 195 days, exact end day UNVERIFIED) | [CD-SW], [IB-SW] |
| Gdańsk 12.56 m slurry | tube 1 about 5.9 m/day; tube 2 about 11.8 m/day | 1,072.5 m in 6 months, then "twice as fast" | [GDMT] |
| S19 15.2 m in flysch | first bore about 4.3 m/day; plan about 8 m/day | 2,255 m, 11 July 2024 to 10 Dec 2025 (517 days) vs "about 9 months" | [G-S19], [IB-S19] |
| S7 Luboń Mały, mined | about 2.3 m/day per tube (two faces) | 2,058 m in 29 months | search summary of GDDKiA/IB pages |
| SR 99 Seattle 17.5 m EPB (comparison) | 2.1 m/day gross; 5.3 m/day after restart | 2,830 m, 30 July 2013 to 4 April 2017 incl. 2-year stoppage; last 2,500 m from 22 Dec 2015 | [WK-99] |

- Contract to TBM launch: Gdańsk about 20 months, Świnoujście 30 months, S19 48 months.
- Breakthrough to opening: Świnoujście 21 months, S7 31 months (second tube April 2020 to Nov 2022).
- Contract to opening for tunnel sections: 57 to 76 months. For plain sections: S61 Kolno–Stawiski and Stawiski–Szczuczyn signed 31 Oct 2017, opened July/Aug 2021 (45 months); S61 Ełk–Wysokie July 2018 to Aug 2023 (61 months); S61 Budzisko–Suwałki rebid Jan 2020 to Dec 2022 (35 months) [W61]. The 2020 signing cohort (S1, S3 Świnoujście–Troszyn, S7 Załuski–Czosnów) opened in 2025, about 5 years [W], [G25].

### 3.4 Bridges

| Bridge | Deck | Cost | Per m2 | Source |
|---|---|---|---|---|
| Most Rędziński, A8 Wrocław (cable-stayed, 2 x 256 m spans) | 1,742 m incl. approaches x 38.58 m; 70,000 m2 | 576 mln PLN; contract 20 May 2008, open 31 Aug 2011 (39 months) | 8,230 PLN/m2 (USD 3,420 at 2008 rate 2.41; about 15,000 PLN = USD 4,050 in 2026 money) | [W-RED] |
| Most Anny Jagiellonki, S2 Warsaw | river bridge 533.6 m, whole crossing 1,505 m x 45.8 m (about 68,900 m2) | inside the 757.64 mln PLN section B contract (6.5 km); ZRID 25 May 2017, open 22 Dec 2020 | under 11,000 PLN/m2 (upper bound: whole contract on the crossing) | [W-MAJ] |
| Toruń, gen. Zawackiej (arch) | 540 m; width 24 m (infobox) or 30 m (text) | 753 mln PLN for bridge with about 4.1 km of approaches; start Oct 2010, open Dec 2013 | not separable | [W-TOR] |
| ECA audited Polish projects (ordinary overpasses and viaducts) | | | EUR 1,135/m2, about 2008 to 2010 prices (4,540 PLN at ECA's 4.0 rate; about 8,000 PLN = USD 2,150 in 2026 money) | [ECA13] |

## 4. US / California comparison

### 4.1 Comparator data

| Item | Value | Timeline | Source |
|---|---|---|---|
| FHWA HERS typical cost per lane-mile, 2014 USD (C&P 23rd ed., Exhibit A-1), rural Interstate new alignment | flat 3.55 mln; rolling 4.49 mln; mountainous 10.12 mln | | [HERS] |
| Same, urban freeway new alignment, normal / high cost | small urbanized 7.65 / 26.11 mln; large urbanized 11.22 / 38.30 mln; major urbanized 22.44 / 85.85 mln | | [HERS] |
| Same, add lane, normal / high cost | rural flat 2.56; major urbanized 15.40 / 64.22 mln | | [HERS] |
| FHWA bridge replacement unit cost 2023 | California NHS USD 360/ft2 (3,875/m2); California non-NHS 466/ft2 (5,016/m2); US NHS 377/ft2 | | [FHWA-BR] |
| Presidio Parkway (Doyle Drive), SF | USD 851.6 mln (phase I 486.9, phase II P3 364.7) for 1.6 mi of 6 lanes with two pairs of cut-and-cover tunnels and a viaduct: USD 331 mln/km | P3 agreement Jan 2011; phase I open April 2012; major construction complete July 2015. Environmental start and ROD dates UNVERIFIED | [FHWA-PP] |
| Caldecott Tunnel fourth bore | about USD 420 mln for one 2-lane bore of 3,389 ft (1,033 m): USD 407 mln per tube-km. Method NATM/SEM: UNVERIFIED | Planning from 2000; excavation from Aug 2010; excavation complete Aug 2012; open Nov 2013 (13 years from planning start) | [WK-CAL] |
| Bay Bridge east span | USD 6.5 bn final (1997 estimate 1.1 bn; 2003 2.6 bn; 2005 6.2 bn); 2.2 mi (3.5 km) x 258.33 ft (78.74 m) total width, 10 lanes: about 275,600 m2, USD 23,600/m2, USD 1.86 bn/km | 1996 replacement analysis; construction 29 Jan 2002; open 2 Sept 2013 (planned 2007) | [WK-BB] |
| Devil's Slide (Tom Lantos) tunnels | two single-lane bores 4,149 ft and 4,008 ft (2.49 tube-km), 9 m wide; cost about USD 439 mln incl. approach bridges: from memory, UNVERIFIED | Measure T Nov 1996; groundbreaking May 2005; boring Sept 2007 to 2011; open 26 March 2013 (16.4 years from the vote, 7.9 years of construction) | [WK-TL] |
| SR 99 tunnel, Seattle | programme USD 3.137 to 3.29 bn; bored tunnel incl. access and surface connections USD 2,053 mln; 9,270 ft (2,830 m), 17.5 m EPB, double deck 4 lanes; USD 725 mln/km; USD 3,016 per bored m3. Overruns: about USD 223 mln from the stoppage, plus contractor claims | ROD Aug 2011; TBM start 30 July 2013; stopped 6 Dec 2013 to 22 Dec 2015; breakthrough 4 April 2017; open 4 Feb 2019 | [FHWA-99], [WK-99] |
| Port of Miami tunnel (closest US analogue to Gdańsk) | design-build USD 607 mln; total USD 1,113 mln; two tubes x 3,900 ft (1,189 m), 41 ft (12.5 m) TBM: USD 255 mln per tube-km; USD 2,080 per bored m3 | Financial close Oct 2009; construction May 2010; substantial completion Aug 2014 | [FHWA-PM] |
| I-405 Orange County (SR-73 to I-605) | USD 1.908 bn for 16 mi, +1 general lane and +1 express lane each direction (64 new lane-miles): USD 74 mln per route-km, USD 29.8 mln per lane-mile | D-B contract Jan 2017; substantial completion targeted Dec 2023 | [FHWA-405] |
| I-405 Sepulveda Pass | 10 mi, one HOV lane; "USD 1 billion" per Wikipedia (final about 1.6 bn widely reported: UNVERIFIED): USD 62 mln per route-km for one lane | open 23 May 2014 | [WK-405] |
| Gerald Desmond Bridge replacement, Long Beach | USD 1.561 bn, 2 mi, 6 lanes + shoulders: USD 485 mln/km | D-B contract July 2012; construction 2013; open 5 Oct 2020 | [FHWA-GD] |
| US 101 San Mateo express lanes | about USD 581 mln for 22 mi: from memory, UNVERIFIED (Caltrans and SMCTA pages returned errors) | | none |
| Caltrans per-lane-mile planning figures, California State Auditor findings | not retrieved in this pass | | none |

### 4.2 Ratios

Method: nominal = both sides in USD at the Polish contract year's market rate. PPP = Polish side converted at civil-engineering PPP (GDP PPP x 1.155; about 2.04 in 2015 to 2016, 2.02 in 2021, 2.22 in 2023, 2.28 in 2025), which is the right converter for "same real resources". Polish gross values are used unless stated; netting VAT raises every ratio by up to 1.23x.

| Asset | US / California | Poland | Nominal ratio | PPP ratio |
|---|---|---|---|---|
| Rural at-grade, 4 lanes new alignment | HERS rural Interstate flat to rolling: USD 8.8 to 11.2 mln/km (2014 USD) | 2014 to 2015 rural S contracts 18 to 33 mln PLN/km, median about 24 (USD 6.4 mln at 3.77; net of VAT USD 5.2 mln) | 1.4 to 1.8 gross; 1.7 to 2.2 net | 0.75 to 1.1 |
| Urban freeway, 6 lanes new alignment | HERS major urbanized normal: USD 84 mln/km; high cost: USD 320 mln/km | Urban S contracts 46 to 118 mln PLN/km (USD 12 to 32 mln) | 2.6 to 7 (normal); 10 to 27 (high) | 1.4 to 3.8 (normal) |
| Urban widening | I-405 Orange County USD 74 mln/km for +4 lanes | A1 Tuszyn–Częstochowa full rebuild to 2x3: 30 to 35 mln PLN/km (USD 8.3 to 9.5 mln); Warsaw S17 Zakręt–Lubelska new urban 90 mln PLN/km (USD 23.8 mln) | 3.1 (vs urban) to 8.9 (vs rural rebuild) | 1.7 to 4.9 |
| Urban cut-and-cover road | Presidio Parkway USD 331 mln/km | S2 Ursynów section 266 mln PLN/km (USD 70 mln at 3.77) | 4.7 | 2.5 |
| Standard bridge deck | California NHS USD 3,875/m2 (2023) | ECA Poland EUR 1,135/m2 (about 7,200 PLN in 2023 money, USD 1,720 at 4.20) | 2.3 | 1.2 |
| Signature bridge | Bay Bridge east span USD 23,600/m2; Gerald Desmond USD 485 mln/km | Rędziński USD 3,420/m2 at signing (USD 4,050 in 2026 money); 331 mln PLN/km (USD 137 mln at signing) | 6 to 7 per m2; 3.5 per km | 3 to 4; about 2 |
| Mined 2-lane tube | Caldecott 4th bore USD 407 mln per tube-km | S7 Luboń Mały 225 mln PLN (USD 57 mln at 3.94); S1 Węgierska Górka 117 to 120 mln PLN (USD 31 mln) | 7.1; 13 | 3.6; 7 |
| Large-diameter TBM, twin tube | Port of Miami USD 255 mln per tube-km (D-B cost) | Gdańsk 413 mln PLN per tube-km (USD 139 mln at 2011 rate 2.96) | 1.8 | about 1.3 (2014 PPP used as proxy for 2011: UNVERIFIED) |
| Large-diameter TBM, per bored m3 | SR 99 USD 3,016/m3 | Świnoujście all-in 3,760 PLN/m3 (USD 974 at 3.86) | 3.1 | 1.6 |

Reading
- Greenfield rural at-grade road: no real gap. Nominal 1.5 to 2x is wages and exchange rate; at PPP the US national model cost is at parity with Poland. HERS is a national model input, not a California bid price, so California rural is somewhat higher (not quantified here).
- The gap opens with urban context and structural complexity: 3 to 7x nominal, 1.5 to 4x at PPP for urban freeways, cut-and-cover, mined tunnels, signature bridges.
- Outside California, a well-run US tunnel job (Miami) is within 2x of Poland nominal. The Bay Area mined comparators (Caldecott, and Devil's Slide if the UNVERIFIED cost holds) are 3 to 7x nominal.
- Time: Polish contract-to-opening is 4 to 6 years including design and permit, and the permit itself is one decision with a 90-day statutory clock (7 to 24 months observed). California comparators: Caldecott 13 years planning to opening for 1 km; Devil's Slide 16 years from the vote; Bay Bridge east span 16 years from the replacement decision, 11.6 years of construction against a 5-year plan; SR 99 7.5 years from ROD.
- Defensible ratio: the PPP-adjusted one. Nominal ratios include the wage and exchange-rate gap, which no Bay Area reform can remove; a player who cuts red tape should converge on Polish productivity at Bay Area input prices, not on Polish sticker prices. Use nominal figures for flavour text only. Use civil-engineering PPP (about 2.3 PLN/USD), not GDP PPP (1.97), because construction inputs are more tradable than the GDP basket.

## 5. Transfer to the game

### 5.1 Derivation rules

1. Take Polish road unit rates per physical unit (m3 bored, m3 excavated, m2 of deck, m2 of box footprint, km of formation), in 2026 PLN.
2. Convert at civil-engineering PPP 2.3 PLN/USD to get the reformed Bay Area baseline in USD.
3. Apply a status-quo multiplier per asset class from the PPP ratios in 4.2.
4. Add what roads do not contain (track, power, signalling, stations, rolling stock) from `06-construction-costs.md`.

Scaling a rail tunnel from road tunnels
- Single-track metro tube, about 6.6 m excavated diameter: 34.2 m2, 34,200 m3 per tube-km, 68,400 m3 per route-km twin bore.
- At the all-in road rate (5,200 PLN/m3) twin bore = 356 mln PLN/km. This rate carries road-only items (road deck, jet fans, ramps), which pulls down; small bores lose scale economies per m3, which pushes up (size of either effect UNVERIFIED). Recommended: 4,400 PLN/m3, i.e. about 300 mln PLN per route-km of twin running tunnel, range 200 to 450.
- Rail viaduct, double track, 11 m deck: 8,000 PLN/m2 x 11,000 m2/km = 88 mln PLN/km.
- At-grade double track formation (earthworks, drainage, crossings, noise walls, no track): about half the formation width of a 2x2 expressway; 0.5 x 42 mln = about 20 mln PLN/km (range 12 to 30). The 0.5 factor is an assumption, UNVERIFIED.
- Earthworks unit rates (PLN per m3 of cut or fill) were not found in a citable source. Only quantities were: S1 Węgierska Górka 1.30 mln m3 cut and 0.215 mln m3 fill on 8.5 km [NBI-T22]. Until sourced, do not expose a separate earthworks rate; fold it into the per-km formation cost.

### 5.2 Cross-check against Polish rail and metro

| Project | Fact | Implication |
|---|---|---|
| Warsaw Metro M2 central section | 4,117.5 mln PLN gross (3,375 net), signed 28 Oct 2009, opened 8 March 2015; total 4.17 mld PLN, EU 2.77 mld; four TBMs launched May 2012 to March 2013. Length about 6 km and 7 stations per the plan (length not in the fetched excerpt: UNVERIFIED) [W-M2] | About 680 mln PLN/km gross all-in (about 1,190 mln in 2026 PLN). The road-derived twin running tunnel (300 mln/km) is about a quarter of that. Stations and systems are the other three quarters |
| Łódź cross-city rail tunnel | 1.59 mld PLN for 7.5 km (212 mln PLN/km at 2017 signing, about 330 mln in 2026 PLN), mixed large twin-track bore and small bores, 3 underground stops; unfinished, contract terminated 2026 [W-LDZ] | Signing price sits right at the road-derived tunnel number, and the job failed. Treat 300 mln PLN/km as tunnels only and as optimistic for urban soft ground under buildings |

Where road-derived numbers mislead
- Stations: a road box costs 5,000 to 20,000 PLN/m2 of footprint; a 20 x 150 m station box would come out at 15 to 60 mln PLN, an order of magnitude under real metro stations (deeper, multi-level, fit-out, vertical circulation, utilities relocation in a street). Do not derive stations from road data.
- Systems: no track, traction power, signalling, platform doors, depots in any road number.
- Urban utilities and building protection: Polish road tunnels are under a river, a hill, or a reserved corridor (Ursynów was kept free since the 1970s; from memory, UNVERIFIED). Transit under a built street is harder; Łódź is the warning.
- Tunnel diameter: road TBMs are 12.5 to 15.2 m. Cost per m3 and advance rate do not transfer linearly to 6 to 7 m machines; small EPB machines advance faster (see 06).
- Geology: Polish soft-ground drives were in saturated sands and silts (similar to Bay mud margins); the mined tunnels were in flysch and Sudetic rock (similar class to Caldecott's Orinda formation only loosely). No Polish road tunnel crosses an active fault.
- Seismic design: none in Poland. Bay Area structures carry a real seismic premium that is not red tape; keep part of the bridge and tunnel gap as irreducible.
- VAT: Polish contract values include 23% VAT; the constants below keep it as a contingency rather than strip it.

### 5.3 Recommended constants

Reformed baseline (Polish productivity, Bay Area input prices): 2026 PLN / 2.3. Nominal column (2026 PLN / 3.71) for reference.

| Constant | 2026 PLN | USD reformed (PPP) | Range (USD, PPP) | USD nominal | Status-quo multiplier (range) |
|---|---|---|---|---|---|
| Bored tunnel, soft ground, per m3 | 4,400 | 1,900 | 850 to 2,300 | 1,190 | x2.0 (1.3 to 3) |
| Bored twin-tube running tunnel, per route-km (6.6 m bores) | 300 mln | 130 mln | 87 to 196 mln | 81 mln | x2.0 (1.3 to 3) |
| Mined tunnel in rock, per m3 | 1,250 | 540 | 400 to 800 | 335 | x4.0 (3 to 7) |
| Cut-and-cover, per m3 excavated (structure included) | 1,450 | 630 | 350 to 700 | 390 | x2.5 (2 to 4) |
| Cut-and-cover box, per m2 footprint | 12,000 | 5,200 | 2,900 to 8,500 | 3,230 | x2.5 (2 to 4) |
| Viaduct / bridge deck, per m2 | 8,000 | 3,500 | 2,600 to 6,500 | 2,150 | x1.5 standard (1.2 to 2.5); x3.5 signature or over water |
| Double-track viaduct, per km (11 m deck) | 88 mln | 38 mln | 29 to 72 mln | 24 mln | x1.5 to x3.5 as above |
| At-grade double-track formation, per km (no track) | 20 mln | 8.7 mln | 5 to 13 mln | 5.4 mln | x1.0 greenfield; x2.5 urban (1.5 to 4) |
| 2x2 expressway, rural, per km (if roads are buildable) | 42 mln | 18 mln | 12 to 27 mln | 11.3 mln | x1.0 rural; x2.5 urban |
| Rail megaproject, whole scope (headline, section 6) | n/a | n/a | n/a | n/a | x4 at PPP (2 to 9); x6.5 nominal (3 to 15) |
| Land, supervision, owner costs | +35% on works (S2 Ursynów: 1.66 / 1.2) | | +20 to +40% | | status quo +60 to +100%: UNVERIFIED, set by 06 |

Time model

| Parameter | Reformed (Polish record) | Status quo (Bay Area comparators) |
|---|---|---|
| Permit, from design start to construction permit | 17 months (10 design + 7 ZRID); range 12 to 24; statutory floor 3 months after application | 60 to 120 months (Caldecott 2000 to 2010 start of excavation; Devil's Slide 1996 to 2005) |
| Land acquisition | 0 extra months: title passes with the permit; compensation +5% for 30-day handover | separate track, can gate construction |
| Litigation effect | none on schedule after 60 days from works start (art. 31) | can stop or redesign the project |
| At-grade / viaduct build | 22 working months for a 10 to 20 km section, winter excluded (26 to 28 calendar months); about 1.5 to 2.5 months per km per contract, contracts run in parallel | x1.5 to x2 |
| Contract to opening, plain section | 45 months median (range 35 to 61) | 90+ |
| Contract to opening, tunnel section | 66 months median (range 57 to 76) | 100 to 160 from decision |
| Contract to TBM launch | 30 months (range 20 to 48) | same order (SR 99: ROD Aug 2011 to launch July 2013, 23 months) |
| TBM advance, 12 to 15 m road machine | 8 m/day mean (range 4 to 12); first 300 m at 2 to 3 m/day | 5 m/day when running; model stoppage risk separately (SR 99: 2-year stop) |
| TBM advance, 6 to 7 m metro machine | take from 06; road data give only a floor of about 10 m/day | same machine rate; delays come from stations and permits |
| Mined advance | 2 to 3 m/day per tube | similar (not quantified) |
| Breakthrough to opening (fit-out) | 21 months (range 18 to 31) | 15 to 22 months (Caldecott Aug 2012 to Nov 2013: 15; SR 99 April 2017 to Feb 2019: 22) |
| Schedule slip | +16.5% mean on plain roads (ECA); +25 to +40% on tunnel sections (S1: 46 to 72 months; S3: 57 to 69) | +100% and more (Bay Bridge 5 to 11.6 years) |

Risk events worth modelling from the Polish record
- Lowest-bid collapse: a contractor walks, re-tender costs +36 to +71% and 2 to 3 years (S61).
- Input price shock with fixed-price contracts: either bankruptcies (2012) or indexation payouts (over 5 mld PLN since 2022).
- Geology on TBM drives: advance halves, +8 months (S19); in the rail case the drive stops for years (Łódź).

## 6. Headline test: Bay Area rail priced at Polish road-derived rates

Added 2026-11-09 after the owner made Bay Area rail vs the Polish road-derived baseline the headline comparison. Hypothesis under test: the gap is about 20x. Result: not supported on any like-for-like basis; see 6.5.

### 6.1 Method and rates

- Take each project's physical scope, price it with the 2026 PLN rates from section 5.3, add 35% for land, supervision and owner costs (S2 Ursynów ratio, [NBI22]), convert at 3.71 PLN/USD (nominal) and 2.3 PLN/USD (PPP).
- Rates used: bored tunnel 4,400 PLN/m3; cut-and-cover 1,450 PLN per excavated m3; double-track viaduct 88 mln PLN/km (HSR, 13 m deck: 104 mln PLN/km); at-grade double-track formation 20 mln PLN/km for metro and regional rail. For HSR formation with its road overpasses: 30 mln PLN/km (assumption between the 20 mln rail figure and the 42 mln expressway figure, UNVERIFIED). HSR mountain tunnels: 2,500 PLN/m3 (assumption between the mined 1,250 and bored 4,400 rates, UNVERIFIED); on twin 9.5 m bores this gives 354 mln PLN/km, against 383 mln PLN/km net for the CPK Łódź HSR tunnel contract [06].
- Official costs are sponsor figures in year-of-expenditure dollars, not deflated. Polish side is 2026 money. This biases ratios up for future projects (YOE to 2036 to 2040) and down for Central Subway (2010 to 2022 dollars).
- Scope inputs marked ASSUMED were not found in a source and drive the result; they are listed per project.

### 6.2 Scope and civil-only estimate

| Project | Physical scope priced | Polish-rate civil works, mln PLN (2026) | Scope source |
|---|---|---|---|
| The Portal / DTX | 2.09 km route; older design description: about 1,000 m mined, 1,542 m cut-and-cover, 756 m retained cut. ASSUMED: mined section 190 m2 excavated (3-track, 16.8 m clear width), box 22 m wide by 18 m deep, 4th and Townsend station widening 3,900 m2 by 25 m deep, retained cut 15 m by 6 m. Mined section priced at the bored soft-ground rate | 836 mined + 1,027 cut-and-cover + 99 retained cut = 1,961 | [05] 3.1; [S-DTX] |
| BART Silicon Valley Phase II | 9.66 km; 5 mi (8.05 km) single bore, 53 ft (16.15 m, 205 m2) with platforms inside the bore; 1.6 km at grade; Newhall yard not priced | 7,253 tunnel + 32 at-grade = 7,285 | [05] 3.3 |
| same, built the Warsaw way | 8.05 km twin 6.6 m bores (68.4 m2 total, one third of the single-bore volume) | 2,414 + 32 = 2,446 | section 5.1 |
| Muni Central Subway | 2.74 km; twin 20 ft (6.1 m) bores of 8,500 ft (2,591 m) each; about 0.4 km surface | 666 tunnel + 8 = 674 | [05] 3.9 |
| Link21 crossing | Alignment not fixed. ASSUMED: 8 km twin 8.5 m mainline bores (existing BART tube is 5.8 km) | 3,995 | [05] 3.2; [S-L21] |
| California HSR, Merced to Bakersfield | 171 mi (275 km). Structure split not published in a form found here. ASSUMED: 10% viaduct (27.5 km), 90% at-grade or embankment | 7,425 formation + 2,860 viaduct = 10,285 | [05] 3.12; [S-CV] |
| California HSR, Phase 1 full dedicated buildout | 494 mi (795 km); tunnels 40 to 50 mi (72 km used) per CHSRA factsheet; ASSUMED 80 km viaduct, 643 km at-grade | 25,659 tunnel + 19,290 formation + 8,320 viaduct = 53,269 | [06] 3.1; [S-TUN] |
| Caltrain electrification | 82 km of overhead line, substations, signalling, EMU fleet; no civil works | not priceable from road data | [05] 3.4 |

### 6.3 What the civil-only estimate leaves out, and the add-ons

Not in any Polish road rate: station fit-out and the deep multi-level station structure, track, traction power, signalling, depots, vehicles, financing, and year-of-expenditure escalation. The 35% uplift covers land, supervision and owner costs only. Add-ons below come from the Polish rail and metro record already in this repo:

| Add-on | Value (2026 PLN) | Derivation | Source |
|---|---|---|---|
| Underground metro station | 290 mln PLN each | Warsaw M2 extensions 338 to 350 mln PLN/km all-in (2015 to 2022), about 520 mln PLN/km in 2026 money; stations are 48% of cost at 0.85 stations/km per the TCP hard-cost split | [06] 2.1, 7.1 |
| Line systems (track, power, signalling), metro | 65 mln PLN per route-km | 12% of the same 520 mln PLN/km | [06] 7.1 |
| Mainline track, 25 kV, signalling | 25 mln PLN per route-km | about 60% of the 41 to 44 mln PLN/km Rail Baltica upgrades; the 60% share is an assumption, UNVERIFIED | [06] 2.4 |
| HSR surface station | 150 mln PLN (Central Valley), 300 mln PLN (Phase 1 urban) | assumption, UNVERIFIED | none |
| HSR trainsets, Merced to Bakersfield | 900 mln PLN lump sum | assumption (6 sets), UNVERIFIED | none |
| Financing, YOE escalation | not added | present in official figures, absent from the Polish side; inflates every ratio | |

Calibration note: the same Warsaw split implies running tunnels at about 160 mln PLN per route-km (2,340 PLN/m3) in 2026 money, against the 300 mln PLN/km (4,400 PLN/m3) road-derived rate used here. The road-derived tunnel rate is therefore about 1.9x the Polish metro record. Using the metro-implied rate would raise tunnel-heavy ratios by up to 1.6x (BSV II scope-matched: 4.0 to 6.5 nominal, 2.5 to 4.0 PPP).

Add-ons applied: Portal 1.5 stations (4th and Townsend, plus fit-out of the existing trainbox) and 3-track systems; BSV II 3 underground stations, 1 surface station (30 mln PLN, assumption), 9.66 km systems; Central Subway 3 underground, 1 surface, 2.74 km systems; Link21 2 stations at double size and 8 km systems (all ASSUMED); HSR track and systems on the full length, 5 and 12 stations.

### 6.4 Ratios

Official cost divided by the Polish-rate estimate. "Civil-only" = road-derived civil works x 1.35. "Scope-matched" = (civil works + add-ons) x 1.35.

| Project | Official cost (basis) | Civil-only estimate, USD nominal / PPP | Ratio civil-only, nominal / PPP | Scope-matched estimate, USD nominal / PPP | Ratio scope-matched, nominal / PPP |
|---|---|---|---|---|---|
| The Portal / DTX | $6.84B excl. built trainbox (July 2025 indicative, YOE to 2036) [05] | $0.71B / $1.15B | 9.6 / 5.9 | $0.95B / $1.53B | 7.2 / 4.5 |
| BART SV Phase II, as designed (single bore) | $12.746B (2024 adopted, YOE to 2037 to 2039) [05] | $2.65B / $4.28B | 4.8 / 3.0 | $3.21B / $5.17B | 4.0 / 2.5 |
| BART SV Phase II, Polish twin-bore design | same | $0.89B / $1.44B | 14.3 / 8.9 | $1.45B / $2.33B | 8.8 / 5.5 |
| Muni Central Subway | $1.891B final (2010 to 2022 dollars) [05] | $0.25B / $0.40B | 7.7 / 4.8 | $0.64B / $1.03B | 3.0 / 1.8 |
| Link21 crossing | $18B to $30B (2023 dollars, 1 to 2% design) [05] | $1.45B / $2.35B | 12.4 to 20.6 / 7.7 to 12.8 | $2.07B / $3.33B | 8.7 to 14.5 / 5.4 to 9.0 |
| California HSR, Merced to Bakersfield | $35.66B (2026 plan, YOE, incl. programme support) [05] | $3.74B / $6.04B | 9.5 / 5.9 | $6.76B / $10.9B (with trainsets) | 5.3 / 3.3 |
| California HSR, Phase 1 full buildout | $231.3B (2026 plan bottom-up, YOE) [05] | $19.4B / $31.3B | 11.9 / 7.4 | $27.9B / $45.0B | 8.3 / 5.1 |
| California HSR, Phase 1 "optimised" | $126.08B (YOE; blended and substituted scope, so not the 795 km priced here: lower bound) [05] | same | 6.5 / 4.0 | same | 4.5 / 2.8 |
| Caltrain electrification | $2.44B all-in; infrastructure only $697M for 80 km before overruns [06] | n/a | n/a | $2M per double-track km reformed coefficient from [06], i.e. about $0.16B | about 4 to 7 on infrastructure only (from [06], not from road data) |

Cross-checks from Poland's own rail budgets
- Central Subway scope-matched 3.0x nominal sits beside the 3.3x that [06] gets from the Transit Costs Project per-km comparison with Warsaw. The two methods agree.
- CPK "Y" high-speed line budget: 76.8 mld PLN for about 480 km, 160 mln PLN/km, upper bound with unclear scope [06]. At that rate Merced to Bakersfield is 44 mld PLN ($11.9B nominal, $19.1B PPP): ratio 3.0 nominal, 1.9 PPP. Phase 1 full buildout is 127 mld PLN: ratio 6.7 nominal, 4.2 PPP. Poland's own HSR budget per km is 1.8x the road-derived scope-matched figure (91 mln PLN/km), so the HSR ratios in the table are on the high side.
- The Portal comes out at 4.5x PPP here against about 14x in [06]. The difference is method: [06] divides by route-km against a twin-bore metro; this estimate prices the actual 3-track mined section, the wide boxes and the station volume.

Where 20x does appear
- Link21 at the top of its range, nominal, civil-only: 20.6.
- BSV II nominal, civil-only, no owner costs, against a Polish twin-bore design: 19.3. That is a design-choice gap (single 16 m bore), not a price gap.
- The Portal with the lowest unit rates in section 3.2 (bored at 1,950 PLN/m3, box at 6,740 PLN/m2 footprint), no owner costs, nominal: 35.
- Each of these compares an official all-in, escalated cost with Polish bare civil works at the market exchange rate.

### 6.5 Conclusion

- Per-project multipliers, scope-matched, PPP: Central Subway 1.8; BSV II 2.5 (5.5 against a Polish design); HSR Merced to Bakersfield 3.3; The Portal 4.5; HSR Phase 1 full buildout 5.1; Link21 5.4 to 9.0. Nominal: 3.0; 4.0 (8.8); 5.3; 7.2; 8.3; 8.7 to 14.5.
- Recommended single headline multiplier: x4 at PPP, scope-matched (range 2 to 9). Nominal equivalent: x6.5 (range 3 to 15). If the road-derived tunnel rate is replaced by the cheaper Polish metro-implied rate, the PPP headline moves to about x5.
- 20x is not supported as a like-for-like figure. It is reached only when three things stack: nominal exchange rate (x1.6 over PPP), civil-only Polish scope against all-in official cost (x1.3 to x2.6), and either the top of the Link21 range, a Polish redesign of BSV II, or bottom-of-range unit rates. On a PPP, scope-matched basis the largest ratio found is 9 (Link21 upper bound, on assumed scope).
- Honest framing for the game: "Bay Area rail costs about 4x what Polish practice would deliver for the same scope at Bay Area prices; about 6x to 7x at the exchange rate; and 10x to 20x if you also let Polish engineers redesign the project and count only the concrete."
- Weakest inputs, in order: Link21 scope (all assumed); HSR viaduct share and formation rate; Portal cross-sections; station and systems add-ons taken from a cost split rather than contracts; YOE vs 2026 price basis.

## Recommendations for the game

- Headline (section 6): Bay Area rail runs about x4 the Polish road-derived baseline at PPP on matched scope (range 2 to 9), about x6.5 at the market exchange rate (range 3 to 15). The owner's 20x hypothesis is not supported like-for-like; it appears only for nominal, civil-only comparisons of the worst cases. Use x4 as the default status-quo multiplier for rail megaprojects, with per-project values from 6.5 in the campaign (Central Subway 1.8, BSV II 2.5, HSR Central Valley 3.3, The Portal 4.5, HSR Phase 1 5.1, Link21 5.4 to 9.0).
- Baseline currency: express reformed costs as 2026 PLN / 2.3 (civil-engineering PPP). This gives a baseline about 1.6x the nominal Polish sticker price and keeps the reform story honest: red tape, not wages, is what the player removes.
- Split the gap into levers the player can pull, since the evidence separates them: price and process (about x2 to x4 at PPP), design choices such as single large bore, 3-track mined caverns and deep stations (BSV II: a further x2.2), and exchange rate (x1.6, not a lever).
- Per-asset multipliers from the road-to-road comparison (section 4.2) remain the floor for individual build actions: at-grade x1 to x2.5, standard viaduct x1.5, bored tunnel x2, cut-and-cover x2.5, signature structure x3.5, mined tunnel x4. Stations and systems carry the rest of the rail gap and must come from 06.
- Put most of the status-quo penalty on time, where the road evidence is strongest: permit 17 months vs 60 to 120 months; construction x1.5 to x2; then let financing and escalation turn time into cost.
- Model the specustawa as four discrete reforms the player can unlock: single consolidated permit with a 90-day clock; title transfer by operation of law with a +5% fast-handover bonus; immediate enforceability; annulment bar after works start.
- Voxel pricing: charge bored tunnel per m3 (1,900 USD reformed), cut-and-cover per m3 excavated (630 USD), deck per m2 (3,500 USD). These three numbers cover most player actions and all trace to a named Polish structure.
- Keep failure modes: Poland is cheap and fast, not safe. Give lowest-bid procurement a visible bankruptcy risk and give TBM drives a geology roll.
- Do not use road numbers for stations, systems, or rolling stock.

## Open questions

- Gross vs net: confirm per contract whether [W] values are gross (assumed). Decision for the owner: keep VAT in the baseline as implicit contingency, or strip 18.7%.
- Currency basis: PPP (recommended) or nominal for the reformed baseline? Nominal makes the status-quo multiplier about 1.6x larger and matches the "several times" framing more literally.
- 2026 price level: replace the assumed HICP 2026 (158.3) with the published value, or switch to GUS's civil-engineering construction price index (not retrieved).
- US civil-engineering PPP: Eurostat/OECD value for the US is needed to replace the GDP-PLI assumption behind 2.3 PLN/USD.
- California primaries not retrieved: Caltrans cost per lane-mile or centreline mile, California State Auditor reports (Bay Bridge, Caltrans), Devil's Slide and Sepulveda final costs, US 101 express lanes cost, environmental-start dates for Presidio Parkway and Caldecott.
- Polish primaries not retrieved: GDDKiA average unit prices for earthworks and pavement; NIK audits of the 2012 collapses and of preparation times (STEŚ, DŚU durations); exact indexation caps; original COVEC price; tunnel-only cost split for S3 and S19; S19 TBM type and second-bore dates.
- [W] vs [GSZ] disagreement on km opened in 2018 and 2021.
- Small-diameter scaling: how much per-m3 cost and advance change from 13 m road TBMs to 6.6 m metro TBMs; resolve against Warsaw M2 extension contracts in 06.
- Seismic premium: what share of the Bay Area bridge and tunnel gap is irreducible design demand rather than process.

## Sources

- [05] This repo, `05-bay-area-transit-projects.md` (sponsor figures and their sources; read 2026-11-09)
- [06] This repo, `06-construction-costs.md` (Transit Costs Project data, Warsaw M2, CPK, cost split; read 2026-11-09)
- [S-CV] Search summary, CHSRA Central Valley packages (119 mi, 93 structures, no viaduct split): https://hsr.ca.gov/high-speed-rail-in-california/overview/ and https://en.wikipedia.org/wiki/Construction_of_California_High-Speed_Rail
- [S-DTX] Search summary of older DTX design descriptions (about 1 km mined, 1,542 m cut-and-cover, 756 m retained cut; 16.8 m clear width for three tracks); exact page not opened, UNVERIFIED: https://www.parsons.com/project/downtown-rail-extension-dtx-san-francisco-ca/ and https://www.tjpa.org/portaldtx/about-portal
- [S-L21] Search summary, Link21 (no crossing length published; BART tube 5.8 km): https://en.wikipedia.org/wiki/Link21
- [S-TUN] CHSRA tunnelling factsheet (40 to 50 mi of tunnel), via search summary: https://hsr.ca.gov/wp-content/uploads/2023/12/Tunneling-Factsheet-English.pdf
- [AS10] Auto Świat, 10 July 2024, S10 Stargard–Suchań and Recz–Cybowo contracts: https://www.auto-swiat.pl/wiadomosci/aktualnosci/droga-s10-nastepne-dwie-umowy-na-budowe-kierowcy-ekspresowo-przedra-sie-ze-szczecina/w4nvvmr
- [AS11] Auto Świat, 4 July 2024, S10/S11 contract clock: https://www.auto-swiat.pl/wiadomosci/aktualnosci/sa-umowy-na-budowe-nowych-odcinkow-drog-s10-i-s11-pierwsza-przyniesie-korzysc-setkom/49xnenh
- [AS20] Auto Świat, 22 July 2020, GDDKiA cost per km table: https://www.auto-swiat.pl/porady/autostrada-czy-droga-ekspresowa-ktora-lepsza-czym-sie-roznia-i-ile-to-nas-kosztuje/k19qcdr
- [AS21] Auto Świat, 12 May 2021, GDDKiA cost per km figures: https://www.auto-swiat.pl/wiadomosci/aktualnosci/ile-kosztuje-kilometr-nowej-drogi-szybkiego-ruchu-w-polsce/86qrjcx
- [AS22] Auto Świat, 1 April 2022, 20 years of GDDKiA: https://www.auto-swiat.pl/wiadomosci/aktualnosci/gddkia-tak-zmienila-sie-mapa-drogowa-polski-przez-ostatnie-20-lat-roznica-widoczna/fj34hhh
- [AS26] Auto Świat, 10 June 2026, A2 Kijowiec–Dobryń: https://www.auto-swiat.pl/wiadomosci/aktualnosci/nowy-odcinek-autostrady-a2-budowa-moze-ruszac-wiadomo-kiedy-bedzie-gotowy/qx3wdhg
- [ASB] Auto Świat, 15 May 2024, S16 and S19 near Białystok: https://www.auto-swiat.pl/wiadomosci/aktualnosci/powstana-dwa-nowe-odcinki-ekspresowek-wokol-bialegostoku-podpisano-umowy/qset14f
- [CD-SW] conadrogach.pl, 12 April 2021, Świnoujście TBM at 10 m/day: https://conadrogach.pl/informacje/drazenie-tunelu-w-swinoujsciu-to-juz-10-metrow-na-dobe.html
- [ECA13] European Court of Auditors, Special Report 5/2013 "Are EU Cohesion Policy funds well spent on roads?" (copy read): https://media.hotnews.ro/media_server1/document-2013-07-15-15192453-0-raport-curtea-europeana-conturi.pdf
- [ECA20] European Court of Auditors, Special Report 9/2020 "The EU core road network": https://op.europa.eu/webpub/eca/special-reports/core-road-network-9-2020/en/
- [F-S1] Forsal, S1 Węgierska Górka opening (via search summary): https://forsal.pl/transport/drogi/artykuly/10563156,obejsciem-wegierskiej-gorki-otwarte-tunelami-przez-gory-estakadami-nad-dolinami-tak-wyglada-nowa-trasa-wideo.html
- [FHWA-405] FHWA project profile, I-405 Improvement Project (Orange County): https://www.fhwa.dot.gov/ipd/project_profiles/ca_i405_improvement_project.aspx
- [FHWA-99] FHWA project profile, Alaskan Way Viaduct: https://www.fhwa.dot.gov/ipd/project_profiles/wa_alaskan_way.aspx
- [FHWA-BR] FHWA bridge replacement unit costs 2023: https://www.fhwa.dot.gov/bridge/nbi/sd2023.cfm
- [FHWA-GD] FHWA project profile, Gerald Desmond Bridge: https://www.fhwa.dot.gov/ipd/project_profiles/ca_port_long_beach_gerald_desmond_bridge_project.aspx
- [FHWA-PM] FHWA project profile, Port of Miami Tunnel: https://www.fhwa.dot.gov/ipd/project_profiles/fl_port_miami_tunnel.aspx
- [FHWA-PP] FHWA project profile, Presidio Parkway: https://www.fhwa.dot.gov/ipd/project_profiles/ca_presidio.aspx
- [G24] GDDKiA, summary of 2024: https://www.gov.pl/web/gddkia/podsumowanie-2024-roku and https://www.gov.pl/web/gddkia/rok-pelen-wyzwan---nowe-drogi-umowy-przetargi-i-poprawa-bezpieczenstwa
- [G25] GDDKiA, summary of 2025: https://www.gov.pl/web/gddkia/podsumowanie-2025-roku
- [G-S19] GDDKiA, 11 July 2024, "Karpatka wystartowała": https://www.gov.pl/web/gddkia/karpatka-wystartowala
- [G-S19b] GDDKiA Rzeszów, 4 Feb 2026, TBM turnaround: https://www.gov.pl/web/gddkia-rzeszow/zwrot-akcji-na-s19
- [G-S3] GDDKiA, 3 Aug 2026, two years of the S3 tunnels: https://www.gov.pl/web/gddkia/drugie-urodziny-tuneli-na-s3-i-ponad-piec-milionow-aut
- [GDMT] GDMT geoinżynieria drogi mosty tunele, "Jak powstał najdłuższy tunel drogowy w Polsce": https://inzynieria.com/uploaded/magazines/pdf/gdmt55_jak%20powstal%20najdluzszy%20tunel%20drogowy%20w%20polsce.pdf
- [GOP] GDDKiA Opole, 18 July 2024: https://www.gov.pl/web/gddkia-opole/miliardy-na-budowe-nowych-drog
- [GSZ] GDDKiA, "Budowa dróg: sztafeta rozłożona na lata" (2018 to 2023 openings table): https://www.gov.pl/web/gddkia/Budowa-drog-sztafeta-rozlozona-na-lata
- [HERS] FHWA, Status of the Nation's Highways, Bridges and Transit, 23rd ed., Appendix A, Exhibit A-1: https://www.fhwa.dot.gov/policy/23cpr/appendixa.cfm
- [HICP] Eurostat prc_hicp_aind, Poland, all items, annual average index: https://ec.europa.eu/eurostat/api/dissemination/statistics/1.0/data/prc_hicp_aind?format=JSON&geo=PL&coicop=CP00&unit=INX_A_AVG&sinceTimePeriod=2008
- [IB-S19] Inżynier Budownictwa, 12 Dec 2025, first bore complete: https://inzynierbudownictwa.pl/maszyna-tbm-karpatka-wydrazyla-pierwsza-nawe-tunelu-w-ciagu-drogi-s19/
- [IB-S2] Inżynier Budownictwa, S2 Ursynów tunnel: https://inzynierbudownictwa.pl/tunel-drogowy-w-ciagu-drogi-ekspresowej-s2-na-odcinku-poludniowej-obwodnicy-warszawy/
- [IB-SW] Inżynier Budownictwa, Świnoujście tunnel open: https://inzynierbudownictwa.pl/tunel-pod-swina-przejezdny/
- [M-S1] money.pl, 14 May 2020, S1 Oświęcim–Dankowice: https://www.money.pl/gielda/porr-i-mota-engil-ce-maja-umowe-na-odcinek-s1-myslowice-bielsko-biala-za-990-mln-zl-6510374848202369a.html
- [MON17] money.pl, 28 Nov 2017, cost per km debate: https://www.money.pl/gospodarka/wiadomosci/artykul/drogi-w-polsce-koszt-budowy,223,0,2392031.html
- [NBI22] Nowoczesne Budownictwo Inżynieryjne 1/2022, road investment review (S2 costs, S61): https://nbi.com.pl/content/uploads/assets/NBI-pdf/2022/1_100_2022/pdf/7-Przeglad-inwestycji-drogowych.pdf
- [NBI-T] Nowoczesne Budownictwo Inżynieryjne 1/2021, "Tunele drogowe w Polsce: realizacja i plany" (from GDDKiA materials): https://nbi.com.pl/content/uploads/assets/NBI-pdf/2021/1_94_2021/pdf/14-Tunele-drogowe-w-Polsce.pdf
- [NBI-T22] Nowoczesne Budownictwo Inżynieryjne 6/2022, tunnel investment review: https://nbi.com.pl/content/uploads/assets/NBI-pdf/2022/6_105_2022/pdf/4-Przeglad-inwestycji-tunelowych.pdf
- [NBP] Narodowy Bank Polski API, table A mid rates, annual means computed: https://api.nbp.pl/api/exchangerates/rates/a/usd/2020-01-01/2020-12-31/?format=json (same pattern per year)
- [NIK13] NIK P/13/157 (not opened): https://nik.gov.pl/kontrole/wyniki-kontroli-nik/pobierz,llu~p_13_157_201401100747431389340063~id0~01,typ,kj.pdf
- [PLI] Eurostat prc_ppp_ind, price level indices (GDP, A0502, A050203): https://ec.europa.eu/eurostat/api/dissemination/statistics/1.0/data/prc_ppp_ind?format=JSON&geo=PL&geo=US&na_item=PLI_EU27_2020&ppp_cat=A050203&ppp_cat=GDP&sinceTimePeriod=2019
- [PN-SW] Polsat News, 5 March 2021, start of Świnoujście drive: https://www.polsatnews.pl/wiadomosc/2021-03-05/rusza-drazenie-tunelu-pod-dnem-swiny-na-miejscu-premier-i-prezes-pis/
- [RPBDK] Chancellery of the Prime Minister, resolution establishing the RPBDK to 2030: https://www.gov.pl/web/premier/uchwala-w-sprawie-ustanowienia-programu-wieloletniego-pod-nazwa-rzadowy-program-budowy-drog-krajowych-do-2030-r-z-perspektywa-do-2033-r-przedlozona-przez-ministra-infrastruktury
- [SPEC] Act of 10 April 2003, consolidated text Dz.U. 2024 poz. 311 (Sejm ELI): https://api.sejm.gov.pl/eli/acts/DU/2024/311/text.html
- [TVN26] TVN24 Biznes, GDDKiA plans for 2026 (via search summary): https://tvn24.pl/biznes/z-kraju/setki-kilometrow-nowych-drog-plany-gddkia-na-2026-rok-st8822023
- [W] Polish Wikipedia, "Autostrady i drogi ekspresowe w Polsce" (year tables of openings and signed contracts; status as of 3 Nov 2026): https://pl.wikipedia.org/wiki/Autostrady_i_drogi_ekspresowe_w_Polsce
- [W17] Polish Wikipedia, S17: https://pl.wikipedia.org/wiki/Droga_ekspresowa_S17_(Polska)
- [W61] Polish Wikipedia, S61: https://pl.wikipedia.org/wiki/Droga_ekspresowa_S61_(Polska)
- [W-A2] Polish Wikipedia, A2: https://pl.wikipedia.org/wiki/Autostrada_A2_(Polska)
- [WB-PPP] World Bank, PA.NUS.PPP, Poland: https://api.worldbank.org/v2/country/POL/indicator/PA.NUS.PPP?format=json&date=2014:2026
- [W-GD] Polish Wikipedia, Tunel pod Martwą Wisłą: https://pl.wikipedia.org/wiki/Tunel_pod_Martw%C4%85_Wis%C5%82%C4%85
- [WK-405] English Wikipedia, Interstate 405 (California): https://en.wikipedia.org/wiki/Interstate_405_(California)
- [WK-99] English Wikipedia, State Route 99 tunnel: https://en.wikipedia.org/wiki/State_Route_99_tunnel
- [WK-BB] English Wikipedia, Eastern span replacement of the San Francisco–Oakland Bay Bridge: https://en.wikipedia.org/wiki/Eastern_span_replacement_of_the_San_Francisco%E2%80%93Oakland_Bay_Bridge
- [WK-CAL] English Wikipedia, Caldecott Tunnel: https://en.wikipedia.org/wiki/Caldecott_Tunnel
- [WK-TL] English Wikipedia, Tom Lantos Tunnels: https://en.wikipedia.org/wiki/Tom_Lantos_Tunnels
- [W-LDZ] Polish Wikipedia, Tunel średnicowy w Łodzi: https://pl.wikipedia.org/wiki/Tunel_%C5%9Brednicowy_w_%C5%81odzi
- [W-M2] Polish Wikipedia, Linia M2 metra w Warszawie: https://pl.wikipedia.org/wiki/Linia_M2_metra_w_Warszawie
- [W-MAJ] Polish Wikipedia, Most Południowy w Warszawie: https://pl.wikipedia.org/wiki/Most_Po%C5%82udniowy_w_Warszawie
- [W-RED] Polish Wikipedia, Most Rędziński: https://pl.wikipedia.org/wiki/Most_R%C4%99dzi%C5%84ski
- [WR-S3] wroclaw.pl, S3 Bolków–Kamienna Góra open from 31 July (via search summary): https://www.wroclaw.pl/dla-mieszkanca/otwarcie-s3-bolkow-kamienna-gora-odcinek-przejezdny-od-31-lipca
- [W-TOR] Polish Wikipedia, Most gen. Elżbiety Zawackiej w Toruniu: https://pl.wikipedia.org/wiki/Most_gen._El%C5%BCbiety_Zawackiej_w_Toruniu
