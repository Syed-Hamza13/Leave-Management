import { useMemo, useState } from "react";

import Badge from "../../components/ui/Badge.jsx";
import Button from "../../components/ui/Button.jsx";
import ConfirmDialog from "../../components/ui/ConfirmDialog.jsx";
import EmptyState from "../../components/ui/EmptyState.jsx";
import { LoadingState } from "../../components/ui/LoadingState.jsx";
import Modal from "../../components/ui/Modal.jsx";
import { useToast } from "../../components/ui/ToastContext.js";

import useAsyncData from "../../hooks/useAsyncData.js";
import useMutation from "../../hooks/useMutation.js";
import { errorMessage } from "../../services/errors.js";
import { organization as organizationApi } from "../../services/resources.js";

import MemberDialog from "./MemberDialog.jsx";

export default function EntityMembersModal({ entity, canManage = false, onClose }) {
  const toast = useToast();
  const [memberDialog, setMemberDialog] = useState(null);
  const [removeTarget, setRemoveTarget] = useState(null);

  const { data, loading, error, reload } = useAsyncData(
    `entity-members:${entity?.id}`,
    () => (entity?.id ? organizationApi.listMembers(entity.id) : Promise.resolve(null))
  );

  const members = data?.data ?? [];
  const existingUserIds = useMemo(() => members.map((m) => m.userId), [members]);

  const { run: runRemove, pending: removing } = useMutation();

  async function confirmRemove() {
    const target = removeTarget;
    const outcome = await runRemove(() =>
      organizationApi.removeMember(entity.id, target.userId)
    );

    setRemoveTarget(null);

    if (outcome.ok) {
      toast.success(`"${target.fullName}" was removed from ${entity.name}.`);
      reload();
      return;
    }

    toast.error(errorMessage(outcome.error, "Could not remove member."));
  }

  return (
    <Modal
      open
      onClose={onClose}
      title={`Members — ${entity.name}`}
      description="Users assigned to this entity with their assigned roles."
      size="md"
      footer={
        <Button variant="ghost" onClick={onClose}>
          Close
        </Button>
      }
    >
      <div className="space-y-4">
        {canManage && entity.status === "active" ? (
          <div className="flex justify-end">
            <Button size="sm" onClick={() => setMemberDialog({ mode: "add" })}>
              + Add member
            </Button>
          </div>
        ) : null}

        {loading ? (
          <LoadingState label="Loading members…" />
        ) : error ? (
          <p className="text-sm text-danger">{errorMessage(error, "Failed to load members.")}</p>
        ) : members.length === 0 ? (
          <EmptyState
            title="No members assigned"
            description={`Add users to "${entity.name}" to assign leads, managers, or members.`}
            action={
              canManage && entity.status === "active" ? (
                <Button size="sm" onClick={() => setMemberDialog({ mode: "add" })}>
                  + Add first member
                </Button>
              ) : null
            }
          />
        ) : (
          <ul className="divide-y divide-line overflow-hidden rounded-control border border-line bg-surface">
            {members.map((member) => (
              <li
                key={member.id}
                className="flex flex-wrap items-center justify-between gap-3 px-3 py-2.5 text-sm"
              >
                <div className="min-w-0">
                  <div className="flex items-center gap-2">
                    <span className="font-medium text-ink truncate">{member.fullName}</span>
                    <Badge
                      tone={
                        member.role === "lead"
                          ? "brand"
                          : member.role === "manager"
                            ? "accent"
                            : "neutral"
                      }
                    >
                      {member.role === "lead"
                        ? "Lead"
                        : member.role === "manager"
                          ? "Manager"
                          : "Member"}
                    </Badge>
                    {member.userStatus !== "active" ? (
                      <Badge tone="warning">Inactive</Badge>
                    ) : null}
                  </div>
                  <p className="text-xs text-ink-muted truncate">{member.email}</p>
                </div>

                {canManage && entity.status === "active" ? (
                  <div className="flex items-center gap-1">
                    <Button
                      variant="ghost"
                      size="sm"
                      onClick={() => setMemberDialog({ mode: "edit", member })}
                    >
                      Role
                    </Button>
                    <Button
                      variant="ghost"
                      size="sm"
                      onClick={() => setRemoveTarget(member)}
                    >
                      Remove
                    </Button>
                  </div>
                ) : null}
              </li>
            ))}
          </ul>
        )}

        {memberDialog ? (
          <MemberDialog
            entity={entity}
            member={memberDialog.member ?? null}
            existingUserIds={existingUserIds}
            onClose={() => setMemberDialog(null)}
            onSaved={(saved) => {
              setMemberDialog(null);
              toast.success(
                memberDialog.mode === "add"
                  ? `${saved?.fullName ?? "User"} was added.`
                  : `Role updated for ${saved?.fullName ?? "member"}.`
              );
              reload();
            }}
          />
        ) : null}

        <ConfirmDialog
          open={Boolean(removeTarget)}
          title="Remove member"
          message={`Remove "${removeTarget?.fullName}" from "${entity.name}"?`}
          detail="Removing a member does not delete their user account or records."
          confirmLabel="Remove member"
          loading={removing}
          onCancel={() => setRemoveTarget(null)}
          onConfirm={confirmRemove}
        />
      </div>
    </Modal>
  );
}
