import { useState } from "react";
import Button from "../../components/ui/Button.jsx";
import FieldRenderer from "../../components/ui/FieldRenderer.jsx";
import Modal from "../../components/ui/Modal.jsx";
import Select from "../../components/ui/Select.jsx";
import { useToast } from "../../components/ui/ToastContext.js";
import useMutation from "../../hooks/useMutation.js";
import { errorMessage } from "../../services/errors.js";
import { users as usersApi } from "../../services/resources.js";

export default function BulkUpdateDialog({
  open,
  userIds = [],
  customColumns = [],
  roles = [],
  optionsFor,
  onClose,
  onSaved,
}) {
  const toast = useToast();
  const { run: runBulkUpdate, pending: updating } = useMutation();

  // Unified list of field updates:
  // Array of:
  // - { key: 'status', label: 'Account Status', type: 'system_status', value: 'active' }
  // - { key: 'role', label: 'Primary Role', type: 'system_role', value: string }
  // - { key: string, label: string, type: 'column', column: Object, action: 'set' | 'clear', value: any }
  const [selectedFields, setSelectedFields] = useState([]);

  const allAvailableFields = [
    { key: "status", label: "Account Status", type: "system_status" },
    { key: "role", label: "Primary Role", type: "system_role" },
    ...customColumns.map((col) => ({
      key: col.key,
      label: col.label,
      type: "column",
      column: col,
    })),
  ];

  const unselectedFields = allAvailableFields.filter(
    (field) => !selectedFields.some((sf) => sf.key === field.key)
  );

  function handleAddField(fieldKey) {
    const fieldDef = allAvailableFields.find((f) => f.key === fieldKey);
    if (!fieldDef) return;

    if (fieldDef.type === "system_status") {
      setSelectedFields((prev) => [
        ...prev,
        { key: "status", label: fieldDef.label, type: "system_status", value: "active" },
      ]);
    } else if (fieldDef.type === "system_role") {
      setSelectedFields((prev) => [
        ...prev,
        {
          key: "role",
          label: fieldDef.label,
          type: "system_role",
          value: roles[0]?.key || "employee",
        },
      ]);
    } else {
      let initialVal = "";
      if (fieldDef.column?.config?.allowMultiple) {
        initialVal = [];
      } else if (fieldDef.column?.dataType === "checkbox" || fieldDef.column?.dataType === "toggle") {
        initialVal = false;
      }

      setSelectedFields((prev) => [
        ...prev,
        {
          key: fieldDef.key,
          label: fieldDef.label,
          type: "column",
          column: fieldDef.column,
          action: "set",
          value: initialVal,
        },
      ]);
    }
  }

  function handleRemoveField(fieldKey) {
    setSelectedFields((prev) => prev.filter((sf) => sf.key !== fieldKey));
  }

  function updateFieldState(fieldKey, patch) {
    setSelectedFields((prev) =>
      prev.map((sf) => (sf.key === fieldKey ? { ...sf, ...patch } : sf))
    );
  }

  async function handleSubmit(e) {
    e.preventDefault();

    if (selectedFields.length === 0) {
      toast.danger("Please select at least one field to update.");
      return;
    }

    let statusValue = undefined;
    let roleKeys = undefined;
    const profileValues = {};
    const clearFields = [];

    for (const sf of selectedFields) {
      if (sf.type === "system_status") {
        statusValue = sf.value;
      } else if (sf.type === "system_role") {
        roleKeys = [sf.value];
      } else if (sf.type === "column") {
        if (sf.action === "clear") {
          clearFields.push(sf.key);
        } else {
          profileValues[sf.key] = sf.value;
        }
      }
    }

    const payload = {
      userIds,
      status: statusValue,
      roleKeys,
      profileValues,
      clearFields,
    };

    const outcome = await runBulkUpdate(() => usersApi.bulkUpdate(payload));
    if (!outcome.ok) {
      toast.danger(errorMessage(outcome.error, "Failed to update accounts in bulk."));
      return;
    }

    toast.success(`Successfully updated ${userIds.length} account(s) in bulk.`);
    onSaved?.();
    onClose();
  }

  if (!open) return null;

  return (
    <Modal
      open={open}
      onClose={updating ? () => {} : onClose}
      title={`Bulk Update (${userIds.length} Accounts Selected)`}
      size="lg"
    >
      <form onSubmit={handleSubmit} className="space-y-5">
        <p className="text-xs text-ink-soft">
          Select any field you want to update or clear across all{" "}
          <span className="font-semibold text-ink">{userIds.length}</span> selected accounts.
        </p>

        {/* Normal Field Select Dropdown */}
        <div className="flex items-center gap-2">
          <div className="flex-1">
            <Select
              id="bulk-field-select"
              label="Select field to update"
              placeholder={
                unselectedFields.length === 0
                  ? "All fields have been added"
                  : "Choose a field to update..."
              }
              value=""
              disabled={unselectedFields.length === 0 || updating}
              onChange={(e) => {
                if (e.target.value) {
                  handleAddField(e.target.value);
                }
              }}
              options={unselectedFields.map((f) => ({
                value: f.key,
                label: f.label,
              }))}
            />
          </div>
        </div>

        {/* Selected Fields List */}
        {selectedFields.length === 0 ? (
          <div className="rounded-xl border border-dashed border-line p-6 text-center text-xs text-ink-muted">
            No fields selected for update yet. Choose a field from the dropdown above.
          </div>
        ) : (
          <div className="space-y-3 max-h-[50vh] overflow-y-auto pr-1">
            {selectedFields.map((sf) => {
              if (sf.type === "system_status") {
                return (
                  <div
                    key="status"
                    className="p-3.5 bg-surface-sunken rounded-xl border border-line space-y-2.5 animate-fadeIn"
                  >
                    <div className="flex items-center justify-between">
                      <span className="text-xs font-semibold uppercase tracking-wider text-brand">
                        {sf.label}
                      </span>
                      <button
                        type="button"
                        onClick={() => handleRemoveField("status")}
                        className="text-ink-muted hover:text-danger text-xs font-bold px-1.5 py-0.5 rounded hover:bg-surface"
                        title="Remove field"
                      >
                        ✕
                      </button>
                    </div>

                    <div className="pt-1">
                      <Select
                        id="bulk-status-value"
                        label="New Status"
                        className="w-48"
                        value={sf.value}
                        onChange={(e) => updateFieldState("status", { value: e.target.value })}
                        options={[
                          { value: "active", label: "Active" },
                          { value: "disabled", label: "Deactivated" },
                        ]}
                      />
                    </div>
                  </div>
                );
              }

              if (sf.type === "system_role") {
                return (
                  <div
                    key="role"
                    className="p-3.5 bg-surface-sunken rounded-xl border border-line space-y-2.5 animate-fadeIn"
                  >
                    <div className="flex items-center justify-between">
                      <span className="text-xs font-semibold uppercase tracking-wider text-brand">
                        {sf.label}
                      </span>
                      <button
                        type="button"
                        onClick={() => handleRemoveField("role")}
                        className="text-ink-muted hover:text-danger text-xs font-bold px-1.5 py-0.5 rounded hover:bg-surface"
                        title="Remove field"
                      >
                        ✕
                      </button>
                    </div>

                    <div className="pt-1">
                      <Select
                        id="bulk-role-value"
                        label="New Role"
                        className="w-56"
                        value={sf.value}
                        onChange={(e) => updateFieldState("role", { value: e.target.value })}
                        options={roles.map((r) => ({ value: r.key, label: r.label }))}
                      />
                    </div>
                  </div>
                );
              }

              // Dynamic columns
              const col = sf.column;
              return (
                <div
                  key={sf.key}
                  className="p-3.5 bg-surface-sunken rounded-xl border border-line space-y-2.5 animate-fadeIn"
                >
                  <div className="flex items-center justify-between">
                    <span className="text-xs font-semibold uppercase tracking-wider text-brand">
                      {sf.label}
                    </span>

                    <div className="flex items-center gap-4">
                      <label className="flex items-center gap-1.5 text-xs text-ink cursor-pointer">
                        <input
                          type="radio"
                          name={`action-${sf.key}`}
                          checked={sf.action === "set"}
                          onChange={() => updateFieldState(sf.key, { action: "set" })}
                          className="text-brand focus:ring-brand"
                        />
                        Set new value
                      </label>

                      <label className="flex items-center gap-1.5 text-xs text-danger font-medium cursor-pointer">
                        <input
                          type="radio"
                          name={`action-${sf.key}`}
                          checked={sf.action === "clear"}
                          onChange={() => updateFieldState(sf.key, { action: "clear" })}
                          className="text-danger focus:ring-danger"
                        />
                        Clear / Remove value
                      </label>

                      <button
                        type="button"
                        onClick={() => handleRemoveField(sf.key)}
                        className="text-ink-muted hover:text-danger text-xs font-bold px-1.5 py-0.5 rounded hover:bg-surface ml-1"
                        title="Remove field"
                      >
                        ✕
                      </button>
                    </div>
                  </div>

                  {sf.action === "set" ? (
                    <div className="pt-1">
                      <FieldRenderer
                        field={col}
                        value={sf.value}
                        onChange={(_key, next) => {
                          const nextValue = next !== undefined ? next : _key;
                          updateFieldState(sf.key, { value: nextValue });
                        }}
                        options={optionsFor(col)}
                      />
                    </div>
                  ) : (
                    <p className="text-xs text-danger italic pt-0.5">
                      The value for &ldquo;{sf.label}&rdquo; will be cleared/removed for all{" "}
                      {userIds.length} selected accounts.
                    </p>
                  )}
                </div>
              );
            })}
          </div>
        )}

        <div className="flex justify-end gap-3 pt-3 border-t border-line">
          <Button type="button" variant="ghost" onClick={onClose} disabled={updating}>
            Cancel
          </Button>
          <Button
            type="submit"
            variant="primary"
            loading={updating}
            disabled={selectedFields.length === 0}
          >
            Apply Bulk Updates
          </Button>
        </div>
      </form>
    </Modal>
  );
}
