# Claude Notes — ground-game-ai-public

Working reference for Claude when operating in this repo. Keep this file up to date as architecture changes.

## What this project is

- Daily constituency intelligence dashboard for UK parliamentary seats
- Aggregates ~25 public data sources (Parliament, ONS Census, NOMIS, Land Registry, Environment Agency, Police.uk, CQC, OHID Fingertips, Electoral Calculus, RSS, etc.)
- Synthesises them into a daily AI brief via Anthropic API (`claude-haiku-4-5-20251001`)
- Currently anchored on Braintree; multi-constituency support is partially rolled out (see route table in `README.md`)
- Audience: MPs and their staff — fast single-pane view of 'what's happening on the ground'

## Tech stack

- Next.js 14 (App Router) + React 18 + TypeScript (strict)
- Tailwind CSS, Recharts, MapLibre GL JS, lucide-react
- Firebase Auth (Google + magic link) + Firestore (cache + user records)
- Firebase Admin SDK server-side for session cookies, custom claims, user CRUD
- `rss-parser`, `google-trends-api` (stale, see TODO), SerpAPI (paid alt)
- Path alias `@/*` → `src/*`

## Auth model (added)

- **Gated site** — every page except `/login` and every API route except `/api/auth/*` requires a session
- **Signup is invite-only** — admins invite via `/admin` and POST `/api/admin/users`
- **Roles**: `user | admin` mirrored from `users/{uid}.role` into Firebase Auth custom claims
- **Constituency access**: `users/{uid}.allowedConstituencies: string[]`. Admins are ALSO scoped — they need explicit slugs to read data, the `admin` role only unlocks user management
- **Three defence layers**:
  1. `src/middleware.ts` redirects unauth users to `/login`
  2. `src/lib/guards.ts` (`requireUser`, `requireAdmin`, `requireConstituencyAccess`) enforces auth + scope on every API route
  3. Firestore Security Rules (when migrating reference data into Firestore)
- **Session**: httpOnly cookie minted by `admin.auth().createSessionCookie()` from a Firebase ID token POSTed to `/api/auth/session`
- **Bootstrap**: `npm run bootstrap-admin -- you@example.com` creates the first admin with all 650 constituencies and prints a sign-in link
- **Key files**:
  - `src/lib/firebase-admin.ts` — Admin SDK singleton
  - `src/lib/auth.ts` — `verifySession()` + types (`UserRecord`, `AuthContext`)
  - `src/lib/guards.ts` — route-handler guards
  - `src/hooks/useMe.ts` — singleton client hook for current user
  - `src/hooks/useConstituency.ts` — selection + filter against `allowedConstituencies`
  - `src/app/login/` — Google + magic link UI
  - `src/app/admin/` — user CRUD UI
  - `src/app/api/auth/*` — session + signout + me
  - `src/app/api/admin/users/*` — list/invite/update/delete users
  - `scripts/bootstrap-admin.ts` — first-admin bootstrap

## Repo layout

```
src/
  app/
    api/<source>/route.ts   # one route per upstream data source (~25 routes)
    page.tsx                # single-page dashboard, tabbed UI
    layout.tsx, globals.css
  components/                # ~30 panel components, one per data widget
  data/
    index.ts                 # getFullData(slug) — entry point
    constituencies.ts, mp-data.ts, constituency-geo.ts,
    constituency-areas.ts, candidates-2024.ts, news-feeds.ts,
    ward-deprivation.ts, braintree.ts, constituency-areas.ts
  hooks/useConstituency.ts   # reads ?constituency=<slug> from URL
  lib/
    firebase.ts              # HMR-safe Firestore singleton
    geo.ts                   # constituency boundary helpers
public/
  geojson/                   # constituency + ward boundaries (per-seat files)
  data/                      # static schools JSON per constituency
scripts/build-schools-data.py
```

## Core conventions

- **Data layer entrypoint**: `getFullData(slug)` in `src/data/index.ts` returns `{ constituency, mp, geo, areas, candidates, newsFeeds }`. Every route should call this rather than hardcoding identifiers
- **Cache-then-refresh**: every API route reads its Firestore doc, returns cached payload immediately, then refreshes in the background if older than the route's TTL. Cache key pattern `<collection>/<slug>` (census uses `<slug>-<topic>`)
- **Multi-constituency**: all geo-scoped routes accept `?constituency=<slug>` (defaults to `braintree`). Missing required fields → HTTP 400 with explicit message
- **Non-English seats**: ~107 Scottish, Welsh, NI seats have `geo`/`areas` as `undefined` — geo-dependent routes return 400 for these
- **TypeScript strict mode**; `noEmit: true`; bundler module resolution

## Route status snapshot (from README)

