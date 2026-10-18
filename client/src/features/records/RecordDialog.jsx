import { useMemo, useState } from "react";
import { Link } from "react-router-dom";

import Button from "../../components/ui/Button.jsx";
import FieldRenderer from "../../components/ui/FieldRenderer.jsx";
import Modal from "../../components/ui/Modal.jsx";
import Select from "../../components/ui/Select.jsx";
import { LoadingState } from "../../components/ui/LoadingState.jsx";
import { useToast } from "../../components/ui/ToastContext.js";

import useAsyncData from "../../hooks/useAsyncData.js";
import useMutation from "../../hooks/useMutation.js";
import { errorMessage, fieldErrors, warningMessages } from "../../services/errors.js";
import { forms as formsApi, mappings as mappingsApi, records as recordsApi } from "../../services/resources.js";

import useEntryOptions from "./useEntryOptions.js";
import { initialValuesFromFields } from "./recordValues.js";

/*
 * Records are entered through a mapped form, which is what keeps the values a
 * person types and the columns they land in tied to one published definition.
 *
 * `fixedFormId` pins the entry to one form, which is how an organization
 * profile or section writes through the mapping its configuration chose.
 */
export default function RecordDialog({
  table,
  record = null,
  fixedFormId = null,
  onClose,
  onSaved,
}) {
  const isEdit = Boolean(record);
  const toast = useToast();

  const [formId, setFormId] = useState(null);
  const [draftValues, setDraftValues] = useState(null);
  const [errors, setErrors] = useState({});

  const { run, pending, error: submitError } = useMutation();

  const {
    data: formsData,
    loading: formsLoading,
    error: formsError,
  } = useAsyncData(`table-mappings:${table.id}:${fixedFormId ?? "any"}`, () =>
    fixedFormId
      ? Promise.resolve({ data: [{ formId: Number(fixedFormId) }] })
      : mappingsApi.list({ tableId: table.id, status: "active", pageSize: 100 })
  );

  const mappedForms = useMemo(() => formsData?.data ?? [], [formsData]);

  const activeFormId = formId ?? mappedForms[0]?.formId ?? null;

  const { data: renderData, loading: renderLoading } = useAsyncData(
    `form-render:${activeFormId ?? "none"}`,
    () => (activeFormId ? formsApi.render(activeFormId) : Promise.resolve(null))
  );

  const { data: pairData, loading: pairLoading } = useAsyncData(
    `form-pair:${activeFormId ?? "none"}:${table.id}`,
    () => (activeFormId ? mappingsApi.forFormAndTable(activeFormId, table.id) : Promise.resolve(null))
  );

  const form = renderData?.data ?? null;
  const fields = useMemo(() => form?.fields ?? [], [form]);
  const entries = pairData?.data?.entries ?? null;

  const initialValues = useMemo(
    () => initialValuesFromFields(fields, entries, record?.values ?? null),
    [fields, entries, record]
  );

  const values = draftValues ?? initialValues;

  const { optionsFor, truncatedFor, failedFor, reload: reloadOptions } = useEntryOptions(fields);

  const optionsFailed = fields.some((field) => failedFor(field));

  const busy = formsLoading || renderLoading || pairLoading;

  function setField(key, value) {
    setDraftValues({ ...values, [key]: value });
  }

  async function handleSubmit(event) {
    event.preventDefault();
    setErrors({});

    const payload = { formId: Number(activeFormId), values };

    const outcome = await run(() =>
      isEdit
        ? recordsApi.update(table.id, record.id, payload)
        : recordsApi.create(table.id, payload)
    );

    if (!outcome.ok) {
      setErrors(fieldErrors(outcome.error));

      return;
    }

    const warnings = warningMessages(outcome.result);

    onSaved(outcome.result?.data);

    for (const warning of warnings.slice(0, 3)) {
      toast.warning(warning);
    }
  }

  if (busy) return <LoadingState label="Loading form…" />;

  if (formsError) {
    return (
      <Modal open onClose={onClose} title="Record" size="md">
        <p role="alert" className="text-sm font-medium text-danger">
          {errorMessage(formsError, "The forms for this table could not be loaded.")}
        </p>
      </Modal>
    );
  }

  if (mappedForms.length === 0) {
    return (
      <Modal open onClose={onClose} title="No form writes to this table" size="sm">
        <p className="text-sm text-ink-soft">
          Records are entered through a form mapped to{" "}
          <span className="font-medium text-ink">{table.label}</span>. Map a form to this table
          first.
        </p>

        <div className="mt-4 flex justify-end gap-2">
          <Button variant="ghost" onClick={onClose}>
            Close
          </Button>

          <Link to="/admin/mappings">
            <Button>Open form mappings</Button>
          </Link>
        </div>
      </Modal>
    );
  }

  if (!form) {
    return (
      <Modal
        open
        onClose={onClose}
        title="This form cannot be used"
        description={`“${mappedForms[0]?.form?.label ?? "The mapped form"}” is not available for entry. Check that it is active and still has fields.`}
        size="sm"
        footer={<Button variant="ghost" onClick={onClose}>Close</Button>}
      />
    );
  }

  return (
    <Modal
      open
      onClose={pending ? () => {} : onClose}
      title={isEdit ? `Edit record #${record.id}` : `New ${table.label.toLowerCase()} record`}
      description={`Entered through “${form.label}” and stored in ${table.label}.`}
      size="lg"
      footer={
        <>
          <Button variant="ghost" onClick={onClose} disabled={pending}>
            Cancel
          </Button>

          <Button type="submit" form="record-dialog-form" loading={pending}>
            {isEdit ? "Save record" : form.submitLabel || "Submit"}
          </Button>
        </>
      }
    >
      <form id="record-dialog-form" onSubmit={handleSubmit} className="space-y-4">
        {submitError ? (
          <p
            role="alert"
            className="rounded-control border border-danger bg-danger-soft px-3 py-2 text-sm font-medium text-danger"
          >
            {errorMessage(submitError, "The record could not be saved.")}
          </p>
        ) : null}

        {optionsFailed ? (
          <div className="flex flex-wrap items-center justify-between gap-2 rounded-card border border-warning bg-warning-soft px-3 py-2">
            <p className="text-sm font-medium text-warning">
              Some dropdowns and relations could not be loaded, so those fields offer nothing yet.
            </p>

            <Button variant="secondary" size="sm" onClick={reloadOptions} disabled={pending}>
              Try again
            </Button>
          </div>
        ) : null}

        {mappedForms.length > 1 ? (
          <Select
            id="record-form"
            label="Form"
            hint="Each form writes to this table through its own mapping."
            value={activeFormId}
            disabled={pending}
            onChange={(event) => {
              setFormId(Number(event.target.value));
              setDraftValues(null);
            }}
            options={mappedForms.map((mapping) => ({
              value: mapping.formId,
              label: mapping.form?.label ?? `Form ${mapping.formId}`,
            }))}
          />
        ) : null}

        {fields.length === 0 ? (
          <p className="text-sm text-ink-soft">This form has no active fields to fill in.</p>
        ) : null}

        {fields.map((field) => {
          const options = optionsFor(field);

          /*
           * A relation picker only reaches the newest candidates, so the notice
           * joins the field's own help text rather than sitting beside it.
           */
          const rendered = truncatedFor(field)
            ? {
                ...field,
                helpText: [field.helpText, "Showing the 200 most recent related records."]
                  .filter(Boolean)
                  .join(" "),
              }
            : field;

          return (
            <FieldRenderer
              key={field.formFieldId ?? field.key}
              field={rendered}
              value={values[field.key] ?? null}
              onChange={setField}
              error={
                errors[field.key] ?? (failedFor(field) ? "Choices unavailable." : null)
              }
              disabled={pending}
              options={field.dataType === "dropdown" ? options : null}
              recordOptions={field.dataType === "record_reference" ? options : null}
            />
          );
        })}
      </form>
    </Modal>
  );
}
