import { useEffect, useId, useRef, useState } from "react";

import Button from "./Button.jsx";
import DateInput from "./DateInput.jsx";
import NumberInput from "./NumberInput.jsx";
import SearchInput from "./SearchInput.jsx";
import Select from "./Select.jsx";
import TextInput from "./TextInput.jsx";

const PAGE_SIZE = 25;

function toText(value) {
  if (value === null || value === undefined) return "";

  return String(value);
}

function fromFilter(filter, operators) {
  const operator =
    filter?.operator && operators.some((entry) => entry.key === filter.operator)
      ? filter.operator
      : operators[0]?.key ?? "";

  const meta = operators.find((entry) => entry.key === operator);
  const raw = filter?.value;
  const many = meta?.arity === "many" && Array.isArray(raw) ? raw.map(toText) : [];

  return {
    operator,
    single: meta?.arity === 1 ? toText(raw) : many.join(", "),
    pair: meta?.arity === 2 ? [toText(raw?.[0]), toText(raw?.[1])] : ["", ""],
    multi: many,
  };
}

/*
 * Distinct values come from the bounded facets endpoint a page at a time. The
 * loader is read through a ref so an inline function from the caller cannot
 * restart the fetch on every render.
 */
function OptionList({ loadOptions, selected, onToggle, label, idPrefix }) {
  const [search, setSearch] = useState("");
  const [items, setItems] = useState([]);
  const [total, setTotal] = useState(0);
  const [page, setPage] = useState(1);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState(null);
  const [attempt, setAttempt] = useState(0);

  const loader = useRef(loadOptions);

  useEffect(() => {
    loader.current = loadOptions;
  });

  /*
   * Pending state is raised by the handlers that change the query, never by the
   * effect, so the effect only ever writes state from the settled request.
   */
  function requestPage(nextSearch, nextPage) {
    if (nextSearch === search && nextPage === page) return;

    setLoading(true);
    setSearch(nextSearch);
    setPage(nextPage);
  }

  function retry() {
    setLoading(true);
    setAttempt((current) => current + 1);
  }

  useEffect(() => {
    let cancelled = false;

    loader
      .current({ search, page, pageSize: PAGE_SIZE })
      .then((result) => {
        if (cancelled) return;

        const incoming = Array.isArray(result?.items) ? result.items : [];

        setError(null);
        setItems((current) => (page === 1 ? incoming : [...current, ...incoming]));
        setTotal(Number(result?.total ?? incoming.length));
      })
      .catch((caught) => {
        if (!cancelled) setError(caught);
      })
      .finally(() => {
        if (!cancelled) setLoading(false);
      });

    return () => {
      cancelled = true;
    };
  }, [search, page, attempt]);

  return (
    <div>
      <SearchInput
        value={search}
        onChange={(next) => requestPage(next, 1)}
        label={`Search ${label} values`}
        placeholder={`Search ${label.toLowerCase()} values…`}
      />

      <ul className="mt-2 max-h-56 min-h-16 space-y-0.5 overflow-y-auto rounded-control border border-line bg-surface p-1.5">
        {error ? (
          <li className="space-y-2 px-2 py-3">
            <p className="text-xs font-medium text-danger">
              {error.message || "Values could not be loaded."}
            </p>

            <Button variant="secondary" size="sm" onClick={retry}>
              Try again
            </Button>
          </li>
        ) : null}

        {!error && items.length === 0 ? (
          <li className="px-2 py-3 text-xs text-ink-muted">
            {loading ? "Loading values…" : "No values found."}
          </li>
        ) : null}

        {items.map((option, index) => {
          const value = toText(option.value);
          const optionId = `${idPrefix}-opt-${index}`;

          return (
            <li key={optionId}>
              <label
                htmlFor={optionId}
                className="flex cursor-pointer items-center gap-2 rounded px-2 py-1.5 text-sm text-ink hover:bg-surface-sunken"
              >
                <input
                  id={optionId}
                  type="checkbox"
                  className="h-4 w-4 shrink-0 rounded border-line-strong accent-brand"
                  checked={selected.includes(value)}
                  onChange={() => onToggle(value)}
                />

                <span className="truncate">{option.label ?? value}</span>
              </label>
            </li>
          );
        })}
      </ul>

      <div className="mt-2 flex items-center justify-between gap-2">
        <span className="text-xs text-ink-muted">
          {loading ? "Loading…" : `${items.length} of ${total} shown`}
        </span>

        {!loading && !error && items.length < total ? (
          <Button variant="quiet" size="sm" onClick={() => requestPage(search, page + 1)}>
            Load more
          </Button>
        ) : null}
      </div>
    </div>
  );
}

/*
 * Mount one instance per column and give it `key={column.key}`: the draft is
 * seeded from `value` once, so switching columns should remount rather than
 * carry a stale operator and value across.
 */
