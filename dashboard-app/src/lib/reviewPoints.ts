// Split pasted reviewer comments into separate points, one task each.
// A point starts at a bullet or number ("-", "•", "1.", "(2)", "a)") or after a blank line;
// lone headings such as "Reviewer 2:" are dropped.

const START=/^\s*(?:[-*•–]\s+|\(?\d{1,2}[.)]\s+|\(?[a-h][.)]\s+)/i;
const HEADING=/^\s*(?:reviewer|referee|editor|comments?|minor|major)\b[^.?!]{0,40}:?\s*$/i;

export function reviewPoints(text:string):string[]{
 const points:string[]=[];let current:string[]=[];
 const flush=()=>{const p=current.join(" ").replace(/\s+/g," ").trim();if(p.length>=8)points.push(p);current=[]};
 for(const raw of text.replace(/\r\n?/g,"\n").split("\n")){
  if(!raw.trim()){flush();continue}
  if(HEADING.test(raw)){flush();continue}
  if(START.test(raw)){flush();current.push(raw.replace(START,""));continue}
  current.push(raw.trim());
 }
 flush();
 return points;
}

/** A task title: the first sentence, at most 100 characters. */
export function pointTitle(point:string):string{
 const first=point.match(/^(.+?[.?!])(\s|$)/)?.[1]??point;
 return first.length>100?first.slice(0,99).trimEnd()+"…":first;
}
