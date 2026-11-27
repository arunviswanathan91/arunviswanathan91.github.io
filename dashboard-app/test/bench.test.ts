import { test } from 'node:test';
import assert from 'node:assert/strict';
import {
 convert, dimensionOf, num, fmt, fmtQ, bestUnit, unitLabel, unitsOf, dilution, parseRatio, serialSeries, stepFactor, stepsToReach, reverseDilution, makeSolution, cellDilution, seeding, haemocytometer,
 massToWeigh, molesFromMass, concentrationFrom, recipe, masterMix, linearFit, predictX, predictY, parsePairs, niceTicks,
 type Q, type Qty,
} from '../src/extended/modules/bench/calc.ts';

/** Equal to within floating-point rounding (1 part in 10¹²). */
const near=(actual:number|null|undefined,expected:number,msg?:string)=>{
 assert.ok(typeof actual==='number'&&Number.isFinite(actual),`${msg??''} expected ${expected}, got ${actual}`);
 assert.ok(Math.abs(actual-expected)<=1e-12*Math.max(1,Math.abs(expected)),`${msg??''} expected ${expected}, got ${actual}`);
};
const q=(value:number|null,unit:string):Q=>({value,unit});
const nearQ=(actual:Qty|null|undefined,value:number,unit:string)=>{assert.ok(actual);assert.equal(actual.unit,unit);near(actual.value,value)};
const finite=(o:unknown):boolean=>o===null||typeof o!=='object'?typeof o!=='number'||Number.isFinite(o):Object.values(o as object).every(finite);

test('units convert within a dimension through the base unit',()=>{
 assert.equal(convert(1,'L','mL'),1000);
 assert.equal(convert(0.5,'mL','µL'),500);
 assert.equal(convert(250,'µL','mL'),0.25);
 assert.equal(convert(1,'fL','pL'),0.001);
 assert.equal(convert(1,'L','fL'),1e15);
 assert.equal(convert(1,'kg','g'),1000);
 assert.equal(convert(2500,'mg','g'),2.5);
 assert.equal(convert(1,'pg','ng'),0.001);
 assert.equal(convert(1,'M','mM'),1000);
 assert.equal(convert(150,'mM','M'),0.15);
 assert.equal(convert(5,'nM','pM'),5000);
 assert.equal(convert(1,'fM','M'),1e-15);
 assert.equal(convert(2,'mmol','µmol'),2000);
 assert.equal(convert(7,'mL','mL'),7);
 assert.equal(convert(0,'mL','L'),0);
 assert.equal(convert(5,'%','%'),5);
 assert.equal(convert(10,'x','x'),10);
});

test('mass per volume takes any mass unit over any volume unit',()=>{
 assert.equal(convert(1,'mg/mL','g/L'),1);
 assert.equal(convert(1,'µg/µL','mg/mL'),1);
 assert.equal(convert(1,'mg/mL','µg/mL'),1000);
 assert.equal(convert(50,'ng/µL','µg/mL'),50);
 assert.equal(convert(1,'g/mL','g/L'),1000);
 assert.equal(convert(2,'kg/L','g/mL'),2);
 assert.equal(dimensionOf('pg/fL'),'massvol');
});

test('cell concentrations carry a multiplier',()=>{
 assert.equal(convert(1,'e6 cells/mL','cells/mL'),1e6);
 assert.equal(convert(2.5,'e6 cells/mL','e3 cells/µL'),2.5);
 assert.equal(convert(500000,'cells/mL','e6 cells/mL'),0.5);
 assert.equal(convert(1,'e1 cells/mL','cells/mL'),10);
 assert.equal(convert(1,'e2 cells/mL','cells/mL'),100);
 assert.equal(convert(1,'e3 cells/mL','cells/mL'),1000);
 assert.equal(convert(1,'e9 cells/L','e6 cells/mL'),1);
 assert.equal(convert(1,'e4 cells/mL','cells/mL'),null,'10⁴ is not one of the multipliers');
});

test('molar and mass per volume convert only with a molecular weight',()=>{
 // NaCl, 58.44 g/mol: 1 M = 58.44 g/L; 150 mM = 8.766 mg/mL.
 near(convert(1,'M','g/L',58.44),58.44);
 near(convert(150,'mM','mg/mL',58.44),8.766);
 near(convert(58.44,'g/L','M',58.44),1);
 near(convert(1,'mg/mL','µM',50000),20,'a 50 kDa protein at 1 mg/mL is 20 µM');
 assert.equal(convert(1,'M','g/L'),null);
 assert.equal(convert(1,'M','g/L',0),null);
 assert.equal(convert(1,'M','g/L',-58.44),null);
 assert.equal(convert(1,'%','g/L',58.44),null,'percent is not converted: it may be w/v or v/v');
});

test('conversion refuses what it cannot do',()=>{
 assert.equal(convert(1,'mL','g'),null);
 assert.equal(convert(1,'mL','furlong'),null);
 assert.equal(convert(1,'','mL'),null);
 assert.equal(convert(null,'mL','L'),null);
 assert.equal(convert(undefined,'mL','L'),null);
 assert.equal(convert(NaN,'mL','L'),null);
 assert.equal(convert(Infinity,'mL','L'),null);
 assert.equal(convert(-1,'mL','L'),null);
 assert.equal(convert(1,'cells/mL','M'),null);
 assert.equal(dimensionOf('µL'),'volume');
 assert.equal(dimensionOf('μL'),'volume','Greek mu is read as micro');
 assert.equal(convert(1,'uL','nL'),1000,'u is read as micro');
 assert.equal(dimensionOf('nonsense'),null);
 for(const d of ['volume','mass','amount','molar','massvol','cells','percent','fold'] as const) for(const u of unitsOf(d)) assert.equal(dimensionOf(u),d,u);
});

test('typed numbers: blank is nothing, one comma is a decimal mark, grouping is refused',()=>{
 assert.equal(num('1.5'),1.5);
 assert.equal(num(' 10 '),10);
 assert.equal(num('1,5'),1.5);
 assert.equal(num('.5'),0.5);
 assert.equal(num('5.'),5);
 assert.equal(num('1e6'),1e6);
 assert.equal(num('2.5E-3'),0.0025);
 assert.equal(num('-3'),-3);
 assert.equal(num('0'),0);
 assert.equal(num(4),4);
 for(const bad of ['','   ','abc','1.2.3','1,000,000','1.000,5','1 000','--1','e5','5 mL','Infinity','NaN']) assert.equal(num(bad),null,bad);
 assert.equal(num(null),null);assert.equal(num(undefined),null);assert.equal(num(NaN),null);assert.equal(num(Infinity),null);
});

test('numbers are shown without floating-point noise',()=>{
 assert.equal(fmt(0.1+0.2),'0.3');
 assert.equal(fmt(0.30000000000000004),'0.3');
 assert.equal(fmt(9.499999999999998),'9.5');
 assert.equal(fmt(1234.5678),'1235');
 assert.equal(fmt(1234.5678,6),'1234.57');
 assert.equal(fmt(0.000123456),'0.0001235');
 assert.equal(fmt(105.60000000000001),'105.6');
 assert.equal(fmt(100),'100');
 assert.equal(fmt(0),'0');
 assert.equal(fmt(-2.50001),'-2.5');
 assert.equal(fmt(250000),'250000');
 assert.equal(fmt(1080000),'1.08 × 10⁶');
 assert.equal(fmt(999999.9),'1 × 10⁶');
 assert.equal(fmt(0.00005),'5 × 10⁻⁵');
 assert.equal(fmt(1.5e-12),'1.5 × 10⁻¹²');
 assert.equal(fmt(null),'—');assert.equal(fmt(undefined),'—');assert.equal(fmt(NaN),'—');assert.equal(fmt(Infinity),'—');
});

