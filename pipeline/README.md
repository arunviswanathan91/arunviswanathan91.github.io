# Discovery pipeline

Finds postdoc and research-scientist roles overnight, scores them against a search profile, removes
duplicates across sources, and writes ranked results into the same Supabase database the dashboard
(`../dashboard-app/`) reads from. Uses bounded requests and free-provider options — actual free-tier
eligibility depends on the configured accounts and current quotas; see [Cost](#cost) below.

It shares nothing with the dashboard at runtime except the database; this is a standalone Node
package with its own build, its own tests, and two thin entrypoints (`cli.ts` for GitHub Actions,
`server.ts` for an optional Cloud Run deployment) wrapping one orchestration function in `run.ts`.

## How it works

```
sources (feeds, Adzuna, Jooble, EURAXESS, JSON-LD crawl — optionally Firecrawl-rendered)
  → raw items written to the DB first (a crash never loses fetched data)
  → source fields + deterministic + batched OpenRouter metadata repair (country/city/organisation)
  → factual safety filters (expired/junk/blocked and explicit profile exclusions)
  → focused-query classification (matching or ranked-low; never deletion)
  → deduplicated against everything already known (URL, ATS id, org+title+location, description fingerprint)
  → scored 0–100 across six explainable components (topic, role fit, location, salary, recency, your own past triage)
  → written to `opportunities`, read by the dashboard
```

Broad discovery uses stable role-wide terms (`postdoc`, `postdoctoral researcher`, `research fellow`)
and is independent of the research-interest profile. Focused search uses the typed query to allocate
API requests and rank the returned set, but a query mismatch is retained as `ranked_low` in the
per-run ledger and can still enter the discovery index. It is never treated as a deletion rule.

Nightly runs skip unchanged listings because the raw-item table's unique constraint makes an
unchanged insert a no-op. Interactive Telegram and workspace searches deliberately work differently:
they use a fresh source window, preserve the nightly cursor, and rescore returned listings so a new
query can show a good opportunity that was fetched before. The concept-matching in
`src/score/ontology.ts` (hand-curated from the dashboard site's own research tags) handles the first
ranking pass. When an AI provider is configured, a bounded second phase gathers institution and place
evidence and adds structured decision context to the highest-ranked undecided listings.

## Local setup

```bash
cd pipeline
npm install
cp .env.example .env   # fill in the values below
npm run build
npm run check           # offline checks — no network, no database
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
| `GEMINI_API_KEY` | no | final automatic fallback for evidence-grounded decision briefs |
| `GEMINI_MODEL` | no | model override; defaults to `gemini-3.8-flash` |
| `GROQ_API_KEY` | no | automatic structured-output fallback when OpenRouter is unavailable or busy |
| `GROQ_MODEL` | no | Groq model override; defaults to `openai/gpt-oss-20b` |
| `OPENROUTER_API_KEY` | no | primary context provider; Groq and Gemini are automatic fallbacks |
| `OPENROUTER_MODEL` | no | defaults to `stealth/union-alpha`; all OpenRouter requests enforce zero prompt/completion/request prices |

Search geography comes only from `discovery_profiles.countries` (edited by the dashboard's
**Search destinations** control) plus the separate remote toggle. Nationality, current residence,
home city and the independently selected display currency never add or boost a search country.

Salary conversion uses the daily, key-free
[`fawazahmed0/exchange-api`](https://github.com/fawazahmed0/exchange-api) INR-base table. The worker
tries jsDelivr first and the project's documented Cloudflare Pages mirror second. Advertised pay
always remains primary; the dashboard and Telegram digest label the user-selected display-currency value as an
approximation and show the rate date. If both endpoints fail, foreign salaries are not guessed or
rejected against the INR floor, and the original destination-currency amount remains available.

For GitHub Actions, add `OPENROUTER_API_KEY` under repository Settings → Secrets and variables →
Actions → New repository secret. Never use a `VITE_` key or put it in the frontend. The workflow
pins `OPENROUTER_MODEL=stealth/union-alpha`. For an existing Cloud Run deployment, configure the
same key through Secret Manager and redeploy the updated pipeline separately; GitHub secrets
do not automatically propagate to Cloud Run.

Union Alpha supports JSON output, not strict JSON-schema enforcement. The pipeline validates the
structured decision brief locally before saving, rejects malformed/empty responses, and records
the provider and actual model alongside context. OpenRouter routes to an anonymous provider
which may retain prompts and responses (not for training per its current model page). This
integration sends listing text, collected public evidence, and the explicitly saved assessment
preferences (research interests, nationality/residence country, household/housing and career goal).
It does not send account email, credentials, private tasks or private documents.
No paid web-search plugins are enabled. Visa/tax context comes from fetched official pages; climate
is typical seasonal context, not a live weather forecast.
See https://openrouter.ai/stealth/union-alpha for current preview terms and availability.

Decision enrichment is stored under `opportunities.score_breakdown.context`; metadata provenance is
stored under `score_breakdown.metadata`. The independent run modes and audit ledger require the
additive `supabase/opportunity-search-v2.sql` migration. Source URLs
are stored with the summary so the dashboard can show the evidence used for each card.

To repair country/organisation metadata and enrich opportunities created before these stages existed, run the
**Nightly opportunity discovery** workflow manually with **mode = backfill** and a batch size such
as 5 for the first verification. Backfill skips every crawler, uses a separate evidence/AI request
budget, tries OpenRouter → Groq → Gemini (configured providers only), and reuses each card's evidence
across fallbacks. It skips quota/auth/unavailable providers for the rest of that run. If all providers
are unavailable, it stops the batch and preserves remaining cards as pending for a later rerun.
The backfill first repairs missing metadata in batches, then produces decision briefs. This is fallback/queueing, not automatic rate-limit waiting. It rejects all-placeholder results and prints
attempted, enriched, failed, and pending totals. Repeat it until pending reaches zero. Enable
`refreshExisting` only when a current assessment should be forced to regenerate. Legacy seven-field
summaries, assessments over 30 days old, and briefs generated for different preferences are eligible
automatically. Backfill considers New and Shortlisted opportunities; it never changes their status.

### Research & relocation decision briefs

In **Opportunities → Research & relocation preferences**, select research subjects (or enter your
own), subjects to avoid, nationality, current residence, household size, housing and career direction.
These values live in the existing `discovery_profiles.ontology_overrides.assessment_preferences`
JSON. The worker uses the oldest active profile consistently with the dashboard. Other profile
settings, source configuration and collaborator permissions are preserved. No SQL migration is needed.

The second AI pass produces a versioned `score_breakdown.context.brief`:

- Semantic research fit (direct / transferable / weak / unknown), strengths and gaps. It distinguishes
  subject fit from a generic postdoc title and from the original deterministic search score. Broad
  `postdoc` searches use the selected subject terms. Explicit topical searches still take precedence.
- Actual duties, techniques and qualifications; guaranteed contract percentage, funding dates,
  teaching and temporary-uplift risks; institution/research environment and career value.
- City context, typical climate, transport, housing, inclusion/support and relocation checks.
- Nationality/residence-aware visa guidance and tax/social-contribution context. These legal sections
  require fetched official destination evidence; unsupported claims are replaced with verification
  steps. No promise of visa eligibility, processing speed, tax exemption or a specific net salary.
- Monthly gross pay, estimated payroll deductions, rent and essentials plus separate one-off costs.
  Listed pay, pay-scale assumptions and model estimates are distinct. Guaranteed FTE is applied once;
  a conflicting explicit part-time percentage invalidates the model's salary calculation. When a
  verified daily rate is available, the UI also shows approximate values in the user's selected
  display currency without replacing the destination-currency budget. INR is the default and any
  browser-supported ISO currency can be selected independently of residence.
- Questions for the PI/HR and tailored next steps. Facts, model background and estimates are labelled,
  with per-section citations and source read dates. References that could not be fetched are shown
  as links to check, not as evidence read by the model.

Evidence retrieval fetches a fuller vacancy page (with a stored-excerpt fallback), official country
visa/tax/pay entry points, the institution website and full Wikipedia institution/city extracts. City
extracts reserve space for climate and transport instead of discarding everything after the lead.
Public evidence is cached **within each run**, including failed fetches; personal assessments are
not shared between users. Model background is explicitly unverified. Unsupported current numbers,
specific lab reputations and population-wide safety/racism judgments are not requested.

The read-only swipe card and the opportunity details both show the brief. An AI-fit filter works in
table, board and swipe views, with a separate unassessed option. It never dismisses a listing. The
budget calculator uses conservative bounds, preserves unknowns, allows negative savings, and keeps
upfront costs out of monthly savings. Edits are local to the open card, not a promise of payroll or a
saved household budget. A 12-month comparison is explicitly hypothetical for shorter contracts.

**Rollout:** apply `supabase/opportunity-search-v2.sql`, deploy the updated `opportunity-discover`
function, then merge/publish the dashboard and worker.
Save preferences, then run **Nightly opportunity discovery → Run workflow → backfill**, starting with
`batchSize=5`, `maxLlmCalls=10`, `refreshExisting=false`. Repeat pending batches; failed calls stay
pending rather than overwriting an existing brief. Model attempts across provider fallbacks share
the smaller of the run and profile call caps. Source retrieval and responses remain runtime-bounded;
quotas can still stop a free-tier batch early. OpenRouter's zero price ceiling remains enforced.

If interactive searches use Cloud Run, redeploy the service from **pipeline/** using the existing
service/project/region and existing Secret Manager bindings. A GitHub merge does not redeploy that
service. The Docker image uses the same worker code and existing API variable names. Backfill through
GitHub Actions can upgrade existing cards before the Cloud Run revision is replaced.

### One-time setup: register sources and the search profile

```bash
npm run build
node dist/src/seed.js
```

This upserts the source catalog (`src/sources/catalog/`) into `discovery_sources`, and creates a
default `discovery_profiles` row seeded from the dashboard site's own research tags and publications
(`https://arunviswanathan91.github.io/` — no CV PDF is parsed). Safe to re-run any time; it refreshes
the site snapshot without touching anything you've since edited by hand. Normal discovery runs also
insert any newly shipped catalog rows that are missing, while preserving existing enabled/disabled
choices, configuration, and cursors. This keeps an older Supabase seed from silently losing sources.

**Adjust the profile for your own preferences** — location weighting, salary floor, blocked
organisations, etc. — either by editing the `discovery_profiles` row directly in the Supabase table
editor. Research and relocation preferences now have a dashboard editor as described above.

### Running it

```bash
node dist/src/cli.js run --dry-run                 # parse + score, write nothing
node dist/src/cli.js run --mode discovery
node dist/src/cli.js run --mode search --query "extra search terms" --chat-id 123456789
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
of whether the rendered DOM actually carries `JobPosting` markup. jobRxiv has both a feed and a direct
postdoc-category crawl: the crawl keeps coverage available when the feed is temporarily unavailable.
See the comments in `feeds.ts` and
`sites.ts` for the full list of what was checked. Add real sources as you find them; check the target
actually exists and returns what you expect before trusting it.

Direct crawling of LinkedIn, Indeed, or Naukri is deliberately not implemented: all three were
checked and share the same profile — no public API, active anti-bot measures, and terms of service
that prohibit automated access. Jooble and Adzuna already aggregate from many of the same boards
through a legal API, so this isn't a coverage loss, just a legal route to overlapping data.

## Search profile

Postdoc search is international. Every explicitly selected destination receives the same location
weight; `*` means worldwide. Citizenship and current residence are used only in later visa, tax and
relocation analysis. They never add India—or any other country—to source queries or ranking.

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
GEMINI_API_KEY      # optional; enables swipe-card context enrichment
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

The dashboard and `/discover` can then use the Actions runtime, including the AI provider secrets
already configured for the nightly workflow. An Actions run may take 45–90 seconds to start from
cold, but this avoids maintaining a second copy of those secrets in Cloud Run. The dashboard falls
back to Cloud Run when GitHub dispatch is not configured.

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

`npm run check` runs 164 checks under plain Node — no network, no database — covering URL
canonicalization, ATS identity extraction, JSON-LD parsing, salary extraction, the dedup cascade, and
scoring. The simhash duplicate threshold (`SIMHASH_DUPLICATE_THRESHOLD` in `src/dedupe/cascade.ts`)
was calibrated empirically against realistic description lengths rather than taken from simhash
literature aimed at much larger corpora — the comment there explains the actual measured numbers.
