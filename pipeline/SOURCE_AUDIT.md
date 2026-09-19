# Source validation before AI

This change repairs specific adapter failures. It does not establish live AI
availability or complete the separation of postdoc and industry-job workspaces.

## Data path

Adapters emit `RawItem` records (source ID, URL, original payload, optional JSON-LD,
fetch time). Their normalizers convert these to `NormalizedOpportunity`, the
shared vacancy shape used for filtering, scoring and persistence. Source payloads
remain in `discovery_raw_items`; adapter-emitted pages are saved as they arrive.
Records that fail normalization are also retained with `processed: false`.
Pages/items discarded inside an adapter before it emits a RawItem are not covered
by this retention guarantee. This is not a durable retry queue.

Before metadata AI, deterministic checks hold contradictory labelled workplace
locations and clearly unrelated product/account/sales manager titles. These are
recorded as `ranked_low` in run-item audit records with the issue and evidence;
they are not forwarded as new recommendations. Existing hard filters also run
before AI, with country filtering deferred until metadata repair. Identical
source ID/content pairs are processed only once within a source run.

Metadata AI receives at most five vacancies per request: title, employer,
employer URL, source location, listing URL and an 800-character excerpt per item.
It does not receive the whole crawl. This limit does not change the separate
detailed-context enrichment request format. Validation runs again after metadata
repair, then existing filters, scoring, deduplication and context enrichment run.

## Adapter corrections

| Source or layer | Failure | Correction |
| --- | --- | --- |
| Adzuna | A short page for one country/query stopped other countries | Track exhaustion for each country/query pair |
| Jooble | Salary field ignored | Parse the supplied salary field |
| ResearchersJob / jobRxiv feeds | Publisher used as hiring employer | Leave employer unknown for metadata repair |
| Location parser | Dallas, TX interpreted as country TX | Recognize state suffix before generic two-letter code |
| Location parser | Munich/Cologne aliases implied India | Remove German aliases from Indian location hints |
| Role parser | Incidental description mentions overrode title | Title classification takes precedence |

## Verification and rollout limits

Offline checks cover the shown failure shapes, Adzuna pagination across countries,
and metadata batching with model indices restarting in each batch. They do not
call providers or prove production credentials, quotas or model compatibility.

No database migration is required. Deploy the pipeline worker to enable these
changes. Existing saved opportunities are not deleted, rewritten or reassessed
by this patch. A fresh source search can evaluate unchanged source listings, but
repairing existing cards still needs a deliberate backfill/reconciliation.

Remaining work includes exhaustive country-code validation and ambiguous province
codes, per-field provenance, adapter-specific captured-response fixtures, replay
of unprocessed raw records, explicit UI review queues, semantic topic relevance,
separate postdoc/job views and live provider verification. Institution domain
suffixes and model inference alone are not reliable proof of workplace location.
