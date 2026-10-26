import { useState, useEffect } from "react";
import { useParams, Link } from "react-router-dom";

import Badge from "../../../components/ui/Badge.jsx";
import Button from "../../../components/ui/Button.jsx";
import EmptyState from "../../../components/ui/EmptyState.jsx";
import Modal from "../../../components/ui/Modal.jsx";
import FormField from "../../../components/ui/FormField.jsx";
import TextInput from "../../../components/ui/TextInput.jsx";
import Textarea from "../../../components/ui/Textarea.jsx";
import Select from "../../../components/ui/Select.jsx";
import Toggle from "../../../components/ui/Toggle.jsx";
import { Skeleton } from "../../../components/ui/LoadingState.jsx";
import { useToast } from "../../../components/ui/ToastProvider.jsx";
import { adminLeave } from "../../../services/resources.js";

function PolicyEditorPage() {
  const { id } = useParams();
  const policyId = Number(id);
  const { notify } = useToast();

  const [activeTab, setActiveTab] = useState("types");
  const [policy, setPolicy] = useState(null);
  const [types, setTypes] = useState([]);
  const [rules, setRules] = useState([]);
  const [workflows, setWorkflows] = useState([]);
  const [loading, setLoading] = useState(true);

  // Add Type Modal
  const [typeModalOpen, setTypeModalOpen] = useState(false);
  const [typeKey, setTypeKey] = useState("");
  const [typeName, setTypeName] = useState("");
  const [typeUnit, setTypeUnit] = useState("day");
  const [typePaid, setTypePaid] = useState("paid");
  const [reqBal, setReqBal] = useState(true);
  const [reqAppr, setReqAppr] = useState(true);
  const [halfDay, setHalfDay] = useState(true);
  const [typeSubmitting, setTypeSubmitting] = useState(false);

  // Add Rule Modal
  const [ruleModalOpen, setRuleModalOpen] = useState(false);
  const [ruleKey, setRuleKey] = useState("");
  const [ruleType, setRuleType] = useState("NOTICE_PERIOD");
  const [ruleLeaveTypeId, setRuleLeaveTypeId] = useState("");
  const [ruleConfigJsonStr, setRuleConfigJsonStr] = useState('{"noticeDays":2}');
  const [ruleSubmitting, setRuleSubmitting] = useState(false);

  useEffect(() => {
    loadAll();
  }, [policyId]);

  async function loadAll() {
    setLoading(true);
    try {
      const [polRes, typesRes, rulesRes, wfRes] = await Promise.all([
        adminLeave.getPolicy(policyId),
        adminLeave.listTypes(policyId),
        adminLeave.listRules({ policyId }),
        adminLeave.listWorkflows(policyId),
      ]);
      setPolicy(polRes.data);
      setTypes(typesRes.data || []);
      setRules(rulesRes.data || []);
      setWorkflows(wfRes.data || []);
      if (typesRes.data?.length > 0) {
        setRuleLeaveTypeId(String(typesRes.data[0].id));
      }
    } catch (err) {
      notify({ tone: "danger", message: err.message || "Failed to load policy configuration" });
    } finally {
      setLoading(false);
    }
  }

  async function handleCreateType(e) {
    e.preventDefault();
    if (!typeKey.trim() || !typeName.trim()) return;
    setTypeSubmitting(true);
    try {
      await adminLeave.createType({
        policyId,
        typeKey: typeKey.trim(),
        name: typeName.trim(),
        unit: typeUnit,
        paidStatus: typePaid,
        requiresBalance: reqBal,
        requiresApproval: reqAppr,
        allowsHalfDay: halfDay,
      });
      notify({ tone: "success", message: `Leave type '${typeName}' created.` });
      setTypeModalOpen(false);
      setTypeKey("");
      setTypeName("");
      loadAll();
    } catch (err) {
      notify({ tone: "danger", message: err.message || "Failed to create leave type" });
    } finally {
      setTypeSubmitting(false);
    }
  }

  async function handleCreateRule(e) {
    e.preventDefault();
    if (!ruleKey.trim()) return;

    let parsedConfig;
    try {
      parsedConfig = JSON.parse(ruleConfigJsonStr);
    } catch {
      notify({ tone: "warning", message: "Rule config must be valid JSON." });
      return;
    }

    setRuleSubmitting(true);
    try {
      await adminLeave.createRule({
        policyId,
        leaveTypeId: ruleLeaveTypeId ? Number(ruleLeaveTypeId) : null,
        ruleKey: ruleKey.trim(),
        ruleType,
        priority: 5,
        configJson: parsedConfig,
      });
      notify({ tone: "success", message: `Policy rule '${ruleKey}' created.` });
      setRuleModalOpen(false);
      setRuleKey("");
      loadAll();
    } catch (err) {
      notify({ tone: "danger", message: err.message || "Failed to create rule" });
    } finally {
      setRuleSubmitting(false);
    }
  }

  async function handleDeleteRule(ruleId) {
    try {
      await adminLeave.deleteRule(ruleId);
      notify({ tone: "success", message: "Rule removed." });
      loadAll();
    } catch (err) {
      notify({ tone: "danger", message: err.message || "Failed to delete rule" });
    }
  }

  if (loading) {
    return <Skeleton className="h-80 w-full" />;
  }

  if (!policy) {
    return <EmptyState title="Policy not found" description="The requested policy could not be found." />;
  }

  return (
    <div className="space-y-6">
      {/* Header */}
      <div className="flex flex-col gap-4 sm:flex-row sm:items-center sm:justify-between border-b border-line pb-4">
        <div>
          <div className="flex items-center gap-2">
            <Link to="/admin/leave/policies" className="text-xs text-brand hover:underline">
              &larr; All Policies
            </Link>
            <span className="text-ink-soft">/</span>
            <span className="text-xs font-mono text-ink-muted">v{policy.version}</span>
          </div>
          <h2 className="text-xl font-bold text-ink mt-1">{policy.name}</h2>
          <p className="text-xs text-ink-soft">Key: {policy.policy_key} | Status: {policy.status}</p>
        </div>

        <div className="flex items-center gap-2">
          <Badge tone={policy.status === "published" ? "success" : "warning"}>{policy.status}</Badge>
        </div>
      </div>

      {/* Tabs */}
      <div className="flex border-b border-line">
        {[
          { key: "types", label: `Leave Types (${types.length})` },
          { key: "rules", label: `Policy Rules (${rules.length})` },
          { key: "workflows", label: `Approval Workflows (${workflows.length})` },
        ].map((tab) => (
          <button
            key={tab.key}
            type="button"
            onClick={() => setActiveTab(tab.key)}
            className={`cursor-pointer px-4 py-2.5 text-xs font-semibold border-b-2 transition-colors ${
              activeTab === tab.key
                ? "border-brand text-brand"
                : "border-transparent text-ink-soft hover:text-ink"
            }`}
          >
            {tab.label}
          </button>
        ))}
      </div>

      {/* Tab 1: Leave Types */}
      {activeTab === "types" && (
        <div className="space-y-4">
          <div className="flex justify-between items-center">
            <p className="text-xs text-ink-soft">
              Types of absences governed by this policy, defining tracking unit, paid status, and balance requirements.
            </p>
            <Button tone="brand" onClick={() => setTypeModalOpen(true)}>
              Add Leave Type
            </Button>
          </div>

          <div className="overflow-x-auto rounded-card border border-line bg-surface">
            <table className="w-full text-left text-sm">
              <thead className="border-b border-line bg-surface-soft text-xs font-semibold text-ink-muted">
                <tr>
                  <th className="px-4 py-3">Leave Type</th>
                  <th className="px-4 py-3">Key</th>
                  <th className="px-4 py-3">Unit</th>
                  <th className="px-4 py-3">Compensation</th>
                  <th className="px-4 py-3">Balance Tracking</th>
                  <th className="px-4 py-3">Approval</th>
                  <th className="px-4 py-3">Half Day</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-line text-ink">
                {types.map((t) => (
                  <tr key={t.id} className="hover:bg-surface-soft/40">
                    <td className="px-4 py-3 font-semibold">{t.name}</td>
                    <td className="px-4 py-3 font-mono text-xs text-ink-soft">{t.type_key}</td>
                    <td className="px-4 py-3 uppercase text-xs font-medium">{t.unit}</td>
                    <td className="px-4 py-3">
                      <Badge tone={t.paid_status === "paid" ? "success" : "neutral"}>
                        {t.paid_status}
                      </Badge>
                    </td>
                    <td className="px-4 py-3 text-xs">
                      {t.requires_balance ? "Required (Ledger)" : "Exempt"}
                    </td>
                    <td className="px-4 py-3 text-xs">
                      {t.requires_approval ? "Tiered Workflow" : "Auto-Approved"}
                    </td>
                    <td className="px-4 py-3 text-xs">
                      {t.allows_half_day ? "Allowed" : "No"}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </div>
      )}

      {/* Tab 2: Rules */}
      {activeTab === "rules" && (
        <div className="space-y-4">
          <div className="flex justify-between items-center">
            <p className="text-xs text-ink-soft">
              Dynamic rule evaluators (sandwich rule, notice periods, duration limits, documents).
            </p>
            <Button tone="brand" onClick={() => setRuleModalOpen(true)}>
              Add Policy Rule
            </Button>
          </div>

          <div className="overflow-x-auto rounded-card border border-line bg-surface">
            <table className="w-full text-left text-sm">
              <thead className="border-b border-line bg-surface-soft text-xs font-semibold text-ink-muted">
                <tr>
                  <th className="px-4 py-3">Rule Key</th>
                  <th className="px-4 py-3">Rule Type</th>
                  <th className="px-4 py-3">Applies To</th>
                  <th className="px-4 py-3">Priority</th>
                  <th className="px-4 py-3">Configuration JSON</th>
                  <th className="px-4 py-3 text-right">Actions</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-line text-ink text-xs">
                {rules.map((r) => {
                  const targetType = types.find((t) => t.id === r.leave_type_id);
                  return (
                    <tr key={r.id} className="hover:bg-surface-soft/40">
                      <td className="px-4 py-3 font-semibold text-brand">{r.rule_key}</td>
                      <td className="px-4 py-3 font-mono font-medium">{r.rule_type}</td>
                      <td className="px-4 py-3">{targetType ? targetType.name : "All Types"}</td>
                      <td className="px-4 py-3">{r.priority}</td>
                      <td className="px-4 py-3 font-mono text-[11px] text-ink-soft max-w-xs truncate">
                        {JSON.stringify(r.config_json)}
                      </td>
                      <td className="px-4 py-3 text-right">
                        <button
                          type="button"
                          onClick={() => handleDeleteRule(r.id)}
                          className="cursor-pointer text-rose-600 hover:underline"
                        >
                          Delete
                        </button>
                      </td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>
        </div>
      )}

      {/* Tab 3: Workflows */}
      {activeTab === "workflows" && (
        <div className="space-y-6">
          <p className="text-xs text-ink-soft">
            Tiered approval hierarchies. Applications are matched to workflows based on duration and employee categorization.
          </p>

          <div className="space-y-4">
            {workflows.map((wf) => (
              <div key={wf.id} className="rounded-card border border-line bg-surface p-4 space-y-3">
                <div className="flex items-center justify-between">
                  <div>
                    <h3 className="text-sm font-semibold text-ink">{wf.name}</h3>
                    <p className="text-xs font-mono text-ink-soft">{wf.workflow_key}</p>
                  </div>
                  {wf.conditions_json && (
                    <Badge tone="neutral">
                      Tier: {wf.conditions_json.minDays ?? 0} to {wf.conditions_json.maxDays ?? "∞"} days
                    </Badge>
                  )}
                </div>

                <div className="space-y-2 border-t border-line pt-3">
                  <span className="text-xs font-semibold uppercase tracking-wider text-ink-muted">
                    Approval Sequence
                  </span>
                  {wf.steps?.length === 0 ? (
                    <p className="text-xs text-ink-soft">No steps configured yet.</p>
                  ) : (
                    <div className="flex flex-wrap items-center gap-2">
                      {wf.steps.map((st, i) => (
                        <div key={st.id} className="flex items-center gap-2">
                          <div className="rounded-card border border-line bg-surface-soft px-3 py-1.5 text-xs">
                            <span className="font-bold text-brand">Step {st.step_order}: </span>
                            <span className="font-medium text-ink">{st.approver_type}</span>
                            <span className="ml-1 text-[10px] text-ink-soft">({st.approval_mode})</span>
                          </div>
                          {i < wf.steps.length - 1 && <span className="text-ink-muted">&rarr;</span>}
                        </div>
                      ))}
                    </div>
                  )}
                </div>
              </div>
            ))}
          </div>
        </div>
      )}

      {/* Add Type Modal */}
      {typeModalOpen && (
        <Modal isOpen={typeModalOpen} onClose={() => setTypeModalOpen(false)} title="Add Leave Type">
          <form onSubmit={handleCreateType} className="space-y-4">
            <FormField label="Type Key (unique alphanumeric)" required>
              <TextInput
                placeholder="e.g. sick_leave"
                value={typeKey}
                onChange={(e) => setTypeKey(e.target.value.toLowerCase().replace(/\s+/g, "_"))}
              />
            </FormField>

            <FormField label="Type Name" required>
              <TextInput
                placeholder="e.g. Sick Leave"
                value={typeName}
                onChange={(e) => setTypeName(e.target.value)}
              />
            </FormField>

            <div className="grid grid-cols-2 gap-4">
              <FormField label="Unit">
                <Select value={typeUnit} onChange={(e) => setTypeUnit(e.target.value)}>
                  <option value="day">Day</option>
                  <option value="hour">Hour</option>
                </Select>
              </FormField>

              <FormField label="Paid Status">
                <Select value={typePaid} onChange={(e) => setTypePaid(e.target.value)}>
                  <option value="paid">Paid</option>
                  <option value="unpaid">Unpaid</option>
                </Select>
              </FormField>
            </div>

            <Toggle
              label="Requires Quota Balance"
              checked={reqBal}
              onChange={setReqBal}
              description="Deducts from employee ledger when approved"
            />

            <Toggle
              label="Requires Supervisory Approval"
              checked={reqAppr}
              onChange={setReqAppr}
              description="Routes through approval workflow hierarchy"
            />

            <Toggle
              label="Allows Half Day Leaves"
              checked={halfDay}
              onChange={setHalfDay}
              description="Permits taking morning or afternoon half days"
            />

            <div className="flex justify-end gap-3 pt-3">
              <Button type="button" tone="neutral" variant="outline" onClick={() => setTypeModalOpen(false)}>
                Cancel
              </Button>
              <Button type="submit" tone="brand" disabled={typeSubmitting}>
                {typeSubmitting ? "Creating..." : "Save Leave Type"}
              </Button>
            </div>
          </form>
        </Modal>
      )}

      {/* Add Rule Modal */}
      {ruleModalOpen && (
        <Modal isOpen={ruleModalOpen} onClose={() => setRuleModalOpen(false)} title="Add Policy Rule">
          <form onSubmit={handleCreateRule} className="space-y-4">
            <FormField label="Rule Key (unique identifier)" required>
              <TextInput
                placeholder="e.g. pl_notice_tier"
                value={ruleKey}
                onChange={(e) => setRuleKey(e.target.value.toLowerCase().replace(/\s+/g, "_"))}
              />
            </FormField>

            <FormField label="Rule Type" required>
              <Select value={ruleType} onChange={(e) => setRuleType(e.target.value)}>
                <option value="NOTICE_PERIOD">NOTICE_PERIOD</option>
                <option value="MIN_DURATION">MIN_DURATION</option>
                <option value="MAX_DURATION">MAX_DURATION</option>
                <option value="SANDWICH">SANDWICH</option>
                <option value="DOCUMENT_REQUIRED">DOCUMENT_REQUIRED</option>
                <option value="ENTITLEMENT">ENTITLEMENT</option>
                <option value="ELIGIBILITY">ELIGIBILITY</option>
              </Select>
            </FormField>

            <FormField label="Applies To Leave Type">
              <Select value={ruleLeaveTypeId} onChange={(e) => setRuleLeaveTypeId(e.target.value)}>
                <option value="">All Leave Types (Global)</option>
                {types.map((t) => (
                  <option key={t.id} value={t.id}>
                    {t.name}
                  </option>
                ))}
              </Select>
            </FormField>

            <FormField label="Rule Configuration JSON" required>
              <Textarea
                rows={4}
                value={ruleConfigJsonStr}
                onChange={(e) => setRuleConfigJsonStr(e.target.value)}
              />
            </FormField>

            <div className="flex justify-end gap-3 pt-3">
              <Button type="button" tone="neutral" variant="outline" onClick={() => setRuleModalOpen(false)}>
                Cancel
              </Button>
              <Button type="submit" tone="brand" disabled={ruleSubmitting}>
                {ruleSubmitting ? "Creating..." : "Save Policy Rule"}
              </Button>
            </div>
          </form>
        </Modal>
      )}
    </div>
  );
}

export default PolicyEditorPage;
