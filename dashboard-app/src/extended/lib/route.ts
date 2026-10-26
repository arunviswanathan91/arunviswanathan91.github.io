import { useEffect, useState } from "react";

// Hash-based routing (#/papers/<id>?tab=notes) so GitHub Pages never needs server rewrites.
export interface Route {
  path: string[];
  query: URLSearchParams;
}

function read(): Route {
  const raw = window.location.hash.replace(/^#\/?/, "").replace(/^tools\/?/, "");
  const [p, q = ""] = raw.split("?");
  const path = p.split("/").filter(Boolean).map(decodeURIComponent);
  return { path: path.length ? path : ["home"], query: new URLSearchParams(q) };
}

export function useRoute(): Route {
  const [route, setRoute] = useState(read);
  useEffect(() => {
    const onChange = () => {
      setRoute(read());
      window.scrollTo(0, 0);
    };
    window.addEventListener("hashchange", onChange);
    return () => window.removeEventListener("hashchange", onChange);
  }, []);
  return route;
}

export function href(path: string, query?: Record<string, string | undefined>): string {
  const q = new URLSearchParams(Object.entries(query ?? {}).filter((e): e is [string, string] => !!e[1])).toString();
  return `#/tools/${path}${q ? `?${q}` : ""}`;
}

export function go(path: string, query?: Record<string, string | undefined>) {
  window.location.hash = href(path, query);
}

/** Update one query parameter in place (filters, tabs) without adding history noise. */
export function setQuery(key: string, value: string | undefined) {
  const r = read();
  if (value) r.query.set(key, value);
  else r.query.delete(key);
  const q = r.query.toString();
  history.replaceState(null, "", `#/tools/${r.path.join("/")}${q ? `?${q}` : ""}`);
  window.dispatchEvent(new HashChangeEvent("hashchange"));
}

