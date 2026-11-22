import { useEffect, useMemo, useState } from "react";

import Badge from "../../components/ui/Badge.jsx";
import Button from "../../components/ui/Button.jsx";
import Modal from "../../components/ui/Modal.jsx";
import SearchInput from "../../components/ui/SearchInput.jsx";
import Select from "../../components/ui/Select.jsx";

import useAsyncData from "../../hooks/useAsyncData.js";
import useMutation from "../../hooks/useMutation.js";
import { errorMessage, fieldErrors } from "../../services/errors.js";
import {
  fields as fieldsApi,
  forms as formsApi,
  mappings as mappingsApi,
  tables as tablesApi,
} from "../../services/resources.js";

import { useMetadata } from "../metadata/MetadataContext.js";
import { toFieldsPayload } from "./formFields.js";

const FORM_ID = "add-fields-form";

export default function AddFieldsDialog({ form, onClose, onSaved }) {
  const { getDataType, lookups } = useMetadata();

  const [mode, setMode] = useState("all"); // "all" | "form" | "table"
  const [search, setSearch] = useState("");
  const [selected, setSelected] = useState([]);
  const [errors, setErrors] = useState({});

  const [sourceFormId, setSourceFormId] = useState("");
  const [sourceTableId, setSourceTableId] = useState("");

  const { run, pending, error } = useMutation();

  const usedIds = useMemo(
    () => new Set(form.fields.map((entry) => Number(entry.fieldId))),
    [form.fields]
  );

  // 1. All available active fields
  const { data: allFieldsData, loading: allLoading } = useAsyncData(
    `field-picker:${search}`,
    () => fieldsApi.list({ status: "active", search, pageSize: 100 })
  );

  // 2. Fields from another form
  const { data: sourceFormData, loading: sourceFormLoading } = useAsyncData(
    `add-field-source-form:${sourceFormId || "none"}`,
    () => (sourceFormId ? formsApi.get(sourceFormId) : Promise.resolve(null))
  );

  // 3. Columns and mappings from source table
  const { data: sourceTableData, loading: sourceTableLoading } = useAsyncData(
    `add-field-source-table:${sourceTableId || "none"}`,
    () => (sourceTableId ? tablesApi.get(sourceTableId) : Promise.resolve(null))
  );

  const { data: sourceMappingsData, loading: sourceMappingsLoading } = useAsyncData(
    `add-field-source-mappings:${sourceTableId || "none"}`,
    () =>
      sourceTableId
        ? mappingsApi.list({ tableId: sourceTableId, status: "active", pageSize: 20 })
        : Promise.resolve(null)
  );

  // Load detailed entries for mappings if available
  const [tableMappingEntries, setTableMappingEntries] = useState([]);
  const [tableEntriesLoading, setTableEntriesLoading] = useState(false);

  useEffect(() => {
    let cancelled = false;
    if (!sourceTableId) {
      setTableMappingEntries([]);
      return;
    }

    const mappingsList = sourceMappingsData?.data ?? [];
    if (mappingsList.length === 0) {
      setTableMappingEntries([]);
      return;
    }

    setTableEntriesLoading(true);
    Promise.all(mappingsList.map((m) => mappingsApi.get(m.id).catch(() => null)))
      .then((results) => {
        if (cancelled) return;
        const allEntries = [];
        for (const res of results) {
          if (res?.data?.entries) {
            allEntries.push(...res.data.entries);
          }
        }
        setTableMappingEntries(allEntries);
      })
      .finally(() => {
        if (!cancelled) setTableEntriesLoading(false);
      });

    return () => {
      cancelled = true;
    };
  }, [sourceTableId, sourceMappingsData]);

  const otherForms = useMemo(
    () => (lookups.forms ?? []).filter((f) => Number(f.id) !== Number(form.id)),
    [lookups.forms, form.id]
  );

  const availableTables = useMemo(
    () => (lookups.tables ?? []).filter((t) => t.status !== "archived"),
    [lookups.tables]
  );

  // Derive candidate items for display based on active mode
  const candidates = useMemo(() => {
    if (mode === "all") {
      return (allFieldsData?.data ?? []).map((candidate) => ({
        id: Number(candidate.id),
        label: candidate.label,
        key: candidate.key,
        dataType: candidate.dataType,
        sourceInfo: null,
      }));
    }

    if (mode === "form") {
      const sourceFields = sourceFormData?.data?.fields ?? [];
      return sourceFields.map((field) => ({
        id: Number(field.fieldId),
        label: field.labelOverride || field.label,
        key: field.key,
        dataType: field.dataType,
        sourceInfo: `From form: ${sourceFormData?.data?.label ?? "Form"}`,
      }));
    }

    if (mode === "table") {
      const list = [];
      const seenFieldIds = new Set();
      const allActive = allFieldsData?.data ?? [];
      const allByColKey = new Map(allActive.map((f) => [f.key, f]));

      // 1. From mappings
      for (const entry of tableMappingEntries) {
        if (entry.field && !seenFieldIds.has(Number(entry.field.id))) {
          seenFieldIds.add(Number(entry.field.id));
          list.push({
            id: Number(entry.field.id),
            label: entry.field.label,
            key: entry.field.key,
            dataType: entry.field.dataType,
            sourceInfo: `Mapped to column "${entry.column?.label || entry.column?.key}"`,
          });
        }
      }

      // 2. From table columns matching existing field definitions
      const tableColumns = sourceTableData?.data?.columns ?? [];
      for (const col of tableColumns) {
        if (col.status !== "active") continue;
        const matchingField = allByColKey.get(col.key);
        if (matchingField && !seenFieldIds.has(Number(matchingField.id))) {
          seenFieldIds.add(Number(matchingField.id));
          list.push({
            id: Number(matchingField.id),
            label: matchingField.label,
            key: matchingField.key,
            dataType: matchingField.dataType,
            sourceInfo: `Matches column "${col.label}" (${col.key})`,
          });
        }
      }

      return list;
    }

    return [];
  }, [
    mode,
    allFieldsData,
    sourceFormData,
    tableMappingEntries,
    sourceTableData,
  ]);

  function toggle(fieldId) {
    setSelected((current) =>
      current.includes(fieldId)
        ? current.filter((entry) => entry !== fieldId)
        : [...current, fieldId]
    );
  }

  function selectAllAvailable() {
    const availableInCandidates = candidates
      .filter((c) => !usedIds.has(c.id))
      .map((c) => c.id);

    setSelected((current) => Array.from(new Set([...current, ...availableInCandidates])));
  }

  function clearSelection() {
    setSelected([]);
  }

  async function handleSubmit(event) {
    event.preventDefault();
    setErrors({});

    const payload = {
      fields: [
        ...toFieldsPayload(form.fields),
        ...selected.map((fieldId) => ({ fieldId })),
      ],
    };

    const outcome = await run(() => formsApi.update(form.id, payload));

    if (outcome.ok) {
      onSaved(outcome.result?.data);
      return;
    }

    setErrors(fieldErrors(outcome.error));
  }

  const isLoading =
    mode === "all"
      ? allLoading
      : mode === "form"
        ? sourceFormLoading
        : sourceTableLoading || sourceMappingsLoading || tableEntriesLoading;

  return (
    <Modal
      open
      onClose={pending ? () => {} : onClose}
      title="Add fields to form"
      description="Add reusable fields directly or link fields from another form or mapped table without duplicate definitions."
      size="md"
      footer={
        <>
          <Button variant="ghost" onClick={onClose} disabled={pending}>
            Cancel
          </Button>

          <Button type="submit" form={FORM_ID} loading={pending} disabled={selected.length === 0}>
            Add {selected.length > 0 ? `${selected.length} ` : ""}
            {selected.length === 1 ? "field" : "fields"}
          </Button>
        </>
      }
    >
      <form id={FORM_ID} onSubmit={handleSubmit} className="space-y-4" noValidate>
        {error ? (
          <p
            role="alert"
            className="rounded-control border border-danger bg-danger-soft px-3 py-2 text-sm font-medium text-danger"
          >
            {errorMessage(error, "The fields could not be added.")}
          </p>
        ) : null}

        {errors.fields ? (
          <p role="alert" className="text-xs font-medium text-danger">
            {errors.fields}
          </p>
        ) : null}

        {/* Source Mode Tabs */}
        <div className="flex rounded-control border border-line bg-surface-sunken p-1">
          <button
            type="button"
            onClick={() => setMode("all")}
            className={`flex-1 rounded py-1.5 text-xs font-medium transition ${
              mode === "all"
                ? "bg-surface text-ink shadow-sm font-semibold"
                : "text-ink-soft hover:text-ink"
            }`}
          >
            All Available Fields
          </button>

          <button
            type="button"
            onClick={() => setMode("form")}
            className={`flex-1 rounded py-1.5 text-xs font-medium transition ${
              mode === "form"
                ? "bg-surface text-ink shadow-sm font-semibold"
                : "text-ink-soft hover:text-ink"
            }`}
          >
            From Another Form
          </button>

          <button
            type="button"
            onClick={() => setMode("table")}
            className={`flex-1 rounded py-1.5 text-xs font-medium transition ${
              mode === "table"
                ? "bg-surface text-ink shadow-sm font-semibold"
                : "text-ink-soft hover:text-ink"
            }`}
          >
            From Mapped Table
          </button>
        </div>

        {/* Mode 1: Search all fields */}
        {mode === "all" && (
          <SearchInput
            value={search}
            onChange={setSearch}
            label="Search available fields"
            placeholder="Search fields by label or key…"
          />
        )}

        {/* Mode 2: Select another form */}
        {mode === "form" && (
          <div className="space-y-2">
            <Select
              id="source-form-select"
              label="Select source form"
              value={sourceFormId}
              placeholder="Choose a form to copy fields from…"
              onChange={(e) => {
                setSourceFormId(e.target.value);
              }}
              options={otherForms.map((f) => ({
                value: String(f.id),
                label: `${f.label} (${f.fieldCount ?? 0} fields)`,
              }))}
            />
            {sourceFormId && (
              <p className="text-xs text-ink-soft">
                Fields from this form will be added to the current form using their existing definitions.
              </p>
            )}
          </div>
        )}

        {/* Mode 3: Select mapped table */}
        {mode === "table" && (
          <div className="space-y-2">
            <Select
              id="source-table-select"
              label="Select table"
              value={sourceTableId}
              placeholder="Choose a table to link fields from…"
              onChange={(e) => {
                setSourceTableId(e.target.value);
              }}
              options={availableTables.map((t) => ({
                value: String(t.id),
                label: `${t.label} (${t.key})`,
              }))}
            />
            {sourceTableId && (
              <p className="text-xs text-ink-soft">
                Showing existing form fields mapped to or matching columns in this table.
              </p>
            )}
          </div>
        )}

        {/* Action Bar for candidate selection */}
        {candidates.length > 0 && (
          <div className="flex items-center justify-between text-xs text-ink-soft px-1">
            <span>
              {candidates.filter((c) => !usedIds.has(c.id)).length} available to add
              {selected.length > 0 ? ` (${selected.length} selected)` : ""}
            </span>

            <div className="flex items-center gap-2">
              <Button type="button" variant="quiet" size="sm" onClick={selectAllAvailable}>
                Select all
              </Button>
              {selected.length > 0 && (
                <Button type="button" variant="quiet" size="sm" onClick={clearSelection}>
                  Clear
                </Button>
              )}
            </div>
          </div>
        )}

        {/* Field List */}
        <ul className="max-h-72 space-y-0.5 overflow-y-auto rounded-control border border-line bg-surface p-1.5">
          {isLoading ? (
            <li className="px-2 py-4 text-center text-xs text-ink-muted">Loading fields…</li>
          ) : null}

          {!isLoading && candidates.length === 0 ? (
            <li className="px-2 py-4 text-center text-xs text-ink-muted">
              {mode === "all"
                ? search
                  ? "No fields match your search."
                  : "No fields available."
                : mode === "form"
                  ? sourceFormId
                    ? "This form has no fields to add."
                    : "Select a form above to view its fields."
                  : sourceTableId
                    ? "No mapped form fields found for this table."
                    : "Select a table above to view its fields."}
            </li>
          ) : null}

          {candidates.map((candidate) => {
            const isAlreadyInForm = usedIds.has(candidate.id);
            const isChecked = isAlreadyInForm || selected.includes(candidate.id);
            const id = `add-field-${candidate.id}`;

            return (
              <li key={`${candidate.id}-${candidate.sourceInfo || ""}`}>
                <label
                  htmlFor={id}
                  className={`flex cursor-pointer items-center gap-3 rounded px-2 py-2 ${
                    isAlreadyInForm
                      ? "opacity-60 bg-surface-sunken cursor-not-allowed"
                      : "hover:bg-surface-sunken"
                  }`}
                >
                  <input
                    id={id}
                    type="checkbox"
                    disabled={isAlreadyInForm}
                    className="h-4 w-4 shrink-0 rounded border-line-strong accent-brand disabled:opacity-50"
                    checked={isChecked}
                    onChange={() => !isAlreadyInForm && toggle(candidate.id)}
                  />

                  <span className="min-w-0 flex-1">
                    <span className="block truncate text-sm font-medium text-ink">
                      {candidate.label}
                    </span>

                    <span className="flex flex-wrap items-center gap-2 text-xs text-ink-muted">
                      <code className="font-mono">{candidate.key}</code>
                      {candidate.sourceInfo && <span>· {candidate.sourceInfo}</span>}
                    </span>
                  </span>

                  {isAlreadyInForm ? (
                    <Badge tone="neutral">Already on this form</Badge>
                  ) : (
                    <Badge tone="brand">
                      {getDataType(candidate.dataType)?.label ?? candidate.dataType}
                    </Badge>
                  )}
                </label>
              </li>
            );
          })}
        </ul>

        <div className="rounded-card border border-brand bg-brand-soft px-3 py-2 text-xs text-brand">
          <p className="font-semibold">Zero Duplication Guarantee</p>
          <p className="mt-0.5">
            Fields are shared definitions. Adding them here re-uses the exact same field without creating duplicates.
          </p>
        </div>
      </form>
    </Modal>
  );
}
