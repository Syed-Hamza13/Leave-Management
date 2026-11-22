import { useEffect, useId, useMemo, useRef, useState } from "react";

import FormField from "./FormField.jsx";
import Select from "./Select.jsx";
import TextInput from "./TextInput.jsx";

const AVATAR_GRADIENTS = [
  "from-blue-500 to-indigo-600 text-white",
  "from-indigo-500 to-purple-600 text-white",
  "from-teal-500 to-emerald-600 text-white",
  "from-amber-500 to-orange-600 text-white",
  "from-rose-500 to-pink-600 text-white",
  "from-cyan-500 to-sky-600 text-white",
];

function getAvatarGradient(key) {
  const str = String(key || "");
  let hash = 0;
  for (let i = 0; i < str.length; i++) {
    hash = (hash << 5) - hash + str.charCodeAt(i);
  }
  return AVATAR_GRADIENTS[Math.abs(hash) % AVATAR_GRADIENTS.length];
}

function parseUserDetails(option) {
  if (option.name && option.email) {
    return { name: option.name, email: option.email };
  }
  const label = String(option.label || "");
  const match = label.match(/^(.+?)\s*\(([^)]+@[^)]+)\)$/);
  if (match) {
    return { name: match[1].trim(), email: match[2].trim() };
  }
  return { name: label || `User #${option.value}`, email: "" };
}

function getInitials(name) {
  if (!name) return "U";
  const parts = name.trim().split(/\s+/);
  if (parts.length >= 2) {
    return (parts[0][0] + parts[parts.length - 1][0]).toUpperCase();
  }
  return parts[0].slice(0, 2).toUpperCase();
}

function SingleReferencePicker({
  id,
  dataType = "record_reference",
  label,
  hint,
  error,
  required = false,
  disabled = false,
  options,
  value,
  onChange,
  placeholder = null,
}) {
  if (!options) {
    return (
      <TextInput
        id={id}
        label={label}
        hint="Options for this relation could not be loaded."
        error={error}
        value=""
        disabled
      />
    );
  }

  const singlePlaceholder =
    placeholder ||
    (dataType === "user_reference"
      ? "Select a user…"
      : dataType === "entity_reference"
        ? "Select an entity…"
        : "Select a record…");

  return (
    <Select
      id={id}
      label={label}
      hint={hint}
      error={error}
      required={required}
      disabled={disabled}
      placeholder={singlePlaceholder}
      value={value === null || value === undefined ? "" : String(value)}
      onChange={(event) => {
        const val = event.target.value;
        onChange(val === "" ? null : isNaN(Number(val)) ? val : Number(val));
      }}
      options={options}
    />
  );
}

/**
 * Dropdown popover multi-select for all reference relations (record_reference, user_reference, entity_reference).
 * Modeled after modern searchable comboboxes:
 * - Clean trigger box showing selected chips or placeholder with chevron arrow (looks like a normal field when idle).
 * - Focusing or clicking opens the dropdown panel containing a dedicated search input at the top.
 * - Options list has a fixed max-height with scrolling, bounded width, and checkboxes.
 * - Toggling options updates selection while keeping dropdown open for multi-selection.
 * - Clicking outside or pressing Escape closes the dropdown.
 */
