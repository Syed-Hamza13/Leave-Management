import { useState, useMemo } from "react";
import Badge from "../../components/ui/Badge.jsx";
import Button from "../../components/ui/Button.jsx";
import ConfirmDialog from "../../components/ui/ConfirmDialog.jsx";
import EmptyState from "../../components/ui/EmptyState.jsx";
import { LoadingState } from "../../components/ui/LoadingState.jsx";
import SearchInput from "../../components/ui/SearchInput.jsx";
import Select from "../../components/ui/Select.jsx";
import { useToast } from "../../components/ui/ToastContext.js";
import useAsyncData from "../../hooks/useAsyncData.js";
import useMutation from "../../hooks/useMutation.js";
import { errorMessage } from "../../services/errors.js";
import { leave as leaveApi } from "../../services/resources.js";
import RuleDialog from "./RuleDialog.jsx";

export default function LeaveRulesPage() {
  const toast = useToast();
  const [search, setSearch] = useState("");
  const [statusFilter, setStatusFilter] = useState("all");
  const [ruleDialog, setRuleDialog] = useState(null); // null | rule object to edit/create
  const [deleteTarget, setDeleteTarget] = useState(null);

  const {
    data: rulesData,
    loading: rulesLoading,
    reload: reloadRules,
  } = useAsyncData("leave-rules-list", () => leaveApi.getRules());

  const { run: saveRuleMutation, pending: saving } = useMutation();

  const rules = useMemo(() => rulesData?.data ?? [], [rulesData]);

  const filteredRules = useMemo(() => {
    return rules.filter((r) => {
      const matchesStatus =
        statusFilter === "all" ||
        (statusFilter === "active" && r.status === "active") ||
        (statusFilter === "inactive" && r.status === "inactive");

      const query = search.toLowerCase().trim();
      const matchesSearch =
        !query ||
        r.name.toLowerCase().includes(query) ||
        (r.id && r.id.toLowerCase().includes(query)) ||
        (r.actions?.entityName && r.actions.entityName.toLowerCase().includes(query)) ||
        (r.actions?.approverTarget && r.actions.approverTarget.toLowerCase().includes(query));

      return matchesStatus && matchesSearch;
    });
  }, [rules, search, statusFilter]);

  function openCreateRule() {
    const nextPriority = (rules.length + 1) * 10;
    setRuleDialog({
      id: `rule_${Date.now()}`,
      name: "",
      priority: nextPriority,
      status: "active",
      combinator: "AND",
      conditions: [
        {
          source: "user",
          field: "staff_category",
          operator: "eq",
          value: "Programme Staff",
        },
        {
          source: "request",
          field: "days",
          operator: "between",
          value: [1, 6],
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

  function openDuplicateRule(rule) {
    const nextPriority = (rules.length + 1) * 10;
    const duplicated = JSON.parse(JSON.stringify(rule));
    duplicated.id = `rule_${Date.now()}`;
    duplicated.name = `${rule.name} (Copy)`;
    duplicated.priority = nextPriority;
    setRuleDialog(duplicated);
  }

  async function handleSaveRule(ruleToSave) {
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

  async function handleMovePriority(rule, direction) {
    const sorted = [...rules].sort((a, b) => (Number(a.priority) || 100) - (Number(b.priority) || 100));
    const currentIndex = sorted.findIndex((r) => r.id === rule.id);
    if (currentIndex < 0) return;

    const targetIndex = direction === "up" ? currentIndex - 1 : currentIndex + 1;
    if (targetIndex < 0 || targetIndex >= sorted.length) return;

    // Swap priorities
    const temp = sorted[currentIndex].priority;
    sorted[currentIndex].priority = sorted[targetIndex].priority;
    sorted[targetIndex].priority = temp;

    sorted.sort((a, b) => (Number(a.priority) || 100) - (Number(b.priority) || 100));

    const outcome = await saveRuleMutation(() => leaveApi.saveRules(sorted));
    if (!outcome.ok) {
      toast.danger(errorMessage(outcome.error, "Failed to update priority order."));
      return;
    }

    toast.success("Rule priority updated.");
    reloadRules();
  }

  if (rulesLoading) {
    return <LoadingState label="Loading leave rules configuration..." />;
  }

  return (
    <div className="p-6 space-y-6">
      {/* Prominent Action Bar with Search, Filters and "+ Add Leave Rule" Button */}
      <div className="flex flex-wrap items-center justify-between gap-4 bg-white p-4 rounded-lg border border-slate-200 shadow-sm">
        <div className="flex flex-wrap items-center gap-3 flex-1 min-w-[280px]">
          <SearchInput
            placeholder="Search rules by name, condition, or approver..."
            value={search}
            onChange={setSearch}
            className="w-72"
          />

          <Select
            id="status-filter"
            value={statusFilter}
            onChange={(e) => setStatusFilter(e.target.value)}
            className="w-36 text-xs"
            options={[
              { value: "all", label: "All Rules" },
              { value: "active", label: "Active Only" },
              { value: "inactive", label: "Inactive Only" },
            ]}
          />

          <span className="text-xs text-slate-500 font-medium">
            Showing {filteredRules.length} of {rules.length} rules
          </span>
        </div>

        <Button variant="primary" onClick={openCreateRule} className="font-semibold shadow-sm">
          <span className="mr-1 font-bold text-base leading-none">+</span> Add New Leave Rule
        </Button>
      </div>

      {/* Rules List */}
      {filteredRules.length === 0 ? (
        <EmptyState
          title={search ? "No matching rules found" : "No Leave Rules Configured"}
          description={
            search
              ? "Try adjusting your search criteria or clear the filter."
              : "Create dynamic routing rules to control approver hierarchies and notifications based on duration and staff category."
          }
          action={
            <Button variant="primary" onClick={openCreateRule}>
              + Add Your First Leave Rule
            </Button>
          }
        />
      ) : (
        <div className="space-y-4">
          {filteredRules.map((rule, index) => (
            <div
              key={rule.id}
              className={`rounded-lg border p-5 transition-all bg-white shadow-sm hover:border-indigo-300 ${
                rule.status === "active" ? "border-slate-200" : "border-slate-200 opacity-60 bg-slate-50"
              }`}
            >
              <div className="flex flex-wrap items-center justify-between gap-3 border-b border-slate-100 pb-3">
                <div className="flex items-center gap-3">
                  <div className="flex flex-col items-center justify-center">
                    <button
                      type="button"
                      disabled={index === 0}
                      onClick={() => handleMovePriority(rule, "up")}
                      className="text-slate-400 hover:text-indigo-600 disabled:opacity-20 text-xs px-1"
                      title="Increase Priority (Evaluate Earlier)"
                    >
                      ▲
                    </button>
                    <span className="flex h-6 w-8 items-center justify-center rounded bg-indigo-50 text-xs font-bold text-indigo-700">
                      #{rule.priority}
                    </span>
                    <button
                      type="button"
                      disabled={index === filteredRules.length - 1}
                      onClick={() => handleMovePriority(rule, "down")}
                      className="text-slate-400 hover:text-indigo-600 disabled:opacity-20 text-xs px-1"
                      title="Decrease Priority (Evaluate Later)"
                    >
                      ▼
                    </button>
                  </div>

                  <div>
                    <h3 className="font-semibold text-slate-900 text-sm">{rule.name}</h3>
                    <p className="text-[11px] text-slate-400 font-mono">ID: {rule.id}</p>
                  </div>
                </div>

                <div className="flex items-center gap-2">
                  <Badge tone={rule.status === "active" ? "success" : "neutral"}>
                    {rule.status === "active" ? "Active" : "Inactive"}
                  </Badge>

                  <Button size="sm" variant="ghost" onClick={() => handleToggleStatus(rule)}>
                    {rule.status === "active" ? "Disable" : "Enable"}
                  </Button>

                  <Button size="sm" variant="ghost" onClick={() => openDuplicateRule(rule)} title="Duplicate as new rule">
                    Duplicate
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

              {/* Conditions and Actions Breakdown */}
              <div className="grid grid-cols-1 md:grid-cols-2 gap-4 pt-4 text-xs">
                <div className="rounded border border-slate-100 bg-slate-50 p-3">
                  <h4 className="font-semibold uppercase text-slate-600 tracking-wider mb-2 flex items-center justify-between">
                    <span>Conditions (IF)</span>
                    <span className="font-mono text-[10px] bg-slate-200 px-1.5 py-0.5 rounded">
                      {rule.combinator || "AND"}
                    </span>
                  </h4>
                  {rule.conditions && rule.conditions.length > 0 ? (
                    <ul className="space-y-1.5 text-slate-700">
                      {rule.conditions.map((c, i) => (
                        <li key={i} className="flex flex-wrap items-center gap-1.5">
                          <span className="font-mono bg-white px-1.5 py-0.5 rounded border border-slate-200 text-indigo-700 font-medium">
                            {c.source === "user" ? `user.${c.field}` : c.field}
                          </span>
                          <span className="text-slate-400 font-semibold">{c.operator}</span>
                          <span className="font-medium text-slate-900 bg-white px-1.5 py-0.5 rounded border border-slate-200">
                            {Array.isArray(c.value) ? c.value.join(" to ") : String(c.value)}
                          </span>
                        </li>
                      ))}
                    </ul>
                  ) : (
                    <p className="text-slate-500 italic">No specific condition (Standard Default Rule)</p>
                  )}
                </div>

                <div className="rounded border border-slate-100 bg-slate-50 p-3">
                  <h4 className="font-semibold uppercase text-slate-600 tracking-wider mb-2">
                    Routing & Approver (THEN)
                  </h4>
                  <div className="space-y-1.5 text-slate-700">
                    <p>
                      <span className="text-slate-500">Requires Approval: </span>
                      <span className="font-semibold text-slate-900">
                        {rule.actions?.requiresApproval ? "Yes" : "No (Auto-approved / Inform only)"}
                      </span>
                    </p>
                    {rule.actions?.requiresApproval && (
                      <>
                        <p>
                          <span className="text-slate-500">Primary Approver: </span>
                          <span className="font-semibold text-indigo-700">
                            {rule.actions?.approverType === "user_relation" &&
                              `Direct Supervisor (${rule.actions?.approverTarget || "reports_to"})`}
                            {rule.actions?.approverType === "entity_incharge" &&
                              `In-Charge of Entity (${rule.actions?.inchargeField || "center_in_charge"})`}
                            {rule.actions?.approverType === "council_or_team" &&
                              `Council / Committee (${rule.actions?.entityName || "Assigned"})`}
                            {rule.actions?.approverType === "direct_user" && "Specific User Account"}
                          </span>
                        </p>
                        <p>
                          <span className="text-slate-500">Notice Required: </span>
                          <span className="font-medium">{rule.actions?.noticeDays ?? 2} Days advance</span>
                          <span className="text-slate-300 mx-2">|</span>
                          <span className="text-slate-500">Decision SLA: </span>
                          <span className="font-medium">{rule.actions?.slaHours ?? 48} Hours</span>
                        </p>
                        {rule.actions?.notifyTargets && rule.actions.notifyTargets.length > 0 && (
                          <p>
                            <span className="text-slate-500">Information To (CC): </span>
                            <span className="font-medium text-slate-800">
                              {rule.actions.notifyTargets
                                .map((t) => t.entityName || t.columnKey || t.field || t.type)
                                .join(", ")}
                            </span>
                          </p>
                        )}
                      </>
                    )}
                  </div>
                </div>
              </div>
            </div>
          ))}
        </div>
      )}

      {/* Isolated Rule Dialog */}
      {ruleDialog && (
        <RuleDialog
          open={Boolean(ruleDialog)}
          rule={ruleDialog}
          onClose={() => setRuleDialog(null)}
          onSave={handleSaveRule}
          saving={saving}
        />
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
