import { useEffect, useState } from "react";
import type { Session } from "@supabase/supabase-js";
import { supabase } from "../lib/supabase";
import { Workspace } from "./Workspace";

export function AuthGate(){
 const [session,setSession]=useState<Session|null>(null),[ready,setReady]=useState(false),[email,setEmail]=useState(""),[password,setPassword]=useState(""),[message,setMessage]=useState("");
 useEffect(()=>{if(!supabase){setReady(true);return}void supabase.auth.getSession().then(({data})=>{setSession(data.session);setReady(true)});const {data}=supabase.auth.onAuthStateChange((_event,next)=>setSession(next));return()=>data.subscription.unsubscribe()},[]);
 const signIn=async(e:React.FormEvent)=>{e.preventDefault();if(!supabase)return;setMessage("Signing in…");const {error}=await supabase.auth.signInWithPassword({email,password});setMessage(error?error.message:"")};
 if(!ready)return <div className="auth-screen"><div className="auth-card"><span className="auth-mark">AV</span><h1>Checking access…</h1></div></div>;
 if(!supabase)return <div className="auth-screen"><div className="auth-card"><span className="auth-mark">AV</span><p className="kicker">Private workspace</p><h1>Workspace locked</h1><p>Supabase authentication has not been configured. No dashboard content is available.</p><a href="../">Return to the public website</a></div></div>;
 if(!session)return <div className="auth-screen"><form className="auth-card" onSubmit={signIn}><span className="auth-mark">AV</span><p className="kicker">Private workspace</p><h1>Sign in</h1><p>Only authorized accounts can open this workspace.</p><label>Email<input type="email" autoComplete="email" value={email} onChange={e=>setEmail(e.target.value)} required/></label><label>Password<input type="password" autoComplete="current-password" value={password} onChange={e=>setPassword(e.target.value)} required/></label><button className="primary" type="submit">Sign in securely</button><small className="auth-message" role="status">{message}</small></form></div>;
 return <Workspace userId={session.user.id}/>;
}
