import { NextResponse } from "next/server";
import { adminDb } from "@/lib/firebase-admin";
import { getFullData } from "@/data";

export const dynamic = "force-dynamic";
export const maxDuration = 30;

// Live data (employment rate, claimant count, MP info): 24h TTL, warmed daily by cron.
// Demographic profile (Census indicators): 6-month TTL, auto-fetched on first request
// and stored in demographic_profile_cache/{slug}. Adding a new constituency requires no code
// change — the first page load triggers the fetch and caches it.
const TTL_MS = 24 * 60 * 60 * 1000;
const DEMOGRAPHIC_TTL_MS = 180 * 24 * 60 * 60 * 1000; // ~6 months

const ONS_BASE = "https://api.beta.ons.gov.uk/v1/population-types";
const NOMIS_BASE = "https://www.nomisweb.co.uk/api/v01";

const BRAINTREE_WPCA24 = "721420347";

interface DataSection {
  heading: string;
  rows: Record<string, string>[];
}

interface CommonsLibraryData {
  constituency: string;
  onsCode: string;
  sections: Record<string, DataSection[]>;
  sectionCount: number;
  source: string;
  sourceUrl: string;
  scrapedAt: string;
  note?: string;
}

// Scottish Index of Multiple Deprivation (SIMD 2020v2) aggregated to council area.
// Source: Scottish Government / NRS. Updated ~every 5 years.
// Westminster constituencies that share a council area get the same council-area stats.
const SIMD_LOOKUP: Record<string, { simdRank: string; pctMostDeprived: string; laName: string }> = {
  "aberdeen-north":                      { simdRank: "17th most deprived council area (less deprived)",   pctMostDeprived: "10.1%", laName: "Aberdeen City" },
  "aberdeen-south":                      { simdRank: "17th most deprived council area (less deprived)",   pctMostDeprived: "10.1%", laName: "Aberdeen City" },
  "aberdeenshire-north-and-moray-east":  { simdRank: "29th most deprived council area (least deprived)",  pctMostDeprived: "2.8%",  laName: "Moray" },
  "airdrie-and-shotts":                  { simdRank: "6th most deprived council area (more deprived)",    pctMostDeprived: "32.5%", laName: "North Lanarkshire" },
  "alloa-and-grangemouth":               { simdRank: "8th most deprived council area (average)",          pctMostDeprived: "26.1%", laName: "Clackmannanshire" },
  "angus-and-perthshire-glens":          { simdRank: "22nd most deprived council area (less deprived)",   pctMostDeprived: "7.2%",  laName: "Angus" },
  "arbroath-and-broughty-ferry":         { simdRank: "22nd most deprived council area (less deprived)",   pctMostDeprived: "7.2%",  laName: "Angus" },
  "argyll-bute-and-south-lochaber":      { simdRank: "18th most deprived council area (less deprived)",   pctMostDeprived: "9.1%",  laName: "Highland" },
  "ayr-carrick-and-cumnock":             { simdRank: "7th most deprived council area (average)",          pctMostDeprived: "30.6%", laName: "East Ayrshire" },
  "bathgate-and-linlithgow":             { simdRank: "13th most deprived council area (less deprived)",   pctMostDeprived: "15.3%", laName: "Falkirk" },
  "berwickshire-roxburgh-and-selkirk":   { simdRank: "23rd most deprived council area (least deprived)",  pctMostDeprived: "6.4%",  laName: "Scottish Borders" },
  "caithness-sutherland-and-easter-ross":{ simdRank: "18th most deprived council area (less deprived)",   pctMostDeprived: "9.1%",  laName: "Highland" },
  "central-ayrshire":                    { simdRank: "3rd most deprived council area (more deprived)",    pctMostDeprived: "41.3%", laName: "North Ayrshire" },
  "coatbridge-and-bellshill":            { simdRank: "6th most deprived council area (more deprived)",    pctMostDeprived: "32.5%", laName: "North Lanarkshire" },
  "cowdenbeath-and-kirkcaldy":           { simdRank: "11th most deprived council area (average)",         pctMostDeprived: "19.6%", laName: "Fife" },
  "cumbernauld-and-kirkintilloch":       { simdRank: "27th most deprived council area (least deprived)",  pctMostDeprived: "4.1%",  laName: "East Dunbartonshire" },
  "dumfries-and-galloway":               { simdRank: "19th most deprived council area (less deprived)",   pctMostDeprived: "8.9%",  laName: "Dumfries and Galloway" },
  "dumfriesshire-clydesdale-and-tweeddale":{ simdRank: "19th most deprived council area (less deprived)", pctMostDeprived: "8.9%", laName: "Dumfries and Galloway" },
  "dundee-central":                      { simdRank: "5th most deprived council area (more deprived)",    pctMostDeprived: "36.6%", laName: "Dundee City" },
  "dunfermline-and-dollar":              { simdRank: "8th most deprived council area (average)",          pctMostDeprived: "26.1%", laName: "Clackmannanshire" },
  "east-kilbride-and-strathaven":        { simdRank: "10th most deprived council area (average)",         pctMostDeprived: "19.7%", laName: "South Lanarkshire" },
  "east-renfrewshire":                   { simdRank: "24th most deprived council area (least deprived)",  pctMostDeprived: "5.6%",  laName: "East Renfrewshire" },
  "edinburgh-east-and-musselburgh":      { simdRank: "26th most deprived council area (least deprived)",  pctMostDeprived: "5.2%",  laName: "East Lothian" },
  "edinburgh-north-and-leith":           { simdRank: "16th most deprived council area (less deprived)",   pctMostDeprived: "11.6%", laName: "City of Edinburgh" },
  "edinburgh-south":                     { simdRank: "16th most deprived council area (less deprived)",   pctMostDeprived: "11.6%", laName: "City of Edinburgh" },
  "edinburgh-south-west":                { simdRank: "16th most deprived council area (less deprived)",   pctMostDeprived: "11.6%", laName: "City of Edinburgh" },
  "edinburgh-west":                      { simdRank: "16th most deprived council area (less deprived)",   pctMostDeprived: "11.6%", laName: "City of Edinburgh" },
  "falkirk":                             { simdRank: "13th most deprived council area (less deprived)",   pctMostDeprived: "15.3%", laName: "Falkirk" },
  "glasgow-east":                        { simdRank: "1st most deprived council area (more deprived)",    pctMostDeprived: "44.3%", laName: "Glasgow City" },
  "glasgow-north":                       { simdRank: "1st most deprived council area (more deprived)",    pctMostDeprived: "44.3%", laName: "Glasgow City" },
  "glasgow-north-east":                  { simdRank: "1st most deprived council area (more deprived)",    pctMostDeprived: "44.3%", laName: "Glasgow City" },
  "glasgow-south":                       { simdRank: "1st most deprived council area (more deprived)",    pctMostDeprived: "44.3%", laName: "Glasgow City" },
  "glasgow-south-west":                  { simdRank: "1st most deprived council area (more deprived)",    pctMostDeprived: "44.3%", laName: "Glasgow City" },
  "glasgow-west":                        { simdRank: "1st most deprived council area (more deprived)",    pctMostDeprived: "44.3%", laName: "Glasgow City" },
  "glenrothes-and-mid-fife":             { simdRank: "11th most deprived council area (average)",         pctMostDeprived: "19.6%", laName: "Fife" },
  "gordon-and-buchan":                   { simdRank: "28th most deprived council area (least deprived)",  pctMostDeprived: "3.0%",  laName: "Aberdeenshire" },
  "hamilton-and-clyde-valley":           { simdRank: "10th most deprived council area (average)",         pctMostDeprived: "19.7%", laName: "South Lanarkshire" },
  "inverclyde-and-renfrewshire-west":    { simdRank: "2nd most deprived council area (more deprived)",    pctMostDeprived: "43.1%", laName: "Inverclyde" },
  "inverness-skye-and-west-ross-shire":  { simdRank: "18th most deprived council area (less deprived)",   pctMostDeprived: "9.1%",  laName: "Highland" },
  "kilmarnock-and-loudoun":              { simdRank: "7th most deprived council area (average)",          pctMostDeprived: "30.6%", laName: "East Ayrshire" },
  "livingston":                          { simdRank: "14th most deprived council area (less deprived)",   pctMostDeprived: "14.8%", laName: "West Lothian" },
  "lothian-east":                        { simdRank: "26th most deprived council area (least deprived)",  pctMostDeprived: "5.2%",  laName: "East Lothian" },
  "mid-dunbartonshire":                  { simdRank: "27th most deprived council area (least deprived)",  pctMostDeprived: "4.1%",  laName: "East Dunbartonshire" },
  "midlothian":                          { simdRank: "21st most deprived council area (less deprived)",   pctMostDeprived: "7.9%",  laName: "Midlothian" },
  "moray-west-nairn-and-strathspey":     { simdRank: "18th most deprived council area (less deprived)",   pctMostDeprived: "9.1%",  laName: "Highland" },
  "motherwell-wishaw-and-carluke":       { simdRank: "10th most deprived council area (average)",         pctMostDeprived: "19.7%", laName: "South Lanarkshire" },
  "na-h-eileanan-an-iar":               { simdRank: "30th most deprived council area (least deprived)",  pctMostDeprived: "0.0%",  laName: "Na h-Eileanan Siar" },
  "north-ayrshire-and-arran":            { simdRank: "3rd most deprived council area (more deprived)",    pctMostDeprived: "41.3%", laName: "North Ayrshire" },
  "north-east-fife":                     { simdRank: "11th most deprived council area (average)",         pctMostDeprived: "19.6%", laName: "Fife" },
  "orkney-and-shetland":                 { simdRank: "31st most deprived council area (least deprived)",  pctMostDeprived: "0.0%",  laName: "Orkney Islands" },
  "paisley-and-renfrewshire-north":      { simdRank: "9th most deprived council area (average)",          pctMostDeprived: "24.2%", laName: "Renfrewshire" },
  "paisley-and-renfrewshire-south":      { simdRank: "9th most deprived council area (average)",          pctMostDeprived: "24.2%", laName: "Renfrewshire" },
  "perth-and-kinross-shire":             { simdRank: "25th most deprived council area (least deprived)",  pctMostDeprived: "5.6%",  laName: "Perth and Kinross" },
  "rutherglen":                          { simdRank: "10th most deprived council area (average)",         pctMostDeprived: "19.7%", laName: "South Lanarkshire" },
  "stirling-and-strathallan":            { simdRank: "15th most deprived council area (less deprived)",   pctMostDeprived: "11.8%", laName: "Stirling" },
  "west-aberdeenshire-and-kincardine":   { simdRank: "28th most deprived council area (least deprived)",  pctMostDeprived: "3.0%",  laName: "Aberdeenshire" },
  "west-dunbartonshire":                 { simdRank: "4th most deprived council area (more deprived)",    pctMostDeprived: "39.8%", laName: "West Dunbartonshire" },
};

