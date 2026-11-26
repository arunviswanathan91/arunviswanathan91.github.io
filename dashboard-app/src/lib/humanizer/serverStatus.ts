// Turns the progress messages the notebook writes into one line a reader can act on.
export interface ServerStatus{stage?:string;step?:number;steps?:number;label?:string;since?:string;expect_s?:number;remaining_s?:number;stops_at?:string;idle_minutes?:number;reason?:string}
export type ServerState='off'|'starting'|'ready'|'stopped'|'silent';
export interface ServerView{state:ServerState;text:string}
/** The notebook repeats its status about every 45 seconds; after this long without one it is taken as gone. */
export const SILENT_AFTER_S=150;
const span=(s:number)=>{const m=Math.round(s/60);return s<50?'under a minute':m===1?'1 minute':`${m} minutes`;};
const clock=(t:string)=>{const d=new Date(t);return Number.isNaN(d.getTime())?'':d.toLocaleTimeString([],{hour:'2-digit',minute:'2-digit'});};
export function describeServer(status:ServerStatus|null|undefined,statusAt:string|null|undefined,now:number):ServerView{
 const at=statusAt?new Date(statusAt).getTime():NaN;
 if(!status?.stage||Number.isNaN(at))return {state:'off',text:'The server is off. Start the notebook on Kaggle. Its first message arrives here once Kaggle gives it a machine, usually within 2 minutes, longer when Kaggle has a queue.'};
 if(status.stage==='stopped')return {state:'stopped',text:`The server stopped at ${clock(statusAt!)}${status.reason?` (${status.reason})`:''}. Start the notebook again to use it.`};
 const quiet=(now-at)/1000;
 if(quiet>SILENT_AFTER_S)return {state:'silent',text:`No message from the server for ${span(quiet)}. It has probably stopped, or Kaggle ended the session. Check the notebook on Kaggle.`};
 if(status.stage==='ready'){
  const left=status.stops_at?(new Date(status.stops_at).getTime()-now)/1000:NaN;
  const idle=status.idle_minutes?`It stops by itself after ${status.idle_minutes} minutes without a rewrite`:'It stops by itself when idle';
  return {state:'ready',text:`Ready. ${idle}${left>0?`, in about ${span(left)} if you do nothing`:''}.`};
 }
 const since=status.since?new Date(status.since).getTime():at,elapsed=Math.max(0,(now-since)/1000);
 const parts=[`Starting${status.step&&status.steps?`, step ${status.step} of ${status.steps}`:''}: ${status.label??status.stage}.`,`${span(elapsed)} so far`];
 if(status.expect_s)parts[1]+=`; this step usually takes about ${span(status.expect_s)}`;
 const left=status.remaining_s===undefined?NaN:status.remaining_s-(now-at)/1000;
 return {state:'starting',text:`${parts.join(' ')}. ${left>0?`About ${span(left)} left in total.`:'Almost there.'}`};
}
