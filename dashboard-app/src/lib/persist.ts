// Versioned localStorage helpers. A shape change bumps the version so stale state is
// discarded rather than crashing the app, and every access is guarded because storage
// throws outright in some privacy modes.

const VERSION="v1";
const key=(name:string)=>`dash.${VERSION}.${name}`;

export function load<T>(name:string,fallback:T):T{
 try{
  const raw=localStorage.getItem(key(name));
  return raw?{...fallback,...JSON.parse(raw)} as T:fallback;
 }catch{return fallback}
}

export function save(name:string,value:unknown){
 try{localStorage.setItem(key(name),JSON.stringify(value))}catch{/* storage unavailable */}
}

export function loadRaw<T>(name:string,fallback:T):T{
 try{
  const raw=localStorage.getItem(key(name));
  return raw?JSON.parse(raw) as T:fallback;
 }catch{return fallback}
}