// Welsh Index of Multiple Deprivation (WIMD 2019) aggregated to local authority level.
// Source: Welsh Government WIMD 2019 Results Report (Table 3, p.26).
// Constituencies spanning multiple LAs use a simple average of their constituent LAs.
const WIMD_LOOKUP: Record<string, { pctMostDeprived10: string; pctMostDeprived50: string; laName: string }> = {
  "aberafan-maesteg":           { pctMostDeprived10: "11.1%", pctMostDeprived50: "62.5%", laName: "Neath Port Talbot / Bridgend" },
  "alyn-and-deeside":           { pctMostDeprived10: "3.3%",  pctMostDeprived50: "31.5%", laName: "Flintshire" },
  "bangor-aberconwy":           { pctMostDeprived10: "6.8%",  pctMostDeprived50: "40.5%", laName: "Gwynedd / Conwy / Denbighshire" },
  "blaenau-gwent-and-rhymney":  { pctMostDeprived10: "11.4%", pctMostDeprived50: "73.9%", laName: "Caerphilly / Blaenau Gwent" },
  "brecon-radnor-and-cwm-tawe": { pctMostDeprived10: "8.3%",  pctMostDeprived50: "46.7%", laName: "Neath Port Talbot / Powys" },
  "bridgend":                   { pctMostDeprived10: "6.8%",  pctMostDeprived50: "55.7%", laName: "Bridgend" },
  "caerfyrddin":                { pctMostDeprived10: "4.5%",  pctMostDeprived50: "54.5%", laName: "Carmarthenshire" },
  "caerphilly":                 { pctMostDeprived10: "10.0%", pctMostDeprived50: "62.7%", laName: "Caerphilly" },
  "cardiff-east":               { pctMostDeprived10: "18.2%", pctMostDeprived50: "49.1%", laName: "Cardiff" },
  "cardiff-north":              { pctMostDeprived10: "17.9%", pctMostDeprived50: "60.2%", laName: "Cardiff / Rhondda Cynon Taf" },
  "cardiff-south-and-penarth":  { pctMostDeprived10: "11.0%", pctMostDeprived50: "42.2%", laName: "Vale of Glamorgan / Cardiff" },
  "cardiff-west":               { pctMostDeprived10: "17.9%", pctMostDeprived50: "60.2%", laName: "Cardiff / Rhondda Cynon Taf" },
  "ceredigion-preseli":         { pctMostDeprived10: "3.9%",  pctMostDeprived50: "44.0%", laName: "Ceredigion / Pembrokeshire" },
  "clwyd-east":                 { pctMostDeprived10: "7.5%",  pctMostDeprived50: "39.8%", laName: "Denbighshire / Flintshire / Wrexham" },
  "clwyd-north":                { pctMostDeprived10: "8.8%",  pctMostDeprived50: "43.7%", laName: "Conwy / Denbighshire" },
  "dwyfor-meirionnydd":         { pctMostDeprived10: "7.4%",  pctMostDeprived50: "40.4%", laName: "Gwynedd / Denbighshire" },
  "gower":                      { pctMostDeprived10: "11.5%", pctMostDeprived50: "45.9%", laName: "Swansea" },
  "llanelli":                   { pctMostDeprived10: "4.5%",  pctMostDeprived50: "54.5%", laName: "Carmarthenshire" },
  "merthyr-tydfil-and-aberdare":{ pctMostDeprived10: "19.9%", pctMostDeprived50: "74.6%", laName: "Rhondda Cynon Taf / Merthyr Tydfil" },
  "mid-and-south-pembrokeshire":{ pctMostDeprived10: "5.6%",  pctMostDeprived50: "42.3%", laName: "Pembrokeshire" },
  "monmouthshire":              { pctMostDeprived10: "0.0%",  pctMostDeprived50: "19.6%", laName: "Monmouthshire" },
  "montgomeryshire-and-glynd-r":{ pctMostDeprived10: "4.2%",  pctMostDeprived50: "32.7%", laName: "Wrexham / Powys" },
  "neath-and-swansea-east":     { pctMostDeprived10: "13.4%", pctMostDeprived50: "57.5%", laName: "Swansea / Neath Port Talbot" },
  "newport-east":               { pctMostDeprived10: "24.2%", pctMostDeprived50: "60.0%", laName: "Newport" },
  "newport-west-and-islwyn":    { pctMostDeprived10: "17.1%", pctMostDeprived50: "61.4%", laName: "Caerphilly / Newport" },
  "pontypridd":                 { pctMostDeprived10: "17.5%", pctMostDeprived50: "71.4%", laName: "Rhondda Cynon Taf" },
  "rhondda-and-ogmore":         { pctMostDeprived10: "12.2%", pctMostDeprived50: "63.6%", laName: "Bridgend / Rhondda Cynon Taf" },
  "swansea-west":               { pctMostDeprived10: "11.5%", pctMostDeprived50: "45.9%", laName: "Swansea" },
  "torfaen":                    { pctMostDeprived10: "5.0%",  pctMostDeprived50: "56.7%", laName: "Torfaen" },
  "vale-of-glamorgan":          { pctMostDeprived10: "3.8%",  pctMostDeprived50: "35.4%", laName: "Vale of Glamorgan" },
  "wrexham":                    { pctMostDeprived10: "7.1%",  pctMostDeprived50: "41.2%", laName: "Wrexham" },
  "ynys-m-n":                   { pctMostDeprived10: "2.3%",  pctMostDeprived50: "38.6%", laName: "Isle of Anglesey" },
};

