import type { CSSProperties } from "react";
import { FONTS, PAGES, bullets, dateRange, visibleSections, type ResumeData, type ResumeItem, type ResumeSection } from "./model.ts";

function Entry({ s, i, below, full, left }: { s: ResumeSection; i: ResumeItem; below: boolean; full: boolean; left: boolean }) {
  const dates = dateRange(i);
  const lines = bullets(i.body);
  const simple = s.type === "skills" || s.type === "interests" || s.type === "languages";
  const sep = s.type === "languages" ? " – " : ", ";
  const head = (
    <>
      <strong>{i.title}</strong>
      {i.subtitle && (below ? <div className="rv-sub"><em>{i.subtitle}</em></div> : <>{sep}<em>{i.subtitle}</em></>)}
    </>
  );
  const side = !simple && (dates || i.location)
    ? <div className="rv-side">{dates && <div>{dates}</div>}{i.location && <div>{i.location}</div>}</div> : null;
  return (
    <div className="rv-entry">
      <div className={`rv-row${full ? " rv-full" : ""}`}>
        {left && !full && side}
        <div className="rv-main">{i.link ? <a href={i.link}>{head}</a> : head}</div>
        {(!left || full) && side}
      </div>
      {lines.length > 0 && (s.type === "references"
        ? <div>{lines.map((l, n) => <div key={n}>{l}</div>)}</div>
        : <ul>{lines.map((l, n) => <li key={n}>{l}</li>)}</ul>)}
    </div>
  );
}

/** The resume page itself. The same markup is the on-screen preview and what is printed to PDF. */
export function ResumePreview({ data }: { data: ResumeData }) {
  const { profile: p, style: st } = data;
  const page = PAGES[st.pageFormat];
  const vars = {
    "--rv-accent": st.accent, "--rv-font": FONTS[st.font].stack, "--rv-name-font": FONTS[st.nameFont === "same" ? st.font : st.nameFont].stack,
    "--rv-base": `${st.baseSize}pt`, "--rv-name": `${st.baseSize + st.nameSize}pt`, "--rv-title": `${st.baseSize + st.titleSize}pt`,
    "--rv-heading": `${st.baseSize + st.headingSize}pt`, "--rv-entry": `${st.baseSize + st.entrySize}pt`,
    "--rv-lh": st.lineHeight, "--rv-gap": `${st.spacing}pt`, "--rv-mx": `${st.marginX}mm`, "--rv-my": `${st.marginY}mm`,
    "--rv-w": `${page.w}mm`, "--rv-h": `${page.h}mm`,
  } as CSSProperties;
  const links = p.links.filter((l) => l.label || l.url);
  const sections = visibleSections(data);
  return (
    <article className={`rv-page rv-h-${st.headingStyle} rv-${st.caps} rv-a-${st.align} rv-sep-${st.separator} rv-hl-${st.headlinePos}${(Object.keys(st.accentOn) as (keyof typeof st.accentOn)[]).filter((k) => st.accentOn[k]).map((k) => ` rv-ac-${k}`).join("")}`} style={vars}>
      {/* Margins are per printed page, so they live on @page rather than on the article. */}
      <style>{`@media print{@page{size:${page.w}mm ${page.h}mm;margin:${st.marginY}mm ${st.marginX}mm${st.footer ? `;@bottom-left{content:${JSON.stringify(p.email.split("|").map((x) => x.trim()).filter(Boolean).slice(0, 2).join(" | "))};font:8pt ${FONTS[st.font].stack}}@bottom-right{content:counter(page) "/" counter(pages);font:8pt ${FONTS[st.font].stack}}` : ""}}}`}</style>
      <header>
        <h1>{p.name || "Your name"}{p.headline && <span className="rv-headline">{p.headline}</span>}</h1>
        <div className="rv-contact">
          {p.email && <span>{p.email}</span>}
          {p.phone && <span>{p.phone}</span>}
          {links.map((l, n) => <span key={n}>{l.url ? <a href={l.url}>{l.label || l.url}</a> : l.label}</span>)}
          {p.location && <span>{p.location}</span>}
        </div>
      </header>
      {p.summary.trim() && <p className="rv-summary">{p.summary}</p>}
      {sections.map((s) => (
        <section key={s.id} className={`rv-section${st.twoColumnSkills && s.type === "skills" ? " rv-cols" : ""}${s.type === "certification" || s.type === "scores" ? " rv-grid3" : ""}${s.type === "languages" ? " rv-inline" : ""}`}>
          <h2>{s.title}</h2>
          <div className="rv-items">{s.items.map((i) => <Entry key={i.id} s={s} i={i} below={st.subtitle === "below"} full={st.entryLayout === "full"} left={st.datePos === "left"} />)}</div>
        </section>
      ))}
    </article>
  );
}
