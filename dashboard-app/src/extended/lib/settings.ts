import { currentUserId, list, upsert, useLoad } from "./db.ts";
import { supabase as original } from "../../lib/supabase";
import type { Settings } from "./types.ts";

export const DEFAULT_SETTINGS = { default_currency: "INR", timezone: "Asia/Kolkata" };

export function useSettings() {
  const { data } = useLoad(async () => (await list<Settings>("settings"))[0] ?? null, []);
  return { ...DEFAULT_SETTINGS, ...(data ?? {}) };
}

export async function saveSettings(patch: Partial<Settings>) {
  const user_id = await currentUserId();
  if(patch.timezone){
   new Intl.DateTimeFormat("en",{timeZone:patch.timezone}).format();
   const {error}=await original!.from("profiles").update({timezone:patch.timezone}).eq("id",user_id);
   if(error)throw new Error(error.message);
  }
  const [current] = await list<Settings>("settings");
  await upsert("settings", { ...DEFAULT_SETTINGS, ...(current ?? {}), ...patch, user_id }, "user_id");
}

