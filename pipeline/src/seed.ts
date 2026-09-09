import { Db } from "./db.js";
import { readEnv } from "./config.js";
import { Http, DEFAULT_HTTP } from "./http.js";
import { refreshDefaultSources } from "./sources/catalog/defaults.js";
import { extractSiteSnapshot, termsFromSnapshot } from "./profile/from-site.js";

const SITE_URL = "https://arunviswanathan91.github.io/";

/**
 * One-time (or re-runnable) setup: registers the source catalog and creates or
 * refreshes the default search profile from the site's own markup. Safe to run
 * repeatedly -- sources upsert by (user_id, source_key), and the profile is only
 * created once, then only its site-derived fields are refreshed.
 */
async function main() {
 const env = readEnv();
 const db = new Db(env);
 const userId = await db.resolveUserId(env.userId);
 console.log(`Seeding discovery config for user ${userId}`);

 const sourceKeys = await refreshDefaultSources(db, userId);
 for (const key of sourceKeys) console.log(`  ${key}: ok`);

 // Seed (or refresh) the candidate profile from the site's own structured markup.
 const http = new Http(DEFAULT_HTTP, 5);
 let snapshot = null;
 try {
  const res = await http.get(SITE_URL);
  if (res.ok) snapshot = extractSiteSnapshot(res.body);
 } catch (e) {
  console.warn(`  could not fetch ${SITE_URL}: ${String(e)}`);
 }

 const { data: existing } = await db.client
  .from("discovery_profiles").select("id").eq("user_id", userId).eq("active", true).limit(1).maybeSingle();

 const siteFields = snapshot
  ? { site_snapshot: snapshot, site_fetched_at: snapshot.fetchedAt, terms: termsFromSnapshot(snapshot) }
  : {};

 if (existing?.id) {
  if (snapshot) {
   await db.client.from("discovery_profiles").update(siteFields).eq("id", existing.id);
   console.log("  profile: refreshed site snapshot on existing profile");
  } else {
   console.log("  profile: already exists, left unchanged (site fetch failed)");
  }
 } else {
  // Postdoc search is international by request -- Scandinavia weighted highest in
  // scoring, other Western Europe close behind. Industry roles are fine anywhere
  // in India (arguably preferable: no visa friction) or remote.
  const { error } = await db.client.from("discovery_profiles").insert({
   user_id: userId, name: "Default", active: true,
   types: ["Postdoc", "Research scientist", "Industry R&D", "Fellowship", "Staff scientist"],
   home_city: "Thiruvananthapuram",
   india_cities: ["Thiruvananthapuram", "Kochi", "Bengaluru", "Hyderabad", "Chennai", "Pune", "Mumbai"],
   countries: ["IN", "SE", "NO", "DK", "FI", "DE", "NL", "CH", "GB", "FR", "BE", "AT", "IE"],
   remote_ok: true, faculty_ok: false, years_experience: 0,
   reject_below_floor: false,
   ...siteFields,
  });
  console.log(`  profile: ${error ? "FAILED - " + error.message : "created"}`);
 }

 console.log("\nDone. Set ADZUNA_APP_ID / ADZUNA_APP_KEY and JOOBLE_API_KEY as secrets before the first real run.");
}

main().catch(e => { console.error(e); process.exit(1); });
