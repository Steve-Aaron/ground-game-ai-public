# 20 new public-API integrations - implementation plan (revised: LAD or finer)

Every entry below resolves to an identifier the data layer already carries (`onsCode`, `lads[].code`, `lads[].nomisCode`, `wpca24Code`, `wards[].code`, GP practice code, school URN, court id or postcode). National-only series have been dropped; a single optional 'national backdrop' strip is sketched at the end for the few headlines worth keeping as cross-app context.

## Architectural assumptions (already in place)

- Server routes live at `src/app/api/<slug>/route.ts`, guarded by `requireConstituencyAccess(req)` from `src/lib/guards.ts`
- Each route resolves the active constituency through `getFullData(slug)` and the new `areaIds(slug)` helper
- Each route uses the shared `cached({route, key}, ttlMs, build)` helper in `src/lib/api-cache.ts` for Firestore TTL caching
- Each panel is a `'use client'` React component using `useConstituency` / `withConstituency`, rendered inside `<Panel title='...' />` and added to `src/app/page.tsx`
- All panels carry `data-component='<PanelName>'` on the outermost wrapper

## The revised 20 - grouped by category

### Economy (4)

- Companies House Public Data API at `api.company-information.service.gov.uk`
  - Route: `src/app/api/companies/route.ts` -> Panel: `CompaniesPanel`
  - Mapping: registered-office postcode prefix derived from `areas.wards[]` postcode list
  - Auth: free API key (env: `COMPANIES_HOUSE_KEY`), HTTP Basic
  - Cache TTL: 24h
  - Output: incorporations and dissolutions in last 30 / 90 / 365 days, top SIC codes
  - Risk: rate-limited 600 req / 5min per key

- ONS ASHE earnings via NOMIS at `nomisweb.co.uk/api/v01/dataset/NM_30_1`
  - Route: `src/app/api/earnings/route.ts` -> Panel: `EarningsPanel`
  - Mapping: `areas.lads[].nomisCode` (Annual Survey of Hours and Earnings, place-of-residence and place-of-work)
  - Auth: none
  - Cache TTL: 30d (annual release)
  - Output: median full-time gross weekly pay, gender pay gap, 5-year trend, GB benchmark
  - Risk: small LADs are suppressed - flag confidence-flagged rows

- ONS Business Demography via NOMIS at `nomisweb.co.uk/api/v01/dataset/NM_141_1`
  - Route: `src/app/api/business-demography/route.ts` -> Panel: `BusinessDemographyPanel`
  - Mapping: `areas.lads[].nomisCode`
  - Auth: none
  - Cache TTL: 30d
  - Output: business births and deaths per 10k, 1- / 3- / 5-year survival rates
  - Risk: data lags 18 months - surface the reference year

- Contracts Finder OCDS feed at `contractsfinder.service.gov.uk/Published/OCDS`
  - Route: `src/app/api/contracts/route.ts` -> Panel: `LocalContractsPanel`
  - Mapping: buyer name / region matched against `areas.lads[].name`, plus postcode outcode list for SME tenderers
  - Auth: none
  - Cache TTL: 6h
  - Output: 10 most recent local public-sector tenders above £25,000
  - Risk: OCDS schema is verbose - extract `tender.title`, `tender.value`, `buyer.name`, `tender.endDate` only

### Immigration (3)

- Home Office asylum dispersal by LAD via data.gov.uk CKAN at `data.gov.uk/dataset/immigration-statistics-quarterly-release`
  - Route: `src/app/api/asylum-dispersal/route.ts` -> Panel: `AsylumDispersalPanel`
  - Mapping: filter the 'asylum support - section 95' table by `areas.lads[].code`
  - Auth: none
  - Cache TTL: 24h (quarterly publication)
  - Output: number of supported asylum seekers in each LAD inside the constituency, change since previous quarter
  - Risk: CKAN returns resource URLs to ODS / CSV - cache the parsed JSON not the file

- DWP NINo registrations to adult overseas nationals by LAD via NOMIS at `nomisweb.co.uk/api/v01/dataset/NM_42_1`
  - Route: `src/app/api/nino-overseas/route.ts` -> Panel: `OverseasArrivalsPanel`
  - Mapping: `areas.lads[].nomisCode`
  - Auth: none
  - Cache TTL: 30d (annual)
  - Output: NINo registrations per 1k working-age population, breakdown by top 5 nationalities
  - Risk: NINo is a proxy not a count of arrivals - frame it that way in copy

- ONS Annual Population Survey country-of-birth by LAD via NOMIS at `nomisweb.co.uk/api/v01/dataset/NM_17_1`
  - Route: `src/app/api/country-of-birth/route.ts` -> Panel: `CountryOfBirthPanel`
  - Mapping: `areas.lads[].nomisCode`
  - Auth: none
  - Cache TTL: 30d (annual)
  - Output: share of residents born in UK / EU / non-EU, trend over last 5 years
  - Risk: confidence intervals are wide on small LADs - render an error bar

### NHS (4)

