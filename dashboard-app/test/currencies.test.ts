import assert from "node:assert/strict";
import test from "node:test";
import { CURRENCY_OPTIONS } from "../src/lib/currencies.ts";

test("currency selector includes INR and the major global currencies",()=>{
 const codes=new Set(CURRENCY_OPTIONS.map(option=>option.value));
 for(const code of ["INR","USD","EUR","GBP","JPY","AUD","CAD"])assert.ok(codes.has(code),`${code} is available`);
});

test("currency selector exposes unique three-letter currency codes",()=>{
 const codes=CURRENCY_OPTIONS.map(option=>option.value);
 assert.equal(new Set(codes).size,codes.length);
 assert.ok(codes.every(code=>/^[A-Z]{3}$/.test(code)));
});
