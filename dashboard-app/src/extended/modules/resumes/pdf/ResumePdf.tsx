// The resume as a real PDF (selectable text, embedded fonts, page numbers). It reads the same data and
// style as ResumePreview, so what the editor shows is what the file contains.
import { Document, Link, Page, Text, View } from "@react-pdf/renderer";
import type { Style } from "@react-pdf/types";
import type { ReactNode } from "react";
import {
  bullets, dateRange, groupRuns, layoutFor, roundRobin, visibleSections, withSubinfo,
  type ResumeData, type ResumeItem, type ResumeSection, type ResumeStyle,
} from "../model.ts";

const MM = 72 / 25.4;
const INK = "#111111";
const GROUPED = ["skills", "languages", "interests", "certification", "courses", "awards", "scores"];

interface Ctx { st: ResumeStyle }

function B({ s, body, c }: { s: ResumeSection; body: string; c: Ctx }) {
  const lines = bullets(body);
  if (!lines.length) return null;
  return (
    <View style={{ marginTop: 1 }}>
      {lines.map((l, n) => s.type === "references"
        ? <Text key={n}>{l}</Text>
        : <View key={n} style={{ flexDirection: "row", paddingLeft: 3 }}><Text style={{ width: 9 }}>•</Text><Text style={{ flex: 1 }}>{l}</Text></View>)}
    </View>
  );
}

function Linked({ url, children }: { url: string; children: ReactNode }) {
  return url ? <Link src={url} style={{ color: INK, textDecoration: "none" }}>{children}</Link> : <>{children}</>;
}

function Side({ i, c }: { i: ResumeItem; c: Ctx }) {
  const dates = dateRange(i);
  if (!dates && !i.location) return null;
  const col = c.st.accentOn.dates ? c.st.accent : INK;
  return (
    <View style={{ alignItems: "flex-end", maxWidth: "38%", flexShrink: 0, marginLeft: 12 }}>
      {dates ? <Text style={{ color: col, textAlign: "right" }}>{dates}</Text> : null}
      {i.location ? <Text style={{ textAlign: "right" }}>{i.location}</Text> : null}
    </View>
  );
}

function Entry({ s, i, swap, c }: { s: ResumeSection; i: ResumeItem; swap: boolean; c: Ctx }) {
  const { st } = c;
  const sw = swap && !!i.subtitle;
  const [bold, ital] = sw ? [i.subtitle, i.title] : [i.title, i.subtitle];
  const full = st.entryLayout === "full", left = st.datePos === "left", below = st.subtitle === "below";
  const tcol = st.accentOn.entryTitle ? st.accent : INK;
  const main = (
    <View style={{ flex: 1 }}>
      <Linked url={i.link}>
        <Text style={{ fontSize: st.baseSize + st.entrySize }}>
          <Text style={{ fontWeight: 700, color: tcol }}>{bold}</Text>
          {ital && !below ? <Text>{", "}<Text style={{ fontStyle: "italic" }}>{ital}</Text></Text> : null}
        </Text>
        {ital && below ? <Text style={{ fontStyle: "italic" }}>{ital}</Text> : null}
      </Linked>
    </View>
  );
  const side = <Side i={i} c={c} />;
  const heavy = bullets(i.body).length > 7;
  return (
    <View style={{ marginBottom: st.spacing }} wrap={heavy}>
      <View style={{ flexDirection: full ? "column" : "row", justifyContent: "space-between" }}>
        {left && !full ? side : null}{main}{!left || full ? side : null}
      </View>
      <B s={s} body={i.body} c={c} />
    </View>
  );
}

function Promoted({ s, run, c }: { s: ResumeSection; run: ResumeItem[]; c: Ctx }) {
  const { st } = c;
  const first = run[0];
  const full = st.entryLayout === "full", left = st.datePos === "left";
  return (
    <View style={{ marginBottom: st.spacing }}>
      <Linked url={first.link}><Text style={{ fontWeight: 700, fontSize: st.baseSize + st.entrySize }}>{first.subtitle}</Text></Linked>
      <View style={{ borderLeftWidth: 0.75, borderLeftColor: "#bbbbbb", paddingLeft: 8, marginTop: 1 }}>
        {run.map((i, n) => {
          const side = <Side i={i} c={c} />;
          return (
            <View key={i.id} style={{ marginBottom: n < run.length - 1 ? st.spacing : 0 }} wrap={bullets(i.body).length > 7}>
              <View style={{ flexDirection: full ? "column" : "row", justifyContent: "space-between" }}>
                {left && !full ? side : null}
                <View style={{ flex: 1 }}><Text style={{ fontWeight: 700 }}>{i.title}</Text></View>
                {!left || full ? side : null}
              </View>
              <B s={s} body={i.body} c={c} />
            </View>
          );
        })}
      </View>
    </View>
  );
}