test('the best unit is the largest that keeps the number at 0.1 or more',()=>{
 assert.deepEqual(bestUnit(0.0005,'mL'),{value:0.5,unit:'µL'});
 assert.deepEqual(bestUnit(0.5,'mL'),{value:0.5,unit:'mL'});
 assert.deepEqual(bestUnit(0.05,'mL'),{value:50,unit:'µL'});
 assert.deepEqual(bestUnit(1500,'µL'),{value:1.5,unit:'mL'});
 assert.deepEqual(bestUnit(9.5,'mL'),{value:9.5,unit:'mL'});
 assert.deepEqual(bestUnit(1,'mL'),{value:1,unit:'mL'});
 assert.deepEqual(bestUnit(99,'µL'),{value:99,unit:'µL'});
 assert.deepEqual(bestUnit(100,'µL'),{value:0.1,unit:'mL'});
 assert.deepEqual(bestUnit(99.96,'µL'),{value:0.09996,unit:'mL'},'what reads as 0.1 mL is shown in mL');
 assert.deepEqual(bestUnit(0.05,'g'),{value:50,unit:'mg'});
 assert.deepEqual(bestUnit(4.383,'g'),{value:4.383,unit:'g'});
 assert.deepEqual(bestUnit(0.00002,'M'),{value:20,unit:'µM'});
 assert.deepEqual(bestUnit(0.01,'mol'),{value:10,unit:'mmol'});
 assert.deepEqual(bestUnit(2500,'L'),{value:2500,unit:'L'},'nothing larger than a litre');
 assert.deepEqual(bestUnit(0.001,'fL'),{value:0.001,unit:'fL'},'nothing smaller than a femtolitre');
 assert.deepEqual(bestUnit(0.05,'mg/mL'),{value:50,unit:'µg/mL'},'mass per volume keeps its volume');
 assert.deepEqual(bestUnit(1080000,'cells/mL'),{value:1.08,unit:'e6 cells/mL'});
 assert.deepEqual(bestUnit(0.025,'e6 cells/mL'),{value:25,unit:'e3 cells/mL'});
 assert.deepEqual(bestUnit(500,'cells/mL'),{value:0.5,unit:'e3 cells/mL'});
 assert.deepEqual(bestUnit(50,'cells/mL'),{value:50,unit:'cells/mL'});
 assert.deepEqual(bestUnit(0.5,'%'),{value:0.5,unit:'%'});
 assert.deepEqual(bestUnit(0,'mL'),{value:0,unit:'mL'});
 assert.deepEqual(bestUnit(-0.0005,'mL'),{value:-0.5,unit:'µL'});
 for(const [v,u] of [[3e-7,'L'],[12345,'ng'],[0.004,'mM'],[7e5,'pmol']] as const){const b=bestUnit(v,u);assert.ok(b.value>=0.1&&b.value<1000,`${v} ${u} → ${b.value} ${b.unit}`);near(convert(b.value,b.unit,u),v)}
 assert.equal(fmtQ({value:0.0005,unit:'L'}),'0.5 mL');
 assert.equal(fmtQ({value:0.00005,unit:'L'}),'50 µL');
 assert.equal(fmtQ({value:0.0005,unit:'L'},4,false),'0.0005 L');
 assert.equal(fmtQ({value:1080000,unit:'cells/mL'}),'1.08 ×10⁶ cells/mL');
 assert.equal(fmtQ({value:10,unit:'x'}),'10×');
 assert.equal(fmtQ({value:0.1,unit:'%'}),'0.1 %');
 assert.equal(fmtQ(null),'—');
 assert.equal(unitLabel('e3 cells/µL'),'×10³ cells/µL');
 assert.equal(unitLabel('e1 cells/mL'),'×10 cells/mL');
 assert.equal(unitLabel('x'),'×');
});

test('dilution solves whichever of the four values is blank',()=>{
 // 10 mM stock to 500 µM in 10 mL: 10 mL × 0.5/10 = 0.5 mL of stock, 9.5 mL of diluent, 1 in 20.
 const v1=dilution({c1:q(10,'mM'),v1:q(null,'mL'),c2:q(500,'µM'),v2:q(10,'mL')});
 assert.equal(v1.reason,'');assert.equal(v1.result?.solved,'v1');
 nearQ(v1.result?.v1,0.5,'mL');nearQ(v1.result?.diluent,9.5,'mL');near(v1.result?.fold,20);
 // The answer comes in the blank field's own unit.
 nearQ(dilution({c1:q(10,'mM'),v1:q(null,'µL'),c2:q(500,'µM'),v2:q(10,'mL')}).result?.v1,500,'µL');
 // Final volume: 0.5 mL of 10 mM makes 10 mL at 0.5 mM.
 const v2=dilution({c1:q(10,'mM'),v1:q(500,'µL'),c2:q(0.5,'mM'),v2:q(null,'mL')});
 nearQ(v2.result?.v2,10,'mL');nearQ(v2.result?.diluent,9.5,'mL');
 // Final concentration: 2 mL of 5 M in 100 mL = 0.1 M = 100 mM.
 const c2=dilution({c1:q(5,'M'),v1:q(2,'mL'),c2:q(null,'mM'),v2:q(100,'mL')});
 nearQ(c2.result?.c2,100,'mM');nearQ(c2.result?.diluent,98,'mL');near(c2.result?.fold,50);
 // Stock concentration: 100 µL diluted to 1 mL gives 1 µg/mL, so the stock was 10 µg/mL.
 const c1=dilution({c1:q(null,'µg/mL'),v1:q(100,'µL'),c2:q(1,'µg/mL'),v2:q(1,'mL')});
 nearQ(c1.result?.c1,10,'µg/mL');nearQ(c1.result?.diluent,0.9,'mL');
});

test('dilution works in percent, fold and mass per volume',()=>{
 // 70 % ethanol from 100 %: 500 mL needs 350 mL.
 nearQ(dilution({c1:q(100,'%'),v1:q(null,'mL'),c2:q(70,'%'),v2:q(500,'mL')}).result?.v1,350,'mL');
 // 10× buffer to 1×: 1 L needs 100 mL and 900 mL of water.
 const pbs=dilution({c1:q(10,'x'),v1:q(null,'mL'),c2:q(1,'x'),v2:q(1,'L')});
 nearQ(pbs.result?.v1,100,'mL');nearQ(pbs.result?.diluent,0.9,'L');
 // 1 mg/mL antibody to 2 µg/mL in 5 mL: 10 µL.
 nearQ(dilution({c1:q(1,'mg/mL'),v1:q(null,'µL'),c2:q(2,'µg/mL'),v2:q(5,'mL')}).result?.v1,10,'µL');
 // Equal concentrations: all stock, no diluent.
 const same=dilution({c1:q(1,'M'),v1:q(null,'mL'),c2:q(1,'M'),v2:q(5,'mL')});
 nearQ(same.result?.v1,5,'mL');assert.equal(same.result?.diluent.value,0);
});

test('dilution rejects what cannot be done, with a reason',()=>{
 const higher=dilution({c1:q(1,'mM'),v1:q(null,'mL'),c2:q(2,'mM'),v2:q(10,'mL')});
 assert.equal(higher.result,null);assert.match(higher.reason,/higher than the stock/);assert.equal(higher.incomplete,false);
 assert.match(dilution({c1:q(500,'µM'),v1:q(1,'mL'),c2:q(1,'mM'),v2:q(null,'mL')}).reason,/higher than the stock/,'also across units and when solving the final volume');
 assert.match(dilution({c1:q(1,'M'),v1:q(20,'mL'),c2:q(null,'M'),v2:q(10,'mL')}).reason,/larger than the final volume/);
 assert.match(dilution({c1:q(null,'M'),v1:q(2,'L'),c2:q(1,'M'),v2:q(500,'mL')}).reason,/larger than the final volume/);
 for(const zero of [{c1:q(0,'mM'),v1:q(null,'mL'),c2:q(1,'mM'),v2:q(10,'mL')},{c1:q(10,'mM'),v1:q(null,'mL'),c2:q(0,'mM'),v2:q(10,'mL')},{c1:q(10,'mM'),v1:q(null,'mL'),c2:q(1,'mM'),v2:q(0,'mL')},{c1:q(10,'mM'),v1:q(-1,'mL'),c2:q(null,'mM'),v2:q(10,'mL')},{c1:q(-10,'mM'),v1:q(null,'mL'),c2:q(1,'mM'),v2:q(10,'mL')}]){
  const r=dilution(zero);assert.equal(r.result,null);assert.match(r.reason,/greater than zero/);
 }
 const two=dilution({c1:q(10,'mM'),v1:q(null,'mL'),c2:q(null,'mM'),v2:q(10,'mL')});
 assert.equal(two.result,null);assert.equal(two.incomplete,true);
 const none=dilution({c1:q(null,'mM'),v1:q(null,'mL'),c2:q(null,'mM'),v2:q(null,'mL')});
 assert.equal(none.result,null);assert.equal(none.incomplete,true);
 const all=dilution({c1:q(10,'mM'),v1:q(1,'mL'),c2:q(1,'mM'),v2:q(10,'mL')});
 assert.equal(all.result,null);assert.equal(all.incomplete,true);assert.match(all.reason,/Clear/);
 assert.match(dilution({c1:q(10,'mM'),v1:q(null,'mL'),c2:q(1,'%'),v2:q(10,'mL')}).reason,/same kind of unit/);
 assert.match(dilution({c1:q(10,'mM'),v1:q(null,'mL'),c2:q(1,'mg/mL'),v2:q(10,'mL')}).reason,/same kind of unit/);
 assert.equal(dilution({c1:q(10,'mL'),v1:q(null,'mL'),c2:q(1,'mL'),v2:q(10,'mL')}).result,null,'a volume is not a concentration');
 assert.equal(dilution({c1:q(10,'mM'),v1:q(null,'g'),c2:q(1,'mM'),v2:q(10,'mL')}).result,null);
 assert.equal(dilution({c1:q(NaN,'mM'),v1:q(null,'mL'),c2:q(1,'mM'),v2:q(10,'mL')}).result,null);
 assert.equal(dilution({c1:q(Infinity,'mM'),v1:q(null,'mL'),c2:q(1,'mM'),v2:q(10,'mL')}).result,null);
});

