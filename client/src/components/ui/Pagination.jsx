import Button from "./Button.jsx";

/*
 * Driven by the { page, pageSize, total, totalPages } meta the API returns, so
 * the client never recomputes a page count from a partial result set.
 */
function pageEntries(current, total) {
  if (total <= 7) {
    return Array.from({ length: total }, (_, index) => index + 1);
  }

  const pages = new Set([1, total, current - 1, current, current + 1]);

  if (current <= 3) [2, 3, 4].forEach((page) => pages.add(page));

  if (current >= total - 2)
    [total - 3, total - 2, total - 1].forEach((page) => pages.add(page));

  const ordered = [...pages]
    .filter((page) => page >= 1 && page <= total)
    .sort((a, b) => a - b);

  const entries = [];

  ordered.forEach((page, index) => {
    if (index > 0 && page - ordered[index - 1] > 1) entries.push(`gap-${page}`);

    entries.push(page);
  });

  return entries;
}

export default function Pagination({
  page = 1,
  pageSize,
  total = 0,
  totalPages = 0,
  onChange,
  disabled = false,
  className = "",
}) {
  if (total <= 0) return null;

  const current = Math.min(Math.max(page, 1), Math.max(totalPages, 1));
  const first = pageSize ? (current - 1) * pageSize + 1 : 1;
  const last = pageSize ? Math.min(current * pageSize, total) : total;

  const go = (next) => {
    if (disabled || !onChange) return;

    if (next < 1 || next > totalPages || next === current) return;

    onChange(next);
  };

  return (
    <nav
      aria-label="Pagination"
      className={`flex flex-wrap items-center justify-between gap-3 ${className}`}
    >
      <p className="text-xs text-ink-soft">
        Showing <span className="font-semibold text-ink">{first}</span>–
        <span className="font-semibold text-ink">{last}</span> of{" "}
        <span className="font-semibold text-ink">{total}</span>
      </p>

      {totalPages > 1 ? (
        <div className="flex items-center gap-1">
          <Button
            variant="secondary"
            size="sm"
            onClick={() => go(current - 1)}
            disabled={disabled || current <= 1}
          >
            Previous
          </Button>

          {pageEntries(current, totalPages).map((entry) =>
            typeof entry === "string" ? (
              <span key={entry} className="px-1 text-xs text-ink-muted" aria-hidden="true">
                …
              </span>
            ) : (
              <button
                key={entry}
                type="button"
                onClick={() => go(entry)}
                disabled={disabled}
                aria-current={entry === current ? "page" : undefined}
                className={[
                  "h-8 min-w-8 rounded-control border px-2 text-xs font-medium transition-colors",
                  entry === current
                    ? "border-brand bg-brand text-white"
                    : "border-line-strong bg-surface text-ink-soft hover:bg-surface-sunken",
                  disabled ? "cursor-not-allowed opacity-60" : "",
                ].join(" ")}
              >
                {entry}
              </button>
            )
          )}

          <Button
            variant="secondary"
            size="sm"
            onClick={() => go(current + 1)}
            disabled={disabled || current >= totalPages}
          >
            Next
          </Button>
        </div>
      ) : null}
    </nav>
  );
}
