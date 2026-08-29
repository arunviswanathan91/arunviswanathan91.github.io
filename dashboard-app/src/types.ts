export type View = "home" | "kanban" | "publications" | "documents" | "jobs";
export type Status = "Backlog" | "In progress" | "Review" | "Done";
export interface Task { id:string; title:string; status:Status; project:string; due?:string; priority:"Low"|"Medium"|"High" }
export interface Publication { id:string; title:string; journal:string; stage:"Idea"|"Drafting"|"Submitted"|"Revision"|"Published"; nextAction:string; due?:string }
export interface DocumentItem { id:string; title:string; kind:"Manuscript"|"Protocol"|"Dataset"|"Figure"|"Reference"; project:string; driveUrl?:string; updated:string }
export interface Job { id:string; organization:string; role:string; stage:"Saved"|"Preparing"|"Applied"|"Interview"|"Offer"|"Closed"; deadline?:string; nextAction:string }
