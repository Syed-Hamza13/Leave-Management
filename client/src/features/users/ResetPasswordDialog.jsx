import { useState } from "react";

import Button from "../../components/ui/Button.jsx";
import Modal from "../../components/ui/Modal.jsx";
import TextInput from "../../components/ui/TextInput.jsx";

import useMutation from "../../hooks/useMutation.js";
import { errorMessage, fieldErrors } from "../../services/errors.js";
import { users as usersApi } from "../../services/resources.js";

const FORM_ID = "reset-password-form";

/*
 * An administrator sets a new password without knowing the old one. The value
 * is sent once and never read back, so there is nothing to prefill on a reopen.
 */
export default function ResetPasswordDialog({ user, onClose, onSaved }) {
  const [draft, setDraft] = useState({ password: "", confirmPassword: "" });
  const [errors, setErrors] = useState({});

  const { run, pending, error } = useMutation();

  const patch = (changes) => setDraft((current) => ({ ...current, ...changes }));

  async function handleSubmit(event) {
    event.preventDefault();

    const found = {};

    if (draft.password !== draft.confirmPassword) {
      found.confirmPassword = "The two passwords do not match.";
    }

    setErrors(found);

    if (Object.keys(found).length > 0) return;

    const outcome = await run(() => usersApi.setPassword(user.id, draft.password));

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
      title={`Set a new password for ${user.email}`}
      description="The account cannot sign in with its old password afterwards, and every session it has open is closed."
      footer={
        <>
          <Button variant="ghost" onClick={onClose} disabled={pending}>
            Cancel
          </Button>

          <Button type="submit" form={FORM_ID} loading={pending}>
            Set password
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
            {errorMessage(error, "The password could not be set.")}
          </p>
        ) : null}

        <TextInput
          id="reset-password"
          type="password"
          label="New password"
          required
          autoFocus
          data-autofocus
          hint="At least 8 characters with an uppercase letter, a number and a special character."
          value={draft.password}
          onChange={(event) => patch({ password: event.target.value })}
          error={errors.password}
          maxLength={128}
          autoComplete="new-password"
        />

        <TextInput
          id="reset-password-confirm"
          type="password"
          label="Confirm new password"
          required
          value={draft.confirmPassword}
          onChange={(event) => patch({ confirmPassword: event.target.value })}
          error={errors.confirmPassword}
          maxLength={128}
          autoComplete="new-password"
        />
      </form>
    </Modal>
  );
}
