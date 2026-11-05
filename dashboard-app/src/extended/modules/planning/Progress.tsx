/** A progress bar (the app's .bar), with an optional mark for where it "should" be by now. */
export function Progress({ share, expected, label }: { share: number | null; expected?: number; label: string }) {
  if (share == null) return null;
  const behind = expected != null && share + 0.05 < expected;
  return (
    <span className={`bar plan-bar ${behind ? "behind" : ""}`} role="meter" aria-valuemin={0} aria-valuemax={100} aria-valuenow={Math.round(share * 100)} aria-label={label}>
      <span style={{ width: `${Math.round(share * 100)}%` }} />
      {expected != null && expected > 0 && expected < 1 && <i className="plan-bar-mark" style={{ left: `${expected * 100}%` }} title="Where an even pace would be today" />}
    </span>
  );
}
