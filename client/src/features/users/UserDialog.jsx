import { useMemo, useState } from "react";

import Button from "../../components/ui/Button.jsx";
import Checkbox from "../../components/ui/Checkbox.jsx";
import FieldRenderer from "../../components/ui/FieldRenderer.jsx";
import Modal from "../../components/ui/Modal.jsx";
import Select from "../../components/ui/Select.jsx";
import TextInput from "../../components/ui/TextInput.jsx";

import useAsyncData from "../../hooks/useAsyncData.js";
import useMutation from "../../hooks/useMutation.js";
import { errorMessage, fieldErrors } from "../../services/errors.js";
import {
  authorization as authorizationApi,
  tables as tablesApi,
  users as usersApi,
} from "../../services/resources.js";
import useEntryOptions from "../records/useEntryOptions.js";

const FORM_ID = "user-dialog-form";

const EMPTY = {
  email: "",
  firstName: "",
  lastName: "",
  password: "",
  confirmPassword: "",
  status: "active",
  values: {},
};

function fromUser(user) {
  return {
    ...EMPTY,
    email: user.email ?? "",
    firstName: user.firstName ?? "",
    lastName: user.lastName ?? "",
    status: user.status ?? "active",
    values: { ...(user.values ?? {}) },
  };
}

/*
 * Roles are assigned through the authorization endpoint rather than the account
 * patch, because that is where the server's lockout guard lives. The two writes
 * run in sequence and the dialog reports which one failed.
 */