// Deprivation indicators sourced from published government datasets.
// Not available via real-time API — updated here when new data is released
// (IMD ~every 4 years, life exp / fuel / child pov annually).
// For any constituency not listed, the Deprivation section is omitted.
const DEPRIVATION_LOOKUP: Record<string, {
  imdRank: string; lifeExpM: string; lifeExpF: string;
  fuelPov: string; childPov: string;
}> = {
  "braintree":                        { imdRank: "456th (less deprived)", lifeExpM: "80.5 years", lifeExpF: "83.8 years", fuelPov: "11.8%",  childPov: "18.2%" },
  "clacton":                          { imdRank: "108th (more deprived)", lifeExpM: "77.2 years", lifeExpF: "81.6 years", fuelPov: "17.4%",  childPov: "30.2%" },
  "walthamstow":                      { imdRank: "182nd (more deprived)", lifeExpM: "79.0 years", lifeExpF: "83.3 years", fuelPov: "13.8%",  childPov: "41.8%" },
  "sheffield-central":                { imdRank: "32nd (most deprived)",  lifeExpM: "77.5 years", lifeExpF: "82.0 years", fuelPov: "17.9%",  childPov: "46.1%" },
  "leeds-central-and-headingley":     { imdRank: "91st (more deprived)",  lifeExpM: "77.8 years", lifeExpF: "82.1 years", fuelPov: "16.2%",  childPov: "41.2%" },
  "south-basildon-and-east-thurrock": { imdRank: "319th (average)",       lifeExpM: "78.8 years", lifeExpF: "82.8 years", fuelPov: "13.9%",  childPov: "28.7%" },
  "great-yarmouth":                   { imdRank: "89th (more deprived)",  lifeExpM: "77.3 years", lifeExpF: "81.5 years", fuelPov: "19.8%",  childPov: "36.4%" },
  "streatham-and-croydon-north":      { imdRank: "148th (more deprived)", lifeExpM: "79.5 years", lifeExpF: "83.6 years", fuelPov: "13.1%",  childPov: "40.3%" },
  "lewisham-east":                    { imdRank: "160th (more deprived)", lifeExpM: "79.6 years", lifeExpF: "83.7 years", fuelPov: "13.4%",  childPov: "37.9%" },
  "tonbridge":                        { imdRank: "556th (less deprived)", lifeExpM: "81.2 years", lifeExpF: "84.9 years", fuelPov: "9.8%",   childPov: "15.1%" },
};

