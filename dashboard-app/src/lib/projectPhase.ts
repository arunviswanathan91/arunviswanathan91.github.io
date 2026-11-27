// Project phases. Phase is the one stage the user edits; the workspace lists read the coarser ws_status.
export const PROJECT_PHASES=["Planning","Active","Paused","Analysis","Writing","Submitted","Completed","Archived"] as const;
const WS_STATUS:Record<string,string>={Planning:"planned",Active:"active",Analysis:"active",Writing:"active",Submitted:"active",Paused:"paused",Completed:"completed",Archived:"archived"};
/** The columns that change together when a project's phase changes. */
export const phasePatch=(phase:string)=>({phase,ws_status:WS_STATUS[phase]??"active",status:phase==="Archived"?"Archived":"Active",
 completed_on:phase==="Completed"?new Date().toISOString().slice(0,10):null});
/** A finished project is "Closed" to the reader; the stored phase stays "Completed". */
export const phaseLabel=(phase:string|null|undefined)=>phase==="Completed"?"Closed":phase||"Planning";

// Going back from a publication returns to the project tab it was opened from.
let returnTab:{projectId:string;tab:string}|null=null;
export const rememberProjectTab=(projectId:string,tab:string)=>{returnTab={projectId,tab}};
/** The tab to reopen for this project, once. */
export function takeProjectTab(projectId:string):string|null{
 const tab=returnTab?.projectId===projectId?returnTab.tab:null;
 returnTab=null;return tab;
}
