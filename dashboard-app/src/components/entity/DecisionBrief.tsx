import { useState } from "react";
import { ArrowUpRight, Calculator, CheckCheck, Compass, Sparkles } from "lucide-react";
import { calculateBudget, fitLabels, moneyKeys, parseBudgetRange, type Basis, type Claim, type DecisionBrief, type MoneyKey, type Range } from "../../lib/decision";
import { convertedRange, type CurrencyConversion } from "../../lib/currency";
import { formatDate } from "../../lib/format";
import { safeUrl, type OpportunityContext } from "./OpportunityContext";

const basisLabels: Record<Basis,string> = {listing:"Listing",source:"Sourced",general:"Model background · unverified",estimate:"AI estimate",unknown:"Needs checking"};
const labels: Record<string,string> = { role:"The work & requirements", contract:"Contract & funding", institution:"Institution & research environment", place:"City & neighbourhood context", population:"Population", climate:"Typical climate", transport:"Getting around", living:"Housing & everyday life", inclusion:"Inclusion & support", visa:"Visa & right to work", tax:"Tax & social contributions", career:"Career value", relocation:"Relocation checklist" };
const amountLabels: Record<MoneyKey,string> = {gross:"Gross pay",deductions:"Tax + employee contributions",rent:"Rent",essentials:"Other essentials",upfront:"One-off relocation & deposit"};
const formatAmount = (value:number,currency:string|null) => {
 if (!currency) return value.toLocaleString();
 try { return new Intl.NumberFormat(undefined,{style:"currency",currency,maximumFractionDigits:0}).format(value); }
 catch { return `${currency} ${value.toLocaleString()}`; }
};
const formatRange=(range:Range|null,currency:string|null)=>range
 ? `${formatAmount(range.low,currency)}${range.low!==range.high?` – ${formatAmount(range.high,currency)}`:""}`:"Needs inputs";

function Citations({ids,context}:{ids:number[];context:OpportunityContext}) {
 return <span className="brief-citations">{ids.map(id=>{
  const source=context.sources?.[id-1],url=safeUrl(source?.url);
  return url?<a key={id} href={url} target="_blank" rel="noopener noreferrer" title={source?.label}>[{id}]</a>:null;
 })}</span>;
}
function BriefClaim({name,claim,context}:{name:string;claim?:Claim;context:OpportunityContext}) {
 if(!claim?.text)return null;
 return <div className="brief-claim">
  <div className="brief-claim-heading"><h4>{labels[name]??name}</h4><small className={`claim-basis basis-${claim.basis}`}>{basisLabels[claim.basis]??"Needs checking"}</small></div>
  <p>{claim.text} <Citations ids={claim.source_ids??[]} context={context}/></p>
 </div>;
}

