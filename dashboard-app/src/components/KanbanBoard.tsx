import type { ReactNode } from "react";

export function KanbanBoard<T>({items,columns,getId,getStage,onMove,renderCard}:{
 items:T[];
 columns:readonly string[];
 getId:(item:T)=>string;
 getStage:(item:T)=>string;
 onMove:(id:string,stage:string)=>void;
 renderCard:(item:T)=>ReactNode;
}){
 return <div className="board">{columns.map(s=>
  <section className="column" key={s} onDragOver={e=>e.preventDefault()} onDrop={e=>onMove(e.dataTransfer.getData("card"),s)}>
   <div className="column-head"><span>{s}</span><b>{items.filter(i=>getStage(i)===s).length}</b></div>
   {items.filter(i=>getStage(i)===s).map(item=>
    <article draggable onDragStart={e=>e.dataTransfer.setData("card",getId(item))} className="task-card" key={getId(item)}>
     {renderCard(item)}
    </article>)}
  </section>)}
 </div>
}
