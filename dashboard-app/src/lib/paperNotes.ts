/** Each note is an ordinary UTF-8 Markdown file: a title heading and its body. */
export const PAPER_NOTES_BUCKET="paper-notes";
export const MAX_NOTE_BYTES=2*1024*1024;
export function encodeNote(title:string,body:string){
 return `# ${title.replace(/[\r\n]+/g," ").trim()}\n\n${body}`;
}
export function decodeNote(markdown:string){
 const match=/^# ([^\r\n]+)\r?\n\r?\n/.exec(markdown);
 return {title:match?.[1]??"Untitled note",body:match?markdown.slice(match[0].length):markdown};
}
export function noteFilename(title:string){
 return (title.replace(/[<>:"/\\|?*\u0000-\u001f]/g,"-").replace(/[. ]+$/g,"").trim().slice(0,120)||"paper-note")+".md";
}
export function noteWords(body:string){return body.trim()?body.trim().split(/\s+/u).length:0}