function Budget({brief,context,currencyConversion}:{brief:DecisionBrief;context:OpportunityContext;currencyConversion?:CurrencyConversion|null}) {
 const initial=()=>Object.fromEntries(moneyKeys.map(key=>[key,{low:brief.money[key]?.low?.toString()??"",high:brief.money[key]?.high?.toString()??""}])) as Record<MoneyKey,{low:string;high:string}>;
 const [values,setValues]=useState(initial);
 const [edited,setEdited]=useState(false);
 const ranges=Object.fromEntries(moneyKeys.map(key=>[key,parseBudgetRange(values[key].low,values[key].high)])) as Record<MoneyKey,Range|null>;
 const result=calculateBudget(ranges);
 const currency=brief.money.currency;
 const candidate=brief.currency_conversion??currencyConversion??null;
 const conversion=candidate&&currency&&candidate.fromCurrency===currency&&candidate.toCurrency!==currency?candidate:null;
 const home=(range:Range|null)=>{
  const converted=convertedRange(range,conversion);
  return converted&&conversion?`≈${formatRange(converted,conversion.toCurrency)}`:null;
 };
 const netHome=home(result.net),savingsHome=home(result.savings),upfrontHome=home(ranges.upfront),firstYearHome=home(result.firstYear);
 const set=(key:MoneyKey,bound:"low"|"high",value:string)=>{setEdited(true);setValues(prev=>({...prev,[key]:{...prev[key],[bound]:value}}))};
 const changed=(key:MoneyKey)=>values[key].low!==(brief.money[key]?.low?.toString()??"")||values[key].high!==(brief.money[key]?.high?.toString()??"");
 return <section className="brief-budget" data-no-swipe aria-label="Monthly budget scenario">
  <div className="brief-block-heading"><Calculator/><div><h3>What could you save?</h3><p>Monthly planning ranges{currency?` · ${currency}`:""} · {edited?"Your adjusted scenario":"AI-assisted scenario"}</p></div></div>
  <p className="brief-budget-assumption">{brief.money.salary_basis==="typical_estimate"?"Pay is an estimated market range, not a salary offered by this employer.":brief.money.salary_basis==="pay_scale"?"Pay uses a scale assumption; confirm grade and step with HR.":brief.money.salary_basis==="listed"?"Pay is based on the listing; confirm the final contract with HR.":"Employer pay is not established."}
   {brief.money.contract_percent!==null&&` ${brief.money.contract_percent}% guaranteed contract assumed; any possible uplift is excluded.`}
  </p>
  {conversion&&<p className="currency-rate-note">Approximate {conversion.toCurrency} comparisons use the <a href={safeUrl(conversion.sourceUrl)??undefined} target="_blank" rel="noopener noreferrer">daily exchange rate</a> dated {conversion.asOf}. The destination-currency amounts remain authoritative.</p>}
  <div className="budget-results" aria-live="polite">
   <div><span>Take-home / month</span><strong>{currency?formatRange(result.net,currency):"Currency not established"}</strong>{netHome&&<small className="currency-conversion">{netHome} in {conversion?.toCurrency}</small>}<small>Gross minus estimated payroll deductions</small></div>
   <div className={result.savings&&result.savings.low<0?"budget-shortfall":"budget-saving"}><span>Possible savings / month</span><strong>{currency?formatRange(result.savings,currency):"Currency not established"}</strong>{savingsHome&&<small className="currency-conversion">{savingsHome} in {conversion?.toCurrency}</small>}<small>{result.savings&&result.savings.low<0?"Lower scenario has a shortfall":"After rent and everyday essentials"}</small></div>
  </div>
  <p className="muted-note">These are estimates, not a payroll calculation. The lower scenario pairs lower pay with higher costs. Missing amounts are never treated as zero. Remittances, debts and optional spending are extra.</p>
  <details className="budget-inputs">
   <summary>Adjust pay, taxes & living costs</summary>
   <p>Enter monthly amounts in {currency??"the destination currency (not yet established)"}. Relocation is a one-off amount. Adjustments stay in this card while you review it.</p>
   <div className="budget-input-heading"><span>Amount</span><span>Lower</span><span>Upper</span></div>
   {moneyKeys.map(key=><div className="budget-input-row" key={key}>
    <div><strong>{amountLabels[key]}</strong><small>{changed(key)?"Your input":basisLabels[brief.money[key]?.basis??"unknown"]} {!changed(key)&&<Citations ids={brief.money[key]?.source_ids??[]} context={context}/>}</small></div>
    <input className="input" type="number" inputMode="decimal" min={0} step="any" disabled={!currency} value={values[key].low} aria-label={`${amountLabels[key]} lower amount`} onChange={e=>set(key,"low",e.target.value)}/>
    <input className="input" type="number" inputMode="decimal" min={0} step="any" disabled={!currency} value={values[key].high} aria-label={`${amountLabels[key]} upper amount`} onChange={e=>set(key,"high",e.target.value)}/>
    {brief.money[key]?.note&&<p>{brief.money[key]?.note}</p>}
    {(values[key].low||values[key].high)&&!ranges[key]&&<p className="budget-error">Enter both amounts, with the upper amount at least as large as the lower.</p>}
   </div>)}
   {ranges.gross&&ranges.deductions&&ranges.deductions.high>ranges.gross.high&&<p className="budget-error">Payroll deductions exceed gross pay. Check the amounts before comparing savings.</p>}
   <button className="secondary" type="button" onClick={()=>{setValues(initial());setEdited(false)}}>Reset to assessment</button>
  </details>
  {brief.money.assumptions?.length>0&&<details><summary>Assumptions & exclusions</summary><ul>{brief.money.assumptions.map((text,i)=><li key={i}>{text}</li>)}</ul></details>}
  <details><summary>One-off costs & 12-month comparison</summary>
   <p>Upfront cash needed: <strong>{formatRange(ranges.upfront,currency)}</strong>{upfrontHome&&<> ({upfrontHome} in {conversion?.toCurrency})</>}. A rental deposit is tied-up cash, and may be refundable.</p>
   <p>Hypothetical 12-month cash remaining after upfront costs: <strong>{formatRange(result.firstYear,currency)}</strong>{firstYearHome&&<> ({firstYearHome} in {conversion?.toCurrency})</>}.</p>
   <p>This assumes the same income and expenses for all 12 months. A shorter contract, tax adjustment or job gap changes the result; a possible extension is not guaranteed.</p>
  </details>
 </section>;
}

