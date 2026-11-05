import { useEffect, useMemo, useRef, useState } from "react";
import { list, useLoad } from "../../lib/db.ts";
import { fmtDate } from "../../lib/dates.ts";
import { combine, useFx } from "../../lib/fx.ts";
import { href } from "../../lib/route.ts";
import { useSettings } from "../../lib/settings.ts";
import { Empty, ErrorText, PageHeader } from "../../components/ui.tsx";
import { SECTIONS } from "../../lib/sections.ts";
import { formatMoney, todayISO } from "../loans/balance.ts";
import { netWorthSeries, totals, type NwAccount, type NwLoan, type NwPayment, type NwTx } from "./logic.ts";

type Row = ReturnType<typeof totals> & { date: string };

export function NetWorthView() {
  const cur = useSettings().default_currency;
  const today = todayISO();
  const { data, error } = useLoad(async () => {
    // Only entries that move an account or a loan matter; three narrow queries instead of every transaction.
    const [accounts, fromAcc, toAcc, onCard, loans, payments] = await Promise.all([
      list<NwAccount & { name: string }>("savings_accounts"),
      list<NwTx & { id: string }>("transactions", { notNull: ["account_id"] }),
      list<NwTx & { id: string }>("transactions", { notNull: ["to_account_id"] }),
      list<NwTx & { id: string }>("transactions", { notNull: ["loan_id"] }),
      list<NwLoan>("loans"),
      list<NwPayment>("loan_payments"),
    ]);
    const txs = [...new Map([...fromAcc, ...toAcc, ...onCard].map((t) => [t.id, t])).values()];
    return { accounts, txs, loans, payments };
  }, []);

  const series = useMemo(() => (data ? netWorthSeries(data, today) : []), [data, today]);
  const multi = series.some((p) => [p.accounts, p.owedToYou, p.debts].some((m) => Object.keys(m).some((c) => c.toUpperCase() !== cur.toUpperCase())));
  const fx = useFx(cur, multi);
  const convert = (m: Record<string, number>) => {
    const keys = Object.keys(m);
    if (!keys.length) return 0;
    if (keys.every((c) => c.toUpperCase() === cur.toUpperCase())) return keys.reduce((t, k) => t + m[k], 0);
    return fx ? combine(m, fx) : null;
  };
  const rows: Row[] = series.map((p) => ({ date: p.date, ...totals(p, convert) }));
  const now = rows.at(-1);
  const change = (back: number) => {
    const then = rows.at(-1 - back);
    return now?.net != null && then?.net != null ? now.net - then.net : null;
  };

  const empty = data && !data.accounts.length && !data.loans.length;
  return (
    <section className={!data && !error ? "is-loading" : undefined} aria-busy={(!data && !error) || undefined}>
      <PageHeader
        section="networth"
        title="Net worth"
        subtitle="Savings accounts plus money owed to you, minus loans and card balances, at the end of each month. Rebuilt from your account and loan history."
      />
      <ErrorText error={error} />
      {empty && (
        <div className="card pad">
          <Empty icon={SECTIONS.networth.icon}>
            Add a savings account in <a href={href("budget")}>Budget</a> or a loan in <a href={href("loans")}>Loans &amp; cards</a> and your net worth appears here.
          </Empty>
        </div>
      )}
      {data && !empty && now && (
        <>
          <div className="nw-stats">
            <div className="card pad nw-hero">
              <span className="muted small">Net worth today</span>
              <strong className="nw-big">{now.net == null ? "…" : formatMoney(now.net, cur)}</strong>
              <span className="small">
                <Delta value={change(1)} cur={cur} label="since last month" />
                {rows.length > 12 && <> · <Delta value={change(12)} cur={cur} label="in a year" /></>}
              </span>
            </div>
            <Stat label="Savings accounts" value={now.accounts} cur={cur} />
            <Stat label="Owed to you" value={now.owedToYou} cur={cur} />
            <Stat label="Loans & cards" value={now.debts == null ? null : -now.debts} cur={cur} />
          </div>
          {multi && <p className="muted small">Other currencies are converted at today’s rates{fx ? ` (${fmtDate(fx.date)})` : ", loading…"}, so earlier months are estimates.</p>}
          {rows.length > 1 && (
            <div className="card pad">
              <h2 className="section-title">Net worth by month</h2>
              <LineChart rows={rows} cur={cur} />
            </div>
          )}
          <div className="card list-card">
            <div className="table-scroll">
              <table className="nw-table">
                <caption className="sr-only">Net worth at the end of each month</caption>
                <thead><tr><th scope="col">Month</th><th scope="col">Savings</th><th scope="col">Owed to you</th><th scope="col">Loans &amp; cards</th><th scope="col">Net worth</th></tr></thead>
                <tbody>
                  {[...rows].reverse().map((r) => (
                    <tr key={r.date}>
                      <th scope="row">{r.date === today ? "Today" : fmtDate(r.date, { month: "short", year: "numeric" })}</th>
                      <td className="num">{money(r.accounts, cur)}</td>
                      <td className="num">{money(r.owedToYou, cur)}</td>
                      <td className="num">{r.debts ? money(-r.debts, cur) : money(0, cur)}</td>
                      <td className="num"><strong>{money(r.net, cur)}</strong></td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          </div>
        </>
      )}
    </section>
  );
}

const money = (v: number | null, cur: string) => (v == null ? "—" : formatMoney(v, cur));

function Stat({ label, value, cur }: { label: string; value: number | null; cur: string }) {
  return (
    <div className="card pad nw-stat">
      <span className="muted small">{label}</span>
      <strong>{money(value, cur)}</strong>
    </div>
  );
}

function Delta({ value, cur, label }: { value: number | null; cur: string; label: string }) {
  if (value == null) return <span className="muted">—</span>;
  const sign = value > 0 ? "+" : value < 0 ? "−" : "±";
  return <span className={value > 0 ? "pos" : value < 0 ? "neg" : "muted"}>{sign}{formatMoney(Math.abs(value), cur)} <span className="muted">{label}</span></span>;
}

/** One series over time: 2px line, end dot, hairline grid, crosshair + tooltip on hover or arrow keys. */
function LineChart({ rows, cur }: { rows: Row[]; cur: string }) {
  const [hover, setHover] = useState<number | null>(null);
  // Drawn at the card's real width, so text and strokes stay their true size on any screen.
  const box = useRef<HTMLDivElement>(null);
  const [W, setW] = useState(720);
  useEffect(() => {
    const el = box.current;
    if (!el) return;
    const ro = new ResizeObserver(([e]) => setW(Math.max(280, Math.round(e.contentRect.width))));
    ro.observe(el);
    return () => ro.disconnect();
  }, []);
  const pts = rows.map((r, i) => ({ i, date: r.date, v: r.net })).filter((p): p is { i: number; date: string; v: number } => p.v != null);
  if (pts.length < 2) return <p className="muted small">Waiting for exchange rates…</p>;
  const H = W < 500 ? 200 : 260, L = 52, R = 12, T = 12, B = 28;
  const vals = pts.map((p) => p.v);
  let lo = Math.min(0, ...vals), hi = Math.max(0, ...vals);
  if (hi === lo) hi = lo + 1;
  const step = niceStep((hi - lo) / 4);
  lo = Math.floor(lo / step) * step; hi = Math.ceil(hi / step) * step;
  const x = (i: number) => L + (i / Math.max(1, rows.length - 1)) * (W - L - R);
  const y = (v: number) => T + (1 - (v - lo) / (hi - lo)) * (H - T - B);
  const ticks: number[] = []; for (let v = lo; v <= hi + step / 2; v += step) ticks.push(v);
  const path = pts.map((p, k) => `${k ? "L" : "M"}${x(p.i).toFixed(1)},${y(p.v).toFixed(1)}`).join(" ");
  const labelEvery = Math.ceil(rows.length / Math.max(2, Math.floor((W - L - R) / 72)));
  const last = pts.at(-1)!;
  const h = hover == null ? null : pts.find((p) => p.i === hover) ?? null;
  const compact = (v: number) => new Intl.NumberFormat("en-IN", { notation: "compact", maximumFractionDigits: 1 }).format(v);
  return (
    <div className="nw-chart" ref={box}>
      <svg
        width={W}
        height={H}
        viewBox={`0 0 ${W} ${H}`}
        role="img"
        aria-label={`Net worth from ${fmtDate(pts[0].date)} to ${fmtDate(last.date)}: ${formatMoney(pts[0].v, cur)} to ${formatMoney(last.v, cur)}. Monthly values are in the table below.`}
        tabIndex={0}
        onMouseLeave={() => setHover(null)}
        onMouseMove={(e) => {
          const box = e.currentTarget.getBoundingClientRect();
          const px = ((e.clientX - box.left) / box.width) * W;
          const i = Math.round(((px - L) / (W - L - R)) * (rows.length - 1));
          setHover(Math.max(0, Math.min(rows.length - 1, i)));
        }}
        onKeyDown={(e) => {
          if (e.key !== "ArrowLeft" && e.key !== "ArrowRight") return;
          e.preventDefault();
          setHover((v) => Math.max(0, Math.min(rows.length - 1, (v ?? rows.length - 1) + (e.key === "ArrowLeft" ? -1 : 1))));
        }}
        onBlur={() => setHover(null)}
      >
        {ticks.map((t) => (
          <g key={t}>
            <line className={t === 0 ? "nw-zero" : "nw-grid"} x1={L} x2={W - R} y1={y(t)} y2={y(t)} />
            <text className="nw-axis" x={L - 8} y={y(t)} textAnchor="end" dominantBaseline="middle">{compact(t)}</text>
          </g>
        ))}
        {rows.map((r, i) => (i % labelEvery === 0 || i === rows.length - 1) && (
          <text key={r.date} className="nw-axis" x={x(i)} y={H - 8} textAnchor={i === 0 ? "start" : i === rows.length - 1 ? "end" : "middle"}>
            {fmtDate(r.date, { month: "short", year: "2-digit" })}
          </text>
        ))}
        <path className="nw-line" d={path} />
        <circle className="nw-dot" cx={x(last.i)} cy={y(last.v)} r={4.5} />
        {h && (
          <g>
            <line className="nw-cross" x1={x(h.i)} x2={x(h.i)} y1={T} y2={H - B} />
            <circle className="nw-dot" cx={x(h.i)} cy={y(h.v)} r={4.5} />
          </g>
        )}
      </svg>
      {h && (
        <div className="nw-tip" role="status" style={{ left: `${(x(h.i) / W) * 100}%` }}>
          <span className="muted small">{fmtDate(h.date, { month: "long", year: "numeric" })}</span>
          <strong>{formatMoney(h.v, cur)}</strong>
        </div>
      )}
    </div>
  );
}

function niceStep(raw: number): number {
  const p = 10 ** Math.floor(Math.log10(Math.max(raw, 1e-9)));
  const n = raw / p;
  return (n <= 1 ? 1 : n <= 2 ? 2 : n <= 5 ? 5 : 10) * p;
}
