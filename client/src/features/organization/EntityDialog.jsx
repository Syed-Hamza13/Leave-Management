import { useMemo, useState } from "react";

import Button from "../../components/ui/Button.jsx";
import FieldRenderer from "../../components/ui/FieldRenderer.jsx";
import Modal from "../../components/ui/Modal.jsx";
import TextInput from "../../components/ui/TextInput.jsx";
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

/*
 * An entity's own name is stored relationally, while its details live in the
 * profile record the configured form writes, so the two halves are edited
 * together but validated separately by the server.
 */
export default function EntityDialog({
  entityType,
  profileConfiguration = null,
  entity = null,
  onClose,
  onSaved,
}) {
  const isEdit = Boolean(entity);
  const toast = useToast();

  const [name, setName] = useState(entity?.name ?? "");
  const [draftValues, setDraftValues] = useState(null);
  const [errors, setErrors] = useState({});

  const { run, pending, error } = useMutation();

  const { data: renderData } = useAsyncData(
    `entity-profile-form:${profileConfiguration?.form.id ?? "none"}`,
    () => (profileConfiguration ? formsApi.render(profileConfiguration.form.id) : Promise.resolve(null))
  );

  const { data: pairData } = useAsyncData(
    `entity-profile-pair:${profileConfiguration?.form.id ?? "none"}:${profileConfiguration?.table.id ?? "none"}`,
    () =>
      profileConfiguration
        ? mappingsApi.forFormAndTable(profileConfiguration.form.id, profileConfiguration.table.id)
        : Promise.resolve(null)
  );

  const fields = useMemo(() => renderData?.data?.fields ?? [], [renderData]);
  const entries = pairData?.data?.entries ?? null;

  const initialValues = useMemo(
    () => initialValuesFromFields(fields, entries, entity?.profile?.values ?? null),
    [fields, entries, entity]
  );

  const values = draftValues ?? initialValues;

  const { optionsFor, truncatedFor } = useEntryOptions(fields);

  function setField(key, value) {
    setDraftValues({ ...values, [key]: value });
  }

  async function handleSubmit(event) {
    event.preventDefault();
    setErrors({});

    const payload = {
      name: name.trim(),
      parentEntityId: null,
    };

    if (fields.length > 0 || !isEdit) payload.values = values;

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
      title={isEdit ? `Edit "${entity.name}"` : `New ${entityType.label.toLowerCase()}`}
      description={
        profileConfiguration
          ? `Details are entered through "${profileConfiguration.form.label}".`
          : `No profile form is configured for ${entityType.label} yet, so only the name is stored.`
      }
      size={fields.length > 0 ? "lg" : "sm"}
      footer={
        <>
          <Button variant="ghost" onClick={onClose} disabled={pending}>
            Cancel
          </Button>

          <Button type="submit" form={FORM_ID} loading={pending}>
            {isEdit ? "Save" : "Create"}
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
            {errorMessage(error, "The entity could not be saved.")}
          </p>
        ) : null}

        <TextInput
          id="entity-name"
          label="Name"
          required
          autoFocus
          data-autofocus
          value={name}
          onChange={(event) => setName(event.target.value)}
          error={errors.name}
          maxLength={190}
          placeholder="People Operations"
        />

        {fields.length > 0 ? (
          <div className="space-y-4 border-t border-line pt-4">
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
                  error={errors[field.key] ?? null}
                  disabled={pending}
                  options={field.dataType === "dropdown" ? options : null}
                  recordOptions={field.dataType === "record_reference" ? options : null}
                />
              );
            })}
          </div>
        ) : null}
      </form>
    </Modal>
  );
}
