import { test } from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { europePmcQuery, fetchFunding, fetchPapers, kindOf, mergePaperHits, parseEuropePmc, parseFeed, parseGrantsGov, runAlertsFor, toIsoDay } from "../../supabase/functions/_shared/alerts.ts";

const fixture = (n: string) => JSON.parse(readFileSync(new URL(`./fixtures/${n}`, import.meta.url), "utf8"));

test("Europe PMC: one query per topic, journals and preprints, date-limited", () => {
  assert.equal(europePmcQuery(" STAT3 AND pancreatic cancer ", "2026-11-01", "2026-11-05"), "TITLE_ABS:(STAT3 AND pancreatic cancer) AND FIRST_PDATE:[2026-11-01 TO 2026-11-05] AND (SRC:MED OR SRC:PPR)");
  assert.match(europePmcQuery('AUTH:"Harikumar KB"', "2026-11-01", "2026-11-05"), /^\(AUTH:"Harikumar KB"\) AND/); // a field the user chose is kept
});

test("Europe PMC results (real response) become paper alerts", () => {
  const hits = parseEuropePmc(fixture("europepmc.json"), "STAT3 AND pancreatic cancer");
  assert.equal(hits.length, 4);
  const pre = hits.find((h) => h.source === "preprint")!;
  assert.ok(pre.external_id.startsWith("PPR"));
  assert.equal(pre.pmid, null);
  assert.ok(pre.journal, "a preprint names its server");
  const med = hits.find((h) => h.source === "pubmed")!;
  assert.match(med.pmid!, /^\d+$/);
  assert.match(med.url, /^https:\/\/(doi\.org|pubmed\.ncbi\.nlm\.nih\.gov)\//);
  assert.ok(med.authors.length > 0 && !med.authors[0].endsWith("."));
  for (const h of hits) { assert.match(h.published_on ?? "", /^\d{4}-\d{2}-\d{2}$/); assert.doesNotMatch(h.title, /<|\.$/); }
});

test("a paper found by several topics is one alert, ranked higher", () => {
  const base = { source: "pubmed" as const, pmid: "1", doi: "10.1/x", authors: [], journal: null, published_on: "2026-11-01", abstract: null, url: "", score: 1 };
  const merged = mergePaperHits([
    [{ ...base, external_id: "1", title: "Obesity reshapes STAT3 signalling in PDAC", topics: ["STAT3"] }, { ...base, external_id: "2", doi: "10.1/y", title: "Unrelated title", topics: ["STAT3"] }],
    [{ ...base, external_id: "1", title: "Obesity reshapes STAT3 signalling in PDAC", topics: ["obesity AND pancreatic cancer"] }],
  ]);
  assert.equal(merged.length, 2);
  assert.deepEqual(merged[0].topics, ["STAT3", "obesity AND pancreatic cancer"]);
  assert.equal(merged[0].score, 2.5); // two topics + a topic word in the title
});

test("Grants.gov results (real response): ids, links and US dates", () => {
  const hits = parseGrantsGov(fixture("grantsgov.json"), "tumor immunology");
  assert.equal(hits.length, 3);
  for (const h of hits) {
    assert.equal(h.source, "grants_gov");
    assert.match(h.url!, /^https:\/\/www\.grants\.gov\/search-results-detail\/\d+$/);
    assert.ok(h.closes_on === null || /^\d{4}-\d{2}-\d{2}$/.test(h.closes_on));
  }
  assert.equal(parseGrantsGov({ data: { oppHits: [{ id: 1, title: "X", closeDate: "11/05/2029", openDate: "09/25/2026" }] } }, "t")[0].closes_on, "2029-11-05");
});

test("funding kinds and closing dates read from text", () => {
  assert.equal(kindOf("EMBO Postdoctoral Fellowship"), "fellowship");
  assert.equal(kindOf("AACR Scholar-in-Training Travel Award"), "travel");
  assert.equal(kindOf("Research Project Grant (R01)"), "grant");
  assert.equal(kindOf("Pancreatic Cancer Detection Consortium: Research Units (U01 Clinical Trial Optional)"), "grant");
  assert.equal(parseEuropePmc({ resultList: { result: [{ id: "1", source: "MED", title: "Co-delivery &lt;i&gt;via&lt;/i&gt; a CD44-guided nanocarrier &amp; more." }] } }, "t")[0].title, "Co-delivery via a CD44-guided nanocarrier & more");
  assert.equal(toIsoDay("15 January 2027"), "2027-01-15");
  assert.equal(toIsoDay("January 15, 2027"), "2027-01-15");
  assert.equal(toIsoDay("soon"), null);
});

test("RSS and Atom feeds: only items about your topics, with any stated deadline", () => {
  const rss = `<?xml version="1.0"?><rss><channel><title>DBT India — Calls</title>
    <item><title>Call for proposals: Cancer Biology</title><link>https://dbt.gov.in/call/1</link><guid>c1</guid><pubDate>Mon, 02 Nov 2026 10:00:00 GMT</pubDate>
      <description><![CDATA[Funding for <b>cancer biology</b> and tumour immunology. Deadline: 15 January 2027.]]></description></item>
    <item><title>Call for proposals: Agriculture</title><link>https://dbt.gov.in/call/2</link><description>Crop science.</description></item>
  </channel></rss>`;
  const hits = parseFeed(rss, "https://dbt.gov.in/feed", ["cancer biology", "obesity"]);
  assert.equal(hits.length, 1);
  assert.deepEqual([hits[0].title, hits[0].funder, hits[0].closes_on, hits[0].opens_on, hits[0].topics], ["Call for proposals: Cancer Biology", "DBT India — Calls", "2027-01-15", "2026-11-02", ["cancer biology"]]);
  const atom = `<feed><title>EMBO</title><entry><title>Postdoctoral Fellowships 2027</title><link href="https://embo.org/f"/><id>e1</id><updated>2026-10-01T00:00:00Z</updated><summary>Closes 2027-02-01</summary></entry></feed>`;
  const a = parseFeed(atom, "https://embo.org/feed", []); // no topics: keep everything
  assert.deepEqual([a[0].url, a[0].kind, a[0].closes_on], ["https://embo.org/f", "fellowship", "2027-02-01"]);
});

test("a full run stores new rows only, skips closed calls and records the check", async () => {
  const epmc = fixture("europepmc.json"), gg = fixture("grantsgov.json");
  gg.data.oppHits[0].closeDate = "01/01/2020"; // already closed
  const calls: string[] = [];
  const fakeFetch = async (url: string) => {
    calls.push(url);
    if (url.includes("europepmc")) return new Response(JSON.stringify(epmc));
    if (url.includes("grants.gov")) return new Response(JSON.stringify(gg));
    return new Response("<rss></rss>");
  };
  const written: Record<string, unknown[]> = {};
  const db = {
    from: (t: string) => ({
      upsert: (rows: unknown[]) => ({ select: async () => { written[t] = rows; return { data: rows.slice(0, 2), error: null }; } }),
      update: (v: object) => ({ eq: async () => { written.settings = [v]; return { error: null }; } }),
    }),
  };
  const report = await runAlertsFor(db, "u1", { paper_alert_topics: ["STAT3 AND pancreatic cancer", " "], funding_topics: ["tumor immunology"], funding_feeds: ["not-a-url", "https://example.org/feed"] }, new Date("2026-11-05T09:00:00Z"), fakeFetch as typeof fetch);
  assert.deepEqual(report, { papers: 2, funding: 2, errors: [] });
  assert.equal(calls.filter((c) => c.includes("europepmc")).length, 1, "blank topics are skipped");
  assert.ok(calls.some((c) => c.includes("2026-10-29")), "first run looks a week back");
  assert.equal((written.ws_funding_calls as { external_id: string }[]).length, 2, "the closed call is dropped");
  assert.ok((written.ws_paper_alerts as { user_id: string }[]).every((r) => r.user_id === "u1"));
  assert.deepEqual(written.settings, [{ paper_alerts_checked_on: "2026-11-05", funding_checked_on: "2026-11-05" }]);
});

test("a source that fails is reported, not fatal", async () => {
  const r = await fetchFunding(["x"], ["https://down.example/feed"], "2026-11-05", (async () => new Response("no", { status: 503 })) as typeof fetch);
  assert.equal(r.hits.length, 0);
  assert.equal(r.errors.length, 2);
  await assert.rejects(fetchPapers(["x"], "2026-11-01", "2026-11-05", (async () => new Response("", { status: 500 })) as typeof fetch), /Europe PMC answered 500/);
});
