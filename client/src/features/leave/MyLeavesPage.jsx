import { useState, useEffect } from "react";
import { Link } from "react-router-dom";

import Badge from "../../components/ui/Badge.jsx";
import Button from "../../components/ui/Button.jsx";
import EmptyState from "../../components/ui/EmptyState.jsx";
import Modal from "../../components/ui/Modal.jsx";
import { Skeleton } from "../../components/ui/LoadingState.jsx";
import Textarea from "../../components/ui/Textarea.jsx";
import FormField from "../../components/ui/FormField.jsx";
import { useToast } from "../../components/ui/ToastProvider.jsx";
import { leave } from "../../services/resources.js";

function getStatusTone(status) {
  switch (status) {
    case "APPROVED":
      return "success";
    case "PENDING_APPROVAL":
    case "PARTIALLY_APPROVED":
    case "SUBMITTED":
      return "warning";
    case "REJECTED":
      return "danger";
    case "CANCELLED":
    default:
      return "neutral";
  }
}

function MyLeavesPage() {
  const { notify } = useToast();
  const [applications, setApplications] = useState([]);
  const [loading, setLoading] = useState(true);
  const [statusFilter, setStatusFilter] = useState("");

  // Details Modal
  const [selectedApp, setSelectedApp] = useState(null);
  const [detailsLoading, setDetailsLoading] = useState(false);

  // Cancel Modal
  const [cancelModalApp, setCancelModalApp] = useState(null);
  const [cancelReason, setCancelReason] = useState("");
  const [cancelling, setCancelling] = useState(false);

  useEffect(() => {
    loadApplications();
  }, [statusFilter]);

  async function loadApplications() {
    setLoading(true);
    try {
      const res = await leave.myApplications({ status: statusFilter || undefined });
      setApplications(res.data || []);
    } catch (err) {
      notify({ tone: "danger", message: err.message || "Failed to load leave applications" });
    } finally {
      setLoading(false);
    }
  }

  async function openDetails(app) {
    setDetailsLoading(true);
    try {
      const res = await leave.getApplication(app.id);
      setSelectedApp(res.data);
    } catch (err) {
      notify({ tone: "danger", message: "Failed to load application details" });
    } finally {
      setDetailsLoading(false);
    }
  }

  async function handleCancelSubmit() {
    if (!cancelModalApp) return;
    setCancelling(true);
    try {
      await leave.cancel(cancelModalApp.id, { reason: cancelReason || "Cancelled by employee" });
      notify({ tone: "success", message: `Application ${cancelModalApp.application_number} cancelled.` });
      setCancelModalApp(null);
      setCancelReason("");
      loadApplications();
    } catch (err) {
      notify({ tone: "danger", message: err.message || "Failed to cancel application" });
    } finally {
      setCancelling(false);
    }
  }

  return (
    <div className="space-y-6">
      {/* Header with quick filters and apply button */}
      <div className="flex flex-col gap-4 sm:flex-row sm:items-center sm:justify-between">
        <div className="flex flex-wrap items-center gap-2">
          {["", "PENDING_APPROVAL", "APPROVED", "REJECTED", "CANCELLED"].map((st) => (
            <button
              key={st || "all"}
              type="button"
              onClick={() => setStatusFilter(st)}
              className={`cursor-pointer rounded-full px-3 py-1 text-xs font-medium transition-colors ${
                statusFilter === st
                  ? "bg-brand text-white"
                  : "bg-surface-soft text-ink-soft hover:bg-line"
              }`}
            >
              {st ? st.replace("_", " ") : "All"}
            </button>
          ))}
        </div>

        <Link to="/leave/apply">
          <Button tone="brand">Apply Leave</Button>
        </Link>
      </div>

      {loading ? (
        <Skeleton className="h-64 w-full" />
      ) : applications.length === 0 ? (
        <EmptyState
          title="No applications found"
          description={
            statusFilter
              ? `No leave requests matching status '${statusFilter}'.`
              : "You haven't submitted any leave applications yet."
          }
        />
      ) : (
        <div className="overflow-x-auto rounded-card border border-line bg-surface">
          <table className="w-full text-left text-sm">
            <thead className="border-b border-line bg-surface-soft text-xs font-semibold text-ink-muted">
              <tr>
                <th className="px-4 py-3">Application #</th>
                <th className="px-4 py-3">Leave Type</th>
                <th className="px-4 py-3">Period</th>
                <th className="px-4 py-3">Units</th>
                <th className="px-4 py-3">Reason</th>
                <th className="px-4 py-3">Status</th>
                <th className="px-4 py-3 text-right">Actions</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-line text-ink">
              {applications.map((app) => {
                const canCancel =
                  ["SUBMITTED", "PENDING_APPROVAL", "PARTIALLY_APPROVED", "APPROVED"].includes(app.status);

                return (
                  <tr key={app.id} className="hover:bg-surface-soft/40">
                    <td className="px-4 py-3 font-medium text-brand">
                      {app.application_number}
                      {app.emergency_flag ? (
                        <span className="ml-2 rounded-full bg-rose-100 px-1.5 py-0.5 text-[10px] font-bold text-rose-700">
                          EMERGENCY
                        </span>
                      ) : null}
                    </td>
                    <td className="px-4 py-3">{app.leave_type_name}</td>
                    <td className="px-4 py-3 text-ink-soft">
                      {app.start_date} to {app.end_date}
                    </td>
                    <td className="px-4 py-3 font-semibold">
                      {app.calculated_units} {app.unit}(s)
                    </td>
                    <td className="max-w-xs truncate px-4 py-3 text-ink-soft" title={app.reason}>
                      {app.reason}
                    </td>
                    <td className="px-4 py-3">
                      <Badge tone={getStatusTone(app.status)}>{app.status}</Badge>
                    </td>
                    <td className="px-4 py-3 text-right">
                      <div className="flex items-center justify-end gap-2">
                        <button
                          type="button"
                          onClick={() => openDetails(app)}
                          className="cursor-pointer text-xs font-medium text-brand hover:underline"
                        >
                          Details
                        </button>
                        {canCancel && (
                          <button
                            type="button"
                            onClick={() => {
                              setCancelModalApp(app);
                              setCancelReason("");
                            }}
                            className="cursor-pointer text-xs font-medium text-rose-600 hover:underline"
                          >
                            Cancel
                          </button>
                        )}
                      </div>
                    </td>
                  </tr>
                );
              })}
            </tbody>
          </table>
        </div>
      )}

      {/* Application Details Modal */}
      {selectedApp && (
        <Modal
          isOpen={Boolean(selectedApp)}
          onClose={() => setSelectedApp(null)}
          title={`Application Details: ${selectedApp.application_number}`}
        >
          <div className="space-y-5 text-sm text-ink">
            {/* Meta Header */}
            <div className="grid grid-cols-2 gap-4 rounded-card bg-surface-soft p-4 text-xs">
              <div>
                <span className="text-ink-soft">Leave Type:</span>
                <p className="font-semibold text-ink">{selectedApp.leave_type_name}</p>
              </div>
              <div>
                <span className="text-ink-soft">Status:</span>
                <p className="mt-0.5">
                  <Badge tone={getStatusTone(selectedApp.status)}>{selectedApp.status}</Badge>
                </p>
              </div>
              <div>
                <span className="text-ink-soft">Dates:</span>
                <p className="font-medium text-ink">
                  {selectedApp.start_date} to {selectedApp.end_date}
                </p>
              </div>
              <div>
                <span className="text-ink-soft">Counted Duration:</span>
                <p className="font-bold text-brand">
                  {selectedApp.calculated_units} {selectedApp.unit}(s)
                </p>
              </div>
            </div>

            <div>
              <span className="text-xs font-semibold uppercase tracking-wider text-ink-muted">
                Reason
              </span>
              <p className="mt-1 rounded-card border border-line bg-surface p-3 text-xs text-ink-soft">
                {selectedApp.reason}
              </p>
            </div>

            {/* Day Breakdown */}
            {selectedApp.days?.length > 0 && (
              <div className="space-y-2">
                <span className="text-xs font-semibold uppercase tracking-wider text-ink-muted">
                  Day Classification Breakdown
                </span>
                <div className="max-h-40 overflow-y-auto rounded-card border border-line">
                  <table className="w-full text-left text-xs">
                    <thead className="border-b border-line bg-surface-soft text-ink-muted">
                      <tr>
                        <th className="px-3 py-1.5">Date</th>
                        <th className="px-3 py-1.5">Classification</th>
                        <th className="px-3 py-1.5">Counted Units</th>
                        <th className="px-3 py-1.5">Explanation</th>
                      </tr>
                    </thead>
                    <tbody className="divide-y divide-line">
                      {selectedApp.days.map((d) => (
                        <tr key={d.id}>
                          <td className="px-3 py-1.5 text-ink-soft">{d.date}</td>
                          <td className="px-3 py-1.5 font-medium">{d.day_type}</td>
                          <td className="px-3 py-1.5 font-semibold">
                            {d.counted ? d.units : "0 (Excluded)"}
                          </td>
                          <td className="px-3 py-1.5 text-ink-soft">
                            {d.calculation_metadata_json?.reason || (d.counted ? "Counted" : "Excluded")}
                          </td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </div>
              </div>
            )}

            {/* Approval Chain Timeline */}
            {selectedApp.approvals?.length > 0 && (
              <div className="space-y-2">
                <span className="text-xs font-semibold uppercase tracking-wider text-ink-muted">
                  Approval Timeline
                </span>
                <ol className="space-y-2 border-l-2 border-line pl-4">
                  {selectedApp.approvals.map((appr) => (
                    <li key={appr.id} className="relative text-xs">
                      <span
                        className={`absolute -left-[21px] top-1 h-2.5 w-2.5 rounded-full ${
                          appr.status === "APPROVED"
                            ? "bg-emerald-500"
                            : appr.status === "REJECTED"
                            ? "bg-rose-500"
                            : "bg-amber-400"
                        }`}
                      />
                      <div className="flex items-center justify-between">
                        <span className="font-semibold text-ink">
                          Step {appr.step_order}: {appr.approver_name || appr.approver_type}
                        </span>
                        <Badge tone={getStatusTone(appr.status)}>{appr.status}</Badge>
                      </div>
                      {appr.comments && (
                        <p className="mt-1 text-ink-soft italic">"{appr.comments}"</p>
                      )}
                      {appr.acted_at && (
                        <span className="text-[10px] text-ink-muted">
                          Acted at: {new Date(appr.acted_at).toLocaleString()}
                        </span>
                      )}
                    </li>
                  ))}
                </ol>
              </div>
            )}
          </div>
        </Modal>
      )}

      {/* Cancellation Dialog */}
      {cancelModalApp && (
        <Modal
          isOpen={Boolean(cancelModalApp)}
          onClose={() => setCancelModalApp(null)}
          title={`Cancel Application: ${cancelModalApp.application_number}`}
        >
          <div className="space-y-4 text-sm">
            <p className="text-ink-soft">
              Are you sure you want to cancel this leave application? If it was already approved, the deducted balance of{" "}
              <span className="font-semibold text-ink">
                {cancelModalApp.calculated_units} {cancelModalApp.unit}(s)
              </span>{" "}
              will be automatically restored to your account ledger.
            </p>

            <FormField label="Cancellation Reason">
              <Textarea
                rows={3}
                placeholder="Briefly state why you are cancelling this request..."
                value={cancelReason}
                onChange={(e) => setCancelReason(e.target.value)}
              />
            </FormField>

            <div className="flex justify-end gap-3 pt-2">
              <Button
                type="button"
                tone="neutral"
                variant="outline"
                onClick={() => setCancelModalApp(null)}
              >
                Keep Request
              </Button>
              <Button
                type="button"
                tone="danger"
                disabled={cancelling}
                onClick={handleCancelSubmit}
              >
                {cancelling ? "Cancelling..." : "Confirm Cancellation"}
              </Button>
            </div>
          </div>
        </Modal>
      )}
    </div>
  );
}

export default MyLeavesPage;
