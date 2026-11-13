import { useState } from "react";
import Button from "../../components/ui/Button.jsx";
import Modal from "../../components/ui/Modal.jsx";
import NumberInput from "../../components/ui/NumberInput.jsx";
import Select from "../../components/ui/Select.jsx";
import TextInput from "../../components/ui/TextInput.jsx";
import Toggle from "../../components/ui/Toggle.jsx";
import { useToast } from "../../components/ui/ToastContext.js";

const OPERATORS = [
  { value: "eq", label: "Equals (=)" },
  { value: "neq", label: "Not Equals (!=)" },
  { value: "between", label: "Between (Range [min, max])" },
  { value: "gte", label: "Greater than or equal (>=)" },
  { value: "lte", label: "Less than or equal (<=)" },
  { value: "in", label: "In list (comma separated)" },
];

const APPROVER_TYPES = [
  { value: "user_relation", label: "User Supervisor / Reference (e.g. reports_to / coordinator)" },
  { value: "entity_incharge", label: "Entity In-Charge (e.g. Project or Center In-Charge)" },
  { value: "council_or_team", label: "Council or Committee (e.g. Academic Council, Programme Committee)" },
  { value: "direct_user", label: "Specific User Account" },
];

export default function RuleDialog({ open, rule, onClose, onSave, saving }) {
  const toast = useToast();
  const [draft, setDraft] = useState(() => JSON.parse(JSON.stringify(rule)));

  function handleAddCondition() {
    setDraft((prev) => ({
      ...prev,
      conditions: [
        ...(prev.conditions || []),
        { source: "request", field: "days", operator: "eq", value: "" },
      ],
    }));
  }

  function handleRemoveCondition(index) {
    setDraft((prev) => {
      const updated = [...(prev.conditions || [])];
      updated.splice(index, 1);
      return { ...prev, conditions: updated };
    });
  }

  function updateCondition(index, patch) {
    setDraft((prev) => {
      const updated = [...(prev.conditions || [])];
      updated[index] = { ...updated[index], ...patch };
      return { ...prev, conditions: updated };
    });
  }

  function handleSubmit(e) {
    e.preventDefault();

    if (!draft.name?.trim()) {
      toast.danger("Please enter a valid rule name.");
      return;
    }

    // Process conditions value format (e.g. range string to array if between)
    const processedConditions = (draft.conditions || []).map((cond) => {
      let val = cond.value;
      if (cond.operator === "between" && typeof val === "string") {
        const parts = val.split(",").map((v) => Number(v.trim()));
        if (parts.length === 2 && !isNaN(parts[0]) && !isNaN(parts[1])) {
          val = parts;
        }
      }
      return { ...cond, value: val };
    });

    const ruleToSave = {
      ...draft,
      priority: Number(draft.priority) || 100,
      conditions: processedConditions,
    };

    onSave(ruleToSave);
  }

  if (!open || !draft) return null;

  const isEdit = Boolean(rule?.id && !rule.id.startsWith("rule_temp_"));

  return (
    <Modal
      open={open}
      onClose={saving ? () => {} : onClose}
      title={isEdit ? `Edit Leave Rule: ${draft.name}` : "Create New Leave Rule"}
      size="lg"
    >
      <form onSubmit={handleSubmit} className="space-y-6">
        <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
          <div className="md:col-span-2">
            <TextInput
              id="rule-name"
              label="Rule Name"
              required
              data-autofocus
              placeholder="e.g. Programme Staff: 1 to 6 Days"
              value={draft.name}
              onChange={(e) => setDraft({ ...draft, name: e.target.value })}
            />
          </div>

          <div>
            <NumberInput
              id="rule-priority"
              label="Priority Order"
              required
              hint="Lower number = evaluated first"
              value={draft.priority}
              onChange={(e) => setDraft({ ...draft, priority: Number(e.target.value) })}
            />
          </div>
        </div>

        {/* Conditions Section */}
        <div className="border border-slate-200 rounded-lg p-4 bg-slate-50 space-y-3">
          <div className="flex items-center justify-between border-b border-slate-200 pb-2">
            <div>
              <h4 className="text-sm font-semibold text-slate-800">Matching Criteria (IF)</h4>
              <p className="text-xs text-slate-500">Define which leave requests match this rule</p>
            </div>
            <div className="flex items-center gap-2">
              <Select
                id="rule-combinator"
                className="w-32 text-xs"
                value={draft.combinator || "AND"}
                options={[
                  { value: "AND", label: "Match ALL (AND)" },
                  { value: "OR", label: "Match ANY (OR)" },
                ]}
                onChange={(e) => setDraft({ ...draft, combinator: e.target.value })}
              />
              <Button size="sm" variant="outline" type="button" onClick={handleAddCondition}>
                + Add Condition
              </Button>
            </div>
          </div>

          {draft.conditions?.length === 0 ? (
            <p className="text-xs text-slate-500 italic py-2">
              No conditions set. This rule will act as a standard fallback for all requests.
            </p>
          ) : (
            draft.conditions?.map((cond, idx) => (
              <div key={idx} className="flex flex-wrap items-center gap-2 bg-white p-2.5 rounded border border-slate-200 shadow-2xs">
                <Select
                  id={`cond-source-${idx}`}
                  className="w-32 text-xs"
                  value={cond.source || "request"}
                  options={[
                    { value: "request", label: "Request Field" },
                    { value: "user", label: "User Attribute" },
                  ]}
                  onChange={(e) => updateCondition(idx, { source: e.target.value })}
                />

                <TextInput
                  id={`cond-field-${idx}`}
                  placeholder={cond.source === "user" ? "e.g. staff_category" : "e.g. days"}
                  className="flex-1 min-w-[130px] text-xs"
                  value={cond.field || ""}
                  onChange={(e) => updateCondition(idx, { field: e.target.value })}
                />

                <Select
                  id={`cond-op-${idx}`}
                  className="w-36 text-xs"
                  value={cond.operator || "eq"}
                  options={OPERATORS}
                  onChange={(e) => updateCondition(idx, { operator: e.target.value })}
                />

                <TextInput
                  id={`cond-val-${idx}`}
                  placeholder="e.g. 1,6 or Programme Staff"
                  className="flex-1 min-w-[140px] text-xs"
                  value={Array.isArray(cond.value) ? cond.value.join(",") : cond.value ?? ""}
                  onChange={(e) => updateCondition(idx, { value: e.target.value })}
                />

                <Button
                  size="sm"
                  variant="ghost"
                  type="button"
                  className="text-rose-600 hover:text-rose-700"
                  onClick={() => handleRemoveCondition(idx)}
                  title="Remove Condition"
                >
                  ✕
                </Button>
              </div>
            ))
          )}
        </div>

        {/* Actions Section */}
        <div className="border border-slate-200 rounded-lg p-4 bg-slate-50 space-y-4">
          <div>
            <h4 className="text-sm font-semibold text-slate-800">Approval Routing & Actions (THEN)</h4>
            <p className="text-xs text-slate-500">Configure where the application routes when matched</p>
          </div>

          <div className="space-y-4 pt-1">
            <Toggle
              label="Requires Manager / Council Approval"
              hint="Disable for leaves that do not require prior approval (e.g. 2-Hour Short Leave)"
              checked={draft.actions?.requiresApproval ?? true}
              onChange={(val) =>
                setDraft({
                  ...draft,
                  actions: { ...draft.actions, requiresApproval: val },
                })
              }
            />

            {draft.actions?.requiresApproval && (
              <div className="grid grid-cols-1 md:grid-cols-2 gap-4 pt-2 border-t border-slate-200">
                <Select
                  id="approver-type"
                  label="Approver Hierarchy Type"
                  value={draft.actions?.approverType || "user_relation"}
                  options={APPROVER_TYPES}
                  onChange={(e) =>
                    setDraft({
                      ...draft,
                      actions: { ...draft.actions, approverType: e.target.value },
                    })
                  }
                />

                {draft.actions?.approverType === "user_relation" && (
                  <TextInput
                    id="approver-target"
                    label="User Supervisor Column"
                    hint="Column on Users table (e.g. reports_to or coordinator)"
                    value={draft.actions?.approverTarget || "reports_to"}
                    onChange={(e) =>
                      setDraft({
                        ...draft,
                        actions: { ...draft.actions, approverTarget: e.target.value },
                      })
                    }
                  />
                )}

                {draft.actions?.approverType === "entity_incharge" && (
                  <TextInput
                    id="incharge-field"
                    label="In-Charge Column Key"
                    hint="Profile column on Center/Project (e.g. center_in_charge, project_incharge)"
                    value={draft.actions?.inchargeField || "center_in_charge"}
                    onChange={(e) =>
                      setDraft({
                        ...draft,
                        actions: { ...draft.actions, inchargeField: e.target.value },
                      })
                    }
                  />
                )}

                {draft.actions?.approverType === "council_or_team" && (
                  <TextInput
                    id="council-name"
                    label="Council or Committee Entity Name"
                    hint="e.g. Academic Council, Programme Committee, Executive Council"
                    value={draft.actions?.entityName || ""}
                    placeholder="Academic Council"
                    onChange={(e) =>
                      setDraft({
                        ...draft,
                        actions: { ...draft.actions, entityName: e.target.value },
                      })
                    }
                  />
                )}

                <NumberInput
                  id="notice-days"
                  label="Required Advance Notice (Days)"
                  hint="e.g. 2 days for normal leave, 7 days for long leave"
                  value={draft.actions?.noticeDays ?? 2}
                  onChange={(e) =>
                    setDraft({
                      ...draft,
                      actions: { ...draft.actions, noticeDays: Number(e.target.value) },
                    })
                  }
                />

                <NumberInput
                  id="sla-hours"
                  label="Approver Decision SLA (Hours)"
                  hint="e.g. 48 hours turnaround"
                  value={draft.actions?.slaHours ?? 48}
                  onChange={(e) =>
                    setDraft({
                      ...draft,
                      actions: { ...draft.actions, slaHours: Number(e.target.value) },
                    })
                  }
                />
              </div>
            )}
          </div>
        </div>

        <div className="flex justify-end gap-3 pt-2">
          <Button type="button" variant="outline" onClick={onClose} disabled={saving}>
            Cancel
          </Button>
          <Button type="submit" variant="primary" loading={saving}>
            Save Leave Rule
          </Button>
        </div>
      </form>
    </Modal>
  );
}