test('a dilution per step is read as a ratio or a plain factor',()=>{
 assert.equal(parseRatio('1:10'),10);
 assert.equal(parseRatio('10'),10);
 assert.equal(parseRatio('1/10'),10);
 assert.equal(parseRatio(' 1 : 2 '),2);
 assert.equal(parseRatio('2:10'),5);
 assert.equal(parseRatio('1:1.5'),1.5);
 assert.equal(parseRatio('1:2,5'),2.5);
 assert.equal(parseRatio(3),3);
 assert.equal(parseRatio('1:1'),1,'read, then refused by the series as not a dilution');
 for(const bad of ['',' ','1:','::','1:2:3','a:b','1:0','0:10','-1:10','0','-5','1:-10','ten']) assert.equal(parseRatio(bad),null,bad);
 assert.equal(parseRatio(null),null);assert.equal(parseRatio(0),null);assert.equal(parseRatio(NaN),null);
});

test('serial dilution from a transfer volume: every tube, the volumes and the diluent needed',()=>{
 // 100 mM, 1:10, six steps, 100 µL carried over: 100 + 900 µL each time; 6 × 900 = 5400 µL of diluent.
 const r=serialSeries({start:q(100,'mM'),factors:[10,10,10,10,10,10],volume:q(100,'µL'),volumeIs:'transfer'});
 assert.equal(r.reason,'');assert.equal(r.result?.tubes.length,6);
 [10,1,0.1,0.01,0.001,0.0001].forEach((c,k)=>nearQ(r.result?.tubes[k].concentration,c,'mM'));
 assert.deepEqual(r.result?.tubes.map(t=>t.fold),[10,100,1000,1e4,1e5,1e6]);
 for(const t of r.result!.tubes){nearQ(t.transfer,100,'µL');nearQ(t.diluent,900,'µL');nearQ(t.mixed,1000,'µL')}
 nearQ(r.result?.totalDiluent,5400,'µL');nearQ(r.result?.final,0.0001,'mM');
 assert.equal(fmtQ(r.result?.final),'0.1 µM');
 // Every tube gives 100 µL to the next and keeps 900 µL; the last keeps all 1000 µL.
 assert.deepEqual(r.result?.tubes.map(t=>t.left.value),[900,900,900,900,900,1000]);
 // Two-fold, 100 µL: 100 + 100. 100 ng/mL → 50, 25, 12.5, 6.25.
 const two=serialSeries({start:q(100,'ng/mL'),factors:[2,2,2,2],volume:q(100,'µL'),volumeIs:'transfer'});
 assert.deepEqual(two.result?.tubes.map(t=>t.concentration.value),[50,25,12.5,6.25]);
 nearQ(two.result?.tubes[0].diluent,100,'µL');nearQ(two.result?.totalDiluent,400,'µL');
 assert.deepEqual(two.result?.tubes.map(t=>t.left.value),[100,100,100,200]);
 // A different dilution at every step: 1:10, then 1:2, then 1:5 from 1 M with 50 µL: 0.1, 0.05, 0.01 M;
 // diluent 450, 50 and 200 µL (700 in all); tubes hold 500, 100, 250 µL and keep 450, 50, 250.
 const mixed=serialSeries({start:q(1,'M'),factors:[10,2,5],volume:q(50,'µL'),volumeIs:'transfer'});
 [0.1,0.05,0.01].forEach((c,k)=>nearQ(mixed.result?.tubes[k].concentration,c,'M'));
 assert.deepEqual(mixed.result?.tubes.map(t=>t.diluent.value),[450,50,200]);
 assert.deepEqual(mixed.result?.tubes.map(t=>t.fold),[10,20,100]);
 assert.deepEqual(mixed.result?.tubes.map(t=>t.left.value),[450,50,250]);
 nearQ(mixed.result?.totalDiluent,700,'µL');
});

test('serial dilution from a volume per tube',()=>{
 // Ten-fold, 1 mL per tube: carry 0.1 mL into 0.9 mL. 1 mM → 0.1, 0.01, 0.001 mM.
 const ten=serialSeries({start:q(1,'mM'),factors:[10,10,10],volume:q(1,'mL'),volumeIs:'tube'});
 for(const t of ten.result!.tubes){nearQ(t.transfer,0.1,'mL');nearQ(t.diluent,0.9,'mL');nearQ(t.mixed,1,'mL')}
 [0.1,0.01,0.001].forEach((c,k)=>nearQ(ten.result?.tubes[k].concentration,c,'mM'));
 nearQ(ten.result?.totalDiluent,2.7,'mL');
 [0.9,0.9,1].forEach((v,k)=>nearQ(ten.result?.tubes[k].left,v,'mL'));
 // 1 in 3, 150 µL per well: 50 µL into 100 µL. 9× → 3×, 1×.
 const three=serialSeries({start:q(9,'x'),factors:[3,3],volume:q(150,'µL'),volumeIs:'tube'});
 nearQ(three.result?.tubes[0].transfer,50,'µL');nearQ(three.result?.tubes[0].diluent,100,'µL');
 assert.deepEqual(three.result?.tubes.map(t=>t.concentration.value),[3,1]);
});

test('serial dilution rejects impossible series',()=>{
 const base={start:q(1,'mM'),factors:[10,10,10] as (number|null)[],volume:q(1,'mL'),volumeIs:'transfer' as const};
 assert.match(serialSeries({...base,factors:[10,1,10]}).reason,/must dilute/);
 assert.equal(serialSeries({...base,factors:[0.5]}).result,null);
 assert.equal(serialSeries({...base,factors:[-2]}).result,null);
 assert.equal(serialSeries({...base,factors:[NaN]}).result,null);
 assert.equal(serialSeries({...base,factors:[]}).result,null);
 assert.equal(serialSeries({...base,factors:Array(49).fill(2)}).result,null);
 assert.equal(serialSeries({...base,start:q(0,'mM')}).result,null);
 assert.equal(serialSeries({...base,start:q(-1,'mM')}).result,null);
 assert.equal(serialSeries({...base,volume:q(0,'mL')}).result,null);
 assert.equal(serialSeries({...base,volume:q(-1,'mL')}).result,null);
 assert.equal(serialSeries({...base,volume:q(1,'g')}).result,null);
 assert.equal(serialSeries({...base,start:q(1,'mL')}).result,null);
 const blank=serialSeries({...base,factors:[10,null,10]});
 assert.equal(blank.result,null);assert.equal(blank.incomplete,true);
 assert.equal(serialSeries({...base,start:q(null,'mM')}).incomplete,true);
 assert.equal(serialSeries({start:q(1e-300,'mM'),factors:Array(10).fill(1e10),volume:q(1,'mL'),volumeIs:'tube'}).result,null,'a series that underflows is refused, not shown as 0');
});

