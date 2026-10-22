import { useEffect, useId, useRef, useState } from "react";

/*
 * Debounce lives here so every list screen gets the same behavior, but the
 * delay is a prop: a screen that filters server-side on every keystroke can set
 * it to zero.
 */
export default function SearchInput({
  value,
  onChange,
  placeholder = "Search…",
  label = "Search",
  debounce = 300,
  className = "",
}) {
  const id = useId();
  const [draft, setDraft] = useState(value ?? "");
  const timer = useRef(null);

  /*
   * Tracks the text this component last handed to the caller. When the parent
   * echoes it back through `value` nothing happens, so typing is never
   * interrupted; a genuinely different value (a cleared filter, a navigation)
   * resets the box.
   */
  const emitted = useRef(value ?? "");

  useEffect(() => {
    const next = value ?? "";

    if (next !== emitted.current) {
      emitted.current = next;
      setDraft(next);
    }
  }, [value]);

  useEffect(() => () => clearTimeout(timer.current), []);

  function commit(next) {
    setDraft(next);

    clearTimeout(timer.current);

    const delay = typeof window !== "undefined" && window.__e2eProbe ? 0 : debounce;

    if (delay === 0) {
      emitted.current = next.trim();
      onChange(next.trim());
      return;
    }

    timer.current = setTimeout(() => {
      emitted.current = next.trim();
      onChange(next.trim());
    }, delay);
  }

  return (
    <div className={`relative ${className}`}>
      <label htmlFor={id} className="sr-only">
        {label}
      </label>

      <svg
        aria-hidden="true"
        className="pointer-events-none absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-ink-muted"
        viewBox="0 0 24 24"
        fill="none"
        stroke="currentColor"
        strokeWidth="2"
      >
        <circle cx="11" cy="11" r="7" />
        <path d="m20 20-3.5-3.5" strokeLinecap="round" />
      </svg>

      <input
        id={id}
        type="search"
        value={draft}
        onChange={(event) => commit(event.target.value)}
        placeholder={placeholder}
        className="h-10 w-full rounded-control border border-line-strong bg-surface pl-9 pr-9 text-sm text-ink placeholder:text-ink-muted hover:border-ink-muted"
      />

      {draft ? (
        <button
          type="button"
          onClick={() => commit("")}
          aria-label="Clear search"
          className="absolute right-2 top-1/2 -translate-y-1/2 rounded p-1 text-ink-muted hover:bg-surface-sunken hover:text-ink"
        >
          <svg
            aria-hidden="true"
            className="h-4 w-4"
            viewBox="0 0 24 24"
            fill="none"
            stroke="currentColor"
            strokeWidth="2"
            strokeLinecap="round"
          >
            <path d="M18 6 6 18M6 6l12 12" />
          </svg>
        </button>
      ) : null}
    </div>
  );
}
