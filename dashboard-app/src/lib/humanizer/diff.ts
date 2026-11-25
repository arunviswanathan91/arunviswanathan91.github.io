// Paragraph segments with accept/undo, and a word diff for display.
import type {Flag} from "./fidelity.ts";
export interface Segment{original:string;revised:string;accepted:boolean;rejected?:string;flags:Flag[]}
export interface DiffPart{type:"same"|"add"|"del";text:string}
export const splitParagraphs=(text:string)=>text.split(/(\n+)/);
export const isBreak=(part:string)=>/^\n+$/.test(part)||!part.trim();
/** The text that results from the accepted segments; undone segments keep the original. */
export function compose(segments:Segment[]):string{return segments.map(s=>s.accepted?s.revised:s.original).join("");}
export function wordDiff(a:string,b:string):DiffPart[]{
 const x=a.split(/(\s+)/).filter(Boolean),y=b.split(/(\s+)/).filter(Boolean),n=x.length,m=y.length;
 // Long paragraphs fall back to a whole-block change to keep the table small.
 if(n*m>4_000_000)return a===b?[{type:"same",text:a}]:[{type:"del",text:a},{type:"add",text:b}];
 const w=m+1,t=new Uint32Array((n+1)*w);
 for(let i=n-1;i>=0;i--)for(let j=m-1;j>=0;j--)t[i*w+j]=x[i]===y[j]?t[(i+1)*w+j+1]+1:Math.max(t[(i+1)*w+j],t[i*w+j+1]);
 const out:DiffPart[]=[];
 const push=(type:DiffPart["type"],text:string)=>{const last=out[out.length-1];if(last?.type===type)last.text+=text;else out.push({type,text});};
 let i=0,j=0;
 while(i<n&&j<m){if(x[i]===y[j]){push("same",x[i]);i++;j++;}else if(t[(i+1)*w+j]>=t[i*w+j+1])push("del",x[i++]);else push("add",y[j++]);}
 while(i<n)push("del",x[i++]);
 while(j<m)push("add",y[j++]);
 return out;
}
