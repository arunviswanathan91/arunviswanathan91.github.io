import { createRoot } from "react-dom/client";
import "./extended/styles.css";
import { SECTION_ORDER, SECTION_TYPES } from "./extended/modules/resumes/model.ts";
createRoot(document.getElementById("r")!).render(
  <div className="rb" style={{ padding: 16, width: 780 }}>
    <div className="rb-tiles" id="tiles">{SECTION_ORDER.map((t) => <button key={t} className="rb-tile"><strong>{SECTION_TYPES[t].label}</strong><span className="muted small">{SECTION_TYPES[t].blurb}</span></button>)}</div>
    <div className="rb-card" style={{ width: 400, marginTop: 20 }} id="card"><div className="rb-card-body">
      <label className="toggle"><input type="checkbox" /> Group promotions (consecutive roles at one employer share a heading)</label>
      <div className="tabs">{["Job Title – Employer", "Employer – Job Title"].map((x) => <button key={x}>{x}</button>)}</div>
      <div className="rb-item"><div className="rb-item-head"><button className="rb-toggle"><span className="rb-ell">Uttroside B, a US FDA-designated ‘Orphan Drug’, mitigates the development of hepatocellular carcinoma</span></button><span className="rb-actions"><button className="icon">a</button><button className="icon">b</button><button className="icon">c</button><button className="icon">d</button></span></div></div>
    </div></div>
  </div>);
