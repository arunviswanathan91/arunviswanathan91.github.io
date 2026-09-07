# Discovery pipeline

Finds postdoc and research-scientist roles overnight, scores them against a search profile, removes
duplicates across sources, and writes ranked results into the same Supabase database the dashboard
(`../dashboard-app/`) reads from. Runs entirely within free tiers — see [Cost](#cost) below.

It shares nothing with the dashboard at runtime except the database; this is a standalone Node
package with its own build, its own tests, and two thin entrypoints (`cli.ts` for GitHub Actions,
`server.ts` for an optional Cloud Run deployment) wrapping one orchestration function in `run.ts`.

## How it works

```
sources (feeds, Adzuna, Jooble, EURAXESS, JSON-LD crawl — optionally Firecrawl-rendered)
  → raw items written to the DB first (a crash never loses fetched data)
  → deduplicated against everything already known (URL, ATS id, org+title+location, description fingerprint)
  → hard-filtered (deadline, type, location, salary floor — facts, never judgment calls)
  → scored 0–100 across six explainable components (topic, role fit, location, salary, recency, your own past triage)
  → written to `opportunities`, read by the dashboard
```

Re-seeing an unchanged listing costs nothing — no parsing, no scoring — because the raw-item table's
unique constraint makes an unchanged insert a no-op. Nothing here calls an LLM in this phase; the
concept-matching in `src/score/ontology.ts` (hand-curated from the dashboard site's own research tags)
does the semantic work that would otherwise need one.

## Local setup

```bash
cd pipeline
npm install
cp .env.example .env   # fill in the values below
npm run build
npm run check           # 132 offline logic checks — no network, no database
```

### Environment variables

| Variable | Required | Purpose |
|---|---|---|
| `SUPABASE_URL` | yes | same project as the dashboard |
| `SUPABASE_SERVICE_ROLE_KEY` | yes | bypasses RLS — never expose this client-side, never commit it |
| `DISCOVERY_USER_ID` | no | your user id; auto-detected from `discovery_profiles`/`profiles` if omitted |
| `ADZUNA_APP_ID`, `ADZUNA_APP_KEY` | for the Adzuna source | free at [developer.adzuna.com](https://developer.adzuna.com), ~1000 calls/month |
| `JOOBLE_API_KEY` | for the Jooble source | free key at [jooble.org/api/about](https://jooble.org/api/about) |
| `TELEGRAM_BOT_TOKEN` | to push a digest | same bot token the dashboard's webhook uses |
| `FIRECRAWL_API_KEY` | no — crawl targets work without it | Tier-3 fallback for JS-rendered career pages; free at [firecrawl.dev](https://www.firecrawl.dev), capped locally by `FIRECRAWL_MAX_PER_RUN` |
| `GROQ_API_KEY`, `GEMINI_API_KEY` | not used yet | reserved for Phase 3 (LLM fallback extraction) |

### One-time setup: register sources and the search profile

```bash
npm run build
node dist/src/seed.js
```

This upserts the source catalog (`src/sources/catalog/`) into `discovery_sources`, and creates a
default `discovery_profiles` row seeded from the dashboard site's own research tags and publications
(`https://arunviswanathan91.github.io/` — no CV PDF is parsed). Safe to re-run any time; it refreshes
the site snapshot without touching anything you've since edited by hand.

**Adjust the profile for your own preferences** — location weighting, salary floor, blocked
organisations, etc. — either by editing the `discovery_profiles` row directly in the Supabase table
editor, or by extending `seed.ts`. There is deliberately no settings UI for this; it changes rarely.

### Running it

```bash
node dist/src/cli.js run --dry-run                 # parse + score, write nothing
node dist/src/cli.js run --query "extra search terms" --chat-id 123456789
node dist/src/cli.js --help
```

## Sources

Every source implements one `SourceAdapter` interface (`src/sources/types.ts`), so adding one is a
row in `discovery_sources`, not code — except for genuinely new *kinds* of source (a new API, a new
feed format), which need an adapter file plus one line in `src/sources/registry.ts`.

**Every seed URL was checked against the live site before being included, not guessed** — and several
guesses failed: EURAXESS's jobs section has no RSS feed at all (it gets a dedicated adapter instead,
`src/sources/euraxess.ts`, since its own EU researcher career-stage framework R1–R4 classifies a
posting more reliably than title text), Nature Careers' feed and DKFZ's careers page both 404,
FindAPostDoc returns 403 to automated access, and academicpositions.com/postdocscanner.com both
declare `robots.txt: Disallow: /` and are excluded on that basis regardless of what's technically
fetchable. EMBL's careers page is a JavaScript-rendered Workday board a plain `fetch` can't read —
`crawl.ts` now falls back to a Firecrawl-rendered fetch for exactly that shape when `FIRECRAWL_API_KEY`
is set (see `src/sources/firecrawl.ts`), though re-adding EMBL to `sites.ts` still needs a live check
of whether the rendered DOM actually carries `JobPosting` markup. See the comments in `feeds.ts` and
`sites.ts` for the full list of what was checked. Add real sources as you find them; check the target
actually exists and returns what you expect before trusting it.

Direct crawling of LinkedIn, Indeed, or Naukri is deliberately not implemented: all three were
checked and share the same profile — no public API, active anti-bot measures, and terms of service
that prohibit automated access. Jooble and Adzuna already aggregate from many of the same boards
through a legal API, so this isn't a coverage loss, just a legal route to overlapping data.

## Search profile

Postdoc search is international — Europe and Scandinavia specifically score highest in
`src/score/score.ts`'s location component, ahead of India — because a genuine postdoc is often
advertised under a plain "job"/"scientist" title rather than the word "postdoc", so the location
signal (not the unreliable type classification) is what actually finds them. Industry roles score
well anywhere in India (no visa friction) or remote, matching the original ask for Bangalore/Kerala
coverage on that side.

## Deployment

**Nightly (required):** `.github/workflows/discover.yml` runs on a cron schedule via GitHub Actions,
free and unlimited on this public repo. Add these as **repository secrets** (Settings → Secrets and
variables → Actions → Secrets) — note `SUPABASE_SERVICE_ROLE_KEY` needs a **secret**, not a
**variable**, since it bypasses Row Level Security and grants full database access:

```
SUPABASE_SERVICE_ROLE_KEY
ADZUNA_APP_ID, ADZUNA_APP_KEY
JOOBLE_API_KEY
TELEGRAM_BOT_TOKEN
FIRECRAWL_API_KEY   # optional
```

And as a repository **variable**: `DISCOVERY_USER_ID` (your user id — the same one the dashboard's
Supabase auth uses).

**Telegram `/discover` (optional but recommended):** works without any Cloud Run deployment via
`repository_dispatch` — add a fine-grained GitHub PAT scoped to **only this repo** with `Contents:
write`, then set as Supabase Edge Function secrets (`supabase secrets set ...`, alongside the
existing Telegram secrets):

```
GITHUB_DISPATCH_TOKEN=<the PAT>
GITHUB_REPOSITORY_SLUG=<your-username>/<this-repo-name>
```

`/discover` will then reply in 45–90 seconds (an Actions run has to start from cold) rather than
instantly, which is a fine trade for not running a second piece of infrastructure.

**Cloud Run (optional, Phase 3):** for a sub-5-second `/discover` reply, build and deploy
`Dockerfile` to Cloud Run, then set `DISCOVERY_URL` and `DISCOVERY_SHARED_SECRET` as Edge Function
secrets — the webhook prefers this path over `repository_dispatch` when it's configured. Note
Cloud Run's default CPU allocation gives the container no CPU after a response is sent, so
`server.ts` deliberately runs the entire discovery pass inside the request rather than replying
early — budget the Cloud Run timeout accordingly (`INTERACTIVE_CAPS.maxRuntimeMs` in `config.ts`).

## Cost

Designed to stay at **$0/month**, checked against each provider's actual published free tier rather
than assumed:

| Component | Free tier | Self-imposed cap |
|---|---|---|
| GitHub Actions | unlimited on public repos | ~20 min/night |
| Adzuna | ~1000 calls/month | 900/month |
| Jooble | no published cap | 200/day |
| Firecrawl (if used) | free plan allowance | `FIRECRAWL_MAX_PER_RUN` in `config.ts` (20/run) |
| Supabase | 500 MB DB, pauses after 7 days idle | nightly writes keep it awake; `discovery_prune()` caps storage |
| Cloud Run (if used) | 180,000 vCPU-s/month | ~1 request/day at a few seconds each |

A scheduled GitHub Actions workflow is disabled after 60 days of *repository* inactivity — the
workflow's own heartbeat-commit step resets that clock automatically, and `workflow_dispatch` always
works regardless.

## Testing

`npm run check` runs 132 checks under plain Node — no network, no database — covering URL
canonicalization, ATS identity extraction, JSON-LD parsing, salary extraction, the dedup cascade, and
scoring. The simhash duplicate threshold (`SIMHASH_DUPLICATE_THRESHOLD` in `src/dedupe/cascade.ts`)
was calibrated empirically against realistic description lengths rather than taken from simhash
literature aimed at much larger corpora — the comment there explains the actual measured numbers.
