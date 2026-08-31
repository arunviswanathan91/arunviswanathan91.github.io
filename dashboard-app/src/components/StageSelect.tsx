export function StageSelect<S extends string>({value,options,onChange}:{value:S;options:readonly S[];onChange:(next:S)=>void}){
 return <select className={"badge badge-select "+value.toLowerCase().replaceAll(" ","-")} value={value} onChange={e=>onChange(e.target.value as S)} onClick={e=>e.stopPropagation()}>
  {options.map(o=><option key={o} value={o}>{o}</option>)}
 </select>
}
