import type { Tone } from "../../entities/types";

export function Badge({text,tone="dim"}:{text:string;tone?:Tone}){
 if(!text)return null;
 return <span className={"badge tone-"+tone}>{text}</span>;
}

export function Dot({tone="dim",title}:{tone?:Tone;title?:string}){
 return <span className={"dot tone-"+tone} title={title} aria-hidden="true"/>;
}
