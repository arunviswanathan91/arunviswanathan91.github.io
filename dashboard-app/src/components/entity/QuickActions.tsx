import type { QuickAction, Row } from "../../entities/types";

/**
 * Shared by BoardCard and Table so the same one-click buttons appear in
 * whichever layout the entity happens to use. Renders nothing when the
 * entity declares no quick actions, or none apply to this row's state.
 */
export function QuickActions({actions,row,onRun}:{
 actions:QuickAction[]|undefined;row:Row;onRun(action:QuickAction):void;
}){
 const live=(actions??[]).filter(a=>!a.show||a.show(row));
 if(!live.length)return null;
 return <div className="card-quick" onClick={e=>e.stopPropagation()}>
  {live.map(a=><button key={a.key} type="button" className={"quick-btn tone-"+(a.tone??"slate")}
   title={a.label} aria-label={a.label} onClick={()=>onRun(a)}>
   <a.icon/><span>{a.label}</span>
  </button>)}
 </div>;
}