export default function UserDialog({
  user = null,
  roles = [],
  customColumns: passedCustomColumns = null,
  onClose,
  onSaved,
}) {
  const isEdit = Boolean(user);

  const { data: tableData } = useAsyncData(
    "table-users-definition",
    () => (passedCustomColumns ? Promise.resolve(null) : tablesApi.get("users"))
  );

  const customColumns = useMemo(() => {
    if (passedCustomColumns) return passedCustomColumns;
    return (tableData?.data?.columns ?? []).filter(
      (col) => !col.isSystem && col.status === "active"
    );
  }, [passedCustomColumns, tableData]);

  const { optionsFor } = useEntryOptions(customColumns);

  const [draft, setDraft] = useState(() => (isEdit ? fromUser(user) : EMPTY));
  const [roleKeys, setRoleKeys] = useState(() =>
    isEdit ? (user.roles ?? []).map((role) => role.key) : []
  );
  const [errors, setErrors] = useState({});

  const { run, pending, error } = useMutation();

  const originalRoleKeys = useMemo(
    () => new Set((user?.roles ?? []).map((role) => role.key)),
    [user]
  );

  const patch = (changes) => setDraft((current) => ({ ...current, ...changes }));

  const toggleRole = (key) =>
    setRoleKeys((current) =>
      current.includes(key) ? current.filter((entry) => entry !== key) : [...current, key]
    );

  function buildProfilePayload() {
    if (!isEdit) {
      return {
        email: draft.email.trim(),
        firstName: draft.firstName.trim(),
        lastName: draft.lastName.trim() || null,
        password: draft.password,
        roleKeys,
        values: draft.values,
      };
    }

    const payload = {};

    if (draft.firstName.trim() !== (user.firstName ?? "")) payload.firstName = draft.firstName.trim();

    if ((draft.lastName.trim() || null) !== (user.lastName ?? null)) {
      payload.lastName = draft.lastName.trim() || null;
    }

    if (draft.status !== user.status) payload.status = draft.status;

    const originalValues = user.values ?? {};
    let valuesChanged = false;
    for (const col of customColumns) {
      if ((draft.values?.[col.key] ?? null) !== (originalValues[col.key] ?? null)) {
        valuesChanged = true;
        break;
      }
    }
    if (valuesChanged) {
      payload.values = draft.values;
    }

    return payload;
  }

  function localValidation() {
    const found = {};

    if (!isEdit) {
      if (!draft.email.trim()) found.email = "An email address is required.";
      if (!draft.firstName.trim()) found.firstName = "First name is required.";

      if (draft.password !== draft.confirmPassword) {
        found.confirmPassword = "The two passwords do not match.";
      }
    } else if (!draft.firstName.trim()) {
      found.firstName = "First name is required.";
    }

    for (const col of customColumns) {
      if (col.isRequired) {
        const val = draft.values?.[col.key];
        if (val === null || val === undefined || val === "") {
          found[col.key] = `${col.label} is required.`;
        }
      }
    }

    return found;
  }

  async function handleSubmit(event) {
    event.preventDefault();

    const found = localValidation();

    setErrors(found);

    if (Object.keys(found).length > 0) return;

    const profile = buildProfilePayload();
    const rolesChanged =
      !isEdit ||
      roleKeys.length !== originalRoleKeys.size ||
      roleKeys.some((key) => !originalRoleKeys.has(key));

    const outcome = await run(async () => {
      if (isEdit) {
        /*
         * An unchanged profile is not PATCHed; the server rejects a patch that
         * carries no field at all.
         */
        if (Object.keys(profile).length > 0) await usersApi.update(user.id, profile);

        if (rolesChanged) {
          await authorizationApi.setRoles(user.id, roleKeys);
        }

        return usersApi.get(user.id);
      }

      return usersApi.create(profile);
    });

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
      title={isEdit ? `Edit ${user.email}` : "New account"}
      description={
        isEdit
          ? "The email address identifies the account and does not change. Deactivating keeps the person's records."
          : "An account signs in with this email and password. Roles decide what it may administer."
      }
      footer={
        <>
          <Button variant="ghost" onClick={onClose} disabled={pending}>
            Cancel
          </Button>

          <Button type="submit" form={FORM_ID} loading={pending}>
            {isEdit ? "Save account" : "Create account"}
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
            {errorMessage(error, "The account could not be saved.")}
          </p>
        ) : null}

        {isEdit ? (
          <div>
            <p className="text-sm font-medium text-ink">Email</p>
            <p className="mt-0.5 text-xs text-ink-soft">{draft.email}</p>
          </div>
        ) : (
          <TextInput
            id="user-email"
            type="email"
            label="Email"
            required
            autoFocus
            data-autofocus
            value={draft.email}
            onChange={(event) => patch({ email: event.target.value })}
            error={errors.email}
            maxLength={255}
            placeholder="person@example.com"
          />
        )}

        <div className="grid gap-3 sm:grid-cols-2">
          <TextInput
            id="user-first-name"
            label="First name"
            required
            value={draft.firstName}
            onChange={(event) => patch({ firstName: event.target.value })}
            error={errors.firstName}
            maxLength={100}
          />

          <TextInput
            id="user-last-name"
            label="Last name"
            value={draft.lastName}
            onChange={(event) => patch({ lastName: event.target.value })}
            error={errors.lastName}
            maxLength={100}
          />
        </div>

        {!isEdit ? (
          <div className="grid gap-3 sm:grid-cols-2">
            <TextInput
              id="user-password"
              type="password"
              label="Password"
              required
              hint="At least 8 characters with an uppercase letter, a number and a special character."
              value={draft.password}
              onChange={(event) => patch({ password: event.target.value })}
              error={errors.password}
              maxLength={128}
              autoComplete="new-password"
            />

            <TextInput
              id="user-confirm-password"
              type="password"
              label="Confirm password"
              required
              value={draft.confirmPassword}
              onChange={(event) => patch({ confirmPassword: event.target.value })}
              error={errors.confirmPassword}
              maxLength={128}
              autoComplete="new-password"
            />
          </div>
        ) : null}

        {isEdit ? (
          <Select
            id="user-status"
            label="Status"
            hint="A deactivated account cannot sign in, and its open sessions are closed. Its records stay."
            value={draft.status}
            onChange={(event) => patch({ status: event.target.value })}
            options={[
              { value: "active", label: "Active" },
              { value: "disabled", label: "Deactivated" },
            ]}
          />
        ) : null}

        {customColumns.length > 0 ? (
          <div className="grid gap-3 sm:grid-cols-2">
            {customColumns.map((col) => (
              <FieldRenderer
                key={col.key}
                field={col}
                value={draft.values?.[col.key]}
                onChange={(key, next) =>
                  setDraft((curr) => ({
                    ...curr,
                    values: { ...curr.values, [key]: next },
                  }))
                }
                error={errors[col.key]}
                options={optionsFor(col)}
                recordOptions={optionsFor(col)}
              />
            ))}
          </div>
        ) : null}

        <fieldset className="space-y-2 border-t border-line pt-4">
          <legend className="text-sm font-medium text-ink">Roles</legend>

          <p className="text-xs text-ink-soft">
            Permissions come from the roles; the server checks them on every request.
          </p>

          <div className="space-y-1.5">
            {roles.map((role) => (
              <Checkbox
                key={role.key}
                id={`user-role-${role.key}`}
                label={role.label}
                hint={role.description}
                checked={roleKeys.includes(role.key)}
                onChange={() => toggleRole(role.key)}
              />
            ))}
          </div>
        </fieldset>
      </form>
    </Modal>
  );
}
