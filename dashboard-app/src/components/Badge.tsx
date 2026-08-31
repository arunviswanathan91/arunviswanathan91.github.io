export function Badge({text}:{text:string}){return <span className={"badge "+text.toLowerCase().replaceAll(" ","-")}>{text}</span>}
