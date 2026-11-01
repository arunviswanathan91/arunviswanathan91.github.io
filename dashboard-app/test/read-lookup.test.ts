import assert from "node:assert/strict";
import { test } from "node:test";
import { readFromMeta, readUrl, sameLink } from "../src/lib/readLookup.ts";

test("readFromMeta fills title, DOI link and a short citation with the abstract", () => {
  const f = readFromMeta({ title: "  Metabolic  inflammation,\nobesity, and cancer ", authors: ["Lee, C", "Kumar, B", "Rao, D", "Singh, E"], publication: "Cell Metabolism", year: 2024, doi: "10.1016/x", abstract: "  We  show\nthat… " });
  assert.equal(f.title, "Metabolic inflammation, obesity, and cancer");
  assert.equal(f.url, "https://doi.org/10.1016/x");
  assert.match(f.notes, /^Lee, Kumar, Rao et al\. — Cell Metabolism \(2024\)\nDOI: 10\.1016\/x\n\nWe show that…$/);
});
test("readUrl prefers DOI, then arXiv, PubMed, then the looked-up URL", () => {
  assert.equal(readUrl({ doi: "10.1/a", arxiv_id: "2401.1" }), "https://doi.org/10.1/a");
  assert.equal(readUrl({ arxiv_id: "2401.12345" }), "https://arxiv.org/abs/2401.12345");
  assert.equal(readUrl({ pmid: "34265844" }), "https://pubmed.ncbi.nlm.nih.gov/34265844/");
  assert.equal(readUrl({ url: "https://example.org/p" }), "https://example.org/p");
  assert.equal(readUrl({}), "");
});
test("readFromMeta copes with sparse metadata and long abstracts", () => {
  const f = readFromMeta({ title: "T", doi: "10.1/a" });
  assert.equal(f.notes, "DOI: 10.1/a");
  assert.equal(readFromMeta({ title: "T", abstract: "x".repeat(5000) }).notes.length, 1500);
});
test("sameLink ignores scheme, www and trailing slash", () => {
  assert.ok(sameLink("https://www.nature.com/articles/x/", "http://nature.com/articles/X"));
  assert.ok(!sameLink("https://nature.com/a", "https://nature.com/b"));
  assert.ok(!sameLink("", ""));
  assert.ok(!sameLink(null, undefined));
});
