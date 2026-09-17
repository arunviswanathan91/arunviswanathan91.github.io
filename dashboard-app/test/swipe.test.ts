import assert from "node:assert/strict";
import { test } from "node:test";
import { shuffleIds } from "../src/lib/shuffle.ts";

test("shuffle preserves every available opportunity exactly once",()=>{
 const original=["a","b","c","d"];
 const shuffled=shuffleIds(original,()=>0.25);
 assert.deepEqual([...shuffled].sort(),original);
 assert.equal(new Set(shuffled).size,original.length);
 assert.notEqual(shuffled[0],original[0]);
});

test("shuffle handles empty and single-card queues",()=>{
 assert.deepEqual(shuffleIds([],()=>0),[]);
 assert.deepEqual(shuffleIds(["only"],()=>0),["only"]);
});
