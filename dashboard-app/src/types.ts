export type View = "home" | "kanban" | "publications" | "documents" | "jobs" | "reminders" | "reads" | "telegram";
export type Status = "Backlog" | "In progress" | "Review" | "Done";
export type PublicationStage = "Idea" | "Drafting" | "Submitted" | "Revision" | "Published";
export type JobStage = "Saved" | "Preparing" | "Applied" | "Interview" | "Offer" | "Closed";
export type ProjectStatus = "Active" | "Archived";

export interface Project { id:string; name:string; status:ProjectStatus; createdAt:string }
export interface Task { id:string; title:string; status:Status; projectId:string|null; due?:string; priority:"Low"|"Medium"|"High" }
export interface Publication { id:string; title:string; venue?:string; stage:PublicationStage; nextAction?:string; due?:string; projectId:string|null; url?:string }
export type DocumentKind = "Manuscript"|"Protocol"|"Dataset"|"Figure"|"Reference";
export interface DocumentItem { id:string; title:string; kind:DocumentKind; projectId:string|null; driveUrl?:string; updated:string }
export interface Job { id:string; organization:string; role:string; stage:JobStage; deadline?:string; nextAction?:string; url?:string; projectId:string|null; tagIds:string[] }
export interface Tag { id:string; name:string; color:string|null }
export interface Reminder { id:string; title:string; body?:string; remindAt?:string; done:boolean; tagIds:string[] }
export interface Read { id:string; url:string; title?:string; notes?:string; createdAt:string; tagIds:string[] }
