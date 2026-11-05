import { MapPin, Plus } from "lucide-react";
import { insert, list, useLoad } from "../../lib/db.ts";
import { fmtDate } from "../../lib/dates.ts";
import { go, href, setQuery, type Route } from "../../lib/route.ts";
import { PRESENTATION, TRIP_KIND, TRIP_STATUS, type Trip } from "../../lib/types.ts";
import { Badge, Empty, ErrorText, PageHeader, Tabs } from "../../components/ui.tsx";
import { SECTIONS } from "../../lib/sections.ts";
import { formatMoney, todayISO } from "../loans/balance.ts";
import { daysBetween, defaultChecklist, nextTripDate, relativeDays, tripMoney } from "./logic.ts";
import { setupError } from "./ThesisView.tsx";

export async function createTrip(values: Partial<Trip> = {}) {
  const t = await insert<Trip>("trips", { title: "New conference", checklist: defaultChecklist(false), ...values });
  go(`trips/${t.id}`);
}

type View = "upcoming" | "past" | "all";
export const tripSpan = (t: Pick<Trip, "starts_on" | "ends_on">) =>
  t.starts_on ? `${fmtDate(t.starts_on, { day: "numeric", month: "short" })}${t.ends_on && t.ends_on !== t.starts_on ? ` – ${fmtDate(t.ends_on, { day: "numeric", month: "short" })}` : ""} ${t.starts_on.slice(0, 4)}` : "Dates not set";

export function TripsView({ route }: { route: Route }) {
  const view = (route.query.get("view") as View) || "upcoming";
  const today = todayISO();
  const { data, error } = useLoad(() => list<Trip>("trips", { order: [["starts_on"], ["created_at"]] }), []);
  const trips = data ?? [];
  const past = (t: Trip) => t.status === "attended" || t.status === "cancelled" || (!!t.ends_on && t.ends_on < today);
  const shown = trips.filter((t) => (view === "all" ? true : view === "past" ? past(t) : !past(t)));
  if (view === "past") shown.reverse();
  return (
    <section className={!data && !error ? "is-loading" : undefined} aria-busy={(!data && !error) || undefined}>
      <PageHeader
        section="trips"
        title="Conferences & trips"
        subtitle="Abstracts, registration, travel awards, costs and the packing list for each conference, workshop or lab visit."
        actions={<button className="primary" onClick={() => void createTrip()}><Plus size={16} /> Trip</button>}
      />
      <Tabs value={view} options={[["upcoming", "Upcoming"], ["past", "Past"], ["all", "All"]]} counts={{ upcoming: trips.filter((t) => !past(t)).length, past: trips.filter(past).length }} onChange={(v) => setQuery("view", v === "upcoming" ? undefined : v)} />
      <ErrorText error={setupError(error)} />
      {data && shown.length === 0 && <div className="card pad"><Empty icon={SECTIONS.trips.icon}>{trips.length ? "Nothing here." : "No trips yet. Add a conference you are considering, even before the abstract is in."}</Empty></div>}
      <div className="trip-grid">
        {shown.map((t) => {
          const next = nextTripDate(t, today);
          const money = tripMoney(t);
          const done = t.checklist.filter((c) => c.done).length;
          return (
            <a key={t.id} className="card pad trip-card" href={href(`trips/${t.id}`)}>
              <span className="trip-card-head"><strong>{t.title}</strong><Badge tone={t.status === "cancelled" ? "quiet" : t.status === "attended" ? "pos" : t.status === "considering" ? undefined : "accent"}>{TRIP_STATUS[t.status]}</Badge></span>
              <span className="muted small">{tripSpan(t)}{t.location && <> · <MapPin size={12} aria-hidden /> {t.location}</>}</span>
              <span className="small">{TRIP_KIND[t.kind]}{t.presentation !== "none" ? ` · ${PRESENTATION[t.presentation]}` : ""}</span>
              {next && <span className={`small ${next.label !== "Starts" && daysBetween(today, next.date) <= 7 ? "warn-text" : ""}`}><strong>{next.label}</strong> {relativeDays(today, next.date)} ({fmtDate(next.date, { day: "numeric", month: "short" })})</span>}
              <span className="muted small">
                {money.total > 0 && <>{formatMoney(money.total, t.currency)} cost{money.awarded > 0 ? ` · ${formatMoney(money.awarded, t.currency)} funded` : ""} · </>}
                {t.checklist.length > 0 && `${done}/${t.checklist.length} ready`}
              </span>
            </a>
          );
        })}
      </div>
    </section>
  );
}
