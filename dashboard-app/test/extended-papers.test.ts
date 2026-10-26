import { test } from "node:test";
import assert from "node:assert/strict";
import { authorLine, parseIdentifier } from "../src/extended/modules/papers/lookup.ts";

test("recognises DOIs, bare or as links, and lower-cases them", () => {
  assert.deepEqual(parseIdentifier("10.1038/S41586-021-03819-2"), { kind: "doi", id: "10.1038/s41586-021-03819-2" });
  assert.deepEqual(parseIdentifier("https://doi.org/10.1093/bioinformatics/btab123."), { kind: "doi", id: "10.1093/bioinformatics/btab123" });
});

test("recognises arXiv ids in all common forms", () => {
  for (const s of ["2401.12345", "2401.12345v2", "arXiv:2401.12345", "https://arxiv.org/abs/2401.12345v3", "https://arxiv.org/pdf/2401.12345.pdf", "10.48550/arXiv.2401.12345"]) {
    assert.deepEqual(parseIdentifier(s), { kind: "arxiv", id: "2401.12345" }, s);
  }
  assert.deepEqual(parseIdentifier("arXiv:hep-th/9901001"), { kind: "arxiv", id: "hep-th/9901001" });
});

test("recognises PubMed ids", () => {
  assert.deepEqual(parseIdentifier("34265844"), { kind: "pmid", id: "34265844" });
  assert.deepEqual(parseIdentifier("PMID: 34265844"), { kind: "pmid", id: "34265844" });
  assert.deepEqual(parseIdentifier("https://pubmed.ncbi.nlm.nih.gov/34265844/"), { kind: "pmid", id: "34265844" });
});

test("rejects things that are not identifiers", () => {
  assert.equal(parseIdentifier(""), null);
  assert.equal(parseIdentifier("attention is all you need"), null);
});

test("author line shortens long author lists", () => {
  assert.equal(authorLine(["Ashish Vaswani", "Noam Shazeer", "Niki Parmar", "Jakob Uszkoreit"]), "Vaswani, Shazeer, Parmar et al.");
  assert.equal(authorLine(["Jumper, John"]), "Jumper");
  assert.equal(authorLine([]), "");
});

