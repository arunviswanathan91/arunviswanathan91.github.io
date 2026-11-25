// Meaning checks between an original and a rewrite. They flag; the author decides.
export type FlagKind="number-missing"|"number-added"|"number-order"|"negation"|"direction"|"citation";
export interface Flag{kind:FlagKind;detail:string}
const NUMBER=/(?<![A-Za-z])[-−]?\d+(?:[.,]\d+)*%?/g;
const CITATION=/\[\d+(?:\s*[–-]\s*\d+)?(?:\s*,\s*\d+(?:\s*[–-]\s*\d+)?)*\]|\((?:[A-Z][^()]{0,80}?,?\s)?(?:19|20)\d{2}[a-z]?\)/g;
// Short words such as "no" and "not" count; that is the point of this check.
const NEGATION=/\b(?:no|not|never|none|neither|nor|without|cannot|absent|absence|lack(?:s|ed|ing)?|fail(?:s|ed|ing)?\s+to|unable)\b|n['’]t\b/gi;
const UP=/\b(?:increas\w*|elevat\w*|upregulat\w*|up-regulat\w*|higher|rise[sn]?|rose|rising|rais\w*|enhanc\w*|promot\w*|gain\w*|more)\b/gi;
const DOWN=/\b(?:decreas\w*|reduc\w*|downregulat\w*|down-regulat\w*|lower\w*|declin\w*|fell|fall\w*|suppress\w*|inhibit\w*|loss|lost|diminish\w*|less|fewer)\b/gi;
const all=(s:string,re:RegExp)=>[...s.matchAll(re)].map(m=>m[0].replace("−","-"));
function diff(a:string[],b:string[]):{missing:string[];added:string[]}{
 const left=new Map<string,number>();
 for(const x of a)left.set(x,(left.get(x)??0)+1);
 const added:string[]=[];
 for(const x of b){const n=left.get(x)??0;if(n)left.set(x,n-1);else added.push(x);}
 return {missing:[...left].flatMap(([k,n])=>Array<string>(n).fill(k)),added};
}
export function checkFidelity(original:string,revised:string):Flag[]{
 const flags:Flag[]=[];
 // Citation digits are compared as citations, not as data.
 const strip=(s:string)=>s.replace(CITATION," ");
 const na=all(strip(original),NUMBER),nb=all(strip(revised),NUMBER),nd=diff(na,nb);
 if(nd.missing.length)flags.push({kind:"number-missing",detail:nd.missing.join(", ")});
 if(nd.added.length)flags.push({kind:"number-added",detail:nd.added.join(", ")});
 if(!nd.missing.length&&!nd.added.length&&na.join("|")!==nb.join("|"))flags.push({kind:"number-order",detail:`${na.join(", ")} → ${nb.join(", ")}`});
 const cd=diff(all(original,CITATION),all(revised,CITATION));
 if(cd.missing.length||cd.added.length)flags.push({kind:"citation",detail:[...cd.missing.map(c=>"lost "+c),...cd.added.map(c=>"new "+c)].join(", ")});
 const ga=all(original,NEGATION).length,gb=all(revised,NEGATION).length;
 if(ga!==gb)flags.push({kind:"negation",detail:`${ga} → ${gb} negation words`});
 const ua=all(original,UP).length,ub=all(revised,UP).length,da=all(original,DOWN).length,db=all(revised,DOWN).length;
 if(ua!==ub||da!==db)flags.push({kind:"direction",detail:`increase words ${ua} → ${ub}, decrease words ${da} → ${db}`});
 return flags;
}
