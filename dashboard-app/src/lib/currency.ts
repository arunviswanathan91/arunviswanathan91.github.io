import type { Row } from "../entities/types";

export interface CurrencyConversion {
 fromCurrency:string;
 toCurrency:string;
 rate:number;
 asOf:string;
 sourceUrl:string;
 provider:"fawazahmed0/exchange-api";
 display?:string;
}

const validConversion=(value:unknown):value is CurrencyConversion=>{
 if(!value||typeof value!=="object"||Array.isArray(value))return false;
 const v=value as Record<string,unknown>;
 return typeof v.fromCurrency==="string"&&/^[A-Z]{3}$/.test(v.fromCurrency)
  &&typeof v.toCurrency==="string"&&/^[A-Z]{3}$/.test(v.toCurrency)
  &&typeof v.rate==="number"&&Number.isFinite(v.rate)&&v.rate>0
  &&typeof v.asOf==="string"&&/^\d{4}-\d{2}-\d{2}$/.test(v.asOf)
  &&typeof v.sourceUrl==="string"&&/^https:\/\//.test(v.sourceUrl)
  &&v.provider==="fawazahmed0/exchange-api";
};

export const currencyConversionFor=(row:Row):CurrencyConversion|null=>{
 const score=row.score_breakdown;
 if(!score||typeof score!=="object")return null;
 const direct=score.currency_conversion;
 if(validConversion(direct))return direct;
 const context=score.context;
 const brief=context&&typeof context==="object"?context.brief:null;
 const nested=brief&&typeof brief==="object"?brief.currency_conversion:null;
 return validConversion(nested)?nested:null;
};

export const salaryDisplayFor=(row:Row):string=>{
 const original=String(row.salary_display??"").trim();
 const converted=currencyConversionFor(row)?.display?.trim();
 return [original,converted].filter(Boolean).join(" · ");
};

export const convertedRange=(range:{low:number;high:number}|null,conversion:CurrencyConversion|null)=>
 range&&conversion?{low:range.low*conversion.rate,high:range.high*conversion.rate}:null;