test('serial dilution to a target: the factor per step, or the steps needed',()=>{
 // 100 mM to 0.1 µM is a million-fold: six steps of 10.
 const f=stepFactor({start:q(100,'mM'),target:q(0.1,'µM'),steps:6});
 assert.equal(f.result,10);
 const series=serialSeries({start:q(100,'mM'),factors:Array(6).fill(f.result),volume:q(100,'µL'),volumeIs:'transfer'});
 assert.equal(fmtQ(series.result?.final),'0.1 µM');nearQ(series.result?.totalDiluent,5400,'µL');
 // 1 M to 1 mM in 2 steps: √1000 = 31.6228 per step; 8-fold in 3 steps is 2; one step is the whole dilution.
 near(stepFactor({start:q(1,'M'),target:q(1,'mM'),steps:2}).result,Math.sqrt(1000));
 assert.equal(stepFactor({start:q(8,'x'),target:q(1,'x'),steps:3}).result,2);
 assert.equal(stepFactor({start:q(50,'%'),target:q(10,'%'),steps:1}).result,5);
 assert.match(stepFactor({start:q(1,'mM'),target:q(2,'mM'),steps:3}).reason,/lower than the start/);
 assert.match(stepFactor({start:q(1,'mM'),target:q(1,'mM'),steps:3}).reason,/lower than the start/);
 assert.match(stepFactor({start:q(1,'mM'),target:q(1,'%'),steps:3}).reason,/same kind of unit/);
 for(const steps of [0,-1,2.5,49]) assert.equal(stepFactor({start:q(1,'M'),target:q(1,'mM'),steps}).result,null);
 assert.equal(stepFactor({start:q(1,'M'),target:q(1,'mM'),steps:null}).incomplete,true);
 assert.equal(stepFactor({start:q(null,'M'),target:q(1,'mM'),steps:2}).incomplete,true);
 assert.equal(stepFactor({start:q(0,'M'),target:q(1,'mM'),steps:2}).result,null);
 assert.equal(stepFactor({start:q(1,'M'),target:q(0,'mM'),steps:2}).result,null);
 assert.equal(stepFactor({start:q(-1,'M'),target:q(1,'mM'),steps:2}).result,null);
 // A fixed 1:10 from 100 mM to 0.1 µM takes six steps and lands on it; to 0.3 µM it also takes six (five stops at 1 µM).
 const exact=stepsToReach({start:q(100,'mM'),target:q(0.1,'µM'),factor:10});
 assert.equal(exact.result?.steps,6);nearQ(exact.result?.reached,0.0001,'mM');
 const below=stepsToReach({start:q(100,'mM'),target:q(0.3,'µM'),factor:10});
 assert.equal(below.result?.steps,6);nearQ(below.result?.reached,0.0001,'mM');
 // 1:2 from 100 to 30 ng/mL: one step gives 50 (too high), two give 25.
 const half=stepsToReach({start:q(100,'ng/mL'),target:q(30,'ng/mL'),factor:2});
 assert.equal(half.result?.steps,2);nearQ(half.result?.reached,25,'ng/mL');
 assert.equal(stepsToReach({start:q(1000,'x'),target:q(1,'x'),factor:10}).result?.steps,3);
 assert.match(stepsToReach({start:q(1,'M'),target:q(1,'fM'),factor:1.5}).reason,/more than 48 steps/);
 assert.equal(stepsToReach({start:q(1,'M'),target:q(1,'mM'),factor:1}).result,null);
 assert.equal(stepsToReach({start:q(1,'M'),target:q(1,'mM'),factor:0.5}).result,null);
 assert.equal(stepsToReach({start:q(1,'M'),target:q(1,'mM'),factor:null}).incomplete,true);
 assert.equal(stepsToReach({start:q(1,'mM'),target:q(1,'M'),factor:10}).result,null);
});

test('reverse dilution: what stock plus solvent gives',()=>{
 // 1 mL of 10 mM with 9 mL of solvent: 10 mL at 1 mM, a 1 in 10 dilution.
 const r=reverseDilution({c1:q(10,'mM'),stock:q(1,'mL'),solvent:q(9,'mL')});
 nearQ(r.result?.c2,1,'mM');nearQ(r.result?.v2,10,'mL');near(r.result?.fold,10);
 // Mixed units: 50 µL of 2 mg/mL into 0.95 mL: 1000 µL at 0.1 mg/mL.
 const mixed=reverseDilution({c1:q(2,'mg/mL'),stock:q(50,'µL'),solvent:q(0.95,'mL')});
 nearQ(mixed.result?.c2,0.1,'mg/mL');nearQ(mixed.result?.v2,1000,'µL');near(mixed.result?.fold,20);
 // No solvent: the stock unchanged.
 const neat=reverseDilution({c1:q(5,'%'),stock:q(2,'mL'),solvent:q(0,'mL')});
 assert.equal(neat.result?.c2.value,5);assert.equal(neat.result?.v2.value,2);
 // It undoes the forward calculation: 10 mM → 1 mM in 10 mL is 1 mL of stock + 9 mL of solvent.
 const fwd=dilution({c1:q(10,'mM'),v1:q(null,'mL'),c2:q(1,'mM'),v2:q(10,'mL')});
 nearQ(fwd.result?.v1,1,'mL');nearQ(fwd.result?.diluent,9,'mL');
 assert.equal(reverseDilution({c1:q(null,'mM'),stock:q(1,'mL'),solvent:q(9,'mL')}).incomplete,true);
 assert.equal(reverseDilution({c1:q(10,'mM'),stock:q(1,'mL'),solvent:q(null,'mL')}).incomplete,true);
 for(const bad of [{c1:q(0,'mM'),stock:q(1,'mL'),solvent:q(9,'mL')},{c1:q(10,'mM'),stock:q(0,'mL'),solvent:q(9,'mL')},{c1:q(10,'mM'),stock:q(1,'mL'),solvent:q(-9,'mL')},{c1:q(-10,'mM'),stock:q(1,'mL'),solvent:q(9,'mL')},{c1:q(10,'mL'),stock:q(1,'mL'),solvent:q(9,'mL')},{c1:q(10,'mM'),stock:q(1,'g'),solvent:q(9,'mL')}]){
  const o=reverseDilution(bad);assert.equal(o.result,null);assert.equal(o.incomplete,false);assert.ok(o.reason);
 }
});

test('make a solution: the mass to dissolve',()=>{
 // Glucose, 180.16 g/mol, 50 mM in 500 mL: 0.05 × 0.5 × 180.16 = 4.504 g (0.025 mol).
 const g=makeSolution({mw:180.16,concentration:q(50,'mM'),volume:q(500,'mL')});
 nearQ(g.result?.mass,4.504,'g');nearQ(g.result?.moles,0.025,'mol');assert.equal(fmtQ(g.result?.mass),'4.504 g');
 // Mass per volume and % (w/v) need no molecular weight: 2 mg/mL in 50 mL is 0.1 g; 4 % in 250 mL is 10 g.
 const bsa=makeSolution({mw:null,concentration:q(2,'mg/mL'),volume:q(50,'mL')});
 nearQ(bsa.result?.mass,0.1,'g');assert.equal(bsa.result?.moles,null);
 nearQ(makeSolution({mw:null,concentration:q(4,'%'),volume:q(250,'mL')}).result?.mass,10,'g');
 nearQ(makeSolution({mw:66430,concentration:q(2,'mg/mL'),volume:q(50,'mL')}).result?.mass,0.1,'g','a molecular weight changes nothing here');
 assert.equal(makeSolution({mw:null,concentration:q(50,'mM'),volume:q(500,'mL')}).incomplete,true);
 assert.equal(makeSolution({mw:180.16,concentration:q(null,'mM'),volume:q(500,'mL')}).incomplete,true);
 for(const bad of [{mw:0,concentration:q(50,'mM'),volume:q(500,'mL')},{mw:-1,concentration:q(50,'mM'),volume:q(500,'mL')},{mw:180.16,concentration:q(0,'mM'),volume:q(500,'mL')},{mw:180.16,concentration:q(50,'mM'),volume:q(0,'mL')},{mw:180.16,concentration:q(-50,'mM'),volume:q(500,'mL')},{mw:180.16,concentration:q(10,'x'),volume:q(500,'mL')},{mw:180.16,concentration:q(50,'mM'),volume:q(500,'mg')}]){
  const o=makeSolution(bad);assert.equal(o.result,null);assert.equal(o.incomplete,false);assert.ok(o.reason);
 }
});

test('cell dilution is C1V1 = C2V2 in cells per volume',()=>{
 // 2 × 10⁶ cells/mL to 5 × 10⁵ cells/mL in 10 mL: 2.5 mL of cells and 7.5 mL of medium.
 const r=cellDilution({c1:q(2,'e6 cells/mL'),v1:q(null,'mL'),c2:q(500000,'cells/mL'),v2:q(10,'mL')});
 nearQ(r.result?.v1,2.5,'mL');nearQ(r.result?.diluent,7.5,'mL');near(r.result?.fold,4);
 // 1 mL at 1.2 × 10⁶/mL made up to 6 mL is 2 × 10⁵/mL = 200 × 10³/mL.
 nearQ(cellDilution({c1:q(1.2,'e6 cells/mL'),v1:q(1,'mL'),c2:q(null,'e3 cells/mL'),v2:q(6,'mL')}).result?.c2,200,'e3 cells/mL');
 assert.match(cellDilution({c1:q(1,'e6 cells/mL'),v1:q(null,'mL'),c2:q(2,'e6 cells/mL'),v2:q(10,'mL')}).reason,/higher than the stock/);
 assert.match(cellDilution({c1:q(1,'mM'),v1:q(null,'mL'),c2:q(0.5,'mM'),v2:q(10,'mL')}).reason,/cells per volume/);
 assert.equal(cellDilution({c1:q(0,'e6 cells/mL'),v1:q(null,'mL'),c2:q(1,'e6 cells/mL'),v2:q(10,'mL')}).result,null);
 assert.equal(cellDilution({c1:q(null,'e6 cells/mL'),v1:q(null,'mL'),c2:q(1,'e6 cells/mL'),v2:q(10,'mL')}).incomplete,true);
});