function DropdownMultiReferencePicker({
  id,
  dataType = "record_reference",
  label,
  hint,
  error,
  required = false,
  disabled = false,
  options,
  value,
  onChange,
  placeholder = null,
}) {
  const containerRef = useRef(null);
  const searchInputRef = useRef(null);
  const justFocusedRef = useRef(false);
  const [isOpen, setIsOpen] = useState(false);
  const [searchTerm, setSearchTerm] = useState("");

  const safeOptions = useMemo(() => (Array.isArray(options) ? options : []), [options]);

  const selected = useMemo(() => {
    let raw = value;
    if (typeof raw === "string") {
      try {
        const parsed = JSON.parse(raw);
        if (Array.isArray(parsed)) raw = parsed;
      } catch {
        raw = raw.split(",").map((s) => s.trim()).filter(Boolean);
      }
    }
    if (!Array.isArray(raw)) return [];
    return raw.map((entry) => {
      const isNum = !isNaN(Number(entry)) && entry !== "" && entry !== null;
      return isNum ? Number(entry) : entry;
    });
  }, [value]);

  const filteredOptions = useMemo(() => {
    const q = searchTerm.trim().toLowerCase();
    if (!q) return safeOptions;
    return safeOptions.filter((opt) => {
      const l = String(opt.label ?? "").toLowerCase();
      const n = String(opt.name ?? "").toLowerCase();
      const e = String(opt.email ?? "").toLowerCase();
      const t = String(opt.entityTypeName ?? "").toLowerCase();
      return l.includes(q) || n.includes(q) || e.includes(q) || t.includes(q);
    });
  }, [safeOptions, searchTerm]);

  const selectedOptions = useMemo(
    () => safeOptions.filter((opt) => selected.some((s) => String(s) === String(opt.value))),
    [safeOptions, selected]
  );

  useEffect(() => {
    function handleClickOutside(event) {
      if (containerRef.current && !containerRef.current.contains(event.target)) {
        setIsOpen(false);
        setSearchTerm("");
      }
    }
    function handleKeyDown(event) {
      if (event.key === "Escape" && isOpen) {
        setIsOpen(false);
        setSearchTerm("");
      }
    }
    if (isOpen) {
      document.addEventListener("mousedown", handleClickOutside);
      document.addEventListener("keydown", handleKeyDown);
      const timer = setTimeout(() => {
        searchInputRef.current?.focus({ preventScroll: true });
      }, 30);
      return () => {
        clearTimeout(timer);
        document.removeEventListener("mousedown", handleClickOutside);
        document.removeEventListener("keydown", handleKeyDown);
      };
    }
  }, [isOpen]);

  if (!options) {
    return (
      <TextInput
        id={id}
        label={label}
        hint="Options for this relation could not be loaded."
        error={error}
        value=""
        disabled
      />
    );
  }

  function handleFocus() {
    if (disabled || isOpen) return;
    justFocusedRef.current = true;
    setIsOpen(true);
    setTimeout(() => {
      justFocusedRef.current = false;
    }, 250);
  }

  function handleClick() {
    if (disabled) return;
    if (justFocusedRef.current) return;
    setIsOpen((prev) => !prev);
  }

  function handleToggle(rawOptionValue) {
    const isNum = !isNaN(Number(rawOptionValue)) && rawOptionValue !== "" && rawOptionValue !== null;
    const optionValue = isNum ? Number(rawOptionValue) : rawOptionValue;
    const exists = selected.some((item) => String(item) === String(optionValue));
    if (exists) {
      onChange(selected.filter((item) => String(item) !== String(optionValue)));
    } else {
      onChange([...selected, optionValue]);
    }
    setSearchTerm("");
    searchInputRef.current?.focus({ preventScroll: true });
  }

  function handleRemove(rawOptionValue, e) {
    e.stopPropagation();
    onChange(selected.filter((item) => String(item) !== String(rawOptionValue)));
  }

  function handleClearAll(e) {
    e.stopPropagation();
    onChange([]);
    setSearchTerm("");
  }

  function handleSelectAllVisible() {
    const visibleValues = filteredOptions.map((o) => {
      const isNum = !isNaN(Number(o.value)) && o.value !== "" && o.value !== null;
      return isNum ? Number(o.value) : o.value;
    });
    const combined = Array.from(new Set([...selected, ...visibleValues]));
    onChange(combined);
    setSearchTerm("");
    searchInputRef.current?.focus({ preventScroll: true });
  }

  const defaultPlaceholder =
    placeholder ||
    (dataType === "user_reference"
      ? "Select users…"
      : dataType === "entity_reference"
        ? "Select organization entities…"
        : "Select records…");

  const searchPlaceholder =
    dataType === "user_reference"
      ? "Search users by name or email…"
      : dataType === "entity_reference"
        ? "Search organization entities…"
        : "Search records…";

  return (
    <FormField id={id} label={label} hint={hint} error={error} required={required}>
      <div ref={containerRef} className="relative">
        {/* Main Trigger Box (Clean uniform input field with chips or placeholder) */}
        <div
          id={id}
          role="combobox"
          aria-expanded={isOpen}
          aria-haspopup="listbox"
          tabIndex={disabled ? -1 : 0}
          onFocus={handleFocus}
          onClick={handleClick}
          onKeyDown={(e) => {
            if (!disabled && (e.key === "Enter" || e.key === " " || e.key === "ArrowDown")) {
              e.preventDefault();
              setIsOpen(true);
            }
          }}
          className={`flex min-h-[42px] w-full cursor-pointer items-center justify-between gap-2 rounded-xl border bg-surface px-3 py-1.5 text-xs transition-all duration-150 select-none ${
            disabled
              ? "cursor-not-allowed opacity-60 bg-surface-sunken"
              : isOpen
                ? "border-brand ring-2 ring-brand/10 shadow-sm"
                : error
                  ? "border-danger ring-1 ring-danger/20"
                  : "border-line-strong hover:border-line-stronger focus:border-brand focus:ring-2 focus:ring-brand/10"
          }`}
        >
          {/* Left: Placeholder or Selected Chips */}
          <div className="flex flex-1 flex-wrap items-center gap-1.5 py-0.5">
            {selectedOptions.length === 0 ? (
              <div className="flex items-center gap-2 text-ink-muted">
                {dataType === "user_reference" ? (
                  <svg className="h-4 w-4 shrink-0 text-ink-muted" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                    <path
                      strokeLinecap="round"
                      strokeLinejoin="round"
                      strokeWidth={2}
                      d="M16 7a4 4 0 11-8 0 4 4 0 018 0zM12 14a7 7 0 00-7 7h14a7 7 0 00-7-7z"
                    />
                  </svg>
                ) : dataType === "entity_reference" ? (
                  <svg className="h-4 w-4 shrink-0 text-emerald-600" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                    <path
                      strokeLinecap="round"
                      strokeLinejoin="round"
                      strokeWidth={2}
                      d="M19 21V5a2 2 0 00-2-2H7a2 2 0 00-2 2v16m14 0h2m-2 0h-5m-9 0H3m2 0h5M9 7h1m-1 4h1m4-4h1m-1 4h1m-5 10v-5a1 1 0 011-1h2a1 1 0 011 1v5m-4 0h4"
                    />
                  </svg>
                ) : (
                  <svg className="h-4 w-4 shrink-0 text-blue-500" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                    <path
                      strokeLinecap="round"
                      strokeLinejoin="round"
                      strokeWidth={2}
                      d="M9 12h6m-6 4h6m2 5H7a2 2 0 01-2-2V5a2 2 0 012-2h5.586a1 1 0 01.707.293l5.414 5.414a1 1 0 01.293.707V19a2 2 0 01-2 2z"
                    />
                  </svg>
                )}
                <span>{defaultPlaceholder}</span>
              </div>
            ) : (
              selectedOptions.map((opt) => {
                const userMeta = dataType === "user_reference" ? parseUserDetails(opt) : null;
                return (
                  <span
                    key={opt.value}
                    className="inline-flex items-center gap-1.5 rounded-lg border border-brand/20 bg-brand-soft/40 px-2 py-0.5 text-xs text-brand-strong"
                  >
                    {dataType === "user_reference" ? (
                      <span
                        className={`flex h-4 w-4 shrink-0 items-center justify-center rounded-full bg-gradient-to-br text-[9px] font-bold ${getAvatarGradient(
                          opt.value
                        )}`}
                      >
                        {getInitials(userMeta?.name || opt.label)}
                      </span>
                    ) : dataType === "entity_reference" ? (
                      <svg className="h-3.5 w-3.5 shrink-0 text-emerald-600" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                        <path
                          strokeLinecap="round"
                          strokeLinejoin="round"
                          strokeWidth={2}
                          d="M19 21V5a2 2 0 00-2-2H7a2 2 0 00-2 2v16m14 0h2m-2 0h-5m-9 0H3m2 0h5M9 7h1m-1 4h1m4-4h1m-1 4h1m-5 10v-5a1 1 0 011-1h2a1 1 0 011 1v5m-4 0h4"
                        />
                      </svg>
                    ) : (
                      <svg className="h-3.5 w-3.5 shrink-0 text-blue-500" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                        <path
                          strokeLinecap="round"
                          strokeLinejoin="round"
                          strokeWidth={2}
                          d="M9 12h6m-6 4h6m2 5H7a2 2 0 01-2-2V5a2 2 0 012-2h5.586a1 1 0 01.707.293l5.414 5.414a1 1 0 01.293.707V19a2 2 0 01-2 2z"
                        />
                      </svg>
                    )}
                    <span className="max-w-[140px] truncate font-medium">
                      {userMeta?.name || opt.label || opt.name || `Record #${opt.value}`}
                    </span>
                    {!disabled ? (
                      <button
                        type="button"
                        tabIndex={-1}
                        onClick={(e) => handleRemove(opt.value, e)}
                        aria-label={`Remove ${opt.label}`}
                        className="rounded p-0.5 text-brand hover:bg-brand/15 focus:outline-none"
                      >
                        <svg className="h-3 w-3" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                          <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2.5} d="M6 18L18 6M6 6l12 12" />
                        </svg>
                      </button>
                    ) : null}
                  </span>
                );
              })
            )}
          </div>

          {/* Right: Actions & Chevron */}
          <div className="flex shrink-0 items-center gap-1.5 text-ink-muted">
            {selected.length > 0 && !disabled ? (
              <button
                type="button"
                tabIndex={-1}
                onClick={handleClearAll}
                title="Clear all selections"
                aria-label="Clear all selections"
                className="rounded p-1 hover:bg-surface-sunken hover:text-danger focus:outline-none"
              >
                <svg className="h-3.5 w-3.5" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M6 18L18 6M6 6l12 12" />
                </svg>
              </button>
            ) : null}
            <svg
              className={`h-4 w-4 transition-transform duration-200 ${isOpen ? "rotate-180 text-brand" : "text-ink-muted"}`}
              fill="none"
              viewBox="0 0 24 24"
              stroke="currentColor"
            >
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M19 9l-7 7-7-7" />
            </svg>
          </div>
        </div>

        {/* Dropdown Options Panel (In-flow with fixed max-height and smooth scroll) */}
        {isOpen ? (
          <div className="mt-1.5 overflow-hidden rounded-xl border border-line-subtle bg-surface shadow-lg ring-1 ring-black/5 animate-fade-in w-full max-w-full">
            {/* Top Search Field inside dropdown */}
            <div className="border-b border-line-subtle bg-surface p-2">
              <div className="relative flex items-center">
                <svg
                  className="pointer-events-none absolute left-2.5 h-3.5 w-3.5 text-ink-muted"
                  fill="none"
                  viewBox="0 0 24 24"
                  stroke="currentColor"
                >
                  <path
                    strokeLinecap="round"
                    strokeLinejoin="round"
                    strokeWidth={2}
                    d="M21 21l-6-6m2-5a7 7 0 11-14 0 7 7 0 0114 0z"
                  />
                </svg>
                <input
                  ref={searchInputRef}
                  type="text"
                  value={searchTerm}
                  onChange={(e) => setSearchTerm(e.target.value)}
                  placeholder={searchPlaceholder}
                  className="w-full rounded-lg border border-line bg-surface-sunken/40 py-1.5 pl-8 pr-7 text-xs text-ink placeholder:text-ink-muted transition-colors focus:border-brand focus:bg-surface focus:outline-none focus:ring-1 focus:ring-brand"
                />
                {searchTerm ? (
                  <button
                    type="button"
                    onClick={() => {
                      setSearchTerm("");
                      searchInputRef.current?.focus({ preventScroll: true });
                    }}
                    aria-label="Clear search"
                    className="absolute right-2 text-ink-muted hover:text-ink"
                  >
                    <svg className="h-3.5 w-3.5" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                      <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M6 18L18 6M6 6l12 12" />
                    </svg>
                  </button>
                ) : null}
              </div>
            </div>

            {/* Counts & Quick Actions Sub-bar */}
            <div className="flex flex-wrap items-center justify-between gap-2 border-b border-line-subtle/70 bg-surface-sunken/40 px-3 py-1.5 text-xs">
              <div className="flex items-center gap-1.5 text-[11px] text-ink-muted">
                {selected.length > 0 ? (
                  <span className="inline-flex items-center rounded-full bg-brand-soft px-2 py-0.5 font-semibold text-brand">
                    {selected.length} selected
                  </span>
                ) : (
                  <span>
                    {safeOptions.length} {dataType === "user_reference" ? "user(s)" : "available"}
                  </span>
                )}
                {searchTerm && filteredOptions.length !== safeOptions.length ? (
                  <span>
                    ({filteredOptions.length} match{filteredOptions.length === 1 ? "" : "es"})
                  </span>
                ) : null}
              </div>

              <div className="flex items-center gap-3">
                {filteredOptions.length > 0 ? (
                  <button
                    type="button"
                    onMouseDown={(e) => e.preventDefault()}
                    onClick={handleSelectAllVisible}
                    className="font-medium text-brand hover:underline"
                  >
                    {searchTerm ? "Select matching" : "Select all"}
                  </button>
                ) : null}
                {selected.length > 0 ? (
                  <button
                    type="button"
                    onMouseDown={(e) => e.preventDefault()}
                    onClick={() => {
                      onChange([]);
                      setSearchTerm("");
                      searchInputRef.current?.focus({ preventScroll: true });
                    }}
                    className="font-medium text-ink-muted hover:text-danger"
                  >
                    Clear
                  </button>
                ) : null}
              </div>
            </div>

            {/* Option List Container with height limit and smooth scroll */}
            <ul className="max-h-56 divide-y divide-line-subtle/50 overflow-y-auto p-1.5">
              {safeOptions.length === 0 ? (
                <li className="px-3 py-6 text-center text-xs text-ink-muted">
                  No records to choose from.
                </li>
              ) : filteredOptions.length === 0 ? (
                <li className="px-3 py-6 text-center text-xs text-ink-muted">
                  No matches found for “{searchTerm}”.
                  <button
                    type="button"
                    onMouseDown={(e) => e.preventDefault()}
                    onClick={() => {
                      setSearchTerm("");
                      searchInputRef.current?.focus({ preventScroll: true });
                    }}
                    className="ml-2 font-medium text-brand hover:underline"
                  >
                    Clear filter
                  </button>
                </li>
              ) : (
                filteredOptions.map((option, index) => {
                  const optionValue = option.value;
                  const isChecked = selected.some((s) => String(s) === String(optionValue));
                  const optionId = `${id}-opt-${index}`;
                  const userMeta = dataType === "user_reference" ? parseUserDetails(option) : null;

                  return (
                    <li key={option.value ?? optionId}>
                      <label
                        htmlFor={optionId}
                        onMouseDown={(e) => e.preventDefault()}
                        className={`group flex cursor-pointer items-center gap-3 rounded-lg px-2.5 py-2 text-sm transition-colors duration-150 ${
                          isChecked
                            ? "bg-brand-soft/30 text-ink"
                            : "text-ink hover:bg-surface-sunken"
                        }`}
                      >
                        <input
                          id={optionId}
                          type="checkbox"
                          disabled={disabled}
                          className="h-4 w-4 shrink-0 rounded border-line-strong accent-brand focus:ring-brand"
                          checked={isChecked}
                          onChange={() => handleToggle(optionValue)}
                        />

                        {/* Avatar or Icon */}
                        {dataType === "user_reference" ? (
                          <div
                            className={`flex h-8 w-8 shrink-0 items-center justify-center rounded-full bg-gradient-to-br text-xs font-bold shadow-2xs ${getAvatarGradient(
                              option.value
                            )}`}
                          >
                            {getInitials(userMeta?.name || option.label)}
                          </div>
                        ) : dataType === "entity_reference" ? (
                          <div className="flex h-8 w-8 shrink-0 items-center justify-center rounded-lg border border-emerald-200/60 bg-emerald-50 text-emerald-600 shadow-2xs">
                            <svg className="h-4 w-4" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                              <path
                                strokeLinecap="round"
                                strokeLinejoin="round"
                                strokeWidth={2}
                                d="M19 21V5a2 2 0 00-2-2H7a2 2 0 00-2 2v16m14 0h2m-2 0h-5m-9 0H3m2 0h5M9 7h1m-1 4h1m4-4h1m-1 4h1m-5 10v-5a1 1 0 011-1h2a1 1 0 011 1v5m-4 0h4"
                              />
                            </svg>
                          </div>
                        ) : (
                          <div className="flex h-8 w-8 shrink-0 items-center justify-center rounded-lg border border-blue-200/60 bg-blue-50 text-blue-600 shadow-2xs">
                            <svg className="h-4 w-4" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                              <path
                                strokeLinecap="round"
                                strokeLinejoin="round"
                                strokeWidth={2}
                                d="M9 12h6m-6 4h6m2 5H7a2 2 0 01-2-2V5a2 2 0 012-2h5.586a1 1 0 01.707.293l5.414 5.414a1 1 0 01.293.707V19a2 2 0 01-2 2z"
                              />
                            </svg>
                          </div>
                        )}

                        {/* Content */}
                        <div className="min-w-0 flex-1">
                          {dataType === "user_reference" ? (
                            <>
                              <div className="flex items-center gap-1.5">
                                <span className="truncate font-medium text-ink">
                                  {userMeta?.name || option.label}
                                </span>
                              </div>
                              {userMeta?.email ? (
                                <span className="block truncate text-xs text-ink-muted">
                                  {userMeta.email}
                                </span>
                              ) : null}
                            </>
                          ) : dataType === "entity_reference" ? (
                            <div className="flex items-center gap-1.5">
                              <span className="truncate font-medium text-ink">
                                {option.name || option.label}
                              </span>
                              {option.entityTypeName ? (
                                <span className="inline-block rounded border border-emerald-200/50 bg-emerald-50 px-1.5 py-0.2 text-[10px] font-semibold text-emerald-700">
                                  {option.entityTypeName}
                                </span>
                              ) : null}
                            </div>
                          ) : (
                            <div className="flex items-center gap-1.5">
                              <span className="truncate font-medium text-ink">
                                {option.label ?? option.name ?? `Record #${option.value}`}
                              </span>
                            </div>
                          )}
                        </div>

                        {/* Checkmark indicator */}
                        {isChecked ? (
                          <span className="flex h-5 w-5 shrink-0 items-center justify-center rounded-full bg-brand-soft text-brand">
                            <svg className="h-3 w-3" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2.5} d="M5 13l4 4L19 7" />
                            </svg>
                          </span>
                        ) : null}
                      </label>
                    </li>
                  );
                })
              )}
            </ul>
          </div>
        ) : null}
      </div>
    </FormField>
  );
}

export default function ReferencePicker(props) {
  if (!props.multiple) {
    return <SingleReferencePicker {...props} />;
  }
  return <DropdownMultiReferencePicker {...props} />;
}
