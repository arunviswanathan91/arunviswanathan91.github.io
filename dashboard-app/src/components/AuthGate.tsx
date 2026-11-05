import { lazy, Suspense, useEffect, useState } from "react";
import type { Session } from "@supabase/supabase-js";
import { supabase } from "../lib/supabase";
// The workspace is most of the app's code. Loading it on demand keeps the
// sign-in screen small, and lets the browser fetch it while the session check runs.
const loadWorkspace=()=>import("./Workspace");
const Workspace=lazy(()=>loadWorkspace().then(m=>({default:m.Workspace})));
const Loading=({label}:{label:string})=><div className="auth-screen" aria-busy="true"><div className="auth-card auth-loading"><span className="auth-mark">AV</span><h1>{label}</h1><span className="auth-progress" aria-hidden="true"/></div></div>;

export function AuthGate(){
 const [session,setSession]=useState<Session|null>(null),[ready,setReady]=useState(false),[email,setEmail]=useState(""),[password,setPassword]=useState(""),[message,setMessage]=useState("");
 useEffect(()=>{if(!supabase){setReady(true);return}void loadWorkspace();void supabase.auth.getSession().then(({data})=>{setSession(data.session);setReady(true)});const {data}=supabase.auth.onAuthStateChange((_event,next)=>setSession(next));return()=>data.subscription.unsubscribe()},[]);
 const signIn=async(e:React.FormEvent)=>{e.preventDefault();if(!supabase)return;setMessage("Signing in…");const {error}=await supabase.auth.signInWithPassword({email,password});setMessage(error?error.message:"")};
 if(!ready)return <Loading label="Checking access…"/>;
 if(!supabase)return <div className="auth-screen"><div className="auth-card"><span className="auth-mark">AV</span><p className="kicker">Private workspace</p><h1>Workspace locked</h1><p>Supabase authentication has not been configured. No dashboard content is available.</p><a href="../">Return to the public website</a></div></div>;
 if(!session)return <div className="auth-screen"><form className="auth-card" onSubmit={signIn}><span className="auth-mark">AV</span><p className="kicker">Private workspace</p><h1>Sign in</h1><p>Only authorized accounts can open this workspace.</p><label>Email<input className="input" type="email" autoComplete="email" value={email} onChange={e=>setEmail(e.target.value)} required/></label><label>Password<input className="input" type="password" autoComplete="current-password" value={password} onChange={e=>setPassword(e.target.value)} required/></label><button className="primary" type="submit">Sign in securely</button><small className="auth-message" role="status">{message}</small></form></div>;
 return <Suspense fallback={<Loading label="Opening workspace…"/>}><Workspace userId={session.user.id}/></Suspense>;
}
