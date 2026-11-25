// Style proxies. These describe the prose; they are not a detector and not an AI score.
import {sentences} from "./rules.ts";
export interface StyleMetrics{words:number;sentences:number;meanLength:number;lengthVariation:number;typeTokenRatio:number;connectorRate:number}
const CONNECTORS=/^(however|moreover|furthermore|additionally|also|in addition|overall|notably|importantly|consequently|therefore|thus|taken together|in conclusion),/i;
export function styleMetrics(text:string):StyleMetrics{
 const list=text.split(/\n+/).flatMap(sentences);
 const lengths=list.map(s=>s.trim().split(/\s+/).filter(Boolean).length);
 const tokens=text.toLowerCase().match(/[a-zà-ÿ0-9]+(?:['’-][a-zà-ÿ0-9]+)*/g)??[];
 const n=lengths.length||1,mean=lengths.reduce((a,b)=>a+b,0)/n;
 const sd=Math.sqrt(lengths.reduce((a,b)=>a+(b-mean)**2,0)/n);
 return {words:tokens.length,sentences:lengths.length,meanLength:mean,lengthVariation:mean?sd/mean:0,
  typeTokenRatio:tokens.length?new Set(tokens).size/tokens.length:0,connectorRate:list.filter(s=>CONNECTORS.test(s.trim())).length/n};
}
