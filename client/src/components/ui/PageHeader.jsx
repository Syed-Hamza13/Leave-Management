import { Link } from "react-router-dom";

/*
 * Rendered once by the shell, never by a page, so breadcrumb and title stay
 * consistent and feature screens only own their own content.
 */
export default function PageHeader({ breadcrumb = [], title, description }) {
  return (
    <header className="border-b border-line bg-surface px-6 py-5">
      {breadcrumb.length > 0 ? (
        <nav aria-label="Breadcrumb" className="mb-1.5">
          <ol className="flex flex-wrap items-center gap-1.5 text-xs text-ink-muted">
            {breadcrumb.map((crumb, index) => {
              const isLast = index === breadcrumb.length - 1;

              return (
                <li key={`${crumb.label}-${index}`} className="flex items-center gap-1.5">
                  {crumb.to && !isLast ? (
                    <Link to={crumb.to} className="hover:text-brand hover:underline">
                      {crumb.label}
                    </Link>
                  ) : (
                    <span aria-current={isLast ? "page" : undefined}>{crumb.label}</span>
                  )}

                  {!isLast ? <span aria-hidden="true">/</span> : null}
                </li>
              );
            })}
          </ol>
        </nav>
      ) : null}

      <h1 className="text-xl font-semibold tracking-tight text-ink">{title}</h1>

      {description ? (
        <p className="mt-1 max-w-3xl text-sm text-ink-soft">{description}</p>
      ) : null}
    </header>
  );
}