// Scotland Census 2022 at council area level. Sources:
//   degreeLevel: Figure 4, Education/Labour Market release (NRS, Sep 2024)
//   goodHealth / badHealth: Table 4, Health release (NRS, Oct 2024) — age-standardised %
// Scotland averages: good/very good health 78.9%, bad/very bad 6.9%, degree 35% (approx)
const SCOTLAND_CENSUS_LOOKUP: Record<string, { laName: string; degreeLevel: string; goodHealth: string; badHealth: string }> = {
  "aberdeen-north":                      { laName: "Aberdeen City",          degreeLevel: "38.1%", goodHealth: "82.1%", badHealth: "5.2%" },
  "aberdeen-south":                      { laName: "Aberdeen City",          degreeLevel: "38.1%", goodHealth: "82.1%", badHealth: "5.2%" },
  "aberdeenshire-north-and-moray-east":  { laName: "Moray",                  degreeLevel: "26.9%", goodHealth: "80.4%", badHealth: "5.6%" },
  "airdrie-and-shotts":                  { laName: "North Lanarkshire",       degreeLevel: "23.1%", goodHealth: "75.5%", badHealth: "8.9%" },
  "alloa-and-grangemouth":               { laName: "Clackmannanshire",        degreeLevel: "26.0%", goodHealth: "77.0%", badHealth: "7.6%" },
  "angus-and-perthshire-glens":          { laName: "Angus",                   degreeLevel: "28.3%", goodHealth: "79.4%", badHealth: "6.2%" },
  "arbroath-and-broughty-ferry":         { laName: "Angus",                   degreeLevel: "28.3%", goodHealth: "79.4%", badHealth: "6.2%" },
  "argyll-bute-and-south-lochaber":      { laName: "Highland",                degreeLevel: "31.2%", goodHealth: "79.8%", badHealth: "6.1%" },
  "ayr-carrick-and-cumnock":             { laName: "East Ayrshire",           degreeLevel: "23.4%", goodHealth: "75.8%", badHealth: "8.2%" },
  "bathgate-and-linlithgow":             { laName: "Falkirk",                 degreeLevel: "25.7%", goodHealth: "77.8%", badHealth: "7.2%" },
  "berwickshire-roxburgh-and-selkirk":   { laName: "Scottish Borders",        degreeLevel: "32.0%", goodHealth: "79.6%", badHealth: "5.8%" },
  "caithness-sutherland-and-easter-ross":{ laName: "Highland",                degreeLevel: "31.2%", goodHealth: "79.8%", badHealth: "6.1%" },
  "central-ayrshire":                    { laName: "North Ayrshire",          degreeLevel: "24.1%", goodHealth: "74.1%", badHealth: "9.1%" },
  "coatbridge-and-bellshill":            { laName: "North Lanarkshire",       degreeLevel: "23.1%", goodHealth: "75.5%", badHealth: "8.9%" },
  "cowdenbeath-and-kirkcaldy":           { laName: "Fife",                    degreeLevel: "28.6%", goodHealth: "77.9%", badHealth: "7.1%" },
  "cumbernauld-and-kirkintilloch":       { laName: "East Dunbartonshire",     degreeLevel: "42.9%", goodHealth: "81.7%", badHealth: "5.6%" },
  "dumfries-and-galloway":               { laName: "Dumfries and Galloway",   degreeLevel: "26.0%", goodHealth: "76.1%", badHealth: "7.6%" },
  "dumfriesshire-clydesdale-and-tweeddale":{ laName: "Dumfries and Galloway", degreeLevel: "26.0%", goodHealth: "76.1%", badHealth: "7.6%" },
  "dundee-central":                      { laName: "Dundee City",             degreeLevel: "31.3%", goodHealth: "77.8%", badHealth: "7.5%" },
  "dunfermline-and-dollar":              { laName: "Clackmannanshire",        degreeLevel: "26.0%", goodHealth: "77.0%", badHealth: "7.6%" },
  "east-kilbride-and-strathaven":        { laName: "South Lanarkshire",       degreeLevel: "28.3%", goodHealth: "77.4%", badHealth: "7.7%" },
  "east-renfrewshire":                   { laName: "East Renfrewshire",       degreeLevel: "44.6%", goodHealth: "83.4%", badHealth: "5.2%" },
  "edinburgh-east-and-musselburgh":      { laName: "East Lothian",            degreeLevel: "34.6%", goodHealth: "80.9%", badHealth: "5.7%" },
  "edinburgh-north-and-leith":           { laName: "City of Edinburgh",       degreeLevel: "50.0%", goodHealth: "83.6%", badHealth: "4.9%" },
  "edinburgh-south":                     { laName: "City of Edinburgh",       degreeLevel: "50.0%", goodHealth: "83.6%", badHealth: "4.9%" },
  "edinburgh-south-west":                { laName: "City of Edinburgh",       degreeLevel: "50.0%", goodHealth: "83.6%", badHealth: "4.9%" },
  "edinburgh-west":                      { laName: "City of Edinburgh",       degreeLevel: "50.0%", goodHealth: "83.6%", badHealth: "4.9%" },
  "falkirk":                             { laName: "Falkirk",                 degreeLevel: "25.7%", goodHealth: "77.8%", badHealth: "7.2%" },
  "glasgow-east":                        { laName: "Glasgow City",            degreeLevel: "34.7%", goodHealth: "75.9%", badHealth: "9.3%" },
  "glasgow-north":                       { laName: "Glasgow City",            degreeLevel: "34.7%", goodHealth: "75.9%", badHealth: "9.3%" },
  "glasgow-north-east":                  { laName: "Glasgow City",            degreeLevel: "34.7%", goodHealth: "75.9%", badHealth: "9.3%" },
  "glasgow-south":                       { laName: "Glasgow City",            degreeLevel: "34.7%", goodHealth: "75.9%", badHealth: "9.3%" },
  "glasgow-south-west":                  { laName: "Glasgow City",            degreeLevel: "34.7%", goodHealth: "75.9%", badHealth: "9.3%" },
  "glasgow-west":                        { laName: "Glasgow City",            degreeLevel: "34.7%", goodHealth: "75.9%", badHealth: "9.3%" },
  "glenrothes-and-mid-fife":             { laName: "Fife",                    degreeLevel: "28.6%", goodHealth: "77.9%", badHealth: "7.1%" },
  "gordon-and-buchan":                   { laName: "Aberdeenshire",           degreeLevel: "31.1%", goodHealth: "83.3%", badHealth: "4.3%" },
  "hamilton-and-clyde-valley":           { laName: "South Lanarkshire",       degreeLevel: "28.3%", goodHealth: "77.4%", badHealth: "7.7%" },
  "inverclyde-and-renfrewshire-west":    { laName: "Inverclyde",              degreeLevel: "24.6%", goodHealth: "74.3%", badHealth: "9.5%" },
  "inverness-skye-and-west-ross-shire":  { laName: "Highland",                degreeLevel: "31.2%", goodHealth: "79.8%", badHealth: "6.1%" },
  "kilmarnock-and-loudoun":              { laName: "East Ayrshire",           degreeLevel: "23.4%", goodHealth: "75.8%", badHealth: "8.2%" },
  "livingston":                          { laName: "West Lothian",            degreeLevel: "27.8%", goodHealth: "78.8%", badHealth: "7.0%" },
  "lothian-east":                        { laName: "East Lothian",            degreeLevel: "34.6%", goodHealth: "80.9%", badHealth: "5.7%" },
  "mid-dunbartonshire":                  { laName: "East Dunbartonshire",     degreeLevel: "42.9%", goodHealth: "81.7%", badHealth: "5.6%" },
  "midlothian":                          { laName: "Midlothian",              degreeLevel: "29.5%", goodHealth: "80.4%", badHealth: "6.1%" },
  "moray-west-nairn-and-strathspey":     { laName: "Highland",                degreeLevel: "31.2%", goodHealth: "79.8%", badHealth: "6.1%" },
  "motherwell-wishaw-and-carluke":       { laName: "South Lanarkshire",       degreeLevel: "28.3%", goodHealth: "77.4%", badHealth: "7.7%" },
  "na-h-eileanan-an-iar":               { laName: "Na h-Eileanan Siar",      degreeLevel: "31.1%", goodHealth: "77.9%", badHealth: "6.4%" },
  "north-ayrshire-and-arran":            { laName: "North Ayrshire",          degreeLevel: "24.1%", goodHealth: "74.1%", badHealth: "9.1%" },
  "north-east-fife":                     { laName: "Fife",                    degreeLevel: "28.6%", goodHealth: "77.9%", badHealth: "7.1%" },
  "orkney-and-shetland":                 { laName: "Orkney Islands",          degreeLevel: "31.9%", goodHealth: "82.1%", badHealth: "4.8%" },
  "paisley-and-renfrewshire-north":      { laName: "Renfrewshire",            degreeLevel: "30.5%", goodHealth: "77.7%", badHealth: "7.6%" },
  "paisley-and-renfrewshire-south":      { laName: "Renfrewshire",            degreeLevel: "30.5%", goodHealth: "77.7%", badHealth: "7.6%" },
  "perth-and-kinross-shire":             { laName: "Perth and Kinross",       degreeLevel: "35.8%", goodHealth: "81.4%", badHealth: "5.5%" },
  "rutherglen":                          { laName: "South Lanarkshire",       degreeLevel: "28.3%", goodHealth: "77.4%", badHealth: "7.7%" },
  "stirling-and-strathallan":            { laName: "Stirling",                degreeLevel: "39.6%", goodHealth: "81.8%", badHealth: "5.5%" },
  "west-aberdeenshire-and-kincardine":   { laName: "Aberdeenshire",           degreeLevel: "31.1%", goodHealth: "83.3%", badHealth: "4.3%" },
  "west-dunbartonshire":                 { laName: "West Dunbartonshire",     degreeLevel: "21.7%", goodHealth: "74.6%", badHealth: "9.1%" },
};

