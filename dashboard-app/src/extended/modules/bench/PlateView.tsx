import { ArrowLeft } from "lucide-react";
import { getOne, useLoad } from "../../lib/db.ts";
import { href, useRoute, type Route } from "../../lib/route.ts";
import { Empty, ErrorText, Loading } from "../../components/ui.tsx";
import { PlatePage, type PlateRow } from "./plate/PlatePage.tsx";

/** #/tools/bench/plate — a new plate map; with `id`, the saved one. */
export function PlateView(props: { route?: Route; id?: string }) {
  const current = useRoute();
  const route = props.route ?? current;
  return props.id ? <SavedPlate key={props.id} id={props.id} route={route} /> : <PlatePage key="new" route={route} />;
}

function SavedPlate({ id, route }: { id: string; route: Route }) {
  const { data: item, error, fresh } = useLoad(() => getOne<PlateRow>("bench_items", id), [id]);
  // The editor starts from what the server has now, never from a remembered copy: it saves
  // as you go, and an old copy would be written over progress made on another device.
  if (!fresh) return error ? <ErrorText error={error} /> : <Loading />;
  if (!item || item.kind !== "plate") {
    return (
      <section>
        <a className="back" href={href("bench")}><ArrowLeft size={14} /> Bench</a>
        <Empty>This plate map was not found. It may have been moved to Trash.</Empty>
      </section>
    );
  }
  return <PlatePage key={item.id} item={item} route={route} />;
}
