<div align="center">

# SoberMap

**A real-time public-interest observatory for India's alcohol policy, illicit-liquor incidents, and correlated social harms.**

[![License: MIT](https://img.shields.io/badge/License-MIT-blue.svg)](LICENSE)
[![TypeScript](https://img.shields.io/badge/TypeScript-strict-3178C6?logo=typescript&logoColor=white)](https://www.typescriptlang.org/)
[![React 19](https://img.shields.io/badge/React-19-61DAFB?logo=react&logoColor=black)](https://react.dev/)
[![TanStack Start](https://img.shields.io/badge/TanStack-Start-FF4154)](https://tanstack.com/start)
[![Tailwind CSS v4](https://img.shields.io/badge/Tailwind-v4-06B6D4?logo=tailwindcss&logoColor=white)](https://tailwindcss.com/)
[![Postgres](https://img.shields.io/badge/Postgres-Realtime-336791?logo=postgresql&logoColor=white)](https://www.postgresql.org/)
[![Deploy on Vercel](https://img.shields.io/badge/Deploy-Vercel-000?logo=vercel&logoColor=white)](https://vercel.com/)

</div>

---

## About

SoberMap is an early-stage civic-tech product that fuses four alcohol-related signals India normally tracks in isolation into a single live dashboard:

1. **Policy** — who allows it, who bans it, what the legal drinking age is.
2. **Consumption** — household survey proxies drawn from NFHS-5.
3. **Illicit supply** — hooch tragedies, methanol poisonings, IMFL seizures.
4. **Social harm** — domestic violence rates and alcohol-linked crime.

The result is a map-first observatory with a real GeoJSON choropleth of India, a live signal feed wired to Postgres realtime, per-state deep-dives with SEO-ready routes, and an AI pipeline that watches Indian news wires and inserts structured incident rows as they happen.

> SoberMap is a public-interest research and awareness prototype. It is not an enforcement tool, not a personal-risk predictor, and not a substitute for professional help.

---

## Company

**SoberMap** is built and maintained by:

**Mohammad Zeeshan** — Founder & Engineering
Eötvös Loránd University (ELTE), Budapest
hdglit@inf.elte.hu  ·  github.com/m-zest

Mission: make public data about alcohol, policy, and social harm in India legible, current, and usable — by journalists, civil society, researchers, and the public — without turning people into data points.

---

## Highlights

| Module | What it does |
|---|---|
| **Legality Choropleth** | Real GeoJSON India map (d3-geo + topojson) with zoom, pan, per-state status colors, and live realtime pulses when new incidents arrive. |
| **Signal Feed** | Postgres realtime stream — new incidents prepend with a visual flash and `NEW` badge as they are inserted. |
| **Consumption x DV Panel** | Side-by-side state ranking with the Pearson correlation between consumption proxies and reported domestic-violence rates per 100k. |
| **Per-State Reports** | `/state/$code` with hero KPIs, six-year trend chart (events vs casualties), full incident timeline, prioritized helplines, and unique SEO / OpenGraph metadata per state. |
| **AI News Ingest** | `POST /hooks/ingest-news` parses Indian RSS feeds, de-dupes against existing rows, and uses an OpenAI-compatible model via tool-calling to extract `{state, district, type, date, casualties}` as structured inserts. |
| **Helplines Directory** | Verified Indian DV, de-addiction and mental-health numbers (181, 1091, NIMHANS 14416, AASRA, iCall, and more) with 24x7 flag and coverage area. |

---

## What's in the database

Full transparency about what is real versus seeded, because trust matters more than impressive-looking numbers.

| Table | Rows | Source |
|---|---|---|
| `states` | 31 | Manually curated. `consumption_index`, `dv_rate_per_100k`, `drinking_age`, `policy_notes` are representative figures derived from NFHS-5 and NCRB published ranges — directional, not row-level audited. |
| `incidents` | 20 seed + live | Seed rows are real, attributable public events from news archives (Botad 2022, Chhapra 2022, Tarn Taran 2020, and others). New rows are inserted automatically by the AI ingest hook. |
| `helplines` | 12 | Real, verified Indian numbers. |

Realtime, the choropleth pulses, the signal feed, and the AI extraction pipeline are all real and wired end-to-end. What is small today is the dataset volume, not the plumbing. Schedule the ingest hook and rows accumulate automatically.

---

## Tech stack

- **TanStack Start v1** — full-stack React 19 framework with SSR and file-based routing on Vite 7.
- **TanStack Router** — type-safe routing (`/state/$code` is fully typed).
- **Tailwind CSS v4** — design tokens in `oklch`, defined in `src/styles.css`.
- **Postgres + Realtime** — public-read RLS, websocket subscription on `incidents`.
- **d3-geo + topojson-client** — real India GeoJSON projection with zoom / pan.
- **Recharts** — trend charts on per-state pages.
- **OpenAI-compatible Chat Completions** — provider-agnostic structured extraction via tool-calling (works with OpenAI, Azure OpenAI, OpenRouter, Groq, Together, Fireworks, or any self-hosted gateway).
- **TypeScript strict mode**, ESLint, Prettier.
- **Vercel** — production hosting for both the SSR app and the server routes.

---

## Quick start

```bash
# 1. Install
npm install

# 2. Configure environment
cp .env.example .env
# fill in the keys listed below

# 3. Dev server on http://localhost:5173
npm run dev

# 4. Production build
npm run build
npm run start
```

---

## Environment variables

All variables live in `.env` locally and in the Vercel project settings in production.

```env
# Public (browser-safe) — bundled into the client
VITE_SUPABASE_URL=https://<project-ref>.supabase.co
VITE_SUPABASE_PUBLISHABLE_KEY=<anon-key>
VITE_SUPABASE_PROJECT_ID=<project-ref>

# Server-only — never expose to the browser
SUPABASE_URL=https://<project-ref>.supabase.co
SUPABASE_PUBLISHABLE_KEY=<anon-key>
SUPABASE_SERVICE_ROLE_KEY=<service-role-key>

# AI ingest pipeline
AI_API_KEY=<provider-key>
AI_GATEWAY_URL=https://api.openai.com/v1/chat/completions
AI_MODEL=gpt-4o-mini

# Shared secret for scheduled ingest calls
CRON_SECRET=<long-random-string>
```

The `VITE_`-prefixed values are bundled into the client at build time. Every other value is server-only and must stay out of the browser.

---

## Database schema

Three tables, all RLS-enabled with public-read policies.

- **`states`** — `code`, `name`, `status` (`banned` / `partial` / `legal`), `drinking_age`, `consumption_index`, `dv_rate_per_100k`, `illegal_supply_risk`, `policy_notes`.
- **`incidents`** — `state_code` (FK), `type` (`hooch_tragedy` / `illegal_seizure` / `domestic_violence` / `alcohol_crime`), `occurred_on`, `district`, `casualties`, `source_url`, `title`, `description`.
- **`helplines`** — `name`, `phone`, `category`, `coverage`, `available_24_7`, `url`.

Realtime is enabled on `incidents` (`ALTER PUBLICATION supabase_realtime ADD TABLE public.incidents`), so the dashboard reacts within milliseconds of an insert.

Migrations live under `supabase/migrations/`.

---

## AI ingest pipeline

`POST /hooks/ingest-news` is the heart of the live data layer.

**Per invocation:**

1. Fetch the configured Indian-news RSS feeds.
2. Pre-filter headlines on alcohol / hooch / liquor / seizure keywords.
3. De-dupe against existing `incidents.source_url` rows.
4. Send a JSON-serialized batch to the configured OpenAI-compatible model with a strict tool schema demanding `{state_code, type, occurred_on, district, casualties, title, description, source_url}`.
5. Drop any row whose `state_code` is not a valid Indian state.
6. Insert via the service-role client; Postgres realtime fans out to every connected dashboard.

**Trigger manually:**

```bash
curl -X POST https://<your-deploy>.vercel.app/hooks/ingest-news \
  -H "Authorization: Bearer <service-role-key>"
```

**Trigger on a schedule** (Vercel Cron, GitHub Actions, Postgres `pg_cron`, or any other scheduler):

```bash
curl -X POST https://<your-deploy>.vercel.app/hooks/ingest-news \
  -H "x-ingest-context: cron" \
  -H "x-cron-secret: $CRON_SECRET"
```

---

## Project structure

```
src/
  components/
    IndiaChoropleth.tsx       # d3-geo + topojson, zoom / pan, realtime pulses
    StatusBadge.tsx
  hooks/
    use-data.ts               # useStates, useIncidents (realtime), useHelplines
  integrations/supabase/      # auto-generated client + types + auth middleware
  routes/
    __root.tsx                # head() / shell / 404
    index.tsx                 # dashboard (map + signal feed + DV panel)
    state.$code.tsx           # per-state report (KPIs, trends, timeline)
    hooks/ingest-news.ts      # POST hook: RSS + AI extraction
  styles.css                  # design tokens (oklch) + animations
  router.tsx
```

---

## Deployment (Vercel)

SoberMap is configured end-to-end for Vercel: the SSR app, the `/hooks/ingest-news` server route, and the Postgres client all work out of the box.

1. Push the repo to GitHub.
2. In the Vercel dashboard, import the repository.
3. Build command: `npm run build`.  Output directory: leave empty (Vercel uses `.vercel/output` automatically).
4. Add every variable from `.env.example` to the Vercel project settings (Production + Preview).
5. Deploy.
6. Optional — schedule the ingest hook. Easiest path is Vercel Cron in `vercel.json`:

   ```jsonc
   {
     "crons": [
       { "path": "/hooks/ingest-news", "schedule": "0 * * * *" }
     ]
   }
   ```

   Vercel Cron requests include `x-vercel-cron: 1` — add an equivalent header or use the `x-cron-secret` flow shown above.

Supabase (Postgres, Auth, Realtime, Storage) is a managed service and is not part of the Vercel deploy. You only point the deploy at it via the environment variables above.

---

## Data sources

- **NFHS-5** — National Family Health Survey, Government of India.
- **NCRB** — Crime in India statistical reports.
- **State excise department** public releases.
- **Curated public news archives** (The Hindu, Times of India, NDTV, Indian Express) for hooch tragedies and seizures.

Where reliable data is missing, we say so. Indicators are aggregate. Correlation is not causation.

---

## Ethics and limitations

SoberMap is **not**:

- a real-time crime feed,
- a personal-risk predictor,
- a claim that alcohol *causes* domestic violence,
- a substitute for professional or emergency help.

If you or someone you know needs help, the helplines directory lists free, confidential support numbers across India.

---

## Contributing

SoberMap is early-stage and opinionated, but contributions that improve data quality, extend state coverage, or harden the ingest pipeline are very welcome.

1. Fork the repository.
2. Create a topic branch (`git checkout -b fix/helpline-validation`).
3. Make your change with a short, descriptive commit message.
4. Open a pull request describing the intent and any data sources cited.

---

## License

MIT — see [LICENSE](LICENSE). Data inputs follow their respective source licenses (NFHS, NCRB, state excise departments, and news archives).

---

<div align="center">

**SoberMap** — because policy data should be public, current, and correlated.
Built with care by Mohammad Zeeshan.

</div>
