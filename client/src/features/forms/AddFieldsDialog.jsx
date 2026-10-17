import { useState } from "react";

import Badge from "../../components/ui/Badge.jsx";
import Button from "../../components/ui/Button.jsx";
import Modal from "../../components/ui/Modal.jsx";
import SearchInput from "../../components/ui/SearchInput.jsx";

import useAsyncData from "../../hooks/useAsyncData.js";
import useMutation from "../../hooks/useMutation.js";
import { errorMessage, fieldErrors } from "../../services/errors.js";
import { fields as fieldsApi, forms as formsApi } from "../../services/resources.js";

import { useMetadata } from "../metadata/MetadataContext.js";

import { toFieldsPayload } from "./formFields.js";

const FORM_ID = "add-fields-form";

export default function AddFieldsDialog({ form, onClose, onSaved }) {
  const { getDataType } = useMetadata();

  const [search, setSearch] = useState("");
  const [selected, setSelected] = useState([]);
  const [errors, setErrors] = useState({});

  const { run, pending, error } = useMutation();

  const { data, loading } = useAsyncData(`field-picker:${search}`, () =>
    fieldsApi.list({ status: "active", search, pageSize: 100 })
  );

  const usedIds = new Set(form.fields.map((entry) => Number(entry.fieldId)));

  const available = (data?.data ?? []).filter(
    (candidate) => !usedIds.has(Number(candidate.id))
  );

  function toggle(fieldId) {
    setSelected((current) =>
      current.includes(fieldId)
        ? current.filter((entry) => entry !== fieldId)
        : [...current, fieldId]
    );
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

  return (
    <Modal
      open
      onClose={pending ? () => {} : onClose}
      title="Add fields"
      description="Fields are reusable. Adding one here does not change it for any other form."
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
      <form id={FORM_ID} onSubmit={handleSubmit} className="space-y-3" noValidate>
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

        <SearchInput
          value={search}
          onChange={setSearch}
          label="Search available fields"
          placeholder="Search fields by label or key…"
        />

        <ul className="max-h-80 space-y-0.5 overflow-y-auto rounded-control border border-line bg-surface p-1.5">
          {loading ? (
            <li className="px-2 py-3 text-xs text-ink-muted">Loading fields…</li>
          ) : null}

          {!loading && available.length === 0 ? (
            <li className="px-2 py-3 text-xs text-ink-muted">
              {search
                ? "No unused fields match your search."
                : "Every active field is already on this form."}
            </li>
          ) : null}

          {available.map((candidate) => {
            const id = `add-field-${candidate.id}`;

            return (
              <li key={candidate.id}>
                <label
                  htmlFor={id}
                  className="flex cursor-pointer items-center gap-3 rounded px-2 py-2 hover:bg-surface-sunken"
                >
                  <input
                    id={id}
                    type="checkbox"
                    className="h-4 w-4 shrink-0 rounded border-line-strong accent-brand"
                    checked={selected.includes(candidate.id)}
                    onChange={() => toggle(candidate.id)}
                  />

                  <span className="min-w-0 flex-1">
                    <span className="block truncate text-sm font-medium text-ink">
                      {candidate.label}
                    </span>

                    <code className="font-mono text-xs text-ink-muted">{candidate.key}</code>
                  </span>

                  <Badge tone="neutral">
                    {getDataType(candidate.dataType)?.label ?? candidate.dataType}
                  </Badge>
                </label>
              </li>
            );
          })}
        </ul>

        <p className="text-xs text-ink-muted">
          New fields are appended to the end of the form. Reorder them afterwards.
        </p>
      </form>
    </Modal>
  );
}
