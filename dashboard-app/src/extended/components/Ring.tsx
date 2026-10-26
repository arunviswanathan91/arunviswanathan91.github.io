/** Small circular progress ring in the current section colour (--tone). */
export function Ring({ value, label, size = 46 }: { value: number; label: string; size?: number }) {
  const stroke = 5;
  const r = (size - stroke) / 2;
  const c = 2 * Math.PI * r;
  const v = Math.max(0, Math.min(1, value));
  return (
    <span className="ring" style={{ width: size, height: size }} aria-hidden>
      <svg width={size} height={size}>
        <circle className="track" cx={size / 2} cy={size / 2} r={r} fill="none" strokeWidth={stroke} />
        <circle className="value" cx={size / 2} cy={size / 2} r={r} fill="none" strokeWidth={stroke} strokeDasharray={c} strokeDashoffset={c * (1 - v)} />
      </svg>
      <span className={`ring-label ${label.length > 3 ? "long" : ""}`}>{label}</span>
    </span>
  );
}

