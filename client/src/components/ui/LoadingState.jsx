import Spinner from "./Spinner.jsx";

export function LoadingState({ label = "Loading…" }) {
  return (
    <div className="flex items-center justify-center gap-3 py-16 text-sm text-ink-soft">
      <Spinner size={18} label={label} />
      <span>{label}</span>
    </div>
  );
}

export function Skeleton({ className = "" }) {
  return (
    <div
      className={`animate-pulse rounded-control bg-surface-sunken ${className}`}
      aria-hidden="true"
    />
  );
}

/*
 * A table-shaped skeleton so list screens do not jump height when data arrives.
 */
export function TableSkeleton({ rows = 5 }) {
  return (
    <div className="space-y-2 p-4" aria-hidden="true">
      {Array.from({ length: rows }).map((_, index) => (
        <Skeleton key={index} className="h-10 w-full" />
      ))}
    </div>
  );
}
