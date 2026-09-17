import assert from "node:assert/strict";
import { test } from "node:test";
import { applyDestinationChoice, DESTINATION_PRESETS } from "../src/lib/destinations.ts";

test("a region preset replaces domicile-derived or previous countries",()=>{
 const selected=applyDestinationChoice(["IN"],"preset:EUROPE");
 assert.deepEqual(selected,DESTINATION_PRESETS.EUROPE);
 assert.equal(selected.includes("IN"),false);
});

test("an individual country is added without removing existing destinations",()=>{
 assert.deepEqual(applyDestinationChoice(["DE"],"country:JP"),["DE","JP"]);
 assert.deepEqual(applyDestinationChoice(["DE","JP"],"country:JP"),["DE","JP"]);
});

test("worldwide is a real wildcard and a later country choice narrows it",()=>{
 assert.deepEqual(applyDestinationChoice(["DE"],"preset:WORLDWIDE"),["*"]);
 assert.deepEqual(applyDestinationChoice(["*"],"country:AU"),["AU"]);
});
