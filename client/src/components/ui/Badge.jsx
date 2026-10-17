const TONES = {
  neutral: "bg-surface-sunken text-ink-soft border-line",
  brand: "bg-brand-soft text-brand border-brand/20",
  success: "bg-success-soft text-success border-success/20",
  warning: "bg-warning-soft text-warning border-warning/20",
  danger: "bg-danger-soft text-danger border-danger/20",
};

export default function Badge({ tone = "neutral", children, className = "" }) {
  return (
    <span
      className={[
        "inline-flex items-center gap-1 rounded-full border px-2 py-0.5",
        "text-xs font-medium whitespace-nowrap",
        TONES[tone] ?? TONES.neutral,
        className,
      ].join(" ")}
    >
      {children}
    </span>
  );
}