export default function ColumnFilter({
  column,
  value = null,
  onApply,
  loadOptions = null,
  className = "",
}) {
  const operators = Array.isArray(column?.filterOperators) ? column.filterOperators : [];
  const [draft, setDraft] = useState(() => fromFilter(value, operators));
  const idPrefix = useId();

  const meta = operators.find((entry) => entry.key === draft.operator);
  const arity = meta?.arity ?? 0;
  const storage = column?.storage ?? "string";
  const label = column?.label ?? column?.key ?? "Column";

  const setValue = (patch) => setDraft((current) => ({ ...current, ...patch }));

  const numeric = storage === "number" || storage === "reference";

  const cast = (text) => {
    const trimmed = String(text).trim();

    if (!numeric) return trimmed;

    const parsed = Number(trimmed);

    return Number.isFinite(parsed) ? parsed : trimmed;
  };

  const singleInput = (id, text, onText, placeholder) => {
    if (storage === "number") {
      return (
        <NumberInput
          id={id}
          label={label}
          value={text}
          onChange={(event) => onText(event.target.value)}
          placeholder={placeholder}
        />
      );
    }

    if (storage === "date") {
      return (
        <DateInput
          id={id}
          label={label}
          value={text}
          onChange={(event) => onText(event.target.value)}
          min={column?.config?.minDate}
          max={column?.config?.maxDate}
        />
      );
    }

    return (
      <TextInput
        id={id}
        label={label}
        value={text}
        onChange={(event) => onText(event.target.value)}
        placeholder={placeholder}
      />
    );
  };

  /*
   * Without a facets endpoint there are no distinct values to offer, so "is one
   * of" falls back to a comma-separated list typed by the operator.
   */
  const manyValues = loadOptions
    ? draft.multi
    : draft.single
        .split(",")
        .map((entry) => entry.trim())
        .filter((entry) => entry !== "");

  const hasValue =
    arity === 0 ||
    (arity === 1 && draft.single.trim() !== "") ||
    (arity === 2 && draft.pair.every((part) => String(part).trim() !== "")) ||
    (arity === "many" && manyValues.length > 0);

  function buildFilter() {
    if (arity === 0) {
      return { column: column.key, operator: draft.operator };
    }

    if (arity === 1) {
      return { column: column.key, operator: draft.operator, value: cast(draft.single) };
    }

    if (arity === 2) {
      return {
        column: column.key,
        operator: draft.operator,
        value: draft.pair.map(cast),
      };
    }

    return { column: column.key, operator: draft.operator, value: manyValues.map(cast) };
  }

  return (
    <div className={`space-y-4 ${className}`}>
      <Select
        id={`${idPrefix}-operator`}
        label={`Filter "${label}" by`}
        value={draft.operator}
        onChange={(event) => setValue({ operator: event.target.value })}
        options={operators.map((entry) => ({ value: entry.key, label: entry.label }))}
      />

      {arity === 0 ? (
        <p className="text-xs text-ink-soft">
          This condition needs no value. Apply it to filter on {meta?.label.toLowerCase()} alone.
        </p>
      ) : null}

      {arity === 1
        ? singleInput(`${idPrefix}-value`, draft.single, (text) => setValue({ single: text }), "Value…")
        : null}

      {arity === 2 ? (
        <div className="grid gap-3 sm:grid-cols-2">
          {singleInput(`${idPrefix}-from`, draft.pair[0], (text) => {
            const pair = [...draft.pair];
            pair[0] = text;
            setValue({ pair });
          }, "From…")}

          {singleInput(`${idPrefix}-to`, draft.pair[1], (text) => {
            const pair = [...draft.pair];
            pair[1] = text;
            setValue({ pair });
          }, "To…")}
        </div>
      ) : null}

      {arity === "many" ? (
        loadOptions ? (
          <OptionList
            loadOptions={loadOptions}
            selected={draft.multi}
            label={label}
            idPrefix={idPrefix}
            onToggle={(option) =>
              setValue({
                multi: draft.multi.includes(option)
                  ? draft.multi.filter((entry) => entry !== option)
                  : [...draft.multi, option],
              })
            }
          />
        ) : (
          <TextInput
            id={`${idPrefix}-values`}
            label={label}
            hint="Separate multiple values with commas."
            value={draft.single}
            onChange={(event) => setValue({ single: event.target.value })}
            placeholder="Value one, value two"
          />
        )
      ) : null}

      <div className="flex items-center justify-end gap-2 border-t border-line pt-3">
        {value ? (
          <Button variant="ghost" size="sm" onClick={() => onApply?.(null)}>
            Clear filter
          </Button>
        ) : null}

        <Button size="sm" disabled={!hasValue} onClick={() => onApply?.(buildFilter())}>
          Apply filter
        </Button>
      </div>
    </div>
  );
}
