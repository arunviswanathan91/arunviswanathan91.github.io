import assert from "node:assert/strict";
import { test } from "node:test";
import { calculateBudget, includeResearchFit, parseBudgetRange } from "../src/lib/decision.ts";

const scenario = {
 gross:{low:2500,high:3000},deductions:{low:500,high:900},
 rent:{low:700,high:1100},essentials:{low:400,high:600},upfront:{low:2000,high:3500},
};
test("conservative net and savings ranges use opposite cost bounds",()=>{
 const result=calculateBudget(scenario);
 assert.deepEqual(result.net,{low:1600,high:2500});
 assert.deepEqual(result.savings,{low:-100,high:1400});
 assert.deepEqual(result.firstYear,{low:-4700,high:14800});
});
test("unknown expenses do not become zero or invented savings",()=>{
 const result=calculateBudget({...scenario,rent:null});
 assert.deepEqual(result.net,{low:1600,high:2500});
 assert.equal(result.savings,null);assert.equal(result.firstYear,null);
});
test("missing payroll deductions block net pay",()=>assert.equal(calculateBudget({...scenario,deductions:null}).net,null));
test("relocation is separate from recurring savings",()=>{
 assert.deepEqual(calculateBudget({...scenario,upfront:{low:8000,high:9000}}).savings,calculateBudget(scenario).savings);
});
test("unknown, negative, infinite and reversed inputs are rejected",()=>{
 for(const [low,high] of [["","900"],["500",""],["-1","100"],["900","500"],["Infinity","Infinity"],["NaN","100"]])assert.equal(parseBudgetRange(low,high),null);
 assert.deepEqual(parseBudgetRange("0","0"),{low:0,high:0});
});
test("deductions larger than gross require correction",()=>assert.equal(calculateBudget({...scenario,deductions:{low:4000,high:4500}}).net,null));
test("AI fit filters distinguish unassessed, weak and transferable roles",()=>{
 assert.equal(includeResearchFit("weak","relevant"),false);
 assert.equal(includeResearchFit(undefined,"relevant"),false);
 assert.equal(includeResearchFit("direct","relevant"),true);
 assert.equal(includeResearchFit("transferable","relevant"),true);
 assert.equal(includeResearchFit("weak","weak"),true);
 assert.equal(includeResearchFit(undefined,"pending"),true);
 assert.equal(includeResearchFit("weak","all"),true);
});
