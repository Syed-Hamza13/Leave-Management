import { useState, useEffect } from "react";
import { Link } from "react-router-dom";

import Badge from "../../../components/ui/Badge.jsx";
import Button from "../../../components/ui/Button.jsx";
import EmptyState from "../../../components/ui/EmptyState.jsx";
import Modal from "../../../components/ui/Modal.jsx";
import FormField from "../../../components/ui/FormField.jsx";
import TextInput from "../../../components/ui/TextInput.jsx";
import Textarea from "../../../components/ui/Textarea.jsx";
import Select from "../../../components/ui/Select.jsx";
import DateInput from "../../../components/ui/DateInput.jsx";
import { Skeleton } from "../../../components/ui/LoadingState.jsx";
import { useToast } from "../../../components/ui/ToastProvider.jsx";
import { adminLeave } from "../../../services/resources.js";

function PoliciesPage() {
  const { notify } = useToast();
  const [policies, setPolicies] = useState([]);
  const [calendars, setCalendars] = useState([]);
  const [loading, setLoading] = useState(true);

  // Create Modal
  const [createModalOpen, setCreateModalOpen] = useState(false);
  const [policyKey, setPolicyKey] = useState("");
  const [name, setName] = useState("");
  const [description, setDescription] = useState("");
  const [calendarId, setCalendarId] = useState("");
  const [effectiveFrom, setEffectiveFrom] = useState(new Date().toISOString().slice(0, 10));
  const [submitting, setSubmitting] = useState(false);

  useEffect(() => {
    loadData();
  }, []);

  async function loadData() {
    setLoading(true);
    try {
      const [polRes, calRes] = await Promise.all([
        adminLeave.listPolicies(),
        adminLeave.listCalendars(),
      ]);
      setPolicies(polRes.data || []);
      const cList = calRes.data || [];
      setCalendars(cList);
      if (cList.length > 0) setCalendarId(String(cList[0].id));
    } catch (err) {
      notify({ tone: "danger", message: err.message || "Failed to load leave policies" });
    } finally {
      setLoading(false);
    }
  }

  async function handleCreate(e) {
    e.preventDefault();
    if (!policyKey.trim() || !name.trim() || !calendarId) {
      notify({ tone: "warning", message: "Please fill in all required fields." });
      return;
    }

    setSubmitting(true);
    try {
      await adminLeave.createPolicy({
        policyKey: policyKey.trim(),
        name: name.trim(),
        description: description.trim() || null,
        calendarId: Number(calendarId),
        effectiveFrom,
        status: "draft",
      });
      notify({ tone: "success", message: "Draft leave policy created!" });
      setCreateModalOpen(false);
      setPolicyKey("");
      setName("");
      setDescription("");
      loadData();
    } catch (err) {
      notify({ tone: "danger", message: err.message || "Failed to create policy" });
    } finally {
      setSubmitting(false);
    }
  }

  async function handlePublish(id) {
    try {
      await adminLeave.publishPolicy(id);
      notify({ tone: "success", message: "Leave policy published and active for users!" });
      loadData();
    } catch (err) {
      notify({ tone: "danger", message: err.message || "Publish failed" });
    }
  }

  return (
    <div className="space-y-6">
      <div className="flex flex-col gap-4 sm:flex-row sm:items-center sm:justify-between">
        <div>
          <h2 className="text-xl font-bold text-ink">Leave Policies & Rules</h2>
          <p className="text-sm text-ink-soft">
            Define versionable leave policy sets, quotas, working calendars, and approval hierarchies.
          </p>
        </div>

        <Button tone="brand" onClick={() => setCreateModalOpen(true)}>
          Create Policy Set
        </Button>
      </div>

      {loading ? (
        <Skeleton className="h-64 w-full" />
      ) : policies.length === 0 ? (
        <EmptyState
          title="No leave policies defined"
          description="Click 'Create Policy Set' to configure your institution's leave rules."
        />
      ) : (
        <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-3">
          {policies.map((p) => (
            <div
              key={p.id}
              className="flex flex-col justify-between rounded-card border border-line bg-surface p-5 shadow-xs"
            >
              <div className="space-y-3">
                <div className="flex items-center justify-between">
                  <span className="text-xs font-bold text-ink-muted">v{p.version}</span>
                  <Badge tone={p.status === "published" ? "success" : p.status === "draft" ? "warning" : "neutral"}>
                    {p.status}
                  </Badge>
                </div>

                <div>
                  <h3 className="text-base font-semibold text-ink">{p.name}</h3>
                  <p className="text-xs font-mono text-ink-soft">{p.policy_key}</p>
                </div>

                {p.description && (
                  <p className="line-clamp-2 text-xs text-ink-soft">{p.description}</p>
                )}

                <div className="rounded-card bg-surface-soft p-3 text-xs space-y-1">
                  <div className="flex justify-between">
                    <span className="text-ink-soft">Calendar:</span>
                    <span className="font-medium text-ink">{p.calendar_name || "Standard"}</span>
                  </div>
                  <div className="flex justify-between">
                    <span className="text-ink-soft">Effective From:</span>
                    <span className="font-medium text-ink">{p.effective_from}</span>
                  </div>
                  {p.is_default ? (
                    <div className="text-brand font-semibold text-[10px]">
                      DEFAULT INSTITUTIONAL POLICY
                    </div>
                  ) : null}
                </div>
              </div>

              <div className="mt-4 flex items-center justify-between border-t border-line pt-3">
                <Link
                  to={`/admin/leave/policies/${p.id}`}
                  className="text-xs font-semibold text-brand hover:underline"
                >
                  Configure Rules & Workflows &rarr;
                </Link>

                {p.status === "draft" && (
                  <button
                    type="button"
                    onClick={() => handlePublish(p.id)}
                    className="cursor-pointer text-xs font-medium text-emerald-600 hover:underline"
                  >
                    Publish
                  </button>
                )}
              </div>
            </div>
          ))}
        </div>
      )}

      {/* Create Policy Modal */}
      {createModalOpen && (
        <Modal
          isOpen={createModalOpen}
          onClose={() => setCreateModalOpen(false)}
          title="Create New Policy Set"
        >
          <form onSubmit={handleCreate} className="space-y-4">
            <FormField label="Policy Key (unique, lowercase alphanumeric)" required>
              <TextInput
                placeholder="e.g. eklavya_standard_policy"
                value={policyKey}
                onChange={(e) => setPolicyKey(e.target.value.toLowerCase().replace(/\s+/g, "_"))}
              />
            </FormField>

            <FormField label="Policy Name" required>
              <TextInput
                placeholder="e.g. Standard Institutional Leave Policy"
                value={name}
                onChange={(e) => setName(e.target.value)}
              />
            </FormField>

            <FormField label="Working Calendar" required>
              <Select value={calendarId} onChange={(e) => setCalendarId(e.target.value)}>
                {calendars.map((c) => (
                  <option key={c.id} value={c.id}>
                    {c.name}
                  </option>
                ))}
              </Select>
            </FormField>

            <FormField label="Effective From Date" required>
              <DateInput
                value={effectiveFrom}
                onChange={(e) => setEffectiveFrom(e.target.value)}
              />
            </FormField>

            <FormField label="Description">
              <Textarea
                rows={3}
                placeholder="Summary of this policy set..."
                value={description}
                onChange={(e) => setDescription(e.target.value)}
              />
            </FormField>

            <div className="flex justify-end gap-3 pt-3">
              <Button
                type="button"
                tone="neutral"
                variant="outline"
                onClick={() => setCreateModalOpen(false)}
              >
                Cancel
              </Button>
              <Button type="submit" tone="brand" disabled={submitting}>
                {submitting ? "Creating..." : "Create Policy"}
              </Button>
            </div>
          </form>
        </Modal>
      )}
    </div>
  );
}

export default PoliciesPage;
