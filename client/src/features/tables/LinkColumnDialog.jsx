import { useMemo, useState } from "react";
import Badge from "../../components/ui/Badge.jsx";
import Button from "../../components/ui/Button.jsx";
import Checkbox from "../../components/ui/Checkbox.jsx";
import Modal from "../../components/ui/Modal.jsx";
import Select from "../../components/ui/Select.jsx";
import TextInput from "../../components/ui/TextInput.jsx";
import { useToast } from "../../components/ui/ToastContext.js";
import useAsyncData from "../../hooks/useAsyncData.js";
import useMutation from "../../hooks/useMutation.js";
import { errorMessage, fieldErrors } from "../../services/errors.js";
import { tables as tablesApi } from "../../services/resources.js";
import { useMetadata } from "../metadata/MetadataContext.js";

const FORM_ID = "link-column-dialog-form";

export default function LinkColumnDialog({ table, onClose, onSaved }) {
  const { lookups, getDataType } = useMetadata();
  const toast = useToast();

  const [targetTableId, setTargetTableId] = useState("");
  const [selectedColumnKey, setSelectedColumnKey] = useState("");
  const [syncTargetColumnKey, setSyncTargetColumnKey] = useState("");
  const [label, setLabel] = useState("");
  const [key, setKey] = useState("");
  const [allowMultiple, setAllowMultiple] = useState(false);
  const [isRequired, setIsRequired] = useState(false);
  const [isVisible, setIsVisible] = useState(true);
  const [isSearchable, setIsSearchable] = useState(true);
  const [isFilterable, setIsFilterable] = useState(true);
  const [addToForms, setAddToForms] = useState(true);

  const [errors, setErrors] = useState({});

  const { run, pending, error } = useMutation();

  const availableTables = useMemo(
    () =>
      (lookups.tables ?? []).filter(
        (t) => Number(t.id) !== Number(table.id) && t.status !== "archived"
      ),
    [lookups.tables, table.id]
  );

  // Fetch target table columns
  const { data: targetTableData, loading: targetTableLoading } = useAsyncData(
    `link-column-target-table:${targetTableId || "none"}`,
    () => (targetTableId ? tablesApi.get(targetTableId) : Promise.resolve(null))
  );

  const targetTable = targetTableData?.data ?? null;
  const targetColumns = useMemo(
    () =>
      (targetTable?.columns ?? []).filter(
        (col) => col.status === "active" && col.key !== "password_hash"
      ),
    [targetTable]
  );

  function handleSelectTargetTable(tableIdStr) {
    setTargetTableId(tableIdStr);
    setSelectedColumnKey("");
    setSyncTargetColumnKey("");
    setLabel("");
    setKey("");
    setErrors({});

    if (!tableIdStr) return;

    const matchedTable = availableTables.find((t) => String(t.id) === String(tableIdStr));
    if (matchedTable) {
      setLabel(matchedTable.label);
      setKey(`${matchedTable.key}_id`);
    }
  }

  async function handleSubmit(e) {
    e.preventDefault();
    setErrors({});

    if (!targetTableId) {
      setErrors({ targetTableId: "Select a source table to relate with." });
      return;
    }

    if (!label.trim()) {
      setErrors({ label: "Relation name is required." });
      return;
    }

    const outcome = await run(async () => {
      const isSystemUsers = targetTable?.storageKind === "system_users";
      const resolvedDataType = isSystemUsers ? "user_reference" : "record_reference";

      const payload = {
        label: label.trim(),
        key: key.trim() || undefined,
        dataType: resolvedDataType,
        relationTableId: Number(targetTableId),
        config: {
          targetTableId: Number(targetTableId),
          targetDisplayColumnKey: selectedColumnKey || undefined,
          syncTargetColumnKey: syncTargetColumnKey || undefined,
          allowMultiple: Boolean(allowMultiple),
        },
        isRequired: Boolean(isRequired),
        isSearchable: Boolean(isSearchable),
        isFilterable: Boolean(isFilterable),
        isVisible: Boolean(isVisible),
        description: `Relation to ${targetTable?.label || "table"}${
          syncTargetColumnKey ? ` (syncs to ${syncTargetColumnKey})` : ""
        }`,
        addToForms: Boolean(addToForms),
      };

      return tablesApi.createColumn(table.id, payload);
    });

    if (outcome.ok) {
      toast.success(
        `Relation “${label}” created successfully${
          addToForms ? " and added to the record form." : "."
        }`
      );
      onSaved(outcome.result?.data);
      return;
    }

    setErrors(fieldErrors(outcome.error));
  }

  return (
    <Modal
      open
      onClose={pending ? () => {} : onClose}
      title="Link Table (Create Relation)"
      description="Create a relation between tables. Records can be selected from a dropdown, and automatically synced into the target table's column."
      size="md"
      footer={
        <>
          <Button variant="ghost" onClick={onClose} disabled={pending}>
            Cancel
          </Button>

          <Button
            type="submit"
            form={FORM_ID}
            loading={pending}
            disabled={!targetTableId}
          >
            Create relation
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
            {errorMessage(error, "The relation column could not be created.")}
          </p>
        ) : null}

        {/* 1. Target Table to relate with */}
        <Select
          id="link-target-table"
          label="1. Table to link / relate with"
          required
          placeholder="Select table (e.g. Teams, Projects, Departments)…"
          value={targetTableId}
          error={errors.targetTableId}
          onChange={(e) => handleSelectTargetTable(e.target.value)}
          options={availableTables.map((t) => ({
            value: String(t.id),
            label: `${t.label} (${t.key})`,
          }))}
        />

        {/* 2. Display Column from Target Table */}
        {targetTableId && (
          <div className="space-y-1">
            <Select
              id="link-target-column"
              label="2. Column to display in dropdown & record lists"
              disabled={targetTableLoading}
              placeholder={
                targetTableLoading
                  ? "Loading columns…"
                  : "Default display column (or choose specific column…)"
              }
              value={selectedColumnKey}
              error={errors.selectedColumnKey}
              onChange={(e) => setSelectedColumnKey(e.target.value)}
              options={targetColumns.map((col) => ({
                value: col.key,
                label: `${col.label} (${col.key}) — ${
                  getDataType(col.dataType)?.label ?? col.dataType
                }`,
              }))}
            />

            <p className="text-xs text-ink-soft">
              This column's value from <strong className="text-ink">{targetTable?.label}</strong>{" "}
              (e.g. Team Name) will be shown in the selection dropdown and record table.
            </p>
          </div>
        )}

        {/* 3. Sync Target Column in Target Table */}
        {targetTableId && (
          <div className="space-y-1 rounded-control border border-line bg-surface-sunken p-3">
            <p className="text-xs font-semibold uppercase tracking-wider text-ink-muted">
              3. Automatic Bi-directional Sync
            </p>

            <Select
              id="link-sync-target-column"
              label={`When this record is saved, add it into ${targetTable?.label} column:`}
              disabled={targetTableLoading}
              placeholder="Select column to add into (e.g. members)…"
              value={syncTargetColumnKey}
              error={errors.syncTargetColumnKey}
              onChange={(e) => setSyncTargetColumnKey(e.target.value)}
              options={[
                { value: "", label: "None (Do not sync into a column)" },
                ...targetColumns.map((col) => ({
                  value: col.key,
                  label: `${col.label} (${col.key}) — ${
                    getDataType(col.dataType)?.label ?? col.dataType
                  }`,
                })),
              ]}
            />

            <p className="mt-1 text-xs text-ink-soft">
              {syncTargetColumnKey ? (
                <span>
                  ✓ When someone selects a {targetTable?.label} for this record, this record will
                  automatically be added to that {targetTable?.label}'s{" "}
                  <strong className="text-ink font-mono">{syncTargetColumnKey}</strong> list!
                </span>
              ) : (
                <span>
                  Optional: Choose which column in {targetTable?.label} (e.g.{" "}
                  <code className="text-ink">members</code>) should automatically receive this
                  record when selected.
                </span>
              )}
            </p>
          </div>
        )}

        {/* 4. Relation Name & Key on this table */}
        {targetTableId && (
          <div className="space-y-3 pt-1 border-t border-line">
            <TextInput
              id="link-col-label"
              label="4. Relation field name (in this table)"
              required
              value={label}
              error={errors.label}
              onChange={(e) => setLabel(e.target.value)}
              placeholder="e.g. Team, Department, or Assigned Project"
            />

            <TextInput
              id="link-col-key"
              label="Column key"
              value={key}
              error={errors.key}
              onChange={(e) => setKey(e.target.value)}
              hint="Unique identifier for this relation."
              placeholder="e.g. team_id"
            />

            <fieldset className="space-y-2 rounded-control border border-line p-3">
              <legend className="px-1 text-xs font-medium text-ink-soft">
                Relation & Form Settings
              </legend>

              <Checkbox
                id="link-allow-multiple"
                label={`Allow selecting multiple ${targetTable?.label || "records"}`}
                checked={allowMultiple}
                onChange={(e) => setAllowMultiple(e.target.checked)}
              />

              <Checkbox
                id="link-is-required"
                label="Required field (must select a record)"
                checked={isRequired}
                onChange={(e) => setIsRequired(e.target.checked)}
              />

              <Checkbox
                id="link-add-to-forms"
                label="Automatically add to record form so it appears when adding records"
                checked={addToForms}
                onChange={(e) => setAddToForms(e.target.checked)}
              />

              <Checkbox
                id="link-is-visible"
                label="Show in record list and tables"
                checked={isVisible}
                onChange={(e) => setIsVisible(e.target.checked)}
              />

              <Checkbox
                id="link-is-searchable"
                label="Include in record search"
                checked={isSearchable}
                onChange={(e) => setIsSearchable(e.target.checked)}
              />
            </fieldset>

            <div className="rounded-card border border-brand bg-brand-soft px-3 py-2 text-xs text-brand">
              <p className="font-semibold">Single Relation · Zero Duplication</p>
              <p className="mt-0.5">
                Creates 1 relation column. In the form, a dropdown of records from{" "}
                <strong>{targetTable?.label}</strong> will appear.
                {syncTargetColumnKey && (
                  <span>
                    {" "}
                    Saving will also update{" "}
                    <strong>
                      {targetTable?.label}.{syncTargetColumnKey}
                    </strong>{" "}
                    bi-directionally.
                  </span>
                )}
              </p>
            </div>
          </div>
        )}
      </form>
    </Modal>
  );
}