function GroupItem({ s, i, L, c }: { s: ResumeSection; i: ResumeItem; L: ReturnType<typeof layoutFor>; c: Ctx }) {
  return (
    <View style={{ marginBottom: c.st.spacing }} wrap={false}>
      <Linked url={i.link}>
        <Text>
          <Text style={{ fontWeight: 700 }}>{i.title}</Text>
          {i.subtitle && L.mode === "rows" ? <Text>{L.subinfo === "dash" ? " – " : L.subinfo === "bracket" ? " (" : ": "}{i.subtitle}{L.subinfo === "bracket" ? ")" : ""}</Text> : null}
        </Text>
      </Linked>
      {i.subtitle && L.mode !== "rows" ? <Text>{i.subtitle}</Text> : null}
      <B s={s} body={i.body} c={c} />
    </View>
  );
}

/** A single-column list can break between items; the other layouts are one block. */
function groupParts(s: ResumeSection, c: Ctx): ReactNode[] {
  const L = layoutFor(c.st, s.type);
  if ((L.mode === "grid" || L.mode === "rows") && (L.mode === "rows" || L.cols === 1)) return s.items.map((i) => <GroupItem key={i.id} s={s} i={i} L={L} c={c} />);
  return [<Group key="g" s={s} c={c} />];
}

function Group({ s, c }: { s: ResumeSection; c: Ctx }) {
  const { st } = c;
  const L = layoutFor(st, s.type);
  if (L.mode === "grid" || L.mode === "rows") {
    const cols = L.mode === "rows" ? 1 : L.cols;
    if (cols === 1) return <View>{s.items.map((i) => <GroupItem key={i.id} s={s} i={i} L={L} c={c} />)}</View>;
    if (s.type === "skills") {
      return (
        <View style={{ flexDirection: "row" }}>
          {roundRobin(s.items, cols).map((col, n) => (
            <View key={n} style={{ flex: 1, paddingRight: n < cols - 1 ? 14 : 0 }}>{col.map((i) => <GroupItem key={i.id} s={s} i={i} L={L} c={c} />)}</View>
          ))}
        </View>
      );
    }
    const rows: ResumeItem[][] = [];
    for (let k = 0; k < s.items.length; k += cols) rows.push(s.items.slice(k, k + cols));
    return (
      <View>
        {rows.map((r, n) => (
          <View key={n} style={{ flexDirection: "row" }} wrap={false}>
            {Array.from({ length: cols }, (_, k) => (
              <View key={k} style={{ width: `${100 / cols}%`, paddingRight: 12 }}>{r[k] ? <GroupItem s={s} i={r[k]} L={L} c={c} /> : null}</View>
            ))}
          </View>
        ))}
      </View>
    );
  }
  const sep = L.sep === "pipe" ? "  |  " : L.sep === "comma" ? ", " : "  •  ";
  if (L.mode === "bubble") {
    return (
      <View>
        {s.items.map((i) => {
          const lines = bullets(i.body);
          const chips = lines.length ? lines : [withSubinfo(i.title, i.subtitle, L.subinfo)];
          return (
            <View key={i.id} style={{ flexDirection: "row", flexWrap: "wrap", alignItems: "center", marginBottom: 3 }}>
              {lines.length ? <Text style={{ fontWeight: 700, marginRight: 5 }}>{i.title}</Text> : null}
              {chips.map((t, n) => <Text key={n} style={{ borderWidth: 0.75, borderColor: "#888888", borderRadius: 9, paddingHorizontal: 6, paddingVertical: 0.5, marginRight: 4, marginBottom: 2 }}>{t}</Text>)}
            </View>
          );
        })}
      </View>
    );
  }
  // compact: everything runs on in one paragraph
  return (
    <Text>
      {s.items.map((i, n) => {
        const lines = bullets(i.body);
        const chips = lines.length ? lines : [withSubinfo(i.title, i.subtitle, L.subinfo)];
        return (
          <Text key={i.id}>
            {n > 0 ? ", " : ""}
            {lines.length ? <Text style={{ fontWeight: 700 }}>{i.title}{L.subinfo === "dash" ? " — " : " "}</Text> : null}
            {chips.join(sep)}
          </Text>
        );
      })}
    </Text>
  );
}

function Heading({ title, c }: { title: string; c: Ctx }) {
  const { st } = c;
  const line = st.accentOn.line ? st.accent : INK;
  const box: Style =
    st.headingStyle === "underline" ? { borderBottomWidth: 1, borderBottomColor: line } :
    st.headingStyle === "overline" ? { borderTopWidth: 1, borderTopColor: line, paddingTop: 2 } :
    st.headingStyle === "box" ? { borderWidth: 1, borderColor: line, paddingHorizontal: 5, paddingVertical: 1 } :
    st.headingStyle === "bar" ? { borderLeftWidth: 3, borderLeftColor: line, paddingLeft: 5 } :
    st.headingStyle === "dotted" ? { borderBottomWidth: 1, borderBottomColor: line, borderBottomStyle: "dotted" } : {};
  return (
    <View style={{ ...box, marginBottom: st.spacing, paddingBottom: st.headingStyle === "underline" || st.headingStyle === "dotted" ? 1.5 : box.paddingBottom }}>
      <Text style={{ lineHeight: 1.3, fontWeight: 700, fontSize: st.baseSize + st.headingSize, color: st.accentOn.headings ? st.accent : INK, textTransform: st.caps === "uppercase" ? "uppercase" : "none", letterSpacing: st.caps === "uppercase" ? 0.6 : 0 }}>{title}</Text>
    </View>
  );
}