- NHS Organisation Data Service (ODS) at `directory.spineservices.nhs.uk/ORD/2-0-0/organisations`
  - Route: `src/app/api/nhs-practices/route.ts` -> Panel: `NHSPracticesPanel`
  - Mapping: `areas.lads[].code` per call, then de-duplicate
  - Auth: none
  - Cache TTL: 7d
  - Output: active GP practices, pharmacies and dental practices inside the constituency
  - Status: proof-of-concept already implemented

- NHS BSA Open Data prescriptions at `opendata.nhsbsa.net/api/3/action/datastore_search`
  - Route: `src/app/api/prescriptions/route.ts` -> Panel: `PrescriptionsPanel`
  - Mapping: by GP practice code (from NHS ODS above) aggregated to constituency
  - Auth: none
  - Cache TTL: 7d
  - Output: top 5 BNF chapters by spend per 1k population, antibiotic prescribing rate
  - Risk: dataset is huge - always send a `practice` filter and request only needed columns

- NHS GP Patient Survey by practice at `gp-patient.co.uk/SurveysAndReports`
  - Route: `src/app/api/gp-survey/route.ts` -> Panel: `GPSurveyPanel`
  - Mapping: GP practice code from NHS ODS
  - Auth: none (CSV download per year)
  - Cache TTL: 30d (annual)
  - Output: satisfaction, ease of contact, would-recommend percentages averaged across practices
  - Risk: CSV column names shift year-to-year - pin the year and parse defensively

- NHS England A&E and RTT performance at `files.digital.nhs.uk`
  - Route: `src/app/api/nhs-waits/route.ts` -> Panel: `NHSWaitsPanel`
  - Mapping: NHS trust code via a static `src/data/lad-to-trust.ts` lookup (each LAD maps to 1-3 acute trusts)
  - Auth: none
  - Cache TTL: 7d (monthly publication)
  - Output: 4h A&E performance, 18-week RTT, cancer 62-day, plotted against the England median
  - Risk: CSV column names change monthly - parse by header name not index

### Education (3)

- Ofsted state-funded schools inspections via data.gov.uk CKAN
  - Route: `src/app/api/ofsted/route.ts` -> Panel: `OfstedPanel`
  - Mapping: filter inspection rows by URN from the existing schools dataset
  - Auth: none (downloads management-information ODS workbook)
  - Cache TTL: 30d (monthly MI release)
  - Output: schools per inspection outcome, recently downgraded list, schools-overdue-inspection count
  - Risk: multi-sheet ODS - read the `Inspections` sheet only

- DfE Compare School Performance (KS4 / KS5) at `compare-school-performance.service.gov.uk`
  - Route: `src/app/api/school-performance/route.ts` -> Panel: `SchoolPerformancePanel`
  - Mapping: school URN from the existing static schools file
  - Auth: none (CSV download)
  - Cache TTL: 30d (annual)
  - Output: Progress 8, Attainment 8, Level 3 value-added at constituency level
  - Risk: dataset is large; pre-filter to URNs the constituency cares about server-side

- DfE Find an Apprenticeship API at `findapprenticeshiptraining-api.apprenticeships.education.gov.uk`
  - Route: `src/app/api/apprenticeships/route.ts` -> Panel: `ApprenticeshipsPanel`
  - Mapping: postcode + 5-mile radius from constituency centroid in `geo.ts`
  - Auth: none
  - Cache TTL: 24h
  - Output: live apprenticeship vacancies inside the constituency, top employers, top sectors
  - Risk: radius search pulls in neighbouring constituencies - cap at 5 miles

### Crime / Justice (3)

- Ministry of Justice criminal courts statistics via data.gov.uk CKAN
  - Route: `src/app/api/court-stats/route.ts` -> Panel: `CourtStatsPanel`
  - Mapping: Local Justice Area (LJA) via a one-off `areas.ljas[]` scrape added to `CONSTITUENCY_AREAS`
  - Auth: none
  - Cache TTL: 30d (quarterly)
  - Output: median days from offence to completion, outstanding caseload, top offence categories
  - Risk: LJA boundaries do not match LAD - the one-off scrape is the unblocker

- Home Office Stop and Search by force or BCU at `data.gov.uk/dataset/stop-and-search`
  - Route: `src/app/api/stop-search/route.ts` -> Panel: `StopSearchPanel`
  - Mapping: police force / BCU lookup keyed off `areas.lads[].code` (force areas are LAD-aligned in England outside London)
  - Auth: none (CSV)
  - Cache TTL: 24h
  - Output: searches per 1k, find-rate, ethnic-disparity ratio, monthly trend
  - Risk: London needs an MPS BCU lookup; supply it once and reuse

- Find a Court or Tribunal at `find-court-tribunal.service.gov.uk/courts.json`
  - Route: `src/app/api/courts/route.ts` -> Panel: `LocalCourtsPanel`
  - Mapping: postcode-based lookup using a representative ward postcode
  - Auth: none
  - Cache TTL: 30d (rarely changes)
  - Output: local Magistrates / Crown / Family / Tribunal courts with jurisdiction, contact and opening hours
  - Risk: tiny payloads - coalesce duplicates across wards

