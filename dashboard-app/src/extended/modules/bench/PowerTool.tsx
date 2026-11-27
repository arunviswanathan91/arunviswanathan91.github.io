import { useState } from "react";
import { Tabs } from "../../components/ui.tsx";
import {
  detectableEffectFor, effectFromCount, effectFromFoldCv, fmt, foldFromEffectCv, log2FcFromCountEffect, num, powerOf, sampleSizeFor,
} from "./calc.ts";
import {
  CUSTOM_PROFILE, POWER_PROFILES, powerData, powerProfile, type PowerData, type PowerEngine,
} from "./model.ts";
import { Instruction, NumField, Panel, Reason, Stat, ToolFrame, Working, guard, type ToolProps } from "./parts.tsx";

const TABS: [PowerData["tab"], string][] = [["size", "Sample size"], ["power", "Power"], ["effect", "Detectable effect"]];

const pct = (p: number) => `${fmt(p * 100, 3)}%`;

export function PowerTool({ item }: ToolProps) {
  const [d, setD] = useState(() => powerData(item?.data));
  const set = (patch: Partial<PowerData>) => setD((x) => ({ ...x, ...patch }));
  // Editing any profile-owned value (engine, variability, feature count, depth) means it is no longer that profile.
  const edit = (patch: Partial<PowerData>) => set({ ...patch, profile: CUSTOM_PROFILE });
  function chooseProfile(id: string) {
    const p = powerProfile(id);
    if (!p) { set({ profile: id }); return; }
    set({ profile: id, engine: p.engine, cv: p.cv, features: p.features, mu: p.mu });
  }

  const engine: PowerEngine = d.engine;
  const sides = d.sides === "two" ? 2 : 1;
  const common = { alpha: num(d.alpha), sides: sides as 1 | 2, features: num(d.features) };

  // The standardised effect for the active engine, and the raw strings it is built from (for `guard`).
  const effect = engine === "count"
    ? effectFromCount(num(d.log2fc), num(d.mu), num(d.cv))
    : d.effectMode === "fold" ? effectFromFoldCv(num(d.fold), num(d.cv)) : num(d.d);
  const effectRaw = engine === "count" ? [d.log2fc, d.mu, d.cv] : d.effectMode === "fold" ? [d.fold, d.cv] : [d.d];
  const commonRaw = [d.alpha, d.features];

  const size = guard(sampleSizeFor({ ...common, effect, power: num(d.power) }), ...commonRaw, ...effectRaw, d.power);
  const power = guard(powerOf({ ...common, effect, n: num(d.n) }), ...commonRaw, ...effectRaw, d.n);
  const detect = guard(detectableEffectFor({ ...common, n: num(d.n), power: num(d.power) }), ...commonRaw, d.n, d.power);

  const alphaN = num(d.alpha), featuresN = num(d.features);
  const alphaStar = alphaN !== null && featuresN !== null && featuresN >= 1 ? alphaN / featuresN : null;
  const alphaLine = alphaStar === null ? null
    : featuresN === 1 ? `Significance α = ${fmt(alphaN, 3)}, ${sides === 2 ? "two" : "one"}-sided.`
    : `α corrected for ${fmt(featuresN)} features: ${fmt(alphaN, 3)} ÷ ${fmt(featuresN)} = ${fmt(alphaStar, 3)} (Bonferroni).`;

  const cite = engine === "count"
    ? "Hart et al., Calculating Sample Size Estimates for RNA Sequencing Data, J Comput Biol 2013 (RNASeqPower). Variance per feature ≈ 1/µ + CV²."
    : "Cohen, Statistical Power Analysis for the Behavioral Sciences, 1988. Normal approximation of the two-sample t-test.";

  // The detectable standardised effect, expressed in the engine's own terms.
  const detE = detect.result?.effect ?? null;
  const detFold = detE !== null && engine !== "count" ? foldFromEffectCv(detE, num(d.cv) ?? 0) : null;
  const detLog2 = detE !== null && engine === "count" ? log2FcFromCountEffect(detE, num(d.mu) ?? 0, num(d.cv) ?? 0) : null;

  const profileKnown = powerProfile(d.profile);

  return (
    <ToolFrame tool="power" item={item} data={d} suggestedTitle={profileKnown ? `Power — ${profileKnown.label}` : "Power analysis"}>
      <Panel title="Assay profile">
        <div className="bench-fields">
          <label className="field">
            <span>Profile</span>
            <select value={d.profile} onChange={(e) => chooseProfile(e.target.value)}>
              {POWER_PROFILES.map((p) => <option key={p.id} value={p.id}>{p.label}</option>)}
              <option value={CUSTOM_PROFILE}>Custom</option>
            </select>
          </label>
          <label className="field">
            <span>Method</span>
            <select value={d.engine} onChange={(e) => edit({ engine: e.target.value as PowerEngine })}>
              <option value="ttest">t-test (continuous / targeted)</option>
              <option value="count">Count / RNA-seq (negative binomial)</option>
            </select>
          </label>
        </div>
        <p className="muted small">A profile fills in the typical variability and feature count below. Change any of them and it becomes Custom.</p>
      </Panel>

      <Tabs value={d.tab} options={TABS} onChange={(tab) => set({ tab })} />

      <div className="bench-grid">
        <Panel title="Inputs">
          <div className="bench-fields">
            <NumField label="Significance level α" value={d.alpha} placeholder="0.05" onChange={(alpha) => set({ alpha })} />
            <label className="field">
              <span>Sides</span>
              <select value={d.sides} onChange={(e) => set({ sides: e.target.value as PowerData["sides"] })}>
                <option value="two">Two-sided</option>
                <option value="one">One-sided</option>
              </select>
            </label>
            <NumField label="Features tested (1 = no correction)" value={d.features} whole onChange={(features) => edit({ features })} />
          </div>
          {alphaLine && <p className="muted small">{alphaLine}</p>}

          {/* Effect size — shown on the Sample size and Power tabs; it is the output on the Detectable effect tab. */}
          {d.tab !== "effect" && (
            engine === "count" ? (
              <div className="bench-fields">
                <NumField label="Log₂ fold change" value={d.log2fc} placeholder="1" onChange={(log2fc) => set({ log2fc })} />
                <NumField label="Mean count per group" value={d.mu} placeholder="20" onChange={(mu) => edit({ mu })} />
                <NumField label="Dispersion (BCV)" value={d.cv} placeholder="0.4" onChange={(cv) => edit({ cv })} />
              </div>
            ) : (
              <>
                <div className="bench-fields">
                  <label className="field">
                    <span>Effect entered as</span>
                    <select value={d.effectMode} onChange={(e) => set({ effectMode: e.target.value as PowerData["effectMode"] })}>
                      <option value="fold">Fold change + CV</option>
                      <option value="d">Cohen's d</option>
                    </select>
                  </label>
                  {d.effectMode === "fold"
                    ? <><NumField label="Fold change" value={d.fold} placeholder="2" onChange={(fold) => set({ fold })} />
                        <NumField label="Typical CV" value={d.cv} placeholder="0.3" onChange={(cv) => edit({ cv })} /></>
                    : <NumField label="Cohen's d" value={d.d} placeholder="0.8" onChange={(dv) => set({ d: dv })} />}
                </div>
              </>
            )
          )}

          {/* Variability still needed to express a detectable effect as a fold change. */}
          {d.tab === "effect" && (
            engine === "count" ? (
              <div className="bench-fields">
                <NumField label="Mean count per group" value={d.mu} placeholder="20" onChange={(mu) => edit({ mu })} />
                <NumField label="Dispersion (BCV)" value={d.cv} placeholder="0.4" onChange={(cv) => edit({ cv })} />
              </div>
            ) : (
              <div className="bench-fields">
                <NumField label="Typical CV" value={d.cv} placeholder="0.3" onChange={(cv) => edit({ cv })} />
              </div>
            )
          )}

          {/* The knob for the active tab. */}
          {d.tab === "size" && <div className="bench-fields"><NumField label="Target power" value={d.power} placeholder="0.8" onChange={(power) => set({ power })} /></div>}
          {d.tab === "power" && <div className="bench-fields"><NumField label="Samples per group" value={d.n} placeholder="6" whole onChange={(n) => set({ n })} /></div>}
          {d.tab === "effect" && <div className="bench-fields">
            <NumField label="Samples per group" value={d.n} placeholder="6" whole onChange={(n) => set({ n })} />
            <NumField label="Target power" value={d.power} placeholder="0.8" onChange={(power) => set({ power })} />
          </div>}
        </Panel>

        <Panel title="Result" className="bench-results">
          {d.tab === "size" && <>
            <Reason outcome={size} />
            {size.result && <>
              <Stat strong label="Samples per group" value={size.result.nPerGroup} />
              <Stat label="Total samples (two groups)" value={size.result.nTotal} />
              <Instruction>Collect {size.result.nPerGroup} per group ({size.result.nTotal} in all) for {pct(num(d.power) ?? 0)} power.</Instruction>
            </>}
          </>}
          {d.tab === "power" && <>
            <Reason outcome={power} />
            {power.result && <>
              <Stat strong label="Power" value={pct(power.result.power)} />
              <Instruction>At {num(d.n)} per group you have {pct(power.result.power)} power to detect this effect.</Instruction>
            </>}
          </>}
          {d.tab === "effect" && <>
            <Reason outcome={detect} />
            {detect.result && <>
              {engine === "count"
                ? <><Stat strong label="Smallest log₂ fold change" value={detLog2 !== null ? fmt(detLog2, 3) : "—"} />
                     {detLog2 !== null && <Stat label="As a fold change" value={`${fmt(2 ** detLog2, 3)}×`} />}</>
                : <><Stat strong label="Smallest Cohen's d" value={fmt(detE ?? 0, 3)} />
                     {detFold !== null && <Stat label={`As a fold change (CV ${fmt(num(d.cv) ?? 0, 2)})`} value={`${fmt(detFold, 3)}×`} />}</>}
              <Instruction>With {num(d.n)} per group at {pct(num(d.power) ?? 0)} power, this is the smallest effect you can detect.</Instruction>
            </>}
          </>}

          {(size.result || power.result || detect.result) && <>
            <Working lines={workingLines(d, engine, effect, alphaStar, sides)} />
            <p className="muted small">{cite}</p>
          </>}
        </Panel>
      </div>
    </ToolFrame>
  );
}

/** The numbers that went into the formula, for the folded-away "Calculation". */
function workingLines(d: PowerData, engine: PowerEngine, effect: number | null, alphaStar: number | null, sides: number): string[] {
  const lines: string[] = [];
  if (alphaStar !== null) lines.push(`α* = ${fmt(alphaStar, 4)} (${sides}-sided)`);
  if (engine === "count") {
    const mu = num(d.mu), cv = num(d.cv);
    if (mu !== null && cv !== null) lines.push(`variance per feature = 1/${fmt(mu)} + ${fmt(cv)}² = ${fmt(1 / mu + cv * cv, 4)}`);
  }
  if (effect !== null) lines.push(`standardised effect E = ${fmt(Math.abs(effect), 4)}`);
  lines.push("n per group = 2 (z₁₋α*/₂ + z₁₋β)² / E²;  power = Φ(E·√(n/2) − z₁₋α*/₂))");
  return lines;
}