export function DecisionBriefView({context,currencyConversion}:{context:OpportunityContext;currencyConversion?:CurrencyConversion|null}) {
 const brief=context.brief;
 if(!brief||brief.version<2)return null;
 const sections=brief.sections??{};
 const verdict=brief.fit?.verdict??"unknown";
 const group=(title:string,keys:string[],open=false)=><details className="brief-group" open={open||undefined}>
  <summary>{title}</summary><div className="brief-claims">{keys.map(key=><BriefClaim key={key} name={key} claim={sections[key]} context={context}/>)}</div>
 </details>;
 return <section className="decision-brief" aria-label="Opportunity decision brief">
  <header className="brief-heading"><div><Sparkles/><span><strong>Your opportunity brief</strong><small>Research, relocation & finances in one place</small></span></div>
   {context.generated_at&&<small>Assessed {formatDate(context.generated_at)}</small>}
  </header>
  <section className={`brief-fit fit-${verdict}`}>
   <div className="brief-block-heading"><Compass/><h3>{fitLabels[verdict]??fitLabels.unknown}</h3><small>AI assessment</small></div>
   <p>{brief.fit?.reason}</p>
   <div className="brief-fit-columns">
    {brief.fit?.strengths?.length>0&&<div><h4>Potential strengths</h4><ul>{brief.fit.strengths.map((s,i)=><li key={i}>{s}</li>)}</ul></div>}
    {brief.fit?.gaps?.length>0&&<div><h4>Gaps & tradeoffs</h4><ul>{brief.fit.gaps.map((s,i)=><li key={i}>{s}</li>)}</ul></div>}
   </div>
  </section>
  <div className="brief-claims brief-essentials">{["role","contract"].map(key=><BriefClaim key={key} name={key} claim={sections[key]} context={context}/>)}</div>
  <Budget key={context.generated_at} brief={brief} context={context} currencyConversion={currencyConversion}/>
  {group("Visa, taxes & relocation",["visa","tax","relocation"],true)}
  {group("Institution & career value",["institution","career"])}
  {group("Life in this city",["place","population","climate","transport","living","inclusion"])}
  <details className="brief-group"><summary><CheckCheck/>Questions & next steps</summary>
   <div className="brief-fit-columns"><div><h4>Ask the PI or HR</h4><ul>{brief.questions?.map((s,i)=><li key={i}>{s}</li>)}</ul></div>
    <div><h4>Before applying or relocating</h4><ol>{brief.next_steps?.map((s,i)=><li key={i}>{s}</li>)}</ol></div></div>
  </details>
  <details className="brief-group brief-sources"><summary>Sources & assessment preferences</summary>
   <p>Interests: {brief.preferences?.interests?.join(", ")||"Not specified"}. Nationality: {brief.preferences?.nationality||"Not specified"}. Residence: {brief.preferences?.residence||"Not specified"}. Household: {brief.preferences?.household??1}; {brief.preferences?.housing??"shared"} housing.</p>
   <p>Preferences shown here belong to this assessment. Saving new preferences makes the card eligible for the next context backfill.</p>
   <h4>Sources read for this assessment</h4>
   {(context.sources??[]).map((source,i)=>{const url=safeUrl(source.url);return <div key={i}>{url?<a href={url} target="_blank" rel="noopener noreferrer">[{i+1}] {source.label}<ArrowUpRight/></a>:<span>[{i+1}] {source.label}</span>}{source.checked_at&&<small> Read {formatDate(source.checked_at)}</small>}</div>})}
   {(context.references??[]).length>0&&<><h4>Official guidance to check</h4><p>Reference links are starting points. Only pages listed above were read; requirements may have changed.</p>
    {context.references?.map((source,i)=>{const url=safeUrl(source.url);return url?<a key={i} href={url} target="_blank" rel="noopener noreferrer">{source.label}<ArrowUpRight/></a>:null})}</>}
  </details>
 </section>;
}
