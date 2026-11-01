import type { CSSProperties } from "react";
import {
  PAGES, bullets, dateRange, fontStack, groupRuns, layoutFor, roundRobin, visibleSections, withSubinfo,
  type ResumeData, type ResumeItem, type ResumeSection, type ResumeStyle,
} from "./model.ts";

interface Opts { below: boolean; full: boolean; left: boolean; swap: boolean }

function Bullets({ s, body }: { s: ResumeSection; body: string }) {
  const lines = bullets(body);
  if (!lines.length) return null;
  return s.type === "references" ? <div>{lines.map((l, n) => <div key={n}>{l}</div>)}</div> : <ul>{lines.map((l, n) => <li key={n}>{l}</li>)}</ul>;
}

function Side({ i }: { i: ResumeItem }) {
  const dates = dateRange(i);
  return dates || i.location ? <div className="rv-side">{dates && <div>{dates}</div>}{i.location && <div>{i.location}</div>}</div> : null;
}

/** One entry: bold title, italic subtitle (swapped for education/experience if asked), dates on a side. */
function Entry({ s, i, o }: { s: ResumeSection; i: ResumeItem; o: Opts }) {
  const swap = o.swap && !!i.subtitle;
  const [bold, ital] = swap ? [i.subtitle, i.title] : [i.title, i.subtitle];
  const head = (
    <>
      <strong>{bold}</strong>
      {ital && (o.below ? <div className="rv-sub"><em>{ital}</em></div> : <>{", "}<em>{ital}</em></>)}
    </>
  );
  const side = <Side i={i} />;
  return (
    <div className="rv-entry">
      <div className={`rv-row${o.full ? " rv-full" : ""}`}>
        {o.left && !o.full && side}
        <div className="rv-main">{i.link ? <a href={i.link}>{head}</a> : head}</div>
        {(!o.left || o.full) && side}
      </div>
      <Bullets s={s} body={i.body} />
    </div>
  );
}

/** Several roles at one employer: the employer once, then each role with its own dates. */
function Promoted({ s, run, o }: { s: ResumeSection; run: ResumeItem[]; o: Opts }) {
  const first = run[0];
  return (
    <div className="rv-entry rv-group">
      <div className="rv-main"><strong>{first.link ? <a href={first.link}>{first.subtitle}</a> : first.subtitle}</strong></div>
      <div className="rv-roles">
        {run.map((i) => (
          <div key={i.id} className="rv-role">
            <div className={`rv-row${o.full ? " rv-full" : ""}`}>
              {o.left && !o.full && <Side i={i} />}
              <div className="rv-main"><strong>{i.title}</strong></div>
              {(!o.left || o.full) && <Side i={i} />}
            </div>
            <Bullets s={s} body={i.body} />
          </div>
        ))}
      </div>
    </div>
  );
}

/** Skills, languages, certificates… as a grid, rows, one compact line or bubbles. */
function Group({ s, st }: { s: ResumeSection; st: ResumeStyle }) {
  const L = layoutFor(st, s.type);
  if (L.mode === "grid" || L.mode === "rows") {
    const cols = L.mode === "rows" ? 1 : L.cols;
    if (s.type === "skills" && cols > 1) {
      return (
        <div className="rv-items rv-skillcols" style={{ "--cols": cols } as CSSProperties}>
          {roundRobin(s.items, cols).map((col, n) => (
            <div key={n} className="rv-skillcol">
              {col.map((i) => <div key={i.id} className="rv-entry"><div className="rv-main"><strong>{i.title}</strong></div><Bullets s={s} body={i.body} /></div>)}
            </div>
          ))}
        </div>
      );
    }
    return (
      <div className={`rv-items rv-gridlist${s.type === "skills" ? " rv-flow" : ""}`} style={{ "--cols": cols } as CSSProperties}>
        {s.items.map((i) => (
          <div key={i.id} className="rv-entry">
            <div className="rv-main"><strong>{i.title}</strong>{i.subtitle && (L.mode === "rows" ? <span>{L.subinfo === "dash" ? " – " : L.subinfo === "bracket" ? " (" : ": "}{i.subtitle}{L.subinfo === "bracket" ? ")" : ""}</span> : <div className="rv-sub">{i.link ? <a href={i.link}>{i.subtitle}</a> : i.subtitle}</div>)}</div>
            <Bullets s={s} body={i.body} />
          </div>
        ))}
      </div>
    );
  }
  // compact / bubble: an item with bullet lines is a labelled group of chips, otherwise it is one chip
  return (
    <div className={`rv-items rv-chips rv-m-${L.mode} rv-s-${L.sep}${L.subinfo === "dash" ? " rv-dash" : ""}`}>
      {s.items.map((i) => {
        const lines = bullets(i.body);
        const chips = lines.length ? lines : [withSubinfo(i.title, i.subtitle, L.subinfo)];
        return (
          <div key={i.id} className="rv-chiprow">
            {lines.length > 0 && <strong className="rv-chiplabel">{i.title}</strong>}
            {chips.map((c, n) => <span key={n} className="rv-chip">{c}</span>)}
          </div>
        );
      })}
    </div>
  );
}

