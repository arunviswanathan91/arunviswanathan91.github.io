// The only place a stored ISO timestamp is turned into display text or an input value.
// Rows keep raw ISO everywhere else, so edit forms can always round-trip a date.

const rtf=new Intl.RelativeTimeFormat(undefined,{numeric:"auto"});
const dayMonth=new Intl.DateTimeFormat(undefined,{month:"short",day:"numeric"});
const dayMonthYear=new Intl.DateTimeFormat(undefined,{month:"short",day:"numeric",year:"numeric"});
const dateAndTime=new Intl.DateTimeFormat(undefined,{dateStyle:"medium",timeStyle:"short"});

const valid=(iso:string|null|undefined):Date|null=>{if(!iso)return null;const d=new Date(iso);return isNaN(d.getTime())?null:d};
const pad=(n:number)=>String(n).padStart(2,"0");

export const startOfDay=(t:number|Date)=>{const d=new Date(t);d.setHours(0,0,0,0);return d};
/** Whole days from today to `iso` in local time: 0 today, -1 yesterday, 1 tomorrow. */
export const dayDelta=(iso:string|null,now=Date.now())=>{const d=valid(iso);return d?Math.round((startOfDay(d).getTime()-startOfDay(now).getTime())/86400000):NaN};
export const isOverdue=(iso:string|null,now=Date.now())=>{const d=valid(iso);return !!d&&d.getTime()<now};

export function formatDate(iso:string|null,withTime=false){
 const d=valid(iso); if(!d)return "";
 if(withTime)return dateAndTime.format(d);
 return d.getFullYear()===new Date().getFullYear()?dayMonth.format(d):dayMonthYear.format(d);
}

/** "2h ago" / "in 3 days", falling back to an absolute date beyond a month. */
export function formatRelative(iso:string|null){
 const d=valid(iso); if(!d)return "";
 const secs=Math.round((d.getTime()-Date.now())/1000),abs=Math.abs(secs);
 if(abs<60)return "just now";
 if(abs<3600)return rtf.format(Math.round(secs/60),"minute");
 if(abs<86400)return rtf.format(Math.round(secs/3600),"hour");
 if(abs<2592000)return rtf.format(Math.round(secs/86400),"day");
 return formatDate(iso);
}

/** ISO -> value for <input type="date"> / <input type="datetime-local">, in local time. */
export function toInput(iso:string|null,withTime=false){
 const d=valid(iso); if(!d)return "";
 const date=`${d.getFullYear()}-${pad(d.getMonth()+1)}-${pad(d.getDate())}`;
 return withTime?`${date}T${pad(d.getHours())}:${pad(d.getMinutes())}`:date;
}

/** Input value -> ISO. Date-only values are built from parts: `new Date("2026-03-03")`
 *  parses as UTC midnight, which lands on the previous day in negative offsets. */
export function fromInput(value:string,withTime=false):string|null{
 if(!value)return null;
 if(!withTime){
  const [y,m,d]=value.split("-").map(Number);
  if(!y||!m||!d)return null;
  return new Date(y,m-1,d).toISOString();
 }
 const d=new Date(value);
 return isNaN(d.getTime())?null:d.toISOString();
}

export const hostname=(url:string)=>{try{return new URL(url).hostname.replace(/^www\./,"")}catch{return url}};