export function ResumePdf({ data, body, nameFont, title }: { data: ResumeData; body: string; nameFont: string; title: string }) {
  const { profile: p, style: st } = data;
  const c: Ctx = { st };
  const center = st.align === "center";
  const links = p.links.filter((l) => l.label || l.url);
  const sep = st.separator === "bar" ? "  |  " : st.separator === "bullet" ? "  •  " : "    ";
  const parts: ReactNode[] = [];
  const add = (node: ReactNode) => { if (parts.length) parts.push(<Text key={`s${parts.length}`} style={{ color: "#777777" }}>{sep}</Text>); parts.push(node); };
  if (p.email) add(<Text key="e">{p.email}</Text>);
  if (p.phone) add(<Text key="p">{p.phone}</Text>);
  links.forEach((l, n) => add(<Linked key={`l${n}`} url={l.url}><Text>{l.label || l.url}</Text></Linked>));
  if (p.location) add(<Text key="o">{p.location}</Text>);
  const summary = p.summary.trim();
  const nameCol = st.accentOn.name ? st.accent : INK, headCol = st.accentOn.headline ? st.accent : INK;
  const sections = visibleSections(data);
  const footerEmail = p.email.split("|").map((x) => x.trim()).filter(Boolean).slice(0, 2).join(" | ");
  return (
    <Document title={p.name ? `${p.name} – ${title}` : title} author={p.name} creator="Arun's workspace">
      <Page size={st.pageFormat === "A4" ? "A4" : "LETTER"}
        style={{ fontFamily: body, fontSize: st.baseSize, lineHeight: st.lineHeight, color: INK, paddingTop: st.marginY * MM, paddingBottom: st.marginY * MM, paddingHorizontal: st.marginX * MM }}>
        <View style={{ textAlign: center ? "center" : "left" }}>
          <Text style={{ fontFamily: nameFont, fontSize: st.baseSize + st.nameSize, lineHeight: 1.25 }}>
            <Text style={{ fontSize: st.baseSize + st.nameSize, fontWeight: 700, color: nameCol }}>{p.name || "Your name"}</Text>
            {p.headline && st.headlinePos === "inline" ? <Text style={{ fontFamily: body, fontSize: st.baseSize + st.titleSize, color: headCol }}>{"  "}{p.headline}</Text> : null}
          </Text>
          {p.headline && st.headlinePos === "below" ? <Text style={{ fontSize: st.baseSize + st.titleSize, color: headCol }}>{p.headline}</Text> : null}
          <Text style={{ marginTop: 3, fontFamily: body, fontSize: st.baseSize, lineHeight: st.lineHeight }}>{parts}</Text>
          {summary && st.summaryInHeader ? <Text style={{ marginTop: st.spacing * 2, textAlign: center ? "center" : "justify" }}>{p.summary}</Text> : null}
        </View>
        {summary && !st.summaryInHeader ? (
          st.summaryHeading
            ? <View style={{ marginTop: st.spacing * 3 }}><Heading title="Summary" c={c} /><Text style={{ textAlign: "justify" }}>{p.summary}</Text></View>
            : <Text style={{ marginTop: st.spacing * 2, textAlign: "justify" }}>{p.summary}</Text>
        ) : null}
        {sections.map((s) => {
          const swap = (s.type === "education" && st.swapEducation) || (s.type === "experience" && st.swapExperience);
          const grouped = s.type === "experience" && st.groupPromotions;
          const parts: ReactNode[] = GROUPED.includes(s.type)
            ? groupParts(s, c)
            : (grouped ? groupRuns(s.items) : s.items.map((i) => [i])).map((run) =>
                run.length > 1 ? <Promoted key={run[0].id} s={s} run={run} c={c} /> : <Entry key={run[0].id} s={s} i={run[0]} swap={swap} c={c} />);
          // The heading always travels with the first entry, so it is never left alone at the foot of a page.
          return (
            <View key={s.id} style={{ marginTop: st.spacing * 3 }}>
              <View wrap={false}><Heading title={s.title} c={c} />{parts[0]}</View>
              {parts.slice(1)}
            </View>
          );
        })}
        {st.footer ? (
          <View fixed style={{ position: "absolute", left: st.marginX * MM, right: st.marginX * MM, bottom: Math.max(8, st.marginY * MM * 0.35), flexDirection: "row", justifyContent: "space-between", fontSize: 8, color: "#444444" }}>
            <Text>{footerEmail}</Text>
            <Text render={({ pageNumber, totalPages }) => `${pageNumber}/${totalPages}`} />
          </View>
        ) : null}
      </Page>
    </Document>
  );
}
