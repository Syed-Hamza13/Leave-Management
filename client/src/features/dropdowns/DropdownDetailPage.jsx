import { useState } from "react";
import { useParams } from "react-router-dom";

import Badge from "../../components/ui/Badge.jsx";
import Button from "../../components/ui/Button.jsx";
import Checkbox from "../../components/ui/Checkbox.jsx";
import ConfirmDialog from "../../components/ui/ConfirmDialog.jsx";
import Modal from "../../components/ui/Modal.jsx";
import TextInput from "../../components/ui/TextInput.jsx";
import { LoadingState } from "../../components/ui/LoadingState.jsx";
import { useToast } from "../../components/ui/ToastContext.js";

import useAsyncData from "../../hooks/useAsyncData.js";
import useMutation from "../../hooks/useMutation.js";
import { PERMISSIONS } from "../../lib/permissions.js";
import { errorMessage, fieldErrors } from "../../services/errors.js";
import { dropdowns as dropdownsApi } from "../../services/resources.js";

import { usePermissions } from "../permissions/PermissionsContext.js";

const OPTION_FORM_ID = "dropdown-option-form";

function OptionDialog({ dropdownId, option, onClose, onSaved }) {
  const isEdit = Boolean(option);

  const [value, setValue] = useState(option?.value ?? "");
  const [label, setLabel] = useState(option?.label ?? "");
  const [isActive, setIsActive] = useState(option ? Boolean(option.isActive) : true);
  const [errors, setErrors] = useState({});

  const { run, pending, error } = useMutation();

  async function handleSubmit(event) {
    event.preventDefault();
    setErrors({});

    const outcome = await run(() =>
      isEdit
        ? dropdownsApi.updateOption(dropdownId, option.id, { label: label.trim(), isActive })
        : dropdownsApi.createOption(dropdownId, { value: value.trim(), label: label.trim() })
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
      title={isEdit ? `Edit “${option.label}”` : "Add option"}
      size="sm"
      footer={
        <>
          <Button variant="ghost" onClick={onClose} disabled={pending}>
            Cancel
          </Button>

          <Button type="submit" form={OPTION_FORM_ID} loading={pending}>
            {isEdit ? "Save option" : "Add option"}
          </Button>
        </>
      }
    >
      <form id={OPTION_FORM_ID} onSubmit={handleSubmit} className="space-y-4" noValidate>
        {error ? (
          <p
            role="alert"
            className="rounded-control border border-danger bg-danger-soft px-3 py-2 text-sm font-medium text-danger"
          >
            {errorMessage(error, "The option could not be saved.")}
          </p>
        ) : null}

        {isEdit ? (
          <p className="text-xs text-ink-soft">
            Value{" "}
            <code className="rounded bg-surface-sunken px-1.5 py-0.5 font-mono text-ink">
              {value}
            </code>{" "}
            is stored inside records and cannot be changed.
          </p>
        ) : (
          <TextInput
            id="option-value"
            label="Value"
            required
            hint="Letters, numbers, hyphens or underscores. This is what gets stored."
            data-autofocus
            value={value}
            onChange={(event) => setValue(event.target.value)}
            error={errors.value}
            maxLength={190}
            placeholder="annual"
          />
        )}

        <TextInput
          id="option-label"
          label="Label"
          required
          value={label}
          onChange={(event) => setLabel(event.target.value)}
          error={errors.label}
          maxLength={190}
          placeholder="Annual leave"
        />

        {isEdit ? (
          <Checkbox
            id="option-is-active"
            label="Option is available for new selections"
            checked={isActive}
            onChange={(event) => setIsActive(event.target.checked)}
          />
        ) : null}
      </form>
    </Modal>
  );
}

export default function DropdownDetailPage() {
  const { dropdownId } = useParams();
  const { can } = usePermissions();
  const toast = useToast();

  const [dialog, setDialog] = useState(null);
  const [removeTarget, setRemoveTarget] = useState(null);

  const canManage = can(PERMISSIONS.DROPDOWNS_MANAGE);

  const { data, loading, error, reload } = useAsyncData(`dropdown:${dropdownId}`, () =>
    dropdownsApi.get(dropdownId)
  );

  const dropdown = data?.data ?? null;
  const options = dropdown?.options ?? [];

  const { run, pending } = useMutation();

  async function saveOrder(nextOptions, description) {
    const outcome = await run(() =>
      dropdownsApi.reorderOptions(
        dropdownId,
        nextOptions.map((option) => option.id)
      )
    );

    if (outcome.ok) {
      reload();
      return;
    }

    toast.error(errorMessage(outcome.error, description));
  }

  /*
   * Reordering is a whole-list write, so the buttons move one position and the
   * server re-numbers every option from the submitted order.
   */
  async function move(index, direction) {
    const target = index + direction;

    if (target < 0 || target >= options.length) return;

    const next = [...options];

    [next[index], next[target]] = [next[target], next[index]];

    await saveOrder(next, "The new order could not be saved.");
  }

  async function toggleActive(option) {
    const outcome = await run(() =>
      dropdownsApi.updateOption(dropdownId, option.id, { isActive: !option.isActive })
    );

    if (outcome.ok) {
      reload();
      return;
    }

    toast.error(errorMessage(outcome.error, "The option could not be updated."));
  }

  async function confirmRemove() {
    const target = removeTarget;

    const outcome = await run(() => dropdownsApi.deleteOption(dropdownId, target.id));

    setRemoveTarget(null);

    if (outcome.ok) {
      toast.success(`Option “${target.label}” was removed.`);
      reload();
      return;
    }

    toast.error(errorMessage(outcome.error, "The option could not be removed."));
  }

  if (loading) return <LoadingState label="Loading option set…" />;

  if (error) {
    return (
      <div className="space-y-3">
        <p className="text-sm font-medium text-danger">
          {errorMessage(error, "This option set could not be loaded.")}
        </p>

        <Button variant="secondary" size="sm" onClick={reload}>
          Try again
        </Button>
      </div>
    );
  }

  return (
    <div className="space-y-4">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <div className="min-w-0">
          <p className="truncate text-sm font-semibold text-ink">{dropdown.label}</p>

          <p className="truncate font-mono text-xs text-ink-muted">{dropdown.key}</p>
        </div>

        <div className="flex items-center gap-2">
          <Badge tone={dropdown.status === "active" ? "success" : "neutral"}>
            {dropdown.status}
          </Badge>

          {canManage && dropdown.status === "active" ? (
            <Button size="sm" onClick={() => setDialog({ mode: "create" })}>
              Add option
            </Button>
          ) : null}
        </div>
      </div>

      {dropdown.description ? (
        <p className="text-sm text-ink-soft">{dropdown.description}</p>
      ) : null}

      <div className="overflow-hidden rounded-card border border-line bg-surface">
        <ul className="divide-y divide-line">
          {options.length === 0 ? (
            <li className="px-4 py-10 text-center text-sm text-ink-soft">
              No options yet. Add the choices this set should offer.
            </li>
          ) : null}

          {options.map((option, index) => (
            <li
              key={option.id}
              className="flex flex-wrap items-center gap-3 px-4 py-3 hover:bg-surface-sunken"
            >
              <span className="w-6 shrink-0 text-right text-xs text-ink-muted">{index + 1}</span>

              <div className="min-w-0 flex-1">
                <p
                  className={`truncate text-sm font-medium ${
                    option.isActive ? "text-ink" : "text-ink-muted line-through"
                  }`}
                >
                  {option.label}
                </p>

                <code className="font-mono text-xs text-ink-muted">{option.value}</code>
              </div>

              {!option.isActive ? <Badge tone="neutral">Inactive</Badge> : null}

              {canManage ? (
                <div className="flex items-center gap-1">
                  <Button
                    variant="quiet"
                    size="sm"
                    onClick={() => move(index, -1)}
                    disabled={pending || index === 0}
                    aria-label={`Move ${option.label} up`}
                  >
                    <span aria-hidden="true">↑</span>
                  </Button>

                  <Button
                    variant="quiet"
                    size="sm"
                    onClick={() => move(index, 1)}
                    disabled={pending || index === options.length - 1}
                    aria-label={`Move ${option.label} down`}
                  >
                    <span aria-hidden="true">↓</span>
                  </Button>

                  <Button variant="ghost" size="sm" onClick={() => toggleActive(option)}>
                    {option.isActive ? "Deactivate" : "Activate"}
                  </Button>

                  <Button
                    variant="ghost"
                    size="sm"
                    onClick={() => setDialog({ mode: "edit", option })}
                  >
                    Edit
                  </Button>

                  <Button variant="ghost" size="sm" onClick={() => setRemoveTarget(option)}>
                    Remove
                  </Button>
                </div>
              ) : null}
            </li>
          ))}
        </ul>
      </div>

      {dialog ? (
        <OptionDialog
          dropdownId={dropdownId}
          option={dialog.option ?? null}
          onClose={() => setDialog(null)}
          onSaved={(saved) => {
            setDialog(null);
            toast.success(
              dialog.mode === "create"
                ? `Option “${saved?.label ?? ""}” was added.`
                : `Option “${saved?.label ?? ""}” was saved.`
            );
            reload();
          }}
        />
      ) : null}

      <ConfirmDialog
        open={Boolean(removeTarget)}
        title="Remove option"
        message={`Remove “${removeTarget?.label ?? ""}”?`}
        detail="Records that already store this value keep it. Deactivating the option instead hides it from new selections without touching history."
        confirmLabel="Remove option"
        loading={pending}
        onCancel={() => setRemoveTarget(null)}
        onConfirm={confirmRemove}
      />
    </div>
  );
}
