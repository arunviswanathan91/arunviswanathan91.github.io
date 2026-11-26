import { useMemo } from "react";
import { useData } from "../../lib/store";
import { useLibrary } from "../../lib/libraryLinks";
import type { EntityDef } from "../../entities/types";
import type { ValueCtx } from "./FieldValue";
import type { InputCtx } from "./FieldInput";

/** Shared lookup context so every card/cell/editor resolves projects and tags the same way. */
export function useEntityCtx(def:EntityDef){
 const {projects,people,tables,tags}=useData();
 const projectsById=useMemo(()=>new Map(projects.rows.map(p=>[p.id,p])),[projects.rows]);
 const peopleById=useMemo(()=>new Map(people.rows.map(p=>[p.id,p])),[people.rows]);
 const library=useLibrary();
 const papersById=useMemo(()=>new Map(library.papers.map(p=>[p.id,p.title])),[library.papers]);
 const resumesById=useMemo(()=>new Map(library.resumes.map(r=>[r.id,r.title])),[library.resumes]);
 const publicationsById=useMemo(()=>new Map(tables.publications.rows.map(p=>[p.id,p])),[tables.publications.rows]);
 const valueCtx=useMemo<ValueCtx>(()=>({
  projectName:id=>id?projectsById.get(id)?.name??null:null,
  projectColor:id=>id?projectsById.get(id)?.color??null:null,
  personName:id=>id?peopleById.get(id)?.name??null:null,
  publicationTitle:id=>id?String(publicationsById.get(id)?.title??"")||null:null,
  paperTitle:id=>id?papersById.get(id)||null:null,
  resumeTitle:id=>id?resumesById.get(id)||null:null,
  tagIds:id=>def.tagEntity?tags.idsFor(def.tagEntity,id):[],
  tagsById:tags.byId,
 }),[projectsById,peopleById,publicationsById,papersById,resumesById,tags,def.tagEntity]);
 const inputCtx=useMemo<InputCtx>(()=>({
  projects:projects.rows,people:people.rows,publications:tables.publications.rows,
  papers:library.papers,resumes:library.resumes,
  tags:tags.tags,createTag:(name:string)=>tags.create(name),
 }),[projects.rows,people.rows,tables.publications.rows,library,tags]);
 return {valueCtx,inputCtx,projectsById};
}
