import { useState } from "react";

import Button from "../../components/ui/Button.jsx";
import Modal from "../../components/ui/Modal.jsx";
import TextInput from "../../components/ui/TextInput.jsx";
import Textarea from "../../components/ui/Textarea.jsx";

import useMutation from "../../hooks/useMutation.js";
import { errorMessage, fieldErrors } from "../../services/errors.js";
import { dropdowns as dropdownsApi } from "../../services/resources.js";

const FORM_ID = "dropdown-dialog-form";

export default function DropdownDialog({ dropdown, onClose, onSaved }) {
  const isEdit = Boolean(dropdown);

  const [label, setLabel] = useState(dropdown?.label ?? "");
  const [key, setKey] = useState(dropdown?.key ?? "");
  const [description, setDescription] = useState(dropdown?.description ?? "");
  const [options, setOptions] = useState([]);
  const [errors, setErrors] = useState({});

  const { run, pending, error } = useMutation();

  function updateOption(index, patch) {
    setOptions((current) =>
      current.map((option, position) =>
        position === index ? { ...option, ...patch } : option
      )
    );
  }

  function buildPayload() {
    const payload = {
      label: label.trim(),
      description: description.trim() || null,
    };

    if (isEdit) return payload;

    if (key.trim()) payload.key = key.trim();

    const entries = options
      .map((option) => ({ value: option.value.trim(), label: option.label.trim() }))
      .filter((option) => option.value || option.label);

    if (entries.length > 0) payload.options = entries;

    return payload;
  }

  async function handleSubmit(event) {
    event.preventDefault();
    setErrors({});

    const payload = buildPayload();

    const outcome = await run(() =>
      isEdit ? dropdownsApi.update(dropdown.id, payload) : dropdownsApi.create(payload)
    );

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
      title={isEdit ? `Edit “${dropdown.label}”` : "New option set"}
      description={
        isEdit
          ? "Option values are stored inside records, so they cannot be changed here."
          : "A named list of choices that dropdown fields reference instead of copying."
      }
      footer={
        <>
          <Button variant="ghost" onClick={onClose} disabled={pending}>
            Cancel
          </Button>

          <Button type="submit" form={FORM_ID} loading={pending}>
            {isEdit ? "Save option set" : "Create option set"}
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
            {errorMessage(error, "The option set could not be saved.")}
          </p>
        ) : null}

        <TextInput
          id="dropdown-label"
          label="Label"
          required
          data-autofocus
          value={label}
          onChange={(event) => setLabel(event.target.value)}
          error={errors.label}
          maxLength={160}
          placeholder="Leave type"
        />

        {isEdit ? (
          <p className="text-xs text-ink-soft">
            Key{" "}
            <code className="rounded bg-surface-sunken px-1.5 py-0.5 font-mono text-ink">
              {key}
            </code>{" "}
            is the stable identifier and cannot be changed.
          </p>
        ) : (
          <TextInput
            id="dropdown-key"
            label="Key"
            hint="Lowercase letters, numbers and underscores. Leave blank to generate it from the label."
            value={key}
            onChange={(event) => setKey(event.target.value)}
            error={errors.key}
            maxLength={63}
            placeholder="leave_type"
          />
        )}

        <Textarea
          id="dropdown-description"
          label="Description"
          rows={2}
          value={description}
          onChange={(event) => setDescription(event.target.value)}
          error={errors.description}
          maxLength={500}
        />

        {!isEdit ? (
          <fieldset className="space-y-3">
            <legend className="text-xs font-semibold uppercase tracking-wider text-ink-muted">
              Initial options
            </legend>

            {options.length === 0 ? (
              <p className="text-xs text-ink-soft">
                You can add options now or later from the option set page.
              </p>
            ) : null}

            {options.map((option, index) => (
              <div key={index} className="flex items-start gap-2">
                <div className="flex-1">
                  <TextInput
                    id={`dropdown-option-value-${index}`}
                    label={index === 0 ? "Value" : undefined}
                    value={option.value}
                    onChange={(event) => updateOption(index, { value: event.target.value })}
                    error={errors[`options.${index}.value`]}
                    maxLength={190}
                    placeholder="annual"
                  />
                </div>

                <div className="flex-1">
                  <TextInput
                    id={`dropdown-option-label-${index}`}
                    label={index === 0 ? "Label" : undefined}
                    value={option.label}
                    onChange={(event) => updateOption(index, { label: event.target.value })}
                    error={errors[`options.${index}.label`]}
                    maxLength={190}
                    placeholder="Annual leave"
                  />
                </div>

                <Button
                  variant="ghost"
                  size="sm"
                  className={index === 0 ? "mt-6" : ""}
                  onClick={() =>
                    setOptions((current) => current.filter((_, position) => position !== index))
                  }
                >
                  <span aria-hidden="true">✕</span>
                  <span className="sr-only">Remove option {index + 1}</span>
                </Button>
              </div>
            ))}

            <Button
              variant="secondary"
              size="sm"
              onClick={() => setOptions((current) => [...current, { value: "", label: "" }])}
            >
              Add option
            </Button>
          </fieldset>
        ) : null}
      </form>
    </Modal>
  );
}