// NISRA Census 2021 — education and health at Local Government District (LGD) level.
// Source: NISRA Census 2021 Main Statistics Phase 1 (September 2022).
// NI averages: degree 30.4%, good/very good health 80.6%, bad/very bad health 5.3%.
// Keyed by LGD code (N09 prefix).
const NI_CENSUS_LOOKUP: Record<string, { laName: string; degreeLevel: string; goodHealth: string; badHealth: string }> = {
  "N09000001": { laName: "Antrim and Newtownabbey",              degreeLevel: "28.3%", goodHealth: "81.1%", badHealth: "4.8%" },
  "N09000002": { laName: "Armagh City, Banbridge and Craigavon", degreeLevel: "25.6%", goodHealth: "79.3%", badHealth: "5.7%" },
  "N09000003": { laName: "Belfast",                              degreeLevel: "37.0%", goodHealth: "77.2%", badHealth: "6.7%" },
  "N09000004": { laName: "Causeway Coast and Glens",             degreeLevel: "23.8%", goodHealth: "80.2%", badHealth: "5.2%" },
  "N09000005": { laName: "Derry City and Strabane",              degreeLevel: "28.1%", goodHealth: "76.1%", badHealth: "7.1%" },
  "N09000006": { laName: "Fermanagh and Omagh",                  degreeLevel: "25.2%", goodHealth: "81.2%", badHealth: "4.9%" },
  "N09000007": { laName: "Lisburn and Castlereagh",              degreeLevel: "33.1%", goodHealth: "82.9%", badHealth: "4.2%" },
  "N09000008": { laName: "Mid and East Antrim",                  degreeLevel: "27.3%", goodHealth: "81.1%", badHealth: "4.9%" },
  "N09000009": { laName: "Mid Ulster",                           degreeLevel: "22.5%", goodHealth: "80.8%", badHealth: "4.9%" },
  "N09000010": { laName: "Newry, Mourne and Down",               degreeLevel: "26.3%", goodHealth: "79.5%", badHealth: "5.5%" },
  "N09000011": { laName: "Ards and North Down",                  degreeLevel: "33.8%", goodHealth: "83.1%", badHealth: "4.1%" },
};

// NI Multiple Deprivation Measure (NIMDM) 2017.
// Source: NISRA NIMDM 2017 (published August 2017). Next update was NIMDM 2022 (published May 2024).
// Proportion of SOAs in the most deprived 20% of NI, aggregated to LGD level.
// Keyed by LGD code (N09 prefix).
const NIMDM_LOOKUP: Record<string, { mdmRank: string; pctMostDeprived: string; laName: string }> = {
  "N09000003": { mdmRank: "1 of 11 (most deprived)",   pctMostDeprived: "38.4%", laName: "Belfast" },
  "N09000005": { mdmRank: "2 of 11 (more deprived)",   pctMostDeprived: "32.9%", laName: "Derry City and Strabane" },
  "N09000002": { mdmRank: "3 of 11 (more deprived)",   pctMostDeprived: "26.1%", laName: "Armagh City, Banbridge and Craigavon" },
  "N09000010": { mdmRank: "4 of 11 (above average)",   pctMostDeprived: "22.3%", laName: "Newry, Mourne and Down" },
  "N09000004": { mdmRank: "5 of 11 (average)",         pctMostDeprived: "23.5%", laName: "Causeway Coast and Glens" },
  "N09000009": { mdmRank: "6 of 11 (average)",         pctMostDeprived: "19.6%", laName: "Mid Ulster" },
  "N09000001": { mdmRank: "7 of 11 (below average)",   pctMostDeprived: "17.4%", laName: "Antrim and Newtownabbey" },
  "N09000008": { mdmRank: "8 of 11 (below average)",   pctMostDeprived: "17.5%", laName: "Mid and East Antrim" },
  "N09000006": { mdmRank: "9 of 11 (less deprived)",   pctMostDeprived: "15.9%", laName: "Fermanagh and Omagh" },
  "N09000007": { mdmRank: "10 of 11 (less deprived)",  pctMostDeprived: "10.1%", laName: "Lisburn and Castlereagh" },
  "N09000011": { mdmRank: "11 of 11 (least deprived)", pctMostDeprived: "7.6%",  laName: "Ards and North Down" },
};

// ─── ONS Census 2021 helpers ─────────────────────────────────────────────────

async function fetchONSLtla(
  ladCode: string,
  dim: string,
  popType: "UR" | "HH"
): Promise<Record<string, number>> {
  const url = `${ONS_BASE}/${popType}/census-observations?dimensions=ltla,${dim}&area-type=ltla,${ladCode}`;
  try {
    const r = await fetch(url, {
      headers: { Accept: "application/json" },
      signal: AbortSignal.timeout(8000),
    });
    if (!r.ok) return {};
    const data = await r.json();
    const cats: Record<string, number> = {};
    for (const obs of (data?.observations ?? [])) {
      const d = obs.dimensions?.find((x: { dimension_id: string }) => x.dimension_id === dim);
      if (d && d.option_id !== "-8") cats[d.option_id] = (cats[d.option_id] ?? 0) + obs.observation;
    }
    return cats;
  } catch {
    return {};
  }
}

function sc(cats: Record<string, number>, keys: string[]): number {
  return keys.reduce((a, k) => a + (cats[k] ?? 0), 0);
}
function tc(cats: Record<string, number>): number {
  return Object.values(cats).reduce((a, b) => a + b, 0);
}
function fp(n: number, t: number): string {
  if (t === 0) return "0%";
  return `${Math.round((n / t) * 1000) / 10}%`;
}

// ─── Dynamic demographic profile fetch ──────────────────────────────────────

