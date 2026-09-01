import { useMemo } from "react";
import { useData } from "../../lib/store";
import type { EntityDef } from "../../entities/types";
import type { ValueCtx } from "./FieldValue";
import type { InputCtx } from "./FieldInput";

/** Shared lookup context so every card/cell/editor resolves projects and tags the same way. */
export function useEntityCtx(def:EntityDef){
 const {projects,tags}=useData();
 const projectsById=useMemo(()=>new Map(projects.rows.map(p=>[p.id,p])),[projects.rows]);
 const valueCtx=useMemo<ValueCtx>(()=>({
  projectName:id=>id?projectsById.get(id)?.name??null:null,
  projectColor:id=>id?projectsById.get(id)?.color??null:null,
  tagIds:id=>def.tagEntity?tags.idsFor(def.tagEntity,id):[],
  tagsById:tags.byId,
 }),[projectsById,tags,def.tagEntity]);
 const inputCtx=useMemo<InputCtx>(()=>({
  projects:projects.rows,tags:tags.tags,createTag:(name:string)=>tags.create(name),
 }),[projects.rows,tags]);
 return {valueCtx,inputCtx,projectsById};
}
