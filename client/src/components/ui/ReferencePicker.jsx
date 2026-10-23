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
      onChange={(event) =>
        onChange(event.target.value === "" ? null : Number(event.target.value))
      }
      options={options}
    />
  );
}

/**
 * Dropdown popover multi-select for user_reference and entity_reference.
 * Keeps form compact and opens a floating search popover when clicked.
 */
function DropdownMultiReferencePicker({
  id,
  dataType = "user_reference",
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
  const searchInputId = useId();
  const [isOpen, setIsOpen] = useState(false);
  const [searchTerm, setSearchTerm] = useState("");

  const safeOptions = useMemo(() => (Array.isArray(options) ? options : []), [options]);

  const selected = useMemo(() => {
    return Array.isArray(value) ? value.map((entry) => Number(entry)) : [];
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
    () => safeOptions.filter((opt) => selected.includes(Number(opt.value))),
    [safeOptions, selected]
  );

  useEffect(() => {
    function handleClickOutside(event) {
      if (containerRef.current && !containerRef.current.contains(event.target)) {
        setIsOpen(false);
      }
    }
    function handleKeyDown(event) {
      if (event.key === "Escape" && isOpen) {
        setIsOpen(false);
      }
    }
    if (isOpen) {
      document.addEventListener("mousedown", handleClickOutside);
      document.addEventListener("keydown", handleKeyDown);
    }
    return () => {
      document.removeEventListener("mousedown", handleClickOutside);
      document.removeEventListener("keydown", handleKeyDown);
    };
  }, [isOpen]);

  useEffect(() => {
    if (isOpen && searchInputRef.current) {
      searchInputRef.current.focus();
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

  function handleToggle(optionValue) {
    const num = Number(optionValue);
    if (selected.includes(num)) {
      onChange(selected.filter((item) => item !== num));
    } else {
      onChange([...selected, num]);
    }
  }

  function handleRemove(optionValue, e) {
    e.stopPropagation();
    const num = Number(optionValue);
    onChange(selected.filter((item) => item !== num));
  }

  function handleClearAll(e) {
    e.stopPropagation();
    onChange([]);
  }

  function handleSelectAllVisible() {
    const visibleValues = filteredOptions.map((o) => Number(o.value));
    const combined = Array.from(new Set([...selected, ...visibleValues]));
    onChange(combined);
  }

  const defaultPlaceholder =
    placeholder ||
    (dataType === "user_reference"
      ? "Select users…"
      : "Select organization entities…");

  const searchPlaceholder =
    dataType === "user_reference"
      ? "Search users by name or email…"
      : "Search organization entities…";

  return (
    <FormField id={id} label={label} hint={hint} error={error} required={required}>
      <div ref={containerRef} className="relative">
        {/* Trigger Input Box */}
        <div
          id={id}
          role="combobox"
          aria-expanded={isOpen}
          aria-haspopup="listbox"
          tabIndex={disabled ? -1 : 0}
          onClick={() => {
            if (!disabled) setIsOpen((prev) => !prev);
          }}
          onKeyDown={(e) => {
            if (!disabled && (e.key === "Enter" || e.key === " " || e.key === "ArrowDown")) {
              e.preventDefault();
              setIsOpen(true);
            }
          }}
          className={`flex min-h-[42px] w-full cursor-pointer items-center justify-between gap-2 rounded-xl border bg-surface px-3 py-1.5 text-xs transition-all duration-150 ${
            disabled
              ? "cursor-not-allowed opacity-60 bg-surface-sunken"
              : isOpen
                ? "border-brand ring-2 ring-brand/10 shadow-sm"
                : error
                  ? "border-danger ring-1 ring-danger/20"
                  : "border-line-strong hover:border-line-stronger"
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
                ) : (
                  <svg className="h-4 w-4 shrink-0 text-emerald-600" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                    <path
                      strokeLinecap="round"
                      strokeLinejoin="round"
                      strokeWidth={2}
                      d="M19 21V5a2 2 0 00-2-2H7a2 2 0 00-2 2v16m14 0h2m-2 0h-5m-9 0H3m2 0h5M9 7h1m-1 4h1m4-4h1m-1 4h1m-5 10v-5a1 1 0 011-1h2a1 1 0 011 1v5m-4 0h4"
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
                    ) : (
                      <svg className="h-3.5 w-3.5 shrink-0 text-emerald-600" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                        <path
                          strokeLinecap="round"
                          strokeLinejoin="round"
                          strokeWidth={2}
                          d="M19 21V5a2 2 0 00-2-2H7a2 2 0 00-2 2v16m14 0h2m-2 0h-5m-9 0H3m2 0h5M9 7h1m-1 4h1m4-4h1m-1 4h1m-5 10v-5a1 1 0 011-1h2a1 1 0 011 1v5m-4 0h4"
                        />
                      </svg>
                    )}
                    <span className="max-w-[130px] truncate font-medium">
                      {userMeta?.name || opt.name || opt.label}
                    </span>
                    {!disabled ? (
                      <button
                        type="button"
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

        {/* Floating Dropdown Popover */}
        {isOpen ? (
          <div className="absolute left-0 right-0 top-full z-40 mt-1.5 overflow-hidden rounded-xl border border-line-subtle bg-surface shadow-2xl ring-1 ring-black/5">
            {/* Search Header */}
            <div className="flex items-center gap-2 border-b border-line-subtle bg-surface-sunken/40 px-3 py-2">
              <svg className="h-4 w-4 shrink-0 text-ink-muted" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                <path
                  strokeLinecap="round"
                  strokeLinejoin="round"
                  strokeWidth={2}
                  d="M21 21l-6-6m2-5a7 7 0 11-14 0 7 7 0 0114 0z"
                />
              </svg>
              <input
                ref={searchInputRef}
                id={searchInputId}
                type="text"
                value={searchTerm}
                onChange={(e) => setSearchTerm(e.target.value)}
                placeholder={searchPlaceholder}
                className="w-full bg-transparent text-xs text-ink placeholder:text-ink-muted focus:outline-none"
              />
              {searchTerm ? (
                <button
                  type="button"
                  onClick={() => setSearchTerm("")}
                  aria-label="Clear search"
                  className="rounded p-0.5 text-ink-muted hover:bg-surface hover:text-ink"
                >
                  <svg className="h-3.5 w-3.5" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M6 18L18 6M6 6l12 12" />
                  </svg>
                </button>
              ) : null}
            </div>

            {/* Counts & Quick Actions Sub-bar */}
            <div className="flex flex-wrap items-center justify-between gap-2 border-b border-line-subtle/70 bg-surface px-3 py-1.5 text-xs">
              <div className="flex items-center gap-1.5">
                {selected.length > 0 ? (
                  <span className="inline-flex items-center rounded-full bg-brand-soft px-2 py-0.5 text-[11px] font-semibold text-brand">
                    {selected.length} selected
                  </span>
                ) : (
                  <span className="text-ink-muted">
                    {safeOptions.length} {dataType === "user_reference" ? "user(s)" : "available"}
                  </span>
                )}
                {searchTerm && filteredOptions.length !== safeOptions.length ? (
                  <span className="text-[11px] text-ink-muted">
                    ({filteredOptions.length} match{filteredOptions.length === 1 ? "" : "es"})
                  </span>
                ) : null}
              </div>

              <div className="flex items-center gap-3">
                {filteredOptions.length > 0 ? (
                  <button
                    type="button"
                    onClick={handleSelectAllVisible}
                    className="font-medium text-brand hover:underline"
                  >
                    {searchTerm ? "Select matching" : "Select all"}
                  </button>
                ) : null}
                {selected.length > 0 ? (
                  <button
                    type="button"
                    onClick={() => onChange([])}
                    className="font-medium text-ink-muted hover:text-danger"
                  >
                    Clear
                  </button>
                ) : null}
              </div>
            </div>

            {/* Option List Container */}
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
                    onClick={() => setSearchTerm("")}
                    className="ml-2 font-medium text-brand hover:underline"
                  >
                    Clear filter
                  </button>
                </li>
              ) : (
                filteredOptions.map((option, index) => {
                  const optionValue = Number(option.value);
                  const isChecked = selected.includes(optionValue);
                  const optionId = `${id}-opt-${index}`;
                  const userMeta = dataType === "user_reference" ? parseUserDetails(option) : null;

                  return (
                    <li key={option.value ?? optionId}>
                      <label
                        htmlFor={optionId}
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
                        ) : (
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
                          ) : (
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

            {/* Footer with Done button */}
            <div className="flex items-center justify-between border-t border-line-subtle bg-surface-sunken/40 px-3 py-2 text-xs text-ink-muted">
              <span>Press Esc or click outside to close</span>
              <button
                type="button"
                onClick={() => setIsOpen(false)}
                className="rounded-md bg-brand px-3 py-1 font-semibold text-white shadow-2xs hover:bg-brand-strong transition-colors"
              >
                Done
              </button>
            </div>
          </div>
        ) : null}
      </div>
    </FormField>
  );
}

/**
 * Inline multi-select used for record_reference relations.
 * Renders an inline list with search bar.
 */
function InlineMultiReferencePicker({
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
}) {
  const searchInputId = useId();
  const [searchTerm, setSearchTerm] = useState("");

  const safeOptions = useMemo(() => (Array.isArray(options) ? options : []), [options]);

  const selected = useMemo(() => {
    return Array.isArray(value) ? value.map((entry) => Number(entry)) : [];
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
    () => safeOptions.filter((opt) => selected.includes(Number(opt.value))),
    [safeOptions, selected]
  );

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

  function handleToggle(optionValue) {
    const num = Number(optionValue);
    if (selected.includes(num)) {
      onChange(selected.filter((item) => item !== num));
    } else {
      onChange([...selected, num]);
    }
  }

  function handleSelectAllVisible() {
    const visibleValues = filteredOptions.map((o) => Number(o.value));
    const combined = Array.from(new Set([...selected, ...visibleValues]));
    onChange(combined);
  }

  function handleClearAll() {
    onChange([]);
  }

  return (
    <FormField id={id} label={label} hint={hint} error={error} required={required}>
      <div
        className={`rounded-xl border bg-surface transition-all duration-150 ${
          error
            ? "border-danger ring-1 ring-danger/20"
            : "border-line-strong focus-within:border-brand focus-within:ring-2 focus-within:ring-brand/10"
        }`}
      >
        {/* Search header bar */}
        <div className="flex items-center gap-2 border-b border-line-subtle bg-surface-sunken/40 px-3 py-2">
          <svg className="h-4 w-4 shrink-0 text-ink-muted" fill="none" viewBox="0 0 24 24" stroke="currentColor">
            <path
              strokeLinecap="round"
              strokeLinejoin="round"
              strokeWidth={2}
              d="M21 21l-6-6m2-5a7 7 0 11-14 0 7 7 0 0114 0z"
            />
          </svg>
          <input
            id={searchInputId}
            type="text"
            value={searchTerm}
            onChange={(e) => setSearchTerm(e.target.value)}
            placeholder="Search records…"
            disabled={disabled}
            className="w-full bg-transparent text-xs text-ink placeholder:text-ink-muted focus:outline-none"
          />
          {searchTerm ? (
            <button
              type="button"
              onClick={() => setSearchTerm("")}
              aria-label="Clear search"
              className="rounded p-0.5 text-ink-muted hover:bg-surface hover:text-ink"
            >
              <svg className="h-3.5 w-3.5" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M6 18L18 6M6 6l12 12" />
              </svg>
            </button>
          ) : null}
        </div>

        {/* Action / Count sub-bar */}
        <div className="flex flex-wrap items-center justify-between gap-2 border-b border-line-subtle/70 bg-surface px-3 py-1.5 text-xs">
          <div className="flex items-center gap-1.5">
            {selected.length > 0 ? (
              <span className="inline-flex items-center rounded-full bg-brand-soft px-2 py-0.5 text-[11px] font-semibold text-brand">
                {selected.length} selected
              </span>
            ) : (
              <span className="text-ink-muted">
                {safeOptions.length} available
              </span>
            )}
            {searchTerm && filteredOptions.length !== safeOptions.length ? (
              <span className="text-[11px] text-ink-muted">
                ({filteredOptions.length} match{filteredOptions.length === 1 ? "" : "es"})
              </span>
            ) : null}
          </div>

          <div className="flex items-center gap-3">
            {filteredOptions.length > 0 ? (
              <button
                type="button"
                onClick={handleSelectAllVisible}
                disabled={disabled}
                className="font-medium text-brand hover:underline disabled:opacity-50"
              >
                {searchTerm ? "Select matching" : "Select all"}
              </button>
            ) : null}
            {selected.length > 0 ? (
              <button
                type="button"
                onClick={handleClearAll}
                disabled={disabled}
                className="font-medium text-ink-muted hover:text-danger disabled:opacity-50"
              >
                Clear
              </button>
            ) : null}
          </div>
        </div>

        {/* Selected chips row */}
        {selectedOptions.length > 0 ? (
          <div className="flex max-h-24 flex-wrap gap-1.5 overflow-y-auto border-b border-line-subtle bg-surface-sunken/20 p-2">
            {selectedOptions.map((opt) => (
              <span
                key={opt.value}
                className="inline-flex items-center gap-1.5 rounded-md border border-brand/20 bg-brand-soft/40 px-2 py-0.5 text-xs text-brand-strong"
              >
                <span className="max-w-[140px] truncate font-medium">
                  {opt.label}
                </span>
                {!disabled ? (
                  <button
                    type="button"
                    onClick={() => handleToggle(opt.value)}
                    aria-label={`Remove ${opt.label}`}
                    className="rounded p-0.5 text-brand hover:bg-brand/10"
                  >
                    <svg className="h-3 w-3" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                      <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2.5} d="M6 18L18 6M6 6l12 12" />
                    </svg>
                  </button>
                ) : null}
              </span>
            ))}
          </div>
        ) : null}

        {/* Option list container */}
        <ul
          id={id}
          className="max-h-56 divide-y divide-line-subtle/50 overflow-y-auto p-1.5"
        >
          {safeOptions.length === 0 ? (
            <li className="px-3 py-6 text-center text-xs text-ink-muted">
              No records to choose from.
            </li>
          ) : filteredOptions.length === 0 ? (
            <li className="px-3 py-6 text-center text-xs text-ink-muted">
              No matches found for “{searchTerm}”.
              <button
                type="button"
                onClick={() => setSearchTerm("")}
                className="ml-2 font-medium text-brand hover:underline"
              >
                Clear filter
              </button>
            </li>
          ) : (
            filteredOptions.map((option, index) => {
              const optionValue = Number(option.value);
              const isChecked = selected.includes(optionValue);
              const optionId = `${id}-opt-${index}`;

              return (
                <li key={option.value ?? optionId}>
                  <label
                    htmlFor={optionId}
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

                    <div className="min-w-0 flex-1">
                      <span className="truncate font-medium text-ink">
                        {option.label ?? option.value}
                      </span>
                    </div>

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
    </FormField>
  );
}

export default function ReferencePicker(props) {
  if (!props.multiple) {
    return <SingleReferencePicker {...props} />;
  }
  if (props.dataType === "user_reference" || props.dataType === "entity_reference") {
    return <DropdownMultiReferencePicker {...props} />;
  }
  return <InlineMultiReferencePicker {...props} />;
}