async function fetchDemographicProfile(
  slug: string,
  ladCode: string,
  wpca24Code: string
): Promise<DataSection[]> {
  try {
    // Fetch Census dimensions sequentially to respect ONS rate limits
    const health   = await fetchONSLtla(ladCode, "health_in_general", "UR");
    await new Promise(r => setTimeout(r, 200));
    const quals    = await fetchONSLtla(ladCode, "highest_qualification", "UR");
    await new Promise(r => setTimeout(r, 200));
    const tenure   = await fetchONSLtla(ladCode, "hh_tenure_9a", "HH");
    await new Promise(r => setTimeout(r, 200));
    const econAct  = await fetchONSLtla(ladCode, "economic_activity_status_12a", "UR");
    await new Promise(r => setTimeout(r, 200));
    const birth    = await fetchONSLtla(ladCode, "country_of_birth_3a", "UR");
    await new Promise(r => setTimeout(r, 200));
    const ethnic   = await fetchONSLtla(ladCode, "ethnic_group_tb_20b", "UR");
    await new Promise(r => setTimeout(r, 200));
    const ageGrp   = await fetchONSLtla(ladCode, "resident_age_3a", "UR");

    if (tc(health) === 0 && tc(quals) === 0) return []; // nothing came back

    // NOMIS APS employment rate
    let empRate: string | null = null;
    let medianPay: string | null = null;
    try {
      const er = await fetch(
        `${NOMIS_BASE}/dataset/NM_17_5.data.json?geography=${wpca24Code}&variable=45&measures=20599&time=latest`,
        { signal: AbortSignal.timeout(8000) }
      );
      if (er.ok) {
        const v = (await er.json())?.obs?.[0]?.obs_value?.value;
        if (v) empRate = `${Math.round(v * 10) / 10}%`;
      }
    } catch { /* continue */ }

    // NOMIS ASHE median weekly pay
    try {
      const pr = await fetch(
        `${NOMIS_BASE}/dataset/NM_99_1.data.json?geography=${wpca24Code}&sex=8&item=2&pay=1&measures=20100&time=latest`,
        { signal: AbortSignal.timeout(8000) }
      );
      if (pr.ok) {
        const v = (await pr.json())?.obs?.[0]?.obs_value?.value;
        if (v && String(v) !== "") medianPay = `£${Math.round(Number(v)).toLocaleString("en-GB")}`;
      }
    } catch { /* continue */ }

    // Computed indicators
    const ht = tc(health), qt = tc(quals), tt = tc(tenure);
    const bt = tc(birth), etht = tc(ethnic), at = tc(ageGrp);

    const goodHealth   = fp(sc(health, ["1", "2"]), ht);
    const badHealth    = fp(sc(health, ["4", "5"]), ht);
    const degree       = fp(quals["5"] ?? 0, qt);
    const noQuals      = fp(quals["0"] ?? 0, qt);
    const ownerOcc     = fp(sc(tenure, ["0", "1"]), tt);
    const socialRent   = fp(sc(tenure, ["3", "4"]), tt);
    const privateRent  = fp(sc(tenure, ["5", "6"]), tt);
    const employed     = sc(econAct, ["1", "2", "3", "5"]);
    const unemployed   = sc(econAct, ["4", "6"]);
    const unempRate    = fp(unemployed, employed + unemployed);
    const bornUK       = fp(birth["1"] ?? 0, bt);
    const whiteBritish = fp(ethnic["13"] ?? 0, etht);
    const u16  = at > 0 ? (ageGrp["1"] ?? 0) / at * 100 : 20;
    const o65  = at > 0 ? (ageGrp["3"] ?? 0) / at * 100 : 18;
    const medAge = String(Math.round(u16 * 0.08 + (100 - u16 - o65) * 0.40 + o65 * 0.75));

    const dep = DEPRIVATION_LOOKUP[slug];
    const wimd = WIMD_LOOKUP[slug];

    return [
      {
        heading: "Population & Demographics",
        rows: [
          { Measure: "Median age", Value: medAge, England: "40", Region: "" },
          { Measure: "Born in UK", Value: bornUK, England: "83.4%", Region: "" },
          { Measure: "White British", Value: whiteBritish, England: "73.5%", Region: "" },
        ],
      },
      {
        heading: "Housing",
        rows: [
          { Measure: "Owner occupied", Value: ownerOcc, England: "62.3%", Region: "" },
          { Measure: "Social rented", Value: socialRent, England: "17.1%", Region: "" },
          { Measure: "Private rented", Value: privateRent, England: "18.4%", Region: "" },
        ],
      },
      {
        heading: "Economy & Employment",
        rows: [
          ...(empRate ? [{ Measure: "Employment rate (16-64)", Value: empRate, England: "75.5%", Region: "" }] : []),
          { Measure: "Unemployment rate", Value: unempRate, England: "4.3%", Region: "" },
          ...(medianPay ? [{ Measure: "Median weekly pay", Value: medianPay, England: "£640", Region: "" }] : []),
        ],
      },
      {
        heading: "Education",
        rows: [
          { Measure: "Degree or higher (16+)", Value: degree, England: "33.8%", Region: "" },
          { Measure: "No qualifications (16+)", Value: noQuals, England: "18.2%", Region: "" },
        ],
      },
      {
        heading: "Health",
        rows: [
          { Measure: "Good or very good health", Value: goodHealth, England: "81.7%", Region: "" },
          { Measure: "Bad or very bad health", Value: badHealth, England: "5.2%", Region: "" },
          ...(dep ? [
            { Measure: "Life expectancy (male)", Value: dep.lifeExpM, England: "79.4 years", Region: "" },
            { Measure: "Life expectancy (female)", Value: dep.lifeExpF, England: "83.1 years", Region: "" },
          ] : []),
        ],
      },
      ...(dep ? [{
        heading: "Deprivation",
        rows: [
          { Measure: "IMD rank (of 650)", Value: dep.imdRank, England: "", Region: "" },
          { Measure: "Fuel poverty", Value: dep.fuelPov, England: "13.1%", Region: "" },
          { Measure: "Child poverty (after housing costs)", Value: dep.childPov, England: "29.4%", Region: "" },
        ],
      }] : []),
      ...(wimd ? [{
        heading: "Deprivation (WIMD 2019)",
        rows: [
          { Measure: "LSOAs in most deprived 10% (Wales)", Value: wimd.pctMostDeprived10, England: "", Region: "" },
          { Measure: "LSOAs in most deprived 50% (Wales)", Value: wimd.pctMostDeprived50, England: "", Region: "" },
          { Measure: "Local authority area", Value: wimd.laName, England: "", Region: "" },
          { Measure: "Source", Value: "Welsh Gov WIMD 2019 (local authority level)", England: "", Region: "" },
        ],
      }] : []),
    ];
  } catch {
    return [];
  }
}

// ─── Live NOMIS data (refreshed daily) ──────────────────────────────────────

