import { useState } from "react";

import Button from "../../components/ui/Button.jsx";
import Modal from "../../components/ui/Modal.jsx";
import Select from "../../components/ui/Select.jsx";

import useAsyncData from "../../hooks/useAsyncData.js";
import useMutation from "../../hooks/useMutation.js";
import { errorMessage, fieldErrors } from "../../services/errors.js";
import { organization as organizationApi, users as usersApi } from "../../services/resources.js";

const ROLE_OPTIONS = [
  { value: "member", label: "Member" },
  { value: "lead", label: "Lead / Head" },
  { value: "manager", label: "Manager" },
];

export default function MemberDialog({
  entity,
  member = null,
  existingUserIds = [],
  onClose,
  onSaved,
}) {
  const isEdit = Boolean(member);

  const [userId, setUserId] = useState(() => (member ? String(member.userId) : ""));
  const [role, setRole] = useState(() => member?.role ?? "member");
  const [errors, setErrors] = useState({});

  const { data: usersData, loading: usersLoading } = useAsyncData(
    "active-users-for-membership",
    () => (isEdit ? Promise.resolve(null) : usersApi.list({ pageSize: 200, status: "active" }))
  );

  const existingSet = new Set(existingUserIds);
  const userCandidates = (usersData?.data ?? []).filter((u) => !existingSet.has(u.id));

  const { run, pending, error } = useMutation();

  async function handleSubmit(event) {
    event.preventDefault();
    setErrors({});

    if (!isEdit && !userId) {
      setErrors({ userId: "Please select a user to add." });
      return;
    }

    const outcome = await run(() =>
      isEdit
        ? organizationApi.updateMember(entity.id, member.userId, { role })
        : organizationApi.addMember(entity.id, { userId: Number(userId), role })
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
      title={isEdit ? `Edit Role: ${member.fullName}` : `Add Member to ${entity.name}`}
      description={
        isEdit
          ? "Update the user's role within this organization entity."
          : "Assign an employee or administrator to this organization entity."
      }
      size="sm"
      footer={
        <>
          <Button variant="ghost" onClick={onClose} disabled={pending}>
            Cancel
          </Button>

          <Button type="submit" form="member-dialog-form" loading={pending}>
            {isEdit ? "Save role" : "Add member"}
          </Button>
        </>
      }
    >
      <form id="member-dialog-form" onSubmit={handleSubmit} className="space-y-4" noValidate>
        {error ? (
          <p
            role="alert"
            className="rounded-control border border-danger bg-danger-soft px-3 py-2 text-sm font-medium text-danger"
          >
            {errorMessage(error, "The member could not be saved.")}
          </p>
        ) : null}

        {isEdit ? (
          <div>
            <p className="text-xs font-medium text-ink-muted">Member</p>
            <p className="text-sm font-semibold text-ink">{member.fullName}</p>
            <p className="text-xs text-ink-soft">{member.email}</p>
          </div>
        ) : (
          <Select
            id="member-user-id"
            label="User"
            required
            disabled={usersLoading}
            placeholder={usersLoading ? "Loading users…" : "Select a user…"}
            value={userId}
            onChange={(event) => setUserId(event.target.value)}
            error={errors.userId}
            options={userCandidates.map((user) => ({
              value: user.id,
              label: [user.firstName, user.lastName].filter(Boolean).join(" ") + ` (${user.email})`,
            }))}
          />
        )}

        <Select
          id="member-role"
          label="Role"
          required
          value={role}
          onChange={(event) => setRole(event.target.value)}
          error={errors.role}
          options={ROLE_OPTIONS}
        />
      </form>
    </Modal>
  );
}