### Cost of living (3)

- DWP Stat-Xplore at `stat-xplore.dwp.gov.uk/webapi/rest/v1`
  - Route: `src/app/api/benefits/route.ts` -> Panel: `BenefitsPanel`
  - Mapping: WPCA dimension accepts `wpca24Code` directly - this is the perfect API for a constituency app
  - Auth: bearer token (env: `STAT_XPLORE_TOKEN`, request once)
  - Cache TTL: 24h (monthly publication)
  - Output: PIP claimants, UC caseload, State Pension recipients, Housing Benefit claimants per constituency
  - Risk: JSON-cube POST payloads - encapsulate in `src/lib/stat-xplore.ts` and reuse

- DESNZ sub-national energy consumption by LAD at `gov.uk/government/collections/sub-national-electricity-consumption-data` (and the gas equivalent)
  - Route: `src/app/api/energy-consumption/route.ts` -> Panel: `EnergyConsumptionPanel`
  - Mapping: `areas.lads[].code`
  - Auth: none (XLSX download)
  - Cache TTL: 90d (annual)
  - Output: domestic electricity and gas median kWh per meter, fuel poverty rate, fuel-poor households
  - Risk: workbook layout shifts every release - pin to known sheet names and fail loudly

- VOA Private Rental Market Statistics by LAD at `gov.uk/government/statistics/private-rental-market-summary-statistics-in-england`
  - Route: `src/app/api/rents/route.ts` -> Panel: `PrivateRentsPanel`
  - Mapping: `areas.lads[].code`
  - Auth: none (ODS download)
  - Cache TTL: 90d (annual)
  - Output: median monthly rent for 1- / 2- / 3-bed homes, change vs previous year, lower-quartile rent
  - Risk: VOA reissues data with minor revisions - cache by 'publication date' field not just route

## Optional national backdrop (one panel, not five)

Bank Rate, CPIH and net migration are useful context but identical for every constituency. If we want them in the app at all, they belong in a single `NationalBackdropPanel` that surfaces three or four headlines under a clear 'national context' label - not as five separate routes.

- ONS Time Series API for CPIH (`L55O`) and GDP (`IHYR`)
- Bank of England IADB for Bank Rate (`IUDSOIA`)
- ONS LTIM net migration (`MGYO`)
- Skip UNHCR, NICE, weekly fuel - they are not strong enough to be context cards either

## Rollout order (low-risk first)

1. DWP Stat-Xplore (`BenefitsPanel`) - constituency-native, biggest single value-add, do first
2. NHS ODS (`NHSPracticesPanel`) - already drafted, sets up postcode-in-polygon helper
3. Companies House (`CompaniesPanel`) - needs free key but well documented
4. Contracts Finder (`LocalContractsPanel`)
5. ONS ASHE via NOMIS (`EarningsPanel`) - reuses the NOMIS pattern already in `employment` route
6. ONS Business Demography via NOMIS (`BusinessDemographyPanel`)
7. DWP NINo overseas (`OverseasArrivalsPanel`)
8. ONS APS country-of-birth (`CountryOfBirthPanel`)
9. NHS GP Patient Survey (`GPSurveyPanel`)
10. NHS England A&E and RTT (`NHSWaitsPanel`)
11. NHS BSA prescriptions (`PrescriptionsPanel`)
12. Ofsted CKAN (`OfstedPanel`)
13. DfE Compare School Performance (`SchoolPerformancePanel`)
14. DfE Find an Apprenticeship (`ApprenticeshipsPanel`)
15. Find a Court (`LocalCourtsPanel`)
16. Home Office Stop and Search (`StopSearchPanel`)
17. MoJ Court Statistics (`CourtStatsPanel`)
18. Home Office asylum dispersal (`AsylumDispersalPanel`)
19. VOA Private Rental Market (`PrivateRentsPanel`)
20. DESNZ sub-national energy consumption (`EnergyConsumptionPanel`)

## Shared work (do once, then every integration is small)

- `src/lib/api-cache.ts` - already added
- `src/lib/area-lookup.ts` - already added
- `src/lib/csv.ts`, `src/lib/xlsx.ts` - small parser surface for CSV / XLSX upstreams (papaparse + xlsx already in deps)
- `src/lib/nomis.ts` - encapsulate the `geography=...&measures=...` URL pattern reused across `employment`, `universal-credit`, `earnings`, `business-demography`, `nino-overseas`, `country-of-birth`
- `src/lib/panel-section.tsx` - shared `<PanelSection title trend value subValue />` row component
- `data-component='<PanelName>'` on every panel root

## What this delivers

- 20 routes, every one constituency / LAD / ward / practice / school / court resolvable
- 20 panels you can drop into `src/app/page.tsx` exactly the same way as the existing 18
- Three priority areas (economy, NHS, cost of living) deeply covered at LAD or finer
- Immigration, education and crime broadened past their current zero or single-source coverage with locally-resolvable data
- A reusable cache, area-lookup and NOMIS layer that retroactively simplifies the existing routes
