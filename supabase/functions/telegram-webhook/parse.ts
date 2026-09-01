// Pure message parsing — no Deno or database access, so it can be exercised directly.
import type { BotEntity, BotField } from "./entities.ts";

export interface Parsed{
 text:string;                          // what's left after tokens are removed
 tags:string[];
 project:string|null;                  // project NAME; resolved to an id by the caller
 priority:string|null;
 fields:Record<string,unknown>;        // column -> value, ready for insert/update
 dateSpec:{iso:string}|null;           // resolved date for the entity's date field
 url:string|null;
 unknown:string[];                     // field:value tokens that matched nothing
}

const WEEKDAYS=["sunday","monday","tuesday","wednesday","thursday","friday","saturday"];
const PRIORITIES:Record<string,string>={h:"High",hi:"High",high:"High",m:"Medium",med:"Medium",medium:"Medium",l:"Low",lo:"Low",low:"Low"};

/** Offset of `tz` from UTC at a given instant, in ms. */
export function tzOffset(utcMs:number,tz:string):number{
 try{
  const dtf=new Intl.DateTimeFormat("en-US",{timeZone:tz,hour12:false,
   year:"numeric",month:"2-digit",day:"2-digit",hour:"2-digit",minute:"2-digit",second:"2-digit"});
  const parts=dtf.formatToParts(new Date(utcMs));
  const get=(t:string)=>Number(parts.find(p=>p.type===t)?.value??0);
  const asUtc=Date.UTC(get("year"),get("month")-1,get("day"),get("hour")%24,get("minute"),get("second"));
  return asUtc-utcMs;
 }catch{return 0}
}

/** Build a UTC instant from wall-clock parts interpreted in `tz`. */
export function zonedToUtc(y:number,m:number,d:number,h:number,min:number,tz:string):Date{
 const guess=Date.UTC(y,m-1,d,h,min);
 return new Date(guess-tzOffset(guess,tz));
}

/** Wall-clock "now" in `tz`, as plain numbers. */
function nowIn(tz:string,now:number){
 const shifted=new Date(now+tzOffset(now,tz));
 return {y:shifted.getUTCFullYear(),m:shifted.getUTCMonth()+1,d:shifted.getUTCDate(),
  h:shifted.getUTCHours(),min:shifted.getUTCMinutes(),dow:shifted.getUTCDay()};
}

/**
 * Turns "friday", "tomorrow 9am", "2026-03-03", "in 2h" into an absolute instant,
 * interpreting bare clock times in the user's zone rather than the server's.
 */
export function parseDate(input:string,tz:string,now=Date.now()):string|null{
 const raw=input.trim().toLowerCase();
 if(!raw)return null;

 const rel=raw.match(/^in\s*(\d+)\s*(m|min|mins|minute|minutes|h|hr|hrs|hour|hours|d|day|days|w|week|weeks)$/);
 if(rel){
  const n=parseInt(rel[1],10),u=rel[2][0];
  const ms=u==="m"?n*60000:u==="h"?n*3600000:u==="d"?n*86400000:n*604800000;
  return new Date(now+ms).toISOString();
 }

 // Optional trailing clock time: "friday 9am", "tomorrow 17:30"
 let timeH=9,timeM=0,hasTime=false;
 let body=raw;
 const time=body.match(/\s+(\d{1,2})(?::(\d{2}))?\s*(am|pm)?$/);
 if(time){
  let h=parseInt(time[1],10);
  const m=time[2]?parseInt(time[2],10):0,ap=time[3];
  if(ap==="pm"&&h<12)h+=12;
  if(ap==="am"&&h===12)h=0;
  if(h<=23&&m<=59){timeH=h;timeM=m;hasTime=true;body=body.slice(0,time.index).trim()}
 }

 const cur=nowIn(tz,now);
 const at=(y:number,m:number,d:number)=>zonedToUtc(y,m,d,timeH,timeM,tz).toISOString();

 const iso=body.match(/^(\d{4})-(\d{2})-(\d{2})$/);
 if(iso)return at(+iso[1],+iso[2],+iso[3]);

 const dmy=body.match(/^(\d{1,2})[/](\d{1,2})(?:[/](\d{2,4}))?$/);
 if(dmy){
  const d=+dmy[1],m=+dmy[2];
  let y=dmy[3]?+dmy[3]:cur.y;
  if(y<100)y+=2000;
  if(m>=1&&m<=12&&d>=1&&d<=31)return at(y,m,d);
 }

 if(body==="today")return at(cur.y,cur.m,cur.d);
 if(body==="tomorrow")return new Date(zonedToUtc(cur.y,cur.m,cur.d,timeH,timeM,tz).getTime()+86400000).toISOString();
 if(body==="tonight"){if(!hasTime){timeH=20;timeM=0}return at(cur.y,cur.m,cur.d)}

 const dayIdx=WEEKDAYS.indexOf(body.replace(/^next\s+/,""));
 if(dayIdx>=0){
  let delta=(dayIdx-cur.dow+7)%7;
  if(delta===0||body.startsWith("next "))delta=delta===0?7:delta;
  return new Date(zonedToUtc(cur.y,cur.m,cur.d,timeH,timeM,tz).getTime()+delta*86400000).toISOString();
 }
 return null;
}