async function fetchNomisReport(wpca24Code: string | null): Promise<DataSection[]> {
  const sections: DataSection[] = [];

  try {
    const [empRes, ccRes, popRes] = await Promise.all([
      fetch(
        `${NOMIS_BASE}/dataset/NM_17_5.data.json?geography=2092957703&variable=45&measures=20599&time=latest`,
        { next: { revalidate: 86400 }, signal: AbortSignal.timeout(8000) }
      ).catch(() => null),
      wpca24Code ? fetch(
        `${NOMIS_BASE}/dataset/NM_162_1.data.json?geography=${wpca24Code}&time=latestMINUS2&measures=20100,20201&gender=0&age=0`,
        { next: { revalidate: 86400 }, signal: AbortSignal.timeout(8000) }
      ).catch(() => null) : null,
      wpca24Code ? fetch(
        `${NOMIS_BASE}/dataset/NM_2010_1.data.json?geography=${wpca24Code}&time=latest&measures=20100&gender=0&c_age=200`,
        { next: { revalidate: 86400 }, signal: AbortSignal.timeout(8000) }
      ).catch(() => null) : null,
    ]);

    if (empRes?.ok) {
      const obs = (await empRes.json())?.obs ?? [];
      if (obs.length > 0) {
        const val = obs[0]?.obs_value?.value;
        const date = obs[0]?.time?.description || "";
        if (val) sections.push({
          heading: "Employment Rate (GB)",
          rows: [{ Measure: "Employment rate (16-64)", Value: `${val}%`, Period: date }],
        });
      }
    }

    if (ccRes?.ok) {
      const obs = (await ccRes.json())?.obs ?? [];
      const rows: Record<string, string>[] = [];
      let date = "";
      for (const o of obs) {
        const measure = String(o.measures?.value);
        const val = o.obs_value?.value;
        date = o.time?.description || date;
        if (measure === "20100" && val > 10) rows.push({ Measure: "Claimant count", Value: Number(val).toLocaleString(), Period: date });
        else if (measure === "20201" && val > 0 && val < 100) rows.push({ Measure: "Claimant rate", Value: `${val}%`, Period: date });
      }
      if (rows.length > 0) sections.push({ heading: "Claimant Count", rows });
    }

    if (popRes?.ok) {
      const obs = (await popRes.json())?.obs ?? [];
      if (obs.length > 0) {
        const val = obs[0]?.obs_value?.value;
        const date = obs[0]?.time?.description || "";
        if (val) sections.push({
          heading: "Population",
          rows: [{ Measure: "Total population", Value: Number(val).toLocaleString(), Period: date }],
        });
      }
    }
  } catch { /* continue */ }

  return sections;
}

async function fetchParliamentData(constituency: string): Promise<DataSection[]> {
  try {
    const mpRes = await fetch(
      `https://members-api.parliament.uk/api/Members/Search?Name=&Constituency=${encodeURIComponent(constituency)}&IsCurrentMember=true`,
      { next: { revalidate: 86400 }, signal: AbortSignal.timeout(8000) }
    );
    if (!mpRes.ok) return [];
    const items = (await mpRes.json())?.items ?? [];
    if (items.length === 0) return [];
    const mp = items[0].value;
    return [{
      heading: "Member of Parliament",
      rows: [
        { Field: "Name", Value: mp.nameDisplayAs || "" },
        { Field: "Party", Value: mp.latestParty?.name || "" },
        { Field: "Gender", Value: mp.gender || "" },
        { Field: "Member since", Value: mp.membershipStartDate ? String(new Date(mp.membershipStartDate).getFullYear()) : "" },
      ],
    }];
  } catch {
    return [];
  }
}

// ─── Demographic profile — Firestore cache (6-month TTL) ────────────────────

async function getOrFetchDemographicProfile(
  slug: string,
  ladCode: string | null,
  wpca24Code: string | null
): Promise<DataSection[]> {
  const ref = adminDb.collection("demographic_profile_cache").doc(slug);

  try {
    const snap = await ref.get();
    if (snap.exists) {
      const cached = snap.data()!;
      const age = Date.now() - new Date(cached.cached_at as string).getTime();
      if (age < DEMOGRAPHIC_TTL_MS) {
        const cachedSections = (cached.sections as DataSection[]) ?? [];
        const isScottish = ladCode?.startsWith("S12");
        const isNI = ladCode?.startsWith("N09");
        const hasEducation = cachedSections.some(s => s.heading === "Education");
        const hasNIData = cachedSections.some(s => s.heading.includes("NIMDM") || s.heading.includes("Census 2021"));
        const needsBust =
          (isScottish && !hasEducation && SCOTLAND_CENSUS_LOOKUP[slug]) ||
          (isNI && !hasNIData && !!ladCode && !!NI_CENSUS_LOOKUP[ladCode]);
        if (needsBust) {
          // fall through to regenerate
        } else {
          return cachedSections;
        }
      }
    }
  } catch { /* continue to fetch */ }

  if (!ladCode) return [];

  // NI: use NISRA Census 2021 and NIMDM 2017 static lookups (keyed by N09 LGD code)
  if (ladCode.startsWith("N09")) {
    const census = NI_CENSUS_LOOKUP[ladCode];
    const nimdm = NIMDM_LOOKUP[ladCode];
    if (!census && !nimdm) return [];
    const sections: DataSection[] = [
      ...(census ? [
        {
          heading: "Education",
          rows: [
            { Measure: "Degree or higher (16+)", Value: census.degreeLevel, England: "", Region: "" },
            { Measure: "Council area", Value: census.laName, England: "", Region: "" },
          ],
        },
        {
          heading: "Health",
          rows: [
            { Measure: "Good or very good health", Value: census.goodHealth, England: "", Region: "" },
            { Measure: "Bad or very bad health", Value: census.badHealth, England: "", Region: "" },
            { Measure: "Source", Value: "NISRA Census 2021 (council area level)", England: "", Region: "" },
          ],
        },
      ] : []),
      ...(nimdm ? [{
        heading: "Deprivation (NIMDM 2017)",
        rows: [
          { Measure: "Deprivation rank", Value: nimdm.mdmRank, England: "", Region: "" },
          { Measure: "SOAs in most deprived 20%", Value: nimdm.pctMostDeprived, England: "", Region: "" },
          { Measure: "Council area", Value: nimdm.laName, England: "", Region: "" },
          { Measure: "Source", Value: "NISRA NIMDM 2017 (council area level)", England: "", Region: "" },
        ],
      }] : []),
    ];
    try { await ref.set({ sections, cached_at: new Date().toISOString() }); } catch { /* ignore */ }
    return sections;
  }

  if (!wpca24Code) return [];
  // ONS Census 2021 API covers England & Wales only (S12... codes return 403).
  // Return SIMD deprivation data for Scottish constituencies instead.
  if (ladCode.startsWith("S12")) {
    const simd = SIMD_LOOKUP[slug];
    const census = SCOTLAND_CENSUS_LOOKUP[slug];
    if (!simd && !census) return [];
    const sections: DataSection[] = [
      ...(census ? [
        {
          heading: "Education",
          rows: [
            { Measure: "Degree or higher (16+)", Value: census.degreeLevel, England: "", Region: "" },
            { Measure: "Council area", Value: census.laName, England: "", Region: "" },
          ],
        },
        {
          heading: "Health",
          rows: [
            { Measure: "Good or very good health", Value: census.goodHealth, England: "", Region: "" },
            { Measure: "Bad or very bad health", Value: census.badHealth, England: "", Region: "" },
            { Measure: "Source", Value: "Scotland Census 2022 (council area level)", England: "", Region: "" },
          ],
        },
      ] : []),
      ...(simd ? [{
        heading: "Deprivation (SIMD 2020)",
        rows: [
          { Measure: "SIMD context", Value: simd.simdRank },
          { Measure: "In most deprived quintile", Value: simd.pctMostDeprived },
          { Measure: "Council area", Value: simd.laName },
          { Measure: "Source", Value: "Scottish Government SIMD 2020v2 (council area level)" },
        ],
      }] : []),
    ];
    try { await ref.set({ sections, cached_at: new Date().toISOString() }); } catch { /* ignore */ }
    return sections;
  }

  const sections = await fetchDemographicProfile(slug, ladCode, wpca24Code);
  if (sections.length > 0) {
    try {
      await ref.set({ sections, cached_at: new Date().toISOString() });
    } catch { /* write failure — still return the freshly fetched data */ }
  }
  return sections;
}

