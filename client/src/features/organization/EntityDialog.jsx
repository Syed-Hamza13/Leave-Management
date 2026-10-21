import { useMemo, useState } from "react";

import Button from "../../components/ui/Button.jsx";
import FieldRenderer from "../../components/ui/FieldRenderer.jsx";
import { LoadingState } from "../../components/ui/LoadingState.jsx";
import Modal from "../../components/ui/Modal.jsx";
import { useToast } from "../../components/ui/ToastContext.js";

import useAsyncData from "../../hooks/useAsyncData.js";
import useMutation from "../../hooks/useMutation.js";
import { errorMessage, fieldErrors, warningMessages } from "../../services/errors.js";
import {
  forms as formsApi,
  mappings as mappingsApi,
  organization as organizationApi,
} from "../../services/resources.js";

import { initialValuesFromFields } from "../records/recordValues.js";
import useEntryOptions from "../records/useEntryOptions.js";

const FORM_ID = "entity-dialog-form";

export default function EntityDialog({
  entityType,
  profileConfiguration = null,
  entity = null,
  onClose,
  onSaved,
}) {
  const isEdit = Boolean(entity);
  const toast = useToast();

  const [draftValues, setDraftValues] = useState(null);
  const [errors, setErrors] = useState({});

  const { run, pending, error } = useMutation();

  const { data: renderData, loading: renderLoading } = useAsyncData(
    `entity-profile-form:${profileConfiguration?.form.id ?? "none"}`,
    () => (profileConfiguration ? formsApi.render(profileConfiguration.form.id) : Promise.resolve(null))
  );

  const { data: pairData, loading: pairLoading } = useAsyncData(
    `entity-profile-pair:${profileConfiguration?.form.id ?? "none"}:${profileConfiguration?.table.id ?? "none"}`,
    () =>
      profileConfiguration
        ? mappingsApi.forFormAndTable(profileConfiguration.form.id, profileConfiguration.table.id)
        : Promise.resolve(null)
  );

  const fields = useMemo(() => renderData?.data?.fields ?? [], [renderData]);
  const entries = pairData?.data?.entries ?? null;
  const formLoading = (renderLoading || pairLoading) && Boolean(profileConfiguration);

  const initialValues = useMemo(() => {
    const raw = initialValuesFromFields(fields, entries, entity?.profile?.values ?? null);
    // If editing and first string field is empty, fallback to entity.name
    if (entity?.name && fields.length > 0) {
      const firstField = fields[0];
      if (firstField && !raw[firstField.key]) {
        raw[firstField.key] = entity.name;
      }
    }
    return raw;
  }, [fields, entries, entity]);

  const values = draftValues ?? initialValues;

  const { optionsFor, truncatedFor } = useEntryOptions(fields);

  function setField(key, value) {
    setDraftValues({ ...values, [key]: value });
  }

  async function handleSubmit(event) {
    event.preventDefault();
    setErrors({});

    const payload = {
      parentEntityId: null,
      values: { ...values },
    };

    const firstStr = Object.values(values).find(
      (v) => typeof v === "string" && v.trim().length > 0
    );
    if (firstStr) {
      payload.name = String(firstStr).trim();
    } else if (entity?.name) {
      payload.name = entity.name;
    }

    const outcome = await run(() =>
      isEdit
        ? organizationApi.updateEntity(entity.id, payload)
        : organizationApi.createEntity({
            ...payload,
            entityTypeId: Number(entityType.id),
          })
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

  return (
    <Modal
      open
      onClose={pending ? () => {} : onClose}
      title={isEdit ? `Edit ${entity.name}` : `New ${entityType?.label || "Entry"}`}
      description={
        profileConfiguration
          ? `Enter details through "${profileConfiguration.form.label}".`
          : `Details for ${entityType?.label || "this entity"}.`
      }
      size={fields.length > 3 ? "lg" : "md"}
      footer={
        <>
          <Button variant="ghost" onClick={onClose} disabled={pending}>
            Cancel
          </Button>

          <Button
            type="submit"
            form={FORM_ID}
            loading={pending}
            disabled={formLoading || pending}
          >
            {isEdit ? "Save changes" : `Add ${entityType?.label || "entry"}`}
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
            {errorMessage(error, "The entry could not be saved.")}
          </p>
        ) : null}

        {formLoading ? (
          <div className="flex items-center justify-center py-10">
            <LoadingState label="Loading form fields…" />
          </div>
        ) : fields.length > 0 ? (
          <div className="space-y-4">
            {fields.map((field) => {
              const options = optionsFor(field);

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
                  error={errors[field.key] ?? (field === fields[0] ? errors.name : null)}
                  disabled={pending}
                  options={field.dataType === "dropdown" ? options : null}
                  recordOptions={
                    ["record_reference", "entity_reference", "user_reference"].includes(field.dataType)
                      ? options
                      : null
                  }
                />
              );
            })}
          </div>
        ) : (
          <p className="py-6 text-center text-sm text-ink-muted">
            No fields found in this form. Configure fields in Form Builder first.
          </p>
        )}
      </form>
    </Modal>
  );
}