const findField=(entity:BotEntity,alias:string):BotField|undefined=>
 entity.fields.find(f=>f.aliases.includes(alias));

/**
 * Extracts #tags, @project, !priority, `field:value` pairs, bare URLs and `in 2h`
 * from a message, leaving the prose behind as `text`.
 */
export function parseMessage(input:string,entity:BotEntity,tz:string,now=Date.now()):Parsed{
 const out:Parsed={text:"",tags:[],project:null,priority:null,fields:{},dateSpec:null,url:null,unknown:[]};
 let rest=input;

 /** Callback may return false to leave the match in place instead of consuming it. */
 const take=(re:RegExp,fn:(m:string[])=>boolean|void)=>{
  rest=rest.replace(re,(...args)=>{
   const m=args.slice(0,-2) as string[];
   return fn(m)===false?m[0]:" ";
  });
 };

 // field:value — quoted, or up to the next whitespace
 take(/(^|\s)([a-z_]+):("([^"]*)"|\S+)/gi,(m)=>{
  const alias=String(m[2]).toLowerCase();
  const value=(m[4]!==undefined?m[4]:String(m[3])).trim();
  // A bare link is not a field: "https://x" would otherwise read as field "https".
  if(alias==="http"||alias==="https")return false;
  const field=findField(entity,alias);
  if(!field){out.unknown.push(alias);return}
  if(field.kind==="date"){
   const iso=parseDate(value,tz,now);
   if(iso)out.fields[field.key]=iso; else out.unknown.push(`${alias}:${value}`);
  }else if(field.kind==="enum"){
   const match=field.options?.find(o=>o.toLowerCase()===value.toLowerCase());
   if(match)out.fields[field.key]=match; else out.unknown.push(`${alias}:${value}`);
  }else if(field.kind==="project"){
   out.project=value;
  }else out.fields[field.key]=value;
 });

 take(/(^|\s)!(\w+)/g,(m)=>{
  const p=PRIORITIES[String(m[2]).toLowerCase()];
  if(p&&entity.priorityField)out.fields[entity.priorityField]=p; else out.unknown.push("!"+m[2]);
 });

 take(/(^|\s)@("([^"]+)"|[\w-]+)/g,(m)=>{
  out.project=(m[3]!==undefined?m[3]:String(m[2])).trim();
 });

 take(/(^|\s)#([\w-]+)/g,(m)=>{out.tags.push(String(m[2]).toLowerCase())});

 take(/(^|\s)(https?:\/\/\S+)/gi,(m)=>{
  out.url=String(m[2]).replace(/[.,)\]>]+$/,"");
 });

 // Bare relative offset anywhere in the message: "call PI in 2h"
 if(entity.dateField&&!out.fields[entity.dateField]){
  take(/(^|\s)in\s+(\d+)\s*(m|min|mins|minute|minutes|h|hr|hrs|hour|hours|d|day|days|w|week|weeks)\b/i,(m)=>{
   const iso=parseDate(`in ${m[2]}${m[3]}`,tz,now);
   if(iso)out.fields[entity.dateField!]=iso;
  });
 }

 out.text=rest.replace(/\s+/g," ").trim();
 if(entity.dateField&&out.fields[entity.dateField])out.dateSpec={iso:String(out.fields[entity.dateField])};
 return out;
}

/** Splits "Org | Role" style input, used by /job. */
export function splitPair(text:string):[string,string]|null{
 const i=text.indexOf("|");
 if(i<0)return null;
 const a=text.slice(0,i).trim(),b=text.slice(i+1).trim();
 return a&&b?[a,b]:null;
}

export const isAffirmative=(s:string)=>/^(y|yes|yep|yeah|ok|okay|sure|save|do it)$/i.test(s.trim());
export const isDone=(s:string)=>/^(done|no|nope|nothing|finish|stop|cancel|thanks|thank you)$/i.test(s.trim());
