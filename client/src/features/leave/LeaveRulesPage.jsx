import { useState } from "react";
import Badge from "../../components/ui/Badge.jsx";
import Button from "../../components/ui/Button.jsx";
import ConfirmDialog from "../../components/ui/ConfirmDialog.jsx";
import { LoadingState } from "../../components/ui/LoadingState.jsx";
import Modal from "../../components/ui/Modal.jsx";
import NumberInput from "../../components/ui/NumberInput.jsx";
import PageHeader from "../../components/ui/PageHeader.jsx";
import Select from "../../components/ui/Select.jsx";
import TextInput from "../../components/ui/TextInput.jsx";
import Toggle from "../../components/ui/Toggle.jsx";
import { useToast } from "../../components/ui/ToastContext.js";
import useAsyncData from "../../hooks/useAsyncData.js";
import useMutation from "../../hooks/useMutation.js";
import { errorMessage } from "../../services/errors.js";
import { leave as leaveApi } from "../../services/resources.js";

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
  { value: "council_or_team", label: "Council or Team (e.g. Academic Council, Programme Committee)" },
  { value: "direct_user", label: "Specific User Account" },
];

export default function LeaveRulesPage() {
  const toast = useToast();
  const [ruleDialog, setRuleDialog] = useState(null); // null | rule object to edit/create
  const [deleteTarget, setDeleteTarget] = useState(null);

  const {
    data: rulesData,
    loading: rulesLoading,
    reload: reloadRules,
  } = useAsyncData("leave-rules-list", () => leaveApi.getRules());

  const { run: saveRuleMutation, pending: saving } = useMutation();

  const rules = rulesData?.data ?? [];

  function openCreateRule() {
    setRuleDialog({
      id: `rule_${Date.now()}`,
      name: "",
      priority: (rules.length + 1) * 10,
      status: "active",
      combinator: "AND",
      conditions: [
        {
          source: "request",
          field: "days",
          operator: "between",
          value: "1,6",
        },
      ],
      actions: {
        requiresApproval: true,
        approverType: "user_relation",
        approverTarget: "reports_to",
        inchargeField: "project_incharge",
        entityName: "",
        notifyTargets: [],
        noticeDays: 2,
        slaHours: 48,
      },
    });
  }

  function openEditRule(rule) {
    setRuleDialog(JSON.parse(JSON.stringify(rule)));
  }

  function handleAddCondition() {
    if (!ruleDialog) return;
    setRuleDialog({
      ...ruleDialog,
      conditions: [
        ...ruleDialog.conditions,
        { source: "request", field: "days", operator: "eq", value: "" },
      ],
    });
  }

  function handleRemoveCondition(index) {
    if (!ruleDialog) return;
    const updated = [...ruleDialog.conditions];
    updated.splice(index, 1);
    setRuleDialog({ ...ruleDialog, conditions: updated });
  }

  function updateCondition(index, patch) {
    if (!ruleDialog) return;
    const updated = [...ruleDialog.conditions];
    updated[index] = { ...updated[index], ...patch };
    setRuleDialog({ ...ruleDialog, conditions: updated });
  }

  async function handleSaveRuleSubmit(e) {
    e.preventDefault();
    if (!ruleDialog) return;

    // Process conditions value format (e.g. range string to array if between)
    const processedConditions = ruleDialog.conditions.map((cond) => {
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
      ...ruleDialog,
      conditions: processedConditions,
    };

    const existingIndex = rules.findIndex((r) => r.id === ruleToSave.id);
    let updatedRules;
    if (existingIndex >= 0) {
      updatedRules = [...rules];
      updatedRules[existingIndex] = ruleToSave;
    } else {
      updatedRules = [...rules, ruleToSave];
    }

    updatedRules.sort((a, b) => (Number(a.priority) || 100) - (Number(b.priority) || 100));

    const outcome = await saveRuleMutation(() => leaveApi.saveRules(updatedRules));
    if (!outcome.ok) {
      toast.danger(errorMessage(outcome.error, "Failed to save leave rules."));
      return;
    }

    toast.success("Leave rule saved successfully.");
    setRuleDialog(null);
    reloadRules();
  }

  async function handleDeleteRule() {
    if (!deleteTarget) return;

    const updatedRules = rules.filter((r) => r.id !== deleteTarget.id);
    const outcome = await saveRuleMutation(() => leaveApi.saveRules(updatedRules));

    if (!outcome.ok) {
      toast.danger(errorMessage(outcome.error, "Failed to delete leave rule."));
      return;
    }

    toast.success("Rule deleted successfully.");
    setDeleteTarget(null);
    reloadRules();
  }

  async function handleToggleStatus(rule) {
    const updated = rules.map((r) =>
      r.id === rule.id ? { ...r, status: r.status === "active" ? "inactive" : "active" } : r
    );

    const outcome = await saveRuleMutation(() => leaveApi.saveRules(updated));
    if (!outcome.ok) {
      toast.danger(errorMessage(outcome.error, "Failed to toggle status."));
      return;
    }

    toast.success(`Rule "${rule.name}" is now ${rule.status === "active" ? "inactive" : "active"}.`);
    reloadRules();
  }

  if (rulesLoading) {
    return <LoadingState label="Loading leave rules configuration..." />;
  }

  return (
    <div className="p-6 space-y-6">
      <PageHeader
        title="Leave Rules & Approval Routing"
        description="Configure dynamic condition-based routing rules, approval hierarchies, and notifications without hardcoding."
        action={
          <Button variant="primary" onClick={openCreateRule}>
            + Add Leave Rule
          </Button>
        }
      />

      <div className="space-y-4">
        {rules.map((rule) => (
          <div
            key={rule.id}
            className={`rounded-lg border p-5 transition-all bg-white shadow-sm ${
              rule.status === "active" ? "border-slate-200" : "border-slate-200 opacity-60 bg-slate-50"
            }`}
          >
            <div className="flex flex-wrap items-center justify-between gap-3 border-b border-slate-100 pb-3">
              <div className="flex items-center gap-3">
                <span className="flex h-7 w-7 items-center justify-center rounded-full bg-indigo-50 text-xs font-bold text-indigo-700">
                  {rule.priority}
                </span>
                <div>
                  <h3 className="font-semibold text-slate-900">{rule.name}</h3>
                  <p className="text-xs text-slate-500">ID: {rule.id}</p>
                </div>
              </div>

              <div className="flex items-center gap-3">
                <Badge tone={rule.status === "active" ? "success" : "neutral"}>
                  {rule.status === "active" ? "Active" : "Inactive"}
                </Badge>
                <Button size="sm" variant="ghost" onClick={() => handleToggleStatus(rule)}>
                  {rule.status === "active" ? "Disable" : "Enable"}
                </Button>
                <Button size="sm" variant="outline" onClick={() => openEditRule(rule)}>
                  Edit
                </Button>
                <Button
                  size="sm"
                  variant="ghost"
                  className="text-rose-600 hover:text-rose-700 hover:bg-rose-50"
                  onClick={() => setDeleteTarget(rule)}
                >
                  Delete
                </Button>
              </div>
            </div>

            {/* Conditions and Actions Summary */}
            <div className="grid grid-cols-1 md:grid-cols-2 gap-4 pt-4 text-xs">
              <div className="rounded border border-slate-100 bg-slate-50 p-3">
                <h4 className="font-semibold uppercase text-slate-700 tracking-wider mb-2">
                  Matching Criteria ({rule.combinator || "AND"})
                </h4>
                {rule.conditions && rule.conditions.length > 0 ? (
                  <ul className="space-y-1 text-slate-700">
                    {rule.conditions.map((c, i) => (
                      <li key={i} className="flex items-center gap-2">
                        <span className="font-mono bg-white px-1.5 py-0.5 rounded border border-slate-200 text-indigo-700">
                          {c.source === "user" ? `user.${c.field}` : c.field}
                        </span>
                        <span className="text-slate-500">{c.operator}</span>
                        <span className="font-medium text-slate-900">
                          {Array.isArray(c.value) ? c.value.join(" to ") : String(c.value)}
                        </span>
                      </li>
                    ))}
                  </ul>
                ) : (
                  <p className="text-slate-500 italic">No conditions (Standard Fallback Rule)</p>
                )}
              </div>

              <div className="rounded border border-slate-100 bg-slate-50 p-3">
                <h4 className="font-semibold uppercase text-slate-700 tracking-wider mb-2">
                  Routing Actions & Approver
                </h4>
                <div className="space-y-1.5 text-slate-700">
                  <p>
                    <span className="text-slate-500">Requires Approval: </span>
                    <span className="font-medium">
                      {rule.actions?.requiresApproval ? "Yes" : "No (Auto-approved / Inform only)"}
                    </span>
                  </p>
                  {rule.actions?.requiresApproval && (
                    <>
                      <p>
                        <span className="text-slate-500">Approver Resolution: </span>
                        <span className="font-semibold text-slate-900">
                          {rule.actions?.approverType === "user_relation" &&
                            `Applicant Supervisor (${rule.actions?.approverTarget || "reports_to"})`}
                          {rule.actions?.approverType === "entity_incharge" &&
                            `In-Charge of Entity (${rule.actions?.inchargeField || "in_charge"})`}
                          {rule.actions?.approverType === "council_or_team" &&
                            `Council / Committee: ${rule.actions?.entityName}`}
                          {rule.actions?.approverType === "direct_user" && "Specific User Account"}
                        </span>
                      </p>
                      <p>
                        <span className="text-slate-500">Notice Required: </span>
                        <span className="font-medium">{rule.actions?.noticeDays ?? 2} Days advance</span>
                        <span className="text-slate-400 mx-2">|</span>
                        <span className="text-slate-500">Approver SLA: </span>
                        <span className="font-medium">{rule.actions?.slaHours ?? 48} Hours</span>
                      </p>
                    </>
                  )}
                </div>
              </div>
            </div>
          </div>
        ))}
      </div>

      {/* Rule Edit / Create Modal */}
      {ruleDialog && (
        <Modal
          open={Boolean(ruleDialog)}
          onClose={() => setRuleDialog(null)}
          title={rules.some((r) => r.id === ruleDialog.id) ? "Edit Leave Rule" : "Create Leave Rule"}
          size="lg"
        >
          <form onSubmit={handleSaveRuleSubmit} className="space-y-6">
            <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
              <TextInput
                id="rule-name"
                label="Rule Name"
                required
                value={ruleDialog.name}
                onChange={(e) => setRuleDialog({ ...ruleDialog, name: e.target.value })}
              />

              <NumberInput
                id="rule-priority"
                label="Priority Order (Lower = higher priority)"
                required
                value={ruleDialog.priority}
                onChange={(e) =>
                  setRuleDialog({ ...ruleDialog, priority: Number(e.target.value) })
                }
              />
            </div>

            {/* Conditions Section */}
            <div className="border border-slate-200 rounded-lg p-4 bg-slate-50 space-y-3">
              <div className="flex items-center justify-between border-b border-slate-200 pb-2">
                <h4 className="text-sm font-semibold text-slate-800">Conditions (IF)</h4>
                <div className="flex items-center gap-2">
                  <Select
                    id="rule-combinator"
                    className="w-28 text-xs"
                    value={ruleDialog.combinator}
                    options={[
                      { value: "AND", label: "Match ALL" },
                      { value: "OR", label: "Match ANY" },
                    ]}
                    onChange={(e) => setRuleDialog({ ...ruleDialog, combinator: e.target.value })}
                  />
                  <Button size="sm" variant="outline" type="button" onClick={handleAddCondition}>
                    + Add Condition
                  </Button>
                </div>
              </div>

              {ruleDialog.conditions.map((cond, idx) => (
                <div key={idx} className="flex flex-wrap items-center gap-2 bg-white p-2.5 rounded border border-slate-200">
                  <Select
                    id={`cond-source-${idx}`}
                    className="w-28 text-xs"
                    value={cond.source}
                    options={[
                      { value: "request", label: "Request Field" },
                      { value: "user", label: "User Attribute" },
                    ]}
                    onChange={(e) => updateCondition(idx, { source: e.target.value })}
                  />

                  <TextInput
                    id={`cond-field-${idx}`}
                    placeholder="Field key (e.g. days, staff_category)"
                    className="flex-1 min-w-[130px] text-xs"
                    value={cond.field}
                    onChange={(e) => updateCondition(idx, { field: e.target.value })}
                  />

                  <Select
                    id={`cond-op-${idx}`}
                    className="w-40 text-xs"
                    value={cond.operator}
                    options={OPERATORS}
                    onChange={(e) => updateCondition(idx, { operator: e.target.value })}
                  />

                  <TextInput
                    id={`cond-val-${idx}`}
                    placeholder="Value (e.g. 1,6 or Programme Staff)"
                    className="flex-1 min-w-[140px] text-xs"
                    value={Array.isArray(cond.value) ? cond.value.join(",") : cond.value}
                    onChange={(e) => updateCondition(idx, { value: e.target.value })}
                  />

                  <Button
                    size="sm"
                    variant="ghost"
                    type="button"
                    className="text-rose-600"
                    onClick={() => handleRemoveCondition(idx)}
                  >
                    ✕
                  </Button>
                </div>
              ))}
            </div>

            {/* Actions Section */}
            <div className="border border-slate-200 rounded-lg p-4 bg-slate-50 space-y-4">
              <h4 className="text-sm font-semibold text-slate-800 border-b border-slate-200 pb-2">
                Actions & Approver Routing (THEN)
              </h4>

              <div className="space-y-3">
                <Toggle
                  label="Requires Manager / Council Approval"
                  hint="Disable for self-recorded leaves like Short Leave"
                  checked={ruleDialog.actions.requiresApproval}
                  onChange={(val) =>
                    setRuleDialog({
                      ...ruleDialog,
                      actions: { ...ruleDialog.actions, requiresApproval: val },
                    })
                  }
                />

                {ruleDialog.actions.requiresApproval && (
                  <div className="grid grid-cols-1 md:grid-cols-2 gap-4 pt-2">
                    <Select
                      id="approver-type"
                      label="Approver Hierarchy Type"
                      value={ruleDialog.actions.approverType}
                      options={APPROVER_TYPES}
                      onChange={(e) =>
                        setRuleDialog({
                          ...ruleDialog,
                          actions: { ...ruleDialog.actions, approverType: e.target.value },
                        })
                      }
                    />

                    {ruleDialog.actions.approverType === "user_relation" && (
                      <TextInput
                        id="approver-target"
                        label="User Reference Column"
                        hint="Column on Users table (e.g. reports_to or coordinator)"
                        value={ruleDialog.actions.approverTarget || ""}
                        onChange={(e) =>
                          setRuleDialog({
                            ...ruleDialog,
                            actions: { ...ruleDialog.actions, approverTarget: e.target.value },
                          })
                        }
                      />
                    )}

                    {ruleDialog.actions.approverType === "entity_incharge" && (
                      <TextInput
                        id="incharge-field"
                        label="In-Charge Column Key"
                        hint="Profile column (e.g. project_incharge, center_in_charge)"
                        value={ruleDialog.actions.inchargeField || ""}
                        onChange={(e) =>
                          setRuleDialog({
                            ...ruleDialog,
                            actions: { ...ruleDialog.actions, inchargeField: e.target.value },
                          })
                        }
                      />
                    )}

                    {ruleDialog.actions.approverType === "council_or_team" && (
                      <TextInput
                        id="council-name"
                        label="Council or Committee Entity Name"
                        hint="e.g. Academic Council, Programme Committee, Executive Council"
                        value={ruleDialog.actions.entityName || ""}
                        onChange={(e) =>
                          setRuleDialog({
                            ...ruleDialog,
                            actions: { ...ruleDialog.actions, entityName: e.target.value },
                          })
                        }
                      />
                    )}

                    <NumberInput
                      id="notice-days"
                      label="Advance Notice Days Required"
                      value={ruleDialog.actions.noticeDays ?? 2}
                      onChange={(e) =>
                        setRuleDialog({
                          ...ruleDialog,
                          actions: { ...ruleDialog.actions, noticeDays: Number(e.target.value) },
                        })
                      }
                    />

                    <NumberInput
                      id="sla-hours"
                      label="Approver SLA (Hours)"
                      value={ruleDialog.actions.slaHours ?? 48}
                      onChange={(e) =>
                        setRuleDialog({
                          ...ruleDialog,
                          actions: { ...ruleDialog.actions, slaHours: Number(e.target.value) },
                        })
                      }
                    />
                  </div>
                )}
              </div>
            </div>

            <div className="flex justify-end gap-3 pt-2">
              <Button type="button" variant="outline" onClick={() => setRuleDialog(null)} disabled={saving}>
                Cancel
              </Button>
              <Button type="submit" variant="primary" loading={saving}>
                Save Rule
              </Button>
            </div>
          </form>
        </Modal>
      )}

      {/* Delete Rule Confirmation */}
      {deleteTarget && (
        <ConfirmDialog
          open={Boolean(deleteTarget)}
          title="Delete Leave Rule"
          message={`Are you sure you want to delete the rule "${deleteTarget.name}"?`}
          confirmLabel="Delete Rule"
          tone="danger"
          loading={saving}
          onConfirm={handleDeleteRule}
          onCancel={() => setDeleteTarget(null)}
        />
      )}
    </div>
  );
}