/** The resume page itself. The same markup is the on-screen preview and what is printed to PDF. */
export function ResumePreview({ data }: { data: ResumeData }) {
  const { profile: p, style: st } = data;
  const page = PAGES[st.pageFormat];
  const vars = {
    "--rv-accent": st.accent, "--rv-font": fontStack(st.font), "--rv-name-font": fontStack(st.nameFont === "same" ? st.font : st.nameFont),
    "--rv-base": `${st.baseSize}pt`, "--rv-name": `${st.baseSize + st.nameSize}pt`, "--rv-title": `${st.baseSize + st.titleSize}pt`,
    "--rv-heading": `${st.baseSize + st.headingSize}pt`, "--rv-entry": `${st.baseSize + st.entrySize}pt`,
    "--rv-lh": st.lineHeight, "--rv-gap": `${st.spacing}pt`, "--rv-mx": `${st.marginX}mm`, "--rv-my": `${st.marginY}mm`,
    "--rv-w": `${page.w}mm`, "--rv-h": `${page.h}mm`,
  } as CSSProperties;
  const links = p.links.filter((l) => l.label || l.url);
  const sections = visibleSections(data);
  const summary = p.summary.trim();
  const base = { below: st.subtitle === "below", full: st.entryLayout === "full", left: st.datePos === "left" };
  return (
    <article className={`rv-page rv-h-${st.headingStyle} rv-${st.caps} rv-a-${st.align} rv-sep-${st.separator} rv-hl-${st.headlinePos}${(Object.keys(st.accentOn) as (keyof typeof st.accentOn)[]).filter((k) => st.accentOn[k]).map((k) => ` rv-ac-${k}`).join("")}`} style={vars}>
      <header>
        <h1>{p.name || "Your name"}{p.headline && <span className="rv-headline">{p.headline}</span>}</h1>
        <div className="rv-contact">
          {p.email && <span>{p.email}</span>}
          {p.phone && <span>{p.phone}</span>}
          {links.map((l, n) => <span key={n}>{l.url ? <a href={l.url}>{l.label || l.url}</a> : l.label}</span>)}
          {p.location && <span>{p.location}</span>}
        </div>
        {summary && st.summaryInHeader && <p className="rv-summary">{p.summary}</p>}
      </header>
      {summary && !st.summaryInHeader && (st.summaryHeading
        ? <section className="rv-section"><h2>Summary</h2><p className="rv-summary rv-plain">{p.summary}</p></section>
        : <p className="rv-summary">{p.summary}</p>)}
      {sections.map((s) => {
        const swap = (s.type === "education" && st.swapEducation) || (s.type === "experience" && st.swapExperience);
        const o: Opts = { ...base, swap };
        const grouped = s.type === "experience" && st.groupPromotions;
        const asGroup = ["skills", "languages", "interests", "certification", "courses", "awards", "scores"].includes(s.type);
        return (
          <section key={s.id} className="rv-section">
            <h2>{s.title}</h2>
            {asGroup ? <Group s={s} st={st} /> : (
              <div className="rv-items">
                {(grouped ? groupRuns(s.items) : s.items.map((i) => [i])).map((run) =>
                  run.length > 1 ? <Promoted key={run[0].id} s={s} run={run} o={o} /> : <Entry key={run[0].id} s={s} i={run[0]} o={o} />)}
              </div>
            )}
          </section>
        );
      })}
    </article>
  );
}
