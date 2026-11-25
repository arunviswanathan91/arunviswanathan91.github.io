// Invisible-character inspector. Joiners (ZWJ/ZWNJ) are kept: Malayalam and emoji sequences need them.
export type CharAction="remove"|"space"|"keep";
export interface CharFinding{index:number;code:number;name:string;action:CharAction}
const NAMED:Record<number,[string,CharAction]>={
 0x200b:["ZERO WIDTH SPACE","remove"],0xfeff:["BYTE ORDER MARK","remove"],0x00ad:["SOFT HYPHEN","remove"],
 0x2060:["WORD JOINER","remove"],0x180e:["MONGOLIAN VOWEL SEPARATOR","remove"],
 0x00a0:["NO-BREAK SPACE","space"],0x202f:["NARROW NO-BREAK SPACE","space"],0x2009:["THIN SPACE","space"],0x200a:["HAIR SPACE","space"],
 0x200e:["LEFT-TO-RIGHT MARK","remove"],0x200f:["RIGHT-TO-LEFT MARK","remove"],
 0x202a:["LEFT-TO-RIGHT EMBEDDING","remove"],0x202b:["RIGHT-TO-LEFT EMBEDDING","remove"],0x202c:["POP DIRECTIONAL FORMATTING","remove"],
 0x202d:["LEFT-TO-RIGHT OVERRIDE","remove"],0x202e:["RIGHT-TO-LEFT OVERRIDE","remove"],
 0x2066:["LEFT-TO-RIGHT ISOLATE","remove"],0x2067:["RIGHT-TO-LEFT ISOLATE","remove"],0x2068:["FIRST STRONG ISOLATE","remove"],0x2069:["POP DIRECTIONAL ISOLATE","remove"],
 0x200c:["ZERO WIDTH NON-JOINER","keep"],0x200d:["ZERO WIDTH JOINER","keep"],
};
export function inspectChars(text:string):CharFinding[]{
 const out:CharFinding[]=[];
 for(let i=0;i<text.length;i++){
  const code=text.charCodeAt(i),hit=NAMED[code];
  if(hit)out.push({index:i,code,name:hit[0],action:hit[1]});
 }
 return out;
}
/** Applies the findings. Pass a filtered list to apply only some of them. */
export function cleanChars(text:string,findings:CharFinding[]=inspectChars(text)):string{
 const act=new Map(findings.map(f=>[f.index,f.action]));
 let out="";
 for(let i=0;i<text.length;i++){
  const a=act.get(i);
  out+=a==="remove"?"":a==="space"?" ":text[i];
 }
 return out;
}
export const codePoint=(code:number)=>"U+"+code.toString(16).toUpperCase().padStart(4,"0");