- **Fully multi-constituency**: parliament, petitions, electoral-calculus, hansard, air-quality, crime, fixmystreet, planning, floods, worship, census, universal-credit, epc, news, mentions, ai-brief, employment, house-prices, health
- **Partial / Braintree-only fallback**: commons-library, schools, cqc, opposition
- **National scope, no slug needed**: headlines, polling, trends, trends-v2

## Known limitations (do not 'fix' without checking)

- ONS Census 2021 = England & Wales only (NI returns 400)
- `wpca24Code` populated only for Braintree → universal-credit falls back for others
- Opposition Twitter handles + Apify terms only set up for Braintree
- EPC free tier = 100 req/day across all constituencies
- Electoral Calculus uses Title Case seat names; override via `?seat=<exact-EC-name>` if lookup fails
- `google-trends-api` package is 5 years stale; `dailyTrends` + `interestByRegion` return CAPTCHA HTML. Only `interestOverTime` works on the free path. SerpAPI is the paid alternative (decision pending — see TODO.md)

## Panel data health (per MVP_STATUS.md, dated 2026-05-05)

Legend: working with real data / partial / broken / using mock fallback

- **Broken without env vars**: AIBrief (needs `ANTHROPIC_API_KEY`), EPCPanel (needs `EPC_API_KEY` + `EPC_EMAIL`), MentionsFeed (needs `X_BEARER_TOKEN` or `APIFY_API_TOKEN`), TrendsPanel (needs `SERPAPI_KEY`, or rewire to trends-v2)
- **Mock fallback**: NewsFeed (inline `getMockNews()` on fetch failure with banner), SchoolsPanel (hardcoded ~18 schools), CQCPanel (hardcoded 12-facility list)
- **Hardcoded to Braintree**: ConstituencyProfile, Demographics, ECPrediction, ElectionResults, ElectoralIntel, Header ('Braintree · James Cleverly'), PollingDashboard (`seat=Braintree` baked in), WardDataHub, WardTable, LiveFeeds (YouTube IDs hardcoded; Times Radio placeholder is empty)
- **Wired-but-stale upstream**: HealthPanel (OHID Fingertips endpoints changed early 2026, uses fallback)
- **Working cleanly**: ConstituencyMap, EmploymentPanel, FixMyStreet, HansardFeed, Headlines, HousePricesPanel, ParliamentBills, PetitionsPanel, UniversalCreditPanel

Cross-reference gap: `/api/trends-v2` exists and partially works but no component consumes it. `TrendsPanel.tsx` still points at the paid `/api/trends`.

## Environment variables

Required (Firebase, all `NEXT_PUBLIC_*`):
`FIREBASE_API_KEY`, `FIREBASE_AUTH_DOMAIN`, `FIREBASE_PROJECT_ID`, `FIREBASE_STORAGE_BUCKET`, `FIREBASE_MESSAGING_SENDER_ID`, `FIREBASE_APP_ID`, `FIREBASE_MEASUREMENT_ID`

Optional (feature gates):
- `ANTHROPIC_API_KEY` → `/api/ai-brief`
- `EPC_API_KEY` + `EPC_EMAIL` → `/api/epc`
- `APIFY_API_TOKEN` → mentions + opposition tracking
- `SERPAPI_KEY` → `/api/trends`
- `X_BEARER_TOKEN` → alt to Apify for mentions

## Dev workflow

```bash
npm run dev      # next dev
npm run build    # next build
npm run start    # next start
npm run lint     # next lint
```

Test URLs for the three tiers:

- `http://localhost:3000/?constituency=braintree` — full coverage
- `http://localhost:3000/?constituency=witham` — English seat, partial routes return 400
- `http://localhost:3000/?constituency=edinburgh-east` — Scottish, geo routes return 400

## Open priorities (TODO.md, ROLLOUT_READINESS.md, REFACTOR_AUDIT.md)

- Mock-data audit: prove the AI brief isn't summarising fallback data
- Constituency config refactor: move Braintree-specific values into a single config so adding seat #2 is a config change
- SerpAPI vs free-trends decision (tech-lead call)
- Open PRs to upstream `Steve-Aaron`: live-feeds fix, caching layer (9 commits), free-trends route

Long-form audits to read when working on related areas:
- `MVP_STATUS.md` — frontend panels + API routes table
- `REFACTOR_AUDIT.md` — code-health deep-dive
- `ROLLOUT_READINESS.md` — pre-rollout checklist
- `SCALING_COSTS.md` — cost projections

## Conventions Claude should follow in this repo

- Match existing route pattern: `getFullData(slug)` → resolve identifiers → cache-then-refresh via Firestore → return `NextResponse.json`
- Don't hardcode constituency identifiers in new routes; route through the data layer
- When a required field is `undefined` for a slug, return HTTP 400 with a message naming the missing field — do not silently fall back to Braintree
- Components are colocated under `src/components/` as flat files (no per-component folders)
- Use Tailwind utility classes; the repo does not use a CSS-in-JS layer
- Keep TypeScript strict; no `any` slip-ins
