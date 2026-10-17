import { useState } from "react";

import Button from "../../components/ui/Button.jsx";
import Modal from "../../components/ui/Modal.jsx";
import Select from "../../components/ui/Select.jsx";

import { useMetadata } from "../metadata/MetadataContext.js";

const FORM_ID = "mapping-picker-form";

export default function MappingPickerDialog({ onClose, onPick }) {
  const { lookups } = useMetadata();

  const [formId, setFormId] = useState("");
  const [tableId, setTableId] = useState("");

  const ready = Boolean(formId) && Boolean(tableId);

  function handleSubmit(event) {
    event.preventDefault();

    if (!ready) return;

    onPick({ formId, tableId });
  }

  return (
    <Modal
      open
      onClose={onClose}
      title="New mapping"
      description="Choose the form and the table it should write to."
      size="sm"
      footer={
        <>
          <Button variant="ghost" onClick={onClose}>
            Cancel
          </Button>

          <Button type="submit" form={FORM_ID} disabled={!ready}>
            Continue
          </Button>
        </>
      }
    >
      <form id={FORM_ID} onSubmit={handleSubmit} className="space-y-4">
        <Select
          id="mapping-picker-form"
          label="Form"
          required
          data-autofocus
          placeholder="Choose a form…"
          value={formId}
          onChange={(event) => setFormId(event.target.value)}
          options={(lookups.forms ?? []).map((form) => ({
            value: form.id,
            label: `${form.label} (${form.fieldCount} fields)`,
          }))}
        />

        <Select
          id="mapping-picker-table"
          label="Table"
          required
          placeholder="Choose a table…"
          value={tableId}
          onChange={(event) => setTableId(event.target.value)}
          options={(lookups.tables ?? []).map((table) => ({
            value: table.id,
            label: `${table.label} (${table.columnCount} columns)`,
          }))}
        />
      </form>
    </Modal>
  );
}