// ─── Main data assembly ──────────────────────────────────────────────────────

async function generateFreshData(
  constituencySlug: string,
  constituencyName: string,
  onsCode: string,
  wpca24Code: string | null,
  ladCode: string | null
): Promise<CommonsLibraryData> {
  const [nomisSections, parliamentSections, demographicSections] = await Promise.allSettled([
    fetchNomisReport(wpca24Code),
    fetchParliamentData(constituencyName),
    getOrFetchDemographicProfile(constituencySlug, ladCode, wpca24Code),
  ]);

  const liveSections: DataSection[] = [];
  if (nomisSections.status === "fulfilled") liveSections.push(...nomisSections.value);
  if (parliamentSections.status === "fulfilled") liveSections.push(...parliamentSections.value);

  const staticSections: DataSection[] = parliamentSections.status === "fulfilled"
    ? (demographicSections.status === "fulfilled" ? demographicSections.value : [])
    : [];

  const grouped: Record<string, DataSection[]> = {};
  for (const s of liveSections) {
    const cat = "live";
    if (!grouped[cat]) grouped[cat] = [];
    grouped[cat].push(s);
  }
  for (const s of staticSections) {
    const cat = categorise(s.heading);
    if (!grouped[cat]) grouped[cat] = [];
    grouped[cat].push(s);
  }

  const hasProfile = staticSections.length > 0;

  return {
    constituency: constituencyName,
    onsCode,
    sections: grouped,
    sectionCount: liveSections.length + staticSections.length,
    source: liveSections.length > 0 ? (hasProfile ? "mixed" : "live-only") : "static",
    sourceUrl: `https://commonslibrary.parliament.uk/constituency/${constituencySlug}/`,
    scrapedAt: new Date().toISOString(),
    ...(!hasProfile && { note: "Demographic profile is being fetched — check back shortly." }),
  };
}

// ─── GET handler ─────────────────────────────────────────────────────────────

export async function GET(request: Request) {
  const { searchParams } = new URL(request.url);
  const constituencySlug = searchParams.get("constituency") || "braintree";
  const force = searchParams.get("force") === "1";
  const constituencyData = getFullData(constituencySlug);

  if (!constituencyData) {
    return Response.json({ error: "Invalid constituency slug" }, { status: 400 });
  }

  const constituencyName = constituencyData.constituency.name;
  const onsCode = constituencyData.constituency.onsCode;
  const wpca24Code = constituencyData.constituency.wpca24Code ?? (constituencySlug === "braintree" ? BRAINTREE_WPCA24 : null);
  const ladCode = constituencyData.areas?.lads?.[0]?.code ?? null;

  const cacheDocRef = adminDb.collection("commons_library_cache").doc(constituencySlug);

  type CacheDoc = { data: Record<string, unknown>; updated_at: string };
  let cached: CacheDoc | null = null;
  try {
    const snap = await cacheDocRef.get();
    if (snap.exists) cached = snap.data() as CacheDoc;
  } catch { /* continue without cache */ }

  if (cached && !force) {
    const cachedSections = (cached.data?.sections as Record<string, unknown[]>) ?? {};
    const demographicKeys = ["population", "housing", "economy", "education", "health", "deprivation"];
    const cachedHasDemographics = demographicKeys.some(k => (cachedSections[k]?.length ?? 0) > 0);
    const bustForDemographics = !cachedHasDemographics && !!ladCode && (!!wpca24Code || ladCode.startsWith("N09"));

    if (!bustForDemographics) {
      const cacheAge = Date.now() - new Date(cached.updated_at).getTime();
      if (cacheAge > TTL_MS) {
        (async () => {
          try {
            const fresh = await generateFreshData(constituencySlug, constituencyName, onsCode, wpca24Code, ladCode);
            await cacheDocRef.set({ data: fresh, updated_at: new Date().toISOString() });
          } catch (err) {
            console.warn("Commons library background refresh failed:", err);
          }
        })();
      }
      return NextResponse.json({ ...cached.data, source: "cache", _cachedAt: new Date(cached.updated_at).getTime() });
    }
  }

  try {
    const fresh = await generateFreshData(constituencySlug, constituencyName, onsCode, wpca24Code, ladCode);
    const cachedAt = Date.now();
    try {
      await cacheDocRef.set({ data: fresh, updated_at: new Date(cachedAt).toISOString() });
    } catch { /* cache write failure — return fresh anyway */ }
    return NextResponse.json({ ...fresh, _cachedAt: cachedAt });
  } catch (err) {
    console.error("Commons Library API error:", err);
    return NextResponse.json(
      {
        constituency: constituencyName,
        onsCode,
        sections: {},
        sectionCount: 0,
        source: "error",
        sourceUrl: `https://commonslibrary.parliament.uk/constituency/${constituencySlug}/`,
        scrapedAt: new Date().toISOString(),
        note: "Failed to load constituency data.",
      },
      { status: 500 }
    );
  }
}

function categorise(heading: string): string {
  const h = heading.toLowerCase();
  if (h.includes("population") || h.includes("demograph")) return "population";
  if (h.includes("economy") || h.includes("employment") || h.includes("claimant")) return "economy";
  if (h.includes("housing") || h.includes("house price")) return "housing";
  if (h.includes("education") || h.includes("school")) return "education";
  if (h.includes("health") || h.includes("life expectancy")) return "health";
  if (h.includes("deprivation") || h.includes("imd")) return "deprivation";
  if (h.includes("transport") || h.includes("broadband")) return "transport";
  if (h.includes("member") || h.includes("parliament")) return "mp";
  return "other";
}
