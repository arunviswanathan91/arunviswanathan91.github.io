// The submission trail of a manuscript: each journal it went to and what happened there.
// Pure logic, shared by the publication page and the project's publication tiles.

export type SubmissionStatus="submitted"|"desk_rejected"|"under_review"|"revision_requested"|"resubmitted"|"rejected"|"accepted"|"withdrawn";
export interface Submission{
 id:string;publication_id:string;journal:string;position:number;status:SubmissionStatus;
 submitted_on:string;decided_on:string|null;history:{status:SubmissionStatus;on:string}[];
 manuscript_ref:string;notes:string;created_at:string;updated_at:string;
}

export const SUBMISSION_STATUS:Record<SubmissionStatus,string>={
 submitted:"Submitted",desk_rejected:"Desk rejected",under_review:"Under review",revision_requested:"Revision requested",
 resubmitted:"Resubmitted",rejected:"Rejected after review",accepted:"Accepted",withdrawn:"Withdrawn",
};
/** Badge colours, from the tones the app already uses. */
export const SUBMISSION_TONE:Record<SubmissionStatus,string>={
 submitted:"tone-blue",desk_rejected:"tone-red",under_review:"tone-blue",revision_requested:"tone-amber",
 resubmitted:"tone-blue",rejected:"tone-red",accepted:"tone-green",withdrawn:"tone-slate",
};
/** The paper is finished with this journal and can go elsewhere. */
export const isOver=(s:SubmissionStatus)=>s==="desk_rejected"||s==="rejected"||s==="withdrawn";
export const isDecided=(s:SubmissionStatus)=>isOver(s)||s==="accepted";

/** What can happen next at a journal, as the buttons offered. */
export function nextSteps(s:SubmissionStatus):{status:SubmissionStatus;label:string}[]{
 if(s==="submitted")return [{status:"under_review",label:"Sent to review"},{status:"desk_rejected",label:"Desk rejected"},{status:"withdrawn",label:"Withdrawn"}];
 if(s==="under_review"||s==="resubmitted")return [{status:"revision_requested",label:"Revision requested"},{status:"accepted",label:"Accepted"},{status:"rejected",label:"Rejected"}];
 if(s==="revision_requested")return [{status:"resubmitted",label:"Resubmitted"},{status:"withdrawn",label:"Withdrawn"}];
 return [];
}

/** Oldest first: the order the journals were tried in. */
export const inOrder=(rows:Submission[])=>[...rows].sort((a,b)=>a.position-b.position||a.submitted_on.localeCompare(b.submitted_on)||a.created_at.localeCompare(b.created_at));

/** The change to one submission when a step is recorded on a given day. */
export function stepPatch(sub:Pick<Submission,"history"|"submitted_on">,status:SubmissionStatus,on:string){
 const day=on<sub.submitted_on?sub.submitted_on:on;
 return {status,history:[...(sub.history??[]),{status,on:day}],decided_on:isDecided(status)?day:null};
}

/** What the publication itself should show for a submission in this state: its venue and stage. */
export function publicationPatch(journal:string,status:SubmissionStatus):Record<string,unknown>{
 const stage=status==="accepted"?"Accepted":status==="revision_requested"?"Revision Requested":isOver(status)&&status!=="withdrawn"?"Rejected":status==="withdrawn"?"Drafting":"Under Review";
 return {venue:journal,stage,rejection_type:status==="desk_rejected"?"Desk rejection":status==="rejected"?"After review":null};
}

const daysBetween=(from:string,to:string)=>Math.max(0,Math.round((Date.parse(to)-Date.parse(from))/86400000));
/** Days from submission to the decision, or to today while it is still open. */
export const daysAt=(s:Submission,today:string)=>daysBetween(s.submitted_on,s.decided_on??today);
/** Days in the current step (since the last recorded step, else since submission). */
export const daysInStep=(s:Submission,today:string)=>daysBetween(s.history?.at(-1)?.on??s.submitted_on,today);

export interface TrailSummary{
 rows:Submission[];current:Submission|null;
 deskRejections:Submission[];reviewRejections:Submission[];withdrawn:Submission[];accepted:Submission|null;
 /** One sentence for a tile: where the paper is now. */
 headline:string;
}
export function summarise(all:Submission[],today:string):TrailSummary{
 const rows=inOrder(all);
 const current=rows.at(-1)??null;
 const of=(s:SubmissionStatus)=>rows.filter(r=>r.status===s);
 const accepted=of("accepted").at(-1)??null;
 const headline=!current?"Not submitted anywhere yet."
  :current.status==="accepted"?`Accepted at ${current.journal}.`
  :isOver(current.status)?`${SUBMISSION_STATUS[current.status]} at ${current.journal}. Not at a journal now.`
  :`${SUBMISSION_STATUS[current.status]} at ${current.journal} · ${daysInStep(current,today)} day${daysInStep(current,today)===1?"":"s"} in this step.`;
 return {rows,current,deskRejections:of("desk_rejected"),reviewRejections:of("rejected"),withdrawn:of("withdrawn"),accepted,headline};
}
