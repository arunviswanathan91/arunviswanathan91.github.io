import type { Project } from "../types";

export function ProjectScopeSwitcher({projects,scope,onChange}:{projects:Project[];scope:string;onChange:(scope:string)=>void}){
 const active=projects.filter(p=>p.status==="Active");
 return <div className="scope-switcher">
  <button className={scope==="all"?"active":""} onClick={()=>onChange("all")}>All</button>
  {active.map(p=><button key={p.id} className={scope===p.id?"active":""} onClick={()=>onChange(p.id)}>{p.name}</button>)}
 </div>
}
