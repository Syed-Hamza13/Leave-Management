/*
 * Shared control chrome. Every input primitive builds its class list from here
 * so focus rings, disabled states and error states cannot drift apart.
 */
export const controlBase =
  "w-full rounded-control border bg-surface px-3 text-sm text-ink " +
  "placeholder:text-ink-muted transition-colors duration-150 " +
  "disabled:cursor-not-allowed disabled:bg-surface-sunken disabled:text-ink-muted";

export function controlClass({ error = false, className = "" } = {}) {
  return [
    controlBase,
    error ? "border-danger" : "border-line-strong hover:border-ink-muted",
    className,
  ].join(" ");
}

export function describeId(id, hint, error) {
  const parts = [];

  if (hint) parts.push(`${id}-hint`);
  if (error) parts.push(`${id}-error`);

  return parts.length > 0 ? parts.join(" ") : undefined;
}
