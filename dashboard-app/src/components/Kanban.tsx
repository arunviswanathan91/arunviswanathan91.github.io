import { useState } from "react";
import { Plus, Trash2 } from "lucide-react";
import type { Project, Status, Task } from "../types";
import { Badge } from "./Badge";
import { KanbanBoard } from "./KanbanBoard";
import { TaskComposer } from "./TaskComposer";

const columns:Status[]=["Backlog","In progress","Review","Done"];

export function Kanban({projectId,projects,tasks,move,remove,add}:{
 projectId:string|null;
 projects:Project[];
 tasks:Task[];
 move:(id:string,s:Status)=>void;
 remove:(id:string)=>void;
 add:(title:string)=>void;
}){
 const [composer,setComposer]=useState(false);
 const boardName=projectId?projects.find(p=>p.id===projectId)?.name??"Project":"Inbox";
 const scoped=tasks.filter(t=>t.projectId===projectId);
 return <>
  <div className="title-row"><div><p className="kicker">Kanban board</p><h1>{boardName}</h1><p className="subtitle">Tasks scoped to this board.</p></div><button className="primary" onClick={()=>setComposer(true)}><Plus/>New task</button></div>
  <KanbanBoard items={scoped} columns={columns} getId={t=>t.id} getStage={t=>t.status}
   onMove={(id,s)=>move(id,s as Status)}
   renderCard={t=><>
    <span className={"priority "+t.priority.toLowerCase()}/>
    <button className="delete-card" onClick={()=>remove(t.id)} title="Delete task"><Trash2/></button>
    <h3>{t.title}</h3><p>{boardName}</p>
    <footer><small>{t.due||"No date"}</small><Badge text={t.priority}/></footer>
   </>}/>
  {composer&&<TaskComposer boardName={boardName} onClose={()=>setComposer(false)} onAdd={title=>{add(title);setComposer(false)}}/>}
 </>
}
