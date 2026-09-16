import { useEffect, useState, type FormEvent } from "react";
import { SlidersHorizontal } from "lucide-react";
import { supabase } from "../../lib/supabase";
import { useData } from "../../lib/store";
import type { AssessmentPreferences as Preferences } from "../../lib/decision";
import { SelectMenu } from "../ui/SelectMenu";

const subjects = ["Cancer biology", "Cancer immunology", "Computational biology", "Bioinformatics", "Single-cell genomics", "Spatial biology", "Molecular biology", "Machine learning", "Drug discovery", "Microbiology"];
const empty: Preferences = { interests: [], avoid: [], nationality: "", residence: "", household: 1, housing: "shared", careerGoal: "" };
const split = (text: string) => [...new Set(text.split(/[,;\n]/).map(s => s.trim()).filter(Boolean))].slice(0, 12);

export function AssessmentPreferences({disabled=false}:{disabled?:boolean}) {
 const { userId } = useData();
 const [prefs, setPrefs] = useState<Preferences>(empty);
 const [topics, setTopics] = useState("");
 const [avoid, setAvoid] = useState("");
 const [loading, setLoading] = useState(true);
 const [saving, setSaving] = useState(false);
 const [loadError, setLoadError] = useState(false);
 const [message, setMessage] = useState("");
 useEffect(() => {
  let current = true;
  setLoading(true); setLoadError(false);
  void (async () => {
   if (!supabase) { if(current){setLoadError(true);setLoading(false);setMessage("Connect your workspace to save preferences.")} return; }
   const { data, error } = await supabase.from("discovery_profiles").select("ontology_overrides,terms")
    .eq("user_id", userId).eq("active", true).order("created_at").limit(1).maybeSingle();
   if (!current) return;
   if (error) { setMessage(error.message); setLoadError(true); }
   else {
    const saved = data?.ontology_overrides?.assessment_preferences ?? {};
    const value = { ...empty, ...saved, interests: saved.interests?.length ? saved.interests : data?.terms ?? [] };
    setPrefs(value); setTopics(value.interests.join(", ")); setAvoid((value.avoid ?? []).join(", "));
   }
   setLoading(false);
  })();
  return () => { current = false; };
 }, [userId]);
 const save = async (event: FormEvent) => {
  event.preventDefault();
  if (!supabase || loading || loadError || saving || disabled) return;
  const interests = split(topics);
  if (!interests.length) { setMessage("Choose at least one research interest."); return; }
  setSaving(true); setMessage("");
  try {
   // Re-read immediately before saving so unrelated ontology settings survive.
   const { data, error } = await supabase.from("discovery_profiles").select("id,ontology_overrides")
    .eq("user_id", userId).eq("active", true).order("created_at").limit(1).maybeSingle();
   if (error) throw error;
   const value = { ...prefs, interests, avoid: split(avoid), nationality: prefs.nationality.trim(), residence: prefs.residence.trim(), careerGoal: prefs.careerGoal.trim() };
   const ontology_overrides = { ...data?.ontology_overrides, assessment_preferences: value };
   const result = data
    ? await supabase.from("discovery_profiles").update({ ontology_overrides }).eq("id", data.id).eq("user_id", userId).select("id").single()
    : await supabase.from("discovery_profiles").insert({ user_id: userId, active: true, terms: interests, ontology_overrides }).select("id").single();
   if (result.error) throw result.error;
   setPrefs(value);
   setMessage("Saved. New searches and the next AI context backfill will use these preferences. Existing briefs show the preferences used when they were generated.");
  } catch (error) { setMessage(error instanceof Error ? error.message : "Preferences could not be saved. Please try again."); }
  finally { setSaving(false); }
 };
 const selected = split(topics);
 return <details className="assessment-preferences">
  <summary><SlidersHorizontal/>Research & relocation preferences</summary>
  <form onSubmit={save}>
   <p>Choose the science you want to work on, then personalise the visa and budget assessment. Research interests guide matching; they are not treated as qualifications.</p>
   <fieldset disabled={loading || saving || loadError || disabled}>
    <legend>Research interests</legend>
    <div className="assessment-subjects">{subjects.map(subject => <button key={subject} type="button"
     className={selected.some(s => s.toLowerCase() === subject.toLowerCase()) ? "selected" : ""}
     aria-pressed={selected.some(s => s.toLowerCase() === subject.toLowerCase())}
     onClick={() => setTopics((selected.some(s => s.toLowerCase() === subject.toLowerCase())
      ? selected.filter(s => s.toLowerCase() !== subject.toLowerCase()) : [...selected, subject]).join(", "))}>{subject}</button>)}</div>
    <label className="field">Your topics, separated by commas<input className="input" value={topics} maxLength={1500} onChange={e => setTopics(e.target.value)} placeholder="Cancer immunology, spatial transcriptomics…"/></label>
    <label className="field">Subjects to avoid<input className="input" value={avoid} maxLength={1000} onChange={e => setAvoid(e.target.value)} placeholder="Optional: fields you do not want"/></label>
    <div className="field-grid">
     <label className="field">Nationality<input className="input" value={prefs.nationality} maxLength={70} onChange={e => setPrefs({...prefs,nationality:e.target.value})} placeholder="e.g. India"/></label>
     <label className="field">Current country of residence<input className="input" value={prefs.residence} maxLength={70} onChange={e => setPrefs({...prefs,residence:e.target.value})} placeholder="e.g. India"/></label>
     <label className="field">People in your household<input className="input" type="number" min={1} max={8} required value={prefs.household} onChange={e => setPrefs({...prefs,household:Number(e.target.value)})}/></label>
     <div className="field"><span>Housing assumption</span><SelectMenu label="Housing assumption" value={prefs.housing} options={[{value:"shared",label:"Shared accommodation"},{value:"private",label:"Private accommodation"}]} onChange={housing=>setPrefs({...prefs,housing:housing as Preferences["housing"]})}/></div>
    </div>
    <label className="field">Career direction<textarea className="input" value={prefs.careerGoal} maxLength={400} onChange={e => setPrefs({...prefs,careerGoal:e.target.value})} placeholder="e.g. Build translational cancer research skills, then move into industry"/></label>
    <p className="muted-note">These preferences are sent to the configured AI provider with public vacancy information. No account email or credentials are included. Destination countries still follow your discovery profile.</p>
    <button className="primary" type="submit">{saving ? "Saving…" : loading ? "Loading…" : "Save preferences"}</button>
   </fieldset>
   {message && <p role="status">{message}</p>}
  </form>
 </details>;
}