test('seeding a plate: total cells, suspension and medium',()=>{
 // 96 wells × 10,000 cells in 100 µL, 10 % extra, suspension at 1 × 10⁶/mL (1000 cells/µL):
 // 105.6 wells' worth = 1,056,000 cells in 10,560 µL: 1,056 µL of suspension + 9,504 µL of medium.
 const r=seeding({cellsPerWell:10000,wells:96,overagePct:10,volumePerWell:q(100,'µL'),stock:q(1,'e6 cells/mL')});
 assert.equal(r.reason,'');
 near(r.result?.portions,105.6);near(r.result?.totalCells,1056000);
 nearQ(r.result?.totalVolume,10560,'µL');nearQ(r.result?.suspension,1056,'µL');nearQ(r.result?.medium,9504,'µL');
 nearQ(r.result?.mix,100000,'cells/mL');
 // 6 wells × 300,000 cells in 2 mL, no extra, suspension at 1.5 × 10⁶/mL: 1.8 × 10⁶ cells = 1.2 mL + 10.8 mL.
 const six=seeding({cellsPerWell:300000,wells:6,overagePct:null,volumePerWell:q(2,'mL'),stock:q(1.5,'e6 cells/mL')});
 near(six.result?.totalCells,1800000);nearQ(six.result?.suspension,1.2,'mL');nearQ(six.result?.medium,10.8,'mL');nearQ(six.result?.totalVolume,12,'mL');
 // Exactly the density of the suspension: no medium to add.
 const neat=seeding({cellsPerWell:100000,wells:4,overagePct:0,volumePerWell:q(1,'mL'),stock:q(100000,'cells/mL')});
 nearQ(neat.result?.suspension,4,'mL');assert.equal(neat.result?.medium.value,0);
});

test('seeding rejects impossible plates',()=>{
 const base={cellsPerWell:10000 as number|null,wells:96 as number|null,overagePct:10 as number|null,volumePerWell:q(100,'µL'),stock:q(1,'e6 cells/mL')};
 assert.match(seeding({...base,stock:q(50000,'cells/mL')}).reason,/too dilute/,'10,000 cells need 200 µL of this suspension, more than the 100 µL well');
 assert.equal(seeding({...base,cellsPerWell:0}).result,null);
 assert.equal(seeding({...base,cellsPerWell:-5}).result,null);
 assert.equal(seeding({...base,wells:0}).result,null);
 assert.equal(seeding({...base,wells:1.5}).result,null);
 assert.equal(seeding({...base,overagePct:-10}).result,null);
 assert.equal(seeding({...base,volumePerWell:q(0,'µL')}).result,null);
 assert.equal(seeding({...base,stock:q(0,'e6 cells/mL')}).result,null);
 assert.equal(seeding({...base,stock:q(1,'mM')}).result,null);
 assert.equal(seeding({...base,volumePerWell:q(100,'mg')}).result,null);
 assert.equal(seeding({...base,wells:null}).incomplete,true);
 assert.equal(seeding({...base,stock:q(null,'e6 cells/mL')}).incomplete,true);
});

test('haemocytometer: live cells/mL = mean count × dilution × 10⁴',()=>{
 // 52, 48, 61, 55 → mean 54; 1:1 trypan blue → 54 × 2 × 10⁴ = 1.08 × 10⁶ live cells/mL.
 const live=haemocytometer({live:[52,48,61,55],dilution:2});
 assert.equal(live.result?.squares,4);assert.equal(live.result?.meanLive,54);
 assert.equal(live.result?.livePerMl,1080000);assert.equal(live.result?.totalPerMl,1080000);
 assert.equal(live.result?.viability,null,'no dead counts, no viability');assert.equal(live.result?.meanDead,null);assert.equal(live.result?.deadPerMl,null);
 assert.equal(live.result?.totalLiveCells,null);assert.equal(live.result?.warning,null);
 // With 3, 2, 4, 3 dead: 216 live of 228 = 94.74 %; total 57 × 2 × 10⁴ = 1.14 × 10⁶/mL; in 5 mL: 5.4 × 10⁶ live.
 const both=haemocytometer({live:[52,48,61,55],dead:[3,2,4,3],dilution:2,volume:q(5,'mL')});
 assert.equal(both.result?.meanDead,3);assert.equal(both.result?.deadPerMl,60000);assert.equal(both.result?.totalPerMl,1140000);
 near(both.result?.viability,100*216/228);near(both.result?.totalLiveCells,5400000);near(both.result?.totalCells,5700000);
 // Suspension volume in another unit: 500 µL holds 540,000 live cells.
 near(haemocytometer({live:[54],dilution:2,volume:q(500,'µL')}).result?.totalLiveCells,540000);
 // Blank squares are left out of the mean; a blank dead count beside a live count is 0.
 const gaps=haemocytometer({live:[40,null,60,null],dead:[null,7,10,null],dilution:1});
 assert.equal(gaps.result?.squares,2);assert.equal(gaps.result?.meanLive,50);assert.equal(gaps.result?.livePerMl,500000);
 assert.equal(gaps.result?.meanDead,5);near(gaps.result?.viability,100*100/110);
});

test('haemocytometer warns outside 20 to 100 cells per square and rejects bad input',()=>{
 assert.equal(haemocytometer({live:[12,15,9,14],dilution:2}).result?.warning,'low');
 assert.equal(haemocytometer({live:[150,140,160,155],dilution:1}).result?.warning,'high');
 assert.equal(haemocytometer({live:[20,20],dilution:1}).result?.warning,null,'20 is inside the range');
 assert.equal(haemocytometer({live:[100],dilution:1}).result?.warning,null,'100 is inside the range');
 assert.equal(haemocytometer({live:[19],dilution:1}).result?.warning,'low');
 assert.equal(haemocytometer({live:[101],dilution:1}).result?.warning,'high');
 assert.equal(haemocytometer({live:[95],dead:[10],dilution:1}).result?.warning,'high','the range is about every cell counted in a square');
 const empty=haemocytometer({live:[0,0],dead:[0,0],dilution:2});
 assert.equal(empty.result?.livePerMl,0);assert.equal(empty.result?.viability,null,'no cells, no viability');assert.equal(empty.result?.warning,'low');
 assert.equal(haemocytometer({live:[0,0],dead:[5,5],dilution:1}).result?.viability,0);
 const none=haemocytometer({live:[null,null],dilution:2});
 assert.equal(none.result,null);assert.equal(none.incomplete,true);
 assert.equal(haemocytometer({live:[],dilution:2}).result,null);
 assert.equal(haemocytometer({live:[50],dilution:null}).incomplete,true);
 assert.match(haemocytometer({live:[50,-1],dilution:2}).reason,/negative/);
 assert.match(haemocytometer({live:[50],dead:[-2],dilution:2}).reason,/negative/);
 assert.equal(haemocytometer({live:[50],dilution:0}).result,null);
 assert.equal(haemocytometer({live:[50],dilution:0.5}).result,null);
 assert.equal(haemocytometer({live:[50],dilution:-2}).result,null);
 assert.equal(haemocytometer({live:[50],dilution:2,volume:q(0,'mL')}).result,null);
 assert.equal(haemocytometer({live:[50],dilution:2,volume:q(5,'g')}).result,null);
 assert.equal(haemocytometer({live:[NaN],dilution:2}).result,null);
 assert.equal(haemocytometer({live:[50],dilution:2,volume:q(null,'mL')}).result?.totalLiveCells,null,'a blank volume just leaves the total out');
});

