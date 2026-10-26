import { supabase as base } from "../../lib/supabase";
// Reuse the authenticated session. Namespaced views share the existing projects/tasks.
export const supabase = base ? new Proxy(base, {
 get(target, prop) {
  if(prop === "from") return (table:string) => target.from("ws_" + table);
  if(prop === "rpc") return (name:string,args?:object) => target.rpc("ws_" + name,args);
  const value = Reflect.get(target,prop);return typeof value === "function" ? value.bind(target) : value;
 }
}) : null;
