import { useCallback, useEffect, useState, type FormEvent } from "react";
import { SlidersHorizontal } from "lucide-react";
import { supabase } from "../../lib/supabase";
import { useData } from "../../lib/store";
import type { AssessmentPreferences as Preferences } from "../../lib/decision";
import { SelectMenu } from "../ui/SelectMenu";
import { applyDestinationChoice, DEFAULT_DESTINATIONS, DESTINATION_NAMES, DESTINATION_OPTIONS } from "../../lib/destinations";

const subjects = ["Cancer biology", "Cancer immunology", "Computational biology", "Bioinformatics", "Single-cell genomics", "Spatial biology", "Molecular biology", "Machine learning", "Drug discovery", "Microbiology"];
const empty: Preferences = { interests: [], avoid: [], nationality: "", residence: "", household: 1, housing: "shared", careerGoal: "" };
const split = (text: string) => [...new Set(text.split(/[,;\n]/).map(s => s.trim()).filter(Boolean))].slice(0, 12);

export function AssessmentPreferences({disabled=false,registerSave}:{disabled?:boolean;registerSave?:(save:()=>Promise<boolean>)=>void}) {
 const { userId } = useData();
 const [prefs, setPrefs] = useState<Preferences>(empty);
 const [topics, setTopics] = useState("");
 const [avoid, setAvoid] = useState("");
 const [countries,setCountries]=useState<string[]>(DEFAULT_DESTINATIONS);
 const [remoteOk,setRemoteOk]=useState(true);
 const [loading, setLoading] = useState(true);
 const [saving, setSaving] = useState(false);
 const [loadError, setLoadError] = useState(false);
 const [message, setMessage] = useState("");
 useEffect(() => {
  let current = true;
  setLoading(true); setLoadError(false);
  void (async () => {
   if (!supabase) { if(current){setLoadError(true);setLoading(false);setMessage("Connect your workspace to save preferences.")} return; }
   const { data, error } = await supabase.from("discovery_profiles").select("ontology_overrides,terms,countries,remote_ok")
    .eq("user_id", userId).eq("active", true).order("created_at").limit(1).maybeSingle();
   if (!current) return;
   if (error) { setMessage(error.message); setLoadError(true); }
   else {
    const saved = data?.ontology_overrides?.assessment_preferences ?? {};
    const value = { ...empty, ...saved, interests: saved.interests?.length ? saved.interests : data?.terms ?? [] };
    setPrefs(value); setTopics(value.interests.join(", ")); setAvoid((value.avoid ?? []).join(", "));
    setCountries(Array.isArray(data?.countries)?data.countries:DEFAULT_DESTINATIONS);
    setRemoteOk(data?.remote_ok??true);
   }
   setLoading(false);
  })();
  return () => { current = false; };
 }, [userId]);
 const persist = useCallback(async () => {
  if (!supabase || loading || loadError || saving || disabled) return false;
  const interests = split(topics);
  if (!interests.length) { setMessage("Choose at least one research interest."); return false; }
  setSaving(true); setMessage("");
  try {
   // Re-read immediately before saving so unrelated ontology settings survive.
   const { data, error } = await supabase.from("discovery_profiles").select("id,ontology_overrides")
    .eq("user_id", userId).eq("active", true).order("created_at").limit(1).maybeSingle();
   if (error) throw error;
   const value = { ...prefs, interests, avoid: split(avoid), nationality: prefs.nationality.trim(), residence: prefs.residence.trim(), careerGoal: prefs.careerGoal.trim() };
   const ontology_overrides = { ...data?.ontology_overrides, assessment_preferences: value };
   if(!countries.length&&!remoteOk){setMessage("Choose at least one search destination or allow remote roles.");return false}
   const result = data
    ? await supabase.from("discovery_profiles").update({ ontology_overrides,countries,remote_ok:remoteOk }).eq("id", data.id).eq("user_id", userId).select("id").single()
    : await supabase.from("discovery_profiles").insert({ user_id: userId, active: true, terms: interests, ontology_overrides,countries,remote_ok:remoteOk }).select("id").single();
   if (result.error) throw result.error;
   setPrefs(value);
   setMessage("Saved. New searches and the next AI context backfill will use these preferences. Existing briefs show the preferences used when they were generated.");
   return true;
  } catch (error) { setMessage(error instanceof Error ? error.message : "Preferences could not be saved. Please try again."); return false; }
  finally { setSaving(false); }
 },[avoid,countries,disabled,loadError,loading,prefs,remoteOk,saving,topics,userId]);
 useEffect(()=>{registerSave?.(persist)},[persist,registerSave]);
 const save = (event: FormEvent) => { event.preventDefault(); void persist(); };
 const selected = split(topics);
 return <details className="assessment-preferences">
  <summary><SlidersHorizontal/>Search destinations, research & relocation preferences</summary>
  <form onSubmit={save}>
   <p>Search destinations control where vacancies are found. Citizenship and residence are separate domicile details used only for visa, tax, relocation and financial context.</p>
   <fieldset disabled={loading || saving || loadError || disabled}>
    <legend>Search destinations</legend>
    <div className="destination-picker">
     <SelectMenu label="Add a destination or choose a region preset" value="" options={DESTINATION_OPTIONS}
      onChange={choice=>setCountries(current=>applyDestinationChoice(current,choice))}/>
     <div className="destination-chips" aria-label="Selected search destinations">
      {countries.map(code=><button key={code} type="button" title={`Remove ${DESTINATION_NAMES[code]??code}`}
       onClick={()=>setCountries(current=>current.filter(item=>item!==code))}>{DESTINATION_NAMES[code]??code}<span aria-hidden="true">×</span></button>)}
      {!countries.length&&<span className="muted-note">No countries selected.</span>}
     </div>
     <label className="check-row"><input type="checkbox" checked={remoteOk} onChange={event=>setRemoteOk(event.target.checked)}/>Include remote opportunities</label>
     <p className="muted-note">Choosing a region replaces the current country list; choosing an individual country adds it. This setting alone controls search geography.</p>
    </div>
   </fieldset>
   <fieldset disabled={loading || saving || loadError || disabled}>
    <legend>Research interests</legend>
    <div className="assessment-subjects">{subjects.map(subject => <button key={subject} type="button"
     className={selected.some(s => s.toLowerCase() === subject.toLowerCase()) ? "selected" : ""}
     aria-pressed={selected.some(s => s.toLowerCase() === subject.toLowerCase())}
     onClick={() => setTopics((selected.some(s => s.toLowerCase() === subject.toLowerCase())
      ? selected.filter(s => s.toLowerCase() !== subject.toLowerCase()) : [...selected, subject]).join(", "))}>{subject}</button>)}</div>
    <label className="field">Your topics, separated by commas<input className="input" value={topics} maxLength={1500} onChange={e => setTopics(e.target.value)} placeholder="Cancer immunology, spatial transcriptomics…"/></label>
    <label className="field">Subjects to avoid<input className="input" value={avoid} maxLength={1000} onChange={e => setAvoid(e.target.value)} placeholder="Optional: fields you do not want"/></label>
   </fieldset>
   <fieldset disabled={loading || saving || loadError || disabled}>
    <legend>Domicile and relocation assessment</legend>
    <div className="field-grid">
     <label className="field">Citizenship / nationality — visa only<input className="input" value={prefs.nationality} maxLength={70} onChange={e => setPrefs({...prefs,nationality:e.target.value})} placeholder="e.g. India"/></label>
     <label className="field">Current residence — visa, tax and currency context<input className="input" value={prefs.residence} maxLength={70} onChange={e => setPrefs({...prefs,residence:e.target.value})} placeholder="e.g. India"/></label>
     <label className="field">People in your household<input className="input" type="number" min={1} max={8} required value={prefs.household} onChange={e => setPrefs({...prefs,household:Number(e.target.value)})}/></label>
     <div className="field"><span>Housing assumption</span><SelectMenu label="Housing assumption" value={prefs.housing} options={[{value:"shared",label:"Shared accommodation"},{value:"private",label:"Private accommodation"}]} onChange={housing=>setPrefs({...prefs,housing:housing as Preferences["housing"]})}/></div>
    </div>
    <label className="field">Career direction<textarea className="input" value={prefs.careerGoal} maxLength={400} onChange={e => setPrefs({...prefs,careerGoal:e.target.value})} placeholder="e.g. Build translational cancer research skills, then move into industry"/></label>
    <p className="muted-note">Domicile details never add India—or any other country—to the search. They are sent to the configured AI provider with public vacancy information for immigration and relocation analysis. Pay remains in destination currency unless a verified exchange rate is available for a safe home-currency comparison.</p>
    <button className="primary" type="submit">{saving ? "Saving…" : loading ? "Loading…" : "Save preferences"}</button>
   </fieldset>
   {message && <p role="status">{message}</p>}
  </form>
 </details>;
}