test('molarity: mass = concentration × volume × molecular weight',()=>{
 // 1 M NaCl (58.44 g/mol) in 1 L: 58.44 g, 1 mol.
 const one=massToWeigh({concentration:q(1,'M'),volume:q(1,'L'),mw:58.44});
 nearQ(one.result?.mass,58.44,'g');nearQ(one.result?.moles,1,'mol');
 // 150 mM in 500 mL: 0.15 × 0.5 × 58.44 = 4.383 g.
 nearQ(massToWeigh({concentration:q(150,'mM'),volume:q(500,'mL'),mw:58.44}).result?.mass,4.383,'g');
 // 10 µM of a 500 g/mol compound in 10 mL: 1e-5 × 0.01 × 500 = 5e-5 g = 50 µg.
 const small=massToWeigh({concentration:q(10,'µM'),volume:q(10,'mL'),mw:500});
 near(small.result?.mass.value,0.00005);assert.equal(fmtQ(small.result?.mass),'50 µg');
 assert.equal(massToWeigh({concentration:q(null,'M'),volume:q(1,'L'),mw:58.44}).incomplete,true);
 assert.equal(massToWeigh({concentration:q(1,'M'),volume:q(1,'L'),mw:null}).incomplete,true);
 for(const bad of [{concentration:q(0,'M'),volume:q(1,'L'),mw:58.44},{concentration:q(1,'M'),volume:q(0,'L'),mw:58.44},{concentration:q(1,'M'),volume:q(1,'L'),mw:0},{concentration:q(-1,'M'),volume:q(1,'L'),mw:58.44},{concentration:q(1,'M'),volume:q(1,'L'),mw:-58.44},{concentration:q(1,'mg/mL'),volume:q(1,'L'),mw:58.44},{concentration:q(1,'M'),volume:q(1,'g'),mw:58.44}]){
  const r=massToWeigh(bad);assert.equal(r.result,null);assert.equal(r.incomplete,false);assert.ok(r.reason);
 }
});

test('molarity: moles from a mass, and concentration from mass and volume',()=>{
 // 5.844 g of NaCl is 0.1 mol; 180.16 mg of glucose (180.16 g/mol) is 1 mmol.
 nearQ(molesFromMass({mass:q(5.844,'g'),mw:58.44}).result,0.1,'mol');
 nearQ(molesFromMass({mass:q(180.16,'mg'),mw:180.16}).result,0.001,'mol');
 assert.equal(molesFromMass({mass:q(null,'g'),mw:58.44}).incomplete,true);
 assert.equal(molesFromMass({mass:q(1,'g'),mw:null}).incomplete,true);
 assert.equal(molesFromMass({mass:q(0,'g'),mw:58.44}).result,null);
 assert.equal(molesFromMass({mass:q(-1,'g'),mw:58.44}).result,null);
 assert.equal(molesFromMass({mass:q(1,'g'),mw:0}).result,null);
 assert.equal(molesFromMass({mass:q(1,'mL'),mw:58.44}).result,null);
 // 5.844 g of NaCl in 1 L is 0.1 M and 5.844 g/L; 2.922 g in 500 mL is the same.
 const c=concentrationFrom({mass:q(5.844,'g'),volume:q(1,'L'),mw:58.44});
 nearQ(c.result?.molar,0.1,'M');nearQ(c.result?.massvol,5.844,'g/L');
 nearQ(concentrationFrom({mass:q(2.922,'g'),volume:q(500,'mL'),mw:58.44}).result?.molar,0.1,'M');
 // 1 mg of a 500 g/mol compound in 200 µL: 0.002 mmol / 0.2 mL = 10 mM.
 nearQ(concentrationFrom({mass:q(1,'mg'),volume:q(200,'µL'),mw:500}).result?.molar,0.01,'M');
 assert.equal(concentrationFrom({mass:q(1,'g'),volume:q(null,'L'),mw:58.44}).incomplete,true);
 assert.equal(concentrationFrom({mass:q(1,'g'),volume:q(0,'L'),mw:58.44}).result,null,'no division by a zero volume');
 assert.equal(concentrationFrom({mass:q(0,'g'),volume:q(1,'L'),mw:58.44}).result,null);
 assert.equal(concentrationFrom({mass:q(1,'g'),volume:q(1,'L'),mw:0}).result,null);
 assert.equal(concentrationFrom({mass:q(1,'g'),volume:q(-1,'L'),mw:58.44}).result,null);
});

test('recipe: stock volumes, powder masses and the solvent to top up',()=>{
 // 50 mL of lysis buffer.
 const ripa={volume:q(50,'mL'),components:[
  {name:'NaCl',mode:'stock' as const,desired:q(150,'mM'),stock:q(5,'M')},          // 50 × 0.15/5 = 1.5 mL
  {name:'Tris pH 8',mode:'stock' as const,desired:q(50,'mM'),stock:q(1,'M')},      // 50 × 0.05 = 2.5 mL
  {name:'NP-40',mode:'stock' as const,desired:q(1,'%'),stock:q(10,'%')},           // 50 × 0.1 = 5 mL
  {name:'Inhibitors',mode:'stock' as const,desired:q(1,'x'),stock:q(100,'x')},     // 50 / 100 = 0.5 mL
  {name:'SDS',mode:'powder' as const,desired:q(0.1,'%')},                          // 0.1 g/100 mL × 50 mL = 0.05 g
  {name:'EDTA',mode:'powder' as const,desired:q(1,'mM'),mw:372.24},                // 0.001 × 0.05 × 372.24 = 0.018612 g
  {name:'BSA',mode:'powder' as const,desired:q(2,'mg/mL')},                        // 2 g/L × 0.05 L = 0.1 g
 ]};
 const r=recipe(ripa);
 assert.equal(r.reason,'');
 [1.5,2.5,5,0.5].forEach((v,k)=>nearQ(r.lines[k].amount,v,'mL'));
 nearQ(r.lines[4].amount,0.05,'g');nearQ(r.lines[5].amount,0.018612,'g');nearQ(r.lines[6].amount,0.1,'g');
 nearQ(r.liquid,9.5,'mL');nearQ(r.solvent,40.5,'mL');
 assert.deepEqual(r.lines.map(l=>l.name),ripa.components.map(c=>c.name));
 // Rescaling is a new final volume: 200 mL is four times everything.
 const big=recipe({...ripa,volume:q(200,'mL')});
 nearQ(big.lines[0].amount,6,'mL');nearQ(big.lines[4].amount,0.2,'g');nearQ(big.solvent,162,'mL');
 // The final volume's unit carries through: 0.05 L.
 nearQ(recipe({...ripa,volume:q(0.05,'L')}).solvent,0.0405,'L');
 // 150 mM NaCl weighed for 1 L: 8.766 g. From a 2 mg/mL stock to 100 µg/mL in 10 mL: 0.5 mL.
 nearQ(recipe({volume:q(1,'L'),components:[{name:'NaCl',mode:'powder',desired:q(150,'mM'),mw:58.44}]}).lines[0].amount,8.766,'g');
 nearQ(recipe({volume:q(10,'mL'),components:[{name:'Ab',mode:'stock',desired:q(100,'µg/mL'),stock:q(2,'mg/mL')}]}).lines[0].amount,0.5,'mL');
 // Molar wanted from a mass-per-volume stock needs the molecular weight: 1 mM of 500 g/mol is 0.5 g/L; from 5 g/L, 1 in 10.
 nearQ(recipe({volume:q(10,'mL'),components:[{name:'Drug',mode:'stock',desired:q(1,'mM'),stock:q(5,'mg/mL'),mw:500}]}).lines[0].amount,1,'mL');
 // Nothing but solvent, and stocks that fill the volume exactly.
 nearQ(recipe({volume:q(10,'mL'),components:[]}).solvent,10,'mL');
 const full=recipe({volume:q(10,'mL'),components:[{name:'A',mode:'stock',desired:q(1,'x'),stock:q(2,'x')},{name:'B',mode:'stock',desired:q(5,'x'),stock:q(10,'x')}]});
 assert.equal(full.solvent?.value,0);assert.equal(full.reason,'');
});

