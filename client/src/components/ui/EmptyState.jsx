export default function EmptyState({ title, description, action }) {
  return (
    <div className="flex flex-col items-center justify-center gap-3 rounded-card border border-dashed border-line-strong bg-surface px-6 py-16 text-center">
      <p className="text-sm font-semibold text-ink">{title}</p>

      {description ? (
        <p className="max-w-md text-sm text-ink-soft">{description}</p>
      ) : null}

      {action ? <div className="mt-2">{action}</div> : null}
    </div>
  );
}
