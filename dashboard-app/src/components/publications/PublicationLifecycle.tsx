import { Check, FolderKanban, History, Inbox, Tag } from "lucide-react";
import { PUBLICATION_STAGE } from "../../entities";
import type { Row } from "../../entities/types";
import { formatDate } from "../../lib/format";
import { useData, useUi } from "../../lib/store";

const MAIN_PATH=["Idea","Drafting","Under Review","Revision Requested","Accepted","Published"] as const;

const fallbackAction=(stage:string)=>stage==="Idea"?"Define the paper and its first analysis step":
 stage==="Drafting"?"Complete the draft and co-author review":
 stage==="Under Review"?"Wait for a decision and follow up if the review runs long":
 stage==="Revision Requested"?"Address reviewer comments and resubmit":
 stage==="Rejected"?"Choose whether to revise, resubmit elsewhere or close the paper":
 stage==="Accepted"?"Complete proofs and production requirements":
 "Record the citation and archive the final files";

const possibleOutcomes=(stage:string)=>stage==="Under Review"?"Revision requested, accepted or rejected":
 stage==="Revision Requested"?"Resubmitted, accepted or rejected":
 stage==="Rejected"?"Return to drafting or close the paper":
 stage==="Accepted"?"Published":null;

/** Canonical editorial lifecycle and durable stage history. It intentionally
 * stays separate from PublicationWorkflow's freely editable paper work nodes. */
export function PublicationLifecycle({publication}:{publication:Row}){
 const {projects,tables,publicationStageEvents,tags}=useData();
 const ui=useUi();
 const stage=String(publication.stage||"Idea");
 const events=publicationStageEvents.rows.filter(e=>e.publication_id===publication.id)
  .sort((a,b)=>b.created_at.localeCompare(a.created_at));
 const cameFromRevision=events.some(e=>e.to_stage==="Rejected"&&e.from_stage==="Revision Requested");
 const stages=stage==="Rejected"
  ?(["Idea","Drafting","Under Review",...(cameFromRevision?["Revision Requested"]:[]),"Rejected"] as string[])
  :[...MAIN_PATH];
 const currentIndex=Math.max(0,stages.indexOf(stage));
 const directProject=projects.byId.get(publication.project_id??"")??null;
 const paperTagIds=tags.idsFor("publication",publication.id);
 const tagProjects=projects.rows.filter(project=>project.id!==publication.project_id&&
  paperTagIds.some(tagId=>tags.idsFor("project",project.id).includes(tagId)));
 const next=String(publication.next_action||"").trim()||fallbackAction(stage);
 const outcomes=possibleOutcomes(stage);

 const history=events.map(event=>({
  id:event.id,
  label:event.from_stage?`Moved from ${event.from_stage} to ${event.to_stage}`:`Started at ${event.to_stage}`,
  at:event.created_at,
 }));
 if(!history.length)history.push({id:"current",label:`Current stage recorded as ${stage}`,at:publication.updated_at||publication.created_at});

 const openProject=(id:string)=>{ui.closeDrawer();ui.openProject(id)};
 return <section className="publication-lifecycle field-wide" aria-labelledby="publication-lifecycle-heading">
  <header className="paper-lifecycle-head">
   <div><span className="field-label">Selected paper</span><h3 id="publication-lifecycle-heading">{publication.title}</h3>
    <div className="paper-lifecycle-meta">
     {publication.venue&&<span>{publication.venue}</span>}
     <label className={directProject?"paper-project-link":"paper-project-link is-inbox"}>
      {directProject?<FolderKanban/>:<Inbox/>}
      <select value={publication.project_id??""} aria-label="Assign paper to project"
       onChange={e=>void tables.publications.update(publication.id,{project_id:e.target.value||null})}>
       <option value="">Inbox — assign a project</option>
       {projects.rows.filter(p=>p.status==="Active"||p.id===publication.project_id)
        .map(p=><option key={p.id} value={p.id}>{p.name}</option>)}
      </select>
     </label>
    </div>
   </div>
   <label className="paper-stage-control"><span>Update stage</span>
    <select value={stage} aria-label="Update publication stage"
     onChange={e=>void tables.publications.update(publication.id,{stage:e.target.value})}>
     {PUBLICATION_STAGE.map(value=><option key={value}>{value}</option>)}
    </select>
   </label>
  </header>

  <div className="paper-stage-scroll">
   <ol className="paper-stage-flow" style={{gridTemplateColumns:`repeat(${stages.length},minmax(86px,1fr))`}}
    aria-label={`Publication is currently ${stage}`}>
    {stages.map((value,index)=>{
     const state=index<currentIndex?"is-done":index===currentIndex?"is-current":"";
     return <li className={state} key={value} aria-current={index===currentIndex?"step":undefined}>
      <span className="paper-stage-node">{index<currentIndex?<Check/>:index+1}</span>
      <strong>{value}</strong><small>{index<currentIndex?"Completed":index===currentIndex?"Current":"Possible next"}</small>
     </li>;
    })}
   </ol>
  </div>

  <p className="paper-next-action"><strong>Next action:</strong> {next}{outcomes&&<> · <span>Possible outcomes: {outcomes}.</span></>}</p>

  <div className="paper-project-relations">
   <div className="paper-section-label"><Tag/>Project connections from shared tags</div>
   {tagProjects.length?<div className="paper-related-projects">{tagProjects.map(project=>{
    const shared=paperTagIds.filter(tagId=>tags.idsFor("project",project.id).includes(tagId))
     .map(tagId=>tags.byId.get(tagId)?.name).filter(Boolean);
    return <span className="paper-related-project" key={project.id}>
     <button onClick={()=>openProject(project.id)}>{project.name}</button>
     <small>{shared.join(", ")}</small>
     <button className="link-button" onClick={()=>void tables.publications.update(publication.id,{project_id:project.id})}>Link directly</button>
    </span>;
   })}</div>:<p className="muted-note">Give the paper and a project the same tag to relate them without moving the paper.</p>}
  </div>

  <div className="paper-history">
   <div className="paper-section-label"><History/>Stage history</div>
   {history.map(item=><div className="paper-history-row" key={item.id}>
    <span><i/>{item.label}</span><small>{formatDate(item.at,true)}{publication.venue?` · ${publication.venue}`:""}</small>
   </div>)}
   {publication.decision_email_url&&<div className="paper-history-row">
    <span><i/>Decision email linked</span><small>Linked to this paper</small>
   </div>}
   {publicationStageEvents.error
    ?<p className="paper-history-note">Stage history storage is not enabled yet. The current stage still works; run the latest Supabase schema once to start recording changes.</p>
    :!events.length&&<p className="paper-history-note">Earlier stage changes predate history tracking; new changes will be recorded automatically.</p>}
  </div>
 </section>;
}