test('recipe: unfinished lines stay blank and impossible ones say why',()=>{
 const one=(c:Parameters<typeof recipe>[0]['components'][number],volume=q(50,'mL'))=>recipe({volume,components:[c]});
 const over=recipe({volume:q(10,'mL'),components:[{name:'A',mode:'stock',desired:q(6,'x'),stock:q(10,'x')},{name:'B',mode:'stock',desired:q(5,'x'),stock:q(10,'x')}]});
 assert.equal(over.solvent,null);assert.match(over.reason,/more than the final volume/);nearQ(over.liquid,11,'mL');
 const high=one({name:'NaCl',mode:'stock',desired:q(6,'M'),stock:q(5,'M')});
 assert.equal(high.lines[0].amount,null);assert.match(high.lines[0].reason,/higher than the stock/);assert.equal(high.solvent,null);
 assert.match(one({name:'X',mode:'stock',desired:q(1,'mM'),stock:q(10,'%')}).lines[0].reason,/same kind of unit/);
 assert.match(one({name:'X',mode:'stock',desired:q(1,'mM'),stock:q(5,'mg/mL')}).lines[0].reason,/molecular weight/);
 assert.match(one({name:'X',mode:'powder',desired:q(1,'mM')}).lines[0].reason,/molecular weight/);
 assert.match(one({name:'X',mode:'powder',desired:q(1,'mM'),mw:0}).lines[0].reason,/greater than zero/);
 assert.match(one({name:'X',mode:'powder',desired:q(1,'x')}).lines[0].reason,/powder/);
 assert.match(one({name:'X',mode:'stock',desired:q(0,'mM'),stock:q(1,'M')}).lines[0].reason,/greater than zero/);
 assert.match(one({name:'X',mode:'stock',desired:q(1,'mM'),stock:q(0,'M')}).lines[0].reason,/greater than zero/);
 assert.match(one({name:'X',mode:'stock',desired:q(-1,'mM'),stock:q(1,'M')}).lines[0].reason,/greater than zero/);
 assert.match(one({name:'X',mode:'powder',desired:q(-1,'%')}).lines[0].reason,/greater than zero/);
 const blank=one({name:'X',mode:'stock',desired:q(null,'mM'),stock:q(1,'M')});
 assert.equal(blank.lines[0].amount,null);assert.equal(blank.lines[0].reason,'');assert.equal(blank.solvent,null);assert.equal(blank.reason,'');
 assert.equal(one({name:'X',mode:'stock',desired:q(1,'mM')}).lines[0].amount,null);
 // A blank powder does not hold up the solvent volume.
 nearQ(one({name:'X',mode:'powder',desired:q(null,'mM'),mw:100}).solvent,50,'mL');
 const noVolume=one({name:'X',mode:'stock',desired:q(1,'mM'),stock:q(1,'M')},q(null,'mL'));
 assert.equal(noVolume.lines[0].amount,null);assert.equal(noVolume.solvent,null);assert.equal(noVolume.reason,'');
 assert.match(one({name:'X',mode:'stock',desired:q(1,'mM'),stock:q(1,'M')},q(0,'mL')).reason,/greater than zero/);
 assert.match(one({name:'X',mode:'stock',desired:q(1,'mM'),stock:q(1,'M')},q(-5,'mL')).reason,/greater than zero/);
 assert.ok(one({name:'X',mode:'stock',desired:q(1,'mM'),stock:q(1,'M')},q(5,'g')).reason);
});

test('master mix: per reaction × reactions × (1 + overage)',()=>{
 // 24 reactions of 20 µL with 10 % extra: 26.4 reactions' worth.
 const pcr=masterMix({reactions:24,reactionVolume:q(20,'µL'),overage:{mode:'percent',value:10},fill:true,reagents:[
  {name:'2× mix',perReaction:q(10,'µL')},                               // 264 µL
  {name:'Primer F',stock:q(10,'µM'),final:q(0.5,'µM')},                 // 20 × 0.05 = 1 µL → 26.4 µL
  {name:'Primer R',stock:q(10,'µM'),final:q(500,'nM')},                 // the same, across units
  {name:'Template',perReaction:q(2,'µL')},                              // 52.8 µL
 ]});
 assert.equal(pcr.reason,'');near(pcr.result?.portions,26.4);
 nearQ(pcr.result?.lines[0].perReaction,10,'µL');nearQ(pcr.result?.lines[0].total,264,'µL');
 nearQ(pcr.result?.lines[1].perReaction,1,'µL');nearQ(pcr.result?.lines[1].total,26.4,'µL');
 nearQ(pcr.result?.lines[2].perReaction,1,'µL');nearQ(pcr.result?.lines[2].total,26.4,'µL');
 nearQ(pcr.result?.lines[3].total,52.8,'µL');
 nearQ(pcr.result?.fill?.perReaction,6,'µL');nearQ(pcr.result?.fill?.total,158.4,'µL');   // 20 − 14 = 6 µL of water
 nearQ(pcr.result?.perReaction,20,'µL');nearQ(pcr.result?.total,528,'µL');assert.equal(pcr.result?.reason,'');
 // Extra reactions instead of a percentage: 24 + 2 = 26.
 const extra=masterMix({reactions:24,reactionVolume:q(20,'µL'),overage:{mode:'reactions',value:2},fill:false,reagents:[{name:'2× mix',perReaction:q(10,'µL')}]});
 assert.equal(extra.result?.portions,26);nearQ(extra.result?.lines[0].total,260,'µL');
 assert.equal(extra.result?.fill,null);nearQ(extra.result?.perReaction,10,'µL');nearQ(extra.result?.total,260,'µL');
 // No overage; a reagent keeps its own unit and still counts towards the fill: 0.05 mL − 5 µL − 0.02 mL = 25 µL.
 const mixed=masterMix({reactions:8,reactionVolume:q(0.05,'mL'),overage:{mode:'percent',value:null},fill:true,reagents:[{name:'Enzyme',perReaction:q(5,'µL')},{name:'Buffer',perReaction:q(0.02,'mL')}]});
 assert.equal(mixed.result?.portions,8);nearQ(mixed.result?.lines[0].total,40,'µL');nearQ(mixed.result?.lines[1].total,0.16,'mL');
 nearQ(mixed.result?.fill?.perReaction,0.025,'mL');nearQ(mixed.result?.total,0.4,'mL');
 // Stock and final concentration win over a typed volume.
 nearQ(masterMix({reactions:1,reactionVolume:q(50,'µL'),overage:{mode:'percent',value:0},fill:false,reagents:[{name:'dNTP',perReaction:q(9,'µL'),stock:q(10,'mM'),final:q(200,'µM')}]}).result?.lines[0].perReaction,1,'µL');
 // Reagents that fill the reaction exactly leave nothing to add.
 assert.equal(masterMix({reactions:2,reactionVolume:q(20,'µL'),overage:{mode:'percent',value:0},fill:true,reagents:[{name:'A',perReaction:q(20,'µL')}]}).result?.fill?.perReaction?.value,0);
});

test('master mix: rejects impossible setups and flags volumes that do not fit',()=>{
 const base={reactions:24 as number|null,reactionVolume:q(20,'µL'),overage:{mode:'percent' as const,value:10 as number|null},fill:true,reagents:[{name:'Mix',perReaction:q(10,'µL')}]};
 const over=masterMix({...base,reagents:[{name:'Mix',perReaction:q(15,'µL')},{name:'Template',perReaction:q(8,'µL')}]});
 assert.equal(over.result?.fill?.perReaction,null);assert.match(over.result?.reason??'',/more than the reaction volume/);assert.equal(over.result?.total,null);
 nearQ(over.result?.lines[0].total,396,'µL');
 const overNoFill=masterMix({...base,fill:false,reagents:[{name:'Mix',perReaction:q(25,'µL')}]});
 assert.match(overNoFill.result?.reason??'',/more than the reaction volume/);nearQ(overNoFill.result?.total,660,'µL');
 const high=masterMix({...base,reagents:[{name:'Primer',stock:q(1,'µM'),final:q(2,'µM')}]});
 assert.equal(high.result?.lines[0].total,null);assert.match(high.result?.lines[0].reason??'',/higher than the stock/);assert.equal(high.result?.fill?.perReaction,null);assert.equal(high.result?.total,null);
 assert.match(masterMix({...base,reagents:[{name:'P',stock:q(1,'µM'),final:q(1,'%')}]}).result?.lines[0].reason??'',/same kind of unit/);
 assert.match(masterMix({...base,reagents:[{name:'P',perReaction:q(0,'µL')}]}).result?.lines[0].reason??'',/greater than zero/);
 assert.match(masterMix({...base,reagents:[{name:'P',perReaction:q(-1,'µL')}]}).result?.lines[0].reason??'',/greater than zero/);
 assert.match(masterMix({...base,reagents:[{name:'P',stock:q(0,'µM'),final:q(1,'µM')}]}).result?.lines[0].reason??'',/greater than zero/);
 const blank=masterMix({...base,reagents:[{name:'P',perReaction:q(null,'µL')}]});
 assert.equal(blank.result?.lines[0].total,null);assert.equal(blank.result?.lines[0].reason,'');assert.equal(blank.result?.total,null);
 assert.equal(masterMix({...base,reactions:null}).incomplete,true);
 assert.equal(masterMix({...base,reactionVolume:q(null,'µL')}).incomplete,true);
 for(const bad of [{...base,reactions:0},{...base,reactions:-3},{...base,reactions:2.5},{...base,reactionVolume:q(0,'µL')},{...base,reactionVolume:q(-20,'µL')},{...base,reactionVolume:q(20,'mg')},{...base,overage:{mode:'percent' as const,value:-5}},{...base,overage:{mode:'reactions' as const,value:-1}}]){
  const r=masterMix(bad);assert.equal(r.result,null);assert.equal(r.incomplete,false);assert.ok(r.reason);
 }
});

