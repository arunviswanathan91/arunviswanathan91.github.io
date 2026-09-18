import assert from "node:assert/strict";
import { test } from "node:test";
import { convertedRange, currencyConversionFor, salaryDisplayFor } from "../src/lib/currency.ts";

const conversion={
 fromCurrency:"EUR",toCurrency:"INR",rate:92,asOf:"2026-09-16",
 sourceUrl:"https://example.test/inr.json",provider:"fawazahmed0/exchange-api" as const,
 display:"≈₹41.4L–47.8L/yr",
};

test("salary display keeps the advertised value before the selected-currency estimate",()=>{
 const row={id:"1",salary_display:"€45,000–52,000/yr",score_breakdown:{currency_conversion:conversion}};
 assert.equal(salaryDisplayFor(row),"€45,000–52,000/yr · ≈₹41.4L–47.8L/yr");
 assert.deepEqual(currencyConversionFor(row),conversion);
});

test("budget ranges use the same dated exchange-rate snapshot",()=>{
 assert.deepEqual(convertedRange({low:100,high:200},conversion),{low:9200,high:18400});
});

test("malformed conversion metadata is ignored",()=>{
 const row={id:"1",salary_display:"€45,000/yr",score_breakdown:{currency_conversion:{...conversion,rate:-1}}};
 assert.equal(currencyConversionFor(row),null);
 assert.equal(salaryDisplayFor(row),"€45,000/yr");
});
