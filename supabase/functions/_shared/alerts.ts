// Daily research alerts: new papers (Europe PMC: PubMed + bioRxiv/medRxiv and other preprint
// servers) and open funding calls (Grants.gov, plus any RSS/Atom feeds the user adds).
// Plain TypeScript with fetch only, so the parsing is unit-tested from dashboard-app/test.

export interface PaperHit {
  source: "pubmed" | "preprint"; external_id: string; pmid: string | null; doi: string | null; title: string; authors: string[];
  journal: string | null; published_on: string | null; abstract: string | null; url: string; topics: string[]; score: number;
}
export interface FundingHit {
  source: "grants_gov" | "feed"; external_id: string; title: string; funder: string; kind: "grant" | "fellowship" | "travel" | "award" | "other";
  url: string | null; opens_on: string | null; closes_on: string | null; summary: string; topics: string[];
}

type Fetch = (url: string, init?: RequestInit) => Promise<Response>;
const UA = { "user-agent": "arun-workspace-alerts/1.0 (personal research dashboard)" };
const ENTITIES: Record<string, string> = { amp: "&", lt: "<", gt: ">", quot: '"', apos: "'", nbsp: " " };
/** Plain text: HTML entities decoded (titles arrive as "&lt;i&gt;via&lt;/i&gt;"), then tags dropped. */
const clean = (s: unknown) => String(s ?? "")
  .replace(/&(#x?[0-9a-f]+|[a-z]+);/gi, (m, e: string) => e[0] === "#" ? String.fromCodePoint(parseInt(e.slice(e[1] === "x" || e[1] === "X" ? 2 : 1), e[1] === "x" || e[1] === "X" ? 16 : 10)) : ENTITIES[e.toLowerCase()] ?? m)
  .replace(/<[^>]+>/g, "").replace(/\s+/g, " ").trim();

/**
 * Europe PMC query for one topic line, limited to journals and preprints first published in [from, to].
 * Matched in title and abstract only: full-text matching of open-access papers is too loose
 * ("STAT3 AND tumor microenvironment" found 53 papers in a week this way, 5 in title/abstract).
 * A topic that already names a field (TITLE:, AUTH:, MESH: …) is used as written.
 */
export function europePmcQuery(topic: string, from: string, to: string): string {
  const t = topic.trim();
  const scoped = /\b[A-Z_]{3,}:/.test(t) ? `(${t})` : `TITLE_ABS:(${t})`;
  return `${scoped} AND FIRST_PDATE:[${from} TO ${to}] AND (SRC:MED OR SRC:PPR)`;
}

// deno-lint-ignore no-explicit-any
export function parseEuropePmc(json: any, topic: string): PaperHit[] {
  const results = json?.resultList?.result ?? [];
  // deno-lint-ignore no-explicit-any
  return results.filter((r: any) => r?.title && r?.id).map((r: any) => {
    const preprint = r.source === "PPR";
    const pmid = r.pmid ? String(r.pmid) : null;
    const doi = r.doi ? String(r.doi) : null;
    const authors = Array.isArray(r.authorList?.author) && r.authorList.author.length
      // deno-lint-ignore no-explicit-any
      ? r.authorList.author.map((a: any) => clean(a.fullName ?? `${a.lastName ?? ""} ${a.initials ?? ""}`)).filter(Boolean).slice(0, 30)
      : clean(r.authorString).replace(/\.$/, "").split(/,\s*/).filter(Boolean).slice(0, 30);
    return {
      source: preprint ? "preprint" : "pubmed",
      external_id: String(r.id),
      pmid, doi,
      title: clean(r.title).replace(/\.$/, ""),
      authors,
      journal: clean(r.journalInfo?.journal?.title ?? r.journalTitle ?? r.bookOrReportDetails?.publisher) || null,
      published_on: /^\d{4}-\d{2}-\d{2}$/.test(r.firstPublicationDate ?? "") ? r.firstPublicationDate : null,
      abstract: r.abstractText ? clean(r.abstractText).slice(0, 4000) : null,
      url: doi ? `https://doi.org/${doi}` : pmid ? `https://pubmed.ncbi.nlm.nih.gov/${pmid}/` : `https://europepmc.org/article/${r.source}/${r.id}`,
      topics: [topic.trim()],
      score: 1,
    } satisfies PaperHit;
  });
}

/** Merge hits found by several topics: one row per paper, its topics listed, score = topics matched (+0.5 if a topic word is in the title). */
export function mergePaperHits(lists: PaperHit[][]): PaperHit[] {
  const byId = new Map<string, PaperHit>();
  for (const hit of lists.flat()) {
    const key = hit.doi?.toLowerCase() ?? hit.external_id;
    const prev = byId.get(key);
    if (prev) { for (const t of hit.topics) if (!prev.topics.includes(t)) prev.topics.push(t); }
    else byId.set(key, { ...hit, topics: [...hit.topics] });
  }
  for (const h of byId.values()) {
    const title = h.title.toLowerCase();
    const inTitle = h.topics.some((t) => t.toLowerCase().split(/\W+/).filter((w) => w.length > 3 && !/^(and|not)$/.test(w)).some((w) => title.includes(w)));
    h.score = h.topics.length + (inTitle ? 0.5 : 0);
  }
  return [...byId.values()].sort((a, b) => b.score - a.score || (b.published_on ?? "").localeCompare(a.published_on ?? ""));
}

export async function fetchPapers(topics: string[], from: string, to: string, fetchImpl: Fetch = fetch, perTopic = 25): Promise<PaperHit[]> {
  const lists: PaperHit[][] = [];
  for (const topic of topics.map((t) => t.trim()).filter(Boolean).slice(0, 10)) {
    const q = encodeURIComponent(europePmcQuery(topic, from, to));
    const res = await fetchImpl(`https://www.ebi.ac.uk/europepmc/webservices/rest/search?query=${q}&format=json&resultType=core&pageSize=${perTopic}&sort=P_PDATE_D%20desc`, { headers: UA });
    if (!res.ok) throw new Error(`Europe PMC answered ${res.status} for “${topic}”`);
    lists.push(parseEuropePmc(await res.json(), topic));
  }
  return mergePaperHits(lists);
}

// ── Funding ──────────────────────────────────────────────────────────────

/** "11/05/2029" → "2029-11-05" */
/** "2027-01-15", "15 January 2027" or "January 15, 2027" → "2027-01-15"; null if not a date. */
export function toIsoDay(s: string): string | null {
  if (/^\d{4}-\d{2}-\d{2}$/.test(s)) return s;
  const t = Date.parse(`${s.replace(",", "")} 12:00 UTC`);
  return isNaN(t) ? null : new Date(t).toISOString().slice(0, 10);
}
const usDate = (s: unknown) => { const m = String(s ?? "").match(/^(\d{2})\/(\d{2})\/(\d{4})$/); return m ? `${m[3]}-${m[1]}-${m[2]}` : null; };

export function kindOf(title: string): FundingHit["kind"] {
  const t = title.toLowerCase();
  if (/travel (award|grant|fellowship|bursar)|travel support|conference grant/.test(t)) return "travel";
  if (/fellowship|postdoc|early[- ]career|scholar/.test(t)) return "fellowship";
  if (/\b(award|prize)\b/.test(t)) return "award";
  if (/grant|funding|program|call|research project/.test(t) || /\b[RUKP]\d{2}\b/.test(title)) return "grant";
  return "other";
}

// deno-lint-ignore no-explicit-any
export function parseGrantsGov(json: any, topic: string): FundingHit[] {
  // deno-lint-ignore no-explicit-any
  return (json?.data?.oppHits ?? []).filter((o: any) => o?.id && o?.title).map((o: any) => ({
    source: "grants_gov", external_id: String(o.id), title: clean(o.title), funder: clean(o.agency ?? o.agencyCode),
    // Everything on Grants.gov is a funding opportunity: a grant unless the title says otherwise.
    kind: kindOf(String(o.title)) === "other" ? "grant" : kindOf(String(o.title)), url: `https://www.grants.gov/search-results-detail/${o.id}`,
    opens_on: usDate(o.openDate), closes_on: usDate(o.closeDate), summary: clean([o.number, o.oppStatus].filter(Boolean).join(" · ")), topics: [topic.trim()],
  }) satisfies FundingHit);
}

/** Items of an RSS 2.0 or Atom feed that mention at least one topic word (all words, any topic). */
export function parseFeed(xml: string, feedUrl: string, topics: string[]): FundingHit[] {
  const pick = (block: string, tag: string) => {
    const m = block.match(new RegExp(`<${tag}(?:\\s[^>]*)?>([\\s\\S]*?)</${tag}>`, "i"));
    return m ? clean(m[1].replace(/<!\[CDATA\[([\s\S]*?)\]\]>/g, "$1")) : "";
  };
  const host = (() => { try { return new URL(feedUrl).hostname.replace(/^www\./, ""); } catch { return "feed"; } })();
  const channel = pick(xml.replace(/<(item|entry)[\s>][\s\S]*$/i, ""), "title") || host;
  const blocks = xml.match(/<(item|entry)[\s>][\s\S]*?<\/(item|entry)>/gi) ?? [];
  const wanted = topics.map((t) => t.toLowerCase().split(/\W+/).filter((w) => w.length > 2 && !/^(and|not|the|for)$/.test(w))).filter((ws) => ws.length);
  return blocks.flatMap((b) => {
    const title = pick(b, "title");
    if (!title) return [];
    const link = pick(b, "link") || (b.match(/<link[^>]*href="([^"]+)"/i)?.[1] ?? "");
    const summary = (pick(b, "description") || pick(b, "summary") || pick(b, "content")).slice(0, 600);
    const text = `${title} ${summary}`.toLowerCase();
    const matched = topics.filter((_, i) => wanted[i]?.every((w) => text.includes(w)));
    if (wanted.length && !matched.length) return [];
    const date = pick(b, "pubDate") || pick(b, "updated") || pick(b, "published");
    const opened = date && !isNaN(Date.parse(date)) ? new Date(date).toISOString().slice(0, 10) : null;
    // A closing date written in the text ("Deadline: 15 January 2027", "closes 2027-01-15").
    const dl = `${title} ${summary}`.match(/(?:deadline|closes?|closing date|apply by|due)[:\s]+(?:on\s+)?(\d{4}-\d{2}-\d{2}|\d{1,2}\s+[A-Za-z]{3,9}\s+\d{4}|[A-Za-z]{3,9}\s+\d{1,2},?\s+\d{4})/i);
    const closes = dl ? toIsoDay(dl[1]) : null;
    return [{
      source: "feed", external_id: (pick(b, "guid") || pick(b, "id") || link || title).slice(0, 300), title, funder: channel,
      kind: kindOf(title), url: link || null, opens_on: opened, closes_on: closes, summary, topics: matched,
    } satisfies FundingHit];
  });
}

export async function fetchFunding(topics: string[], feeds: string[], today: string, fetchImpl: Fetch = fetch): Promise<{ hits: FundingHit[]; errors: string[] }> {
  const hits: FundingHit[] = [], errors: string[] = [];
  for (const topic of topics.map((t) => t.trim()).filter(Boolean).slice(0, 8)) {
    try {
      const res = await fetchImpl("https://api.grants.gov/v1/api/search2", {
        method: "POST", headers: { ...UA, "content-type": "application/json" },
        body: JSON.stringify({ keyword: topic, oppStatuses: "forecasted|posted", rows: 25 }),
      });
      if (!res.ok) throw new Error(`Grants.gov answered ${res.status}`);
      hits.push(...parseGrantsGov(await res.json(), topic));
    } catch (e) { errors.push(`Grants.gov “${topic}”: ${(e as Error).message}`); }
  }
  for (const url of feeds.map((f) => f.trim()).filter((f) => /^https?:\/\//.test(f)).slice(0, 15)) {
    try {
      const res = await fetchImpl(url, { headers: UA });
      if (!res.ok) throw new Error(`answered ${res.status}`);
      hits.push(...parseFeed(await res.text(), url, topics));
    } catch (e) { errors.push(`${url}: ${(e as Error).message}`); }
  }
  // One row per call; skip ones that have already closed.
  const byId = new Map<string, FundingHit>();
  for (const h of hits) {
    if (h.closes_on && h.closes_on < today) continue;
    const key = `${h.source}:${h.external_id}`;
    const prev = byId.get(key);
    if (prev) { for (const t of h.topics) if (!prev.topics.includes(t)) prev.topics.push(t); } else byId.set(key, { ...h, topics: [...h.topics] });
  }
  return { hits: [...byId.values()], errors };
}

// ── Running for one user (shared by the sweep and the "Check now" button) ─────

// deno-lint-ignore no-explicit-any
type Db = any;
const isoDay = (d: Date) => d.toISOString().slice(0, 10);

/** Fetch and store new papers and funding calls for one user. Never overwrites what the user did (saved / dismissed / status). */
export async function runAlertsFor(db: Db, userId: string, settings: { paper_alert_topics?: string[] | null; funding_topics?: string[] | null; funding_feeds?: string[] | null; paper_alerts_checked_on?: string | null }, now = new Date(), fetchImpl: Fetch = fetch) {
  const today = isoDay(now);
  const report = { papers: 0, funding: 0, errors: [] as string[] };
  const topics = (settings.paper_alert_topics ?? []).filter((t) => t.trim());
  if (topics.length) {
    // From the day after the last check (at most 14 days back; 7 on the first run).
    const last = settings.paper_alerts_checked_on;
    const from = last ? isoDay(new Date(Math.max(Date.parse(`${last}T00:00:00Z`) - 86_400_000, now.getTime() - 14 * 86_400_000))) : isoDay(new Date(now.getTime() - 7 * 86_400_000));
    try {
      const hits = await fetchPapers(topics, from, today, fetchImpl);
      if (hits.length) {
        const rows = hits.slice(0, 100).map((h) => ({ ...h, user_id: userId }));
        const { data, error } = await db.from("ws_paper_alerts").upsert(rows, { onConflict: "user_id,external_id", ignoreDuplicates: true }).select("id");
        if (error) throw new Error(error.message);
        report.papers = data?.length ?? 0;
      }
    } catch (e) { report.errors.push((e as Error).message); }
  }
  const fTopics = (settings.funding_topics ?? []).filter((t) => t.trim());
  const feeds = (settings.funding_feeds ?? []).filter((t) => t.trim());
  if (fTopics.length || feeds.length) {
    const { hits, errors } = await fetchFunding(fTopics, feeds, today, fetchImpl);
    report.errors.push(...errors);
    if (hits.length) {
      const rows = hits.slice(0, 150).map((h) => ({ ...h, user_id: userId }));
      const { data, error } = await db.from("ws_funding_calls").upsert(rows, { onConflict: "user_id,source,external_id", ignoreDuplicates: true }).select("id");
      if (error) report.errors.push(error.message); else report.funding = data?.length ?? 0;
    }
  }
  await db.from("ws_settings").update({ paper_alerts_checked_on: today, funding_checked_on: today }).eq("user_id", userId);
  return report;
}