test('calibration curve: least-squares line, R² and reading unknowns',()=>{
 // An exact line: y = 2x + 1.
 const exact=linearFit([{x:1,y:3},{x:2,y:5},{x:3,y:7}]);
 near(exact?.slope,2);near(exact?.intercept,1);near(exact?.r2,1);assert.equal(exact?.n,3);
 near(predictY(exact,4),9);near(predictX(exact,9),4);near(predictX(exact,1),0);
 // (1,2) (2,3) (3,5): slope 3/2, intercept 1/3, R² = 1 − (1/6)/(14/3) = 27/28.
 const noisy=linearFit([{x:1,y:2},{x:2,y:3},{x:3,y:5}]);
 near(noisy?.slope,1.5);near(noisy?.intercept,1/3);near(noisy?.r2,27/28);
 near(predictY(noisy,2),10/3);near(predictX(noisy,10/3),2);
 // The same points through the origin: slope Σxy/Σx² = 23/14, R² = 1 − (3/14)/38.
 const origin=linearFit([{x:1,y:2},{x:2,y:3},{x:3,y:5}],true);
 near(origin?.slope,23/14);assert.equal(origin?.intercept,0);near(origin?.r2,1-(3/14)/38);assert.equal(origin?.throughOrigin,true);
 near(predictX(origin,23/14),1);
 // A BSA standard curve: 0, 0.25, 0.5, 1, 2 mg/mL reading 0.05, 0.175, 0.3, 0.55, 1.05: A = 0.5c + 0.05 exactly.
 const bsa=linearFit([{x:0,y:0.05},{x:0.25,y:0.175},{x:0.5,y:0.3},{x:1,y:0.55},{x:2,y:1.05}]);
 near(bsa?.slope,0.5);near(bsa?.intercept,0.05);near(predictX(bsa,0.425),0.75,'an unknown reading 0.425 is 0.75 mg/mL');
 // A falling line.
 const down=linearFit([{x:0,y:10},{x:5,y:0}]);
 near(down?.slope,-2);near(down?.intercept,10);near(predictX(down,4),3);
});

test('calibration curve: no fit without enough distinct standards',()=>{
 assert.equal(linearFit([]),null);
 assert.equal(linearFit([{x:1,y:2}]),null);
 assert.equal(linearFit([{x:1,y:2},{x:1,y:3},{x:1,y:4}]),null,'three readings of one standard are one x value');
 assert.equal(linearFit([{x:NaN,y:1},{x:2,y:Infinity},{x:1,y:2}]),null,'points that are not numbers are left out');
 assert.ok(linearFit([{x:1,y:2},{x:NaN,y:9},{x:2,y:4}]));
 near(linearFit([{x:2,y:5}],true)?.slope,2.5,'one standard is enough through the origin');
 assert.equal(linearFit([{x:0,y:5}],true),null,'but not a standard at zero');
 assert.equal(linearFit([],true),null);
 // A flat line has no R² and no x to read off.
 const flat=linearFit([{x:1,y:4},{x:2,y:4},{x:3,y:4}]);
 assert.equal(flat?.slope,0);assert.equal(flat?.intercept,4);assert.equal(flat?.r2,null);
 assert.equal(predictX(flat,4),null);assert.equal(predictY(flat,10),4);
 assert.equal(predictX(null,1),null);assert.equal(predictY(null,1),null);
 const fit=linearFit([{x:1,y:3},{x:2,y:5}]);
 assert.equal(predictX(fit,null),null);assert.equal(predictY(fit,null),null);assert.equal(predictY(fit,NaN),null);
 near(predictX(fit,-1),-1,'an unknown below the blank reads below zero, and is shown as such');
});

test('two pasted columns become standards',()=>{
 assert.deepEqual(parsePairs('0\t0.05\n0.5\t0.3\n1\t0.55'),[{x:0,y:0.05},{x:0.5,y:0.3},{x:1,y:0.55}]);
 assert.deepEqual(parsePairs('Conc\tA595\r\n0,5\t0,3\r\n\r\n1\t0,55\r\n'),[{x:0.5,y:0.3},{x:1,y:0.55}],'header skipped, decimal commas read');
 assert.deepEqual(parsePairs('1;2\n3;4'),[{x:1,y:2},{x:3,y:4}]);
 assert.deepEqual(parsePairs('1 2\n3   4'),[{x:1,y:2},{x:3,y:4}]);
 assert.deepEqual(parsePairs('1,2\n3,4'),[{x:1,y:2},{x:3,y:4}]);
 assert.deepEqual(parsePairs('1\t\n\t2\n5'),[]);
 assert.deepEqual(parsePairs(''),[]);
 assert.deepEqual(parsePairs('1\t2\t3'),[{x:1,y:2}],'extra columns are ignored');
});

test('axis ticks are round numbers that cover the data',()=>{
 assert.deepEqual(niceTicks(0,2),[0,0.5,1,1.5,2]);
 assert.deepEqual(niceTicks(0,1.05),[0,0.5,1,1.5]);
 assert.deepEqual(niceTicks(3,97),[0,20,40,60,80,100]);
 assert.deepEqual(niceTicks(-1,1),[-1,-0.5,0,0.5,1]);
 assert.deepEqual(niceTicks(5,5),[0,2,4,6,8,10]);
 assert.deepEqual(niceTicks(2,0),[0,0.5,1,1.5,2]);
 assert.deepEqual(niceTicks(NaN,1),[]);
});

test('no result ever holds NaN or Infinity',()=>{
 const values=[null,0,-1,1,1e-320,1e308,NaN,Infinity];
 const units=['mL','mM','%','x','mg/mL','e6 cells/mL','g','nonsense'];
 for(const a of values) for(const b of values) for(const u of units){
  for(const out of [
   dilution({c1:q(a,u),v1:q(b,'mL'),c2:q(1,u),v2:q(null,'L')}),
   dilution({c1:q(a,u),v1:q(null,'fL'),c2:q(b,u),v2:q(1e308,'L')}),
   serialSeries({start:q(a,u),factors:Array(48).fill(b),volume:q(b,'mL'),volumeIs:'transfer'}),
   serialSeries({start:q(a,u),factors:[b,a],volume:q(1,'L'),volumeIs:'tube'}),
   stepFactor({start:q(a,u),target:q(b,u),steps:48}),stepsToReach({start:q(a,u),target:q(b,u),factor:a}),
   reverseDilution({c1:q(a,u),stock:q(b,'fL'),solvent:q(a,'L')}),
   makeSolution({mw:b,concentration:q(a,u),volume:q(1e308,'L')}),
   seeding({cellsPerWell:a,wells:3,overagePct:b,volumePerWell:q(1e308,'L'),stock:q(a,'cells/fL')}),
   haemocytometer({live:[a,b],dead:[b,a],dilution:b,volume:q(a,'L')}),
   massToWeigh({concentration:q(a,'M'),volume:q(b,'L'),mw:a}),
   molesFromMass({mass:q(a,'kg'),mw:b}),
   concentrationFrom({mass:q(a,'kg'),volume:q(b,'fL'),mw:1e-300}),
   recipe({volume:q(a,'L'),components:[{name:'',mode:'stock',desired:q(b,u),stock:q(a,u),mw:b},{name:'',mode:'powder',desired:q(b,u),mw:a}]}),
   masterMix({reactions:3,reactionVolume:q(a,'L'),overage:{mode:'percent',value:b},fill:true,reagents:[{name:'',perReaction:q(b,'L')},{name:'',stock:q(a,u),final:q(b,u)}]}),
   convert(a,u,'mL',b),convert(a,'M','pg/L',b),
  ]) assert.ok(finite(out),`${a} ${b} ${u}: ${JSON.stringify(out)}`);
 }
 const wild=[{x:1e308,y:1e308},{x:-1e308,y:1e308},{x:1e-320,y:3}];
 for(const o of [false,true]){const f=linearFit(wild,o);assert.ok(finite(f),JSON.stringify(f));assert.ok(finite(predictX(f,1e308)));assert.ok(finite(predictY(f,1e308)))}
});
