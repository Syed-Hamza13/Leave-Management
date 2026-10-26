import { useState, useEffect } from "react";

import Badge from "../../components/ui/Badge.jsx";
import Button from "../../components/ui/Button.jsx";
import EmptyState from "../../components/ui/EmptyState.jsx";
import Modal from "../../components/ui/Modal.jsx";
import { Skeleton } from "../../components/ui/LoadingState.jsx";
import Textarea from "../../components/ui/Textarea.jsx";
import FormField from "../../components/ui/FormField.jsx";
import { useToast } from "../../components/ui/ToastProvider.jsx";
import { leave } from "../../services/resources.js";

function LeaveApprovalsPage() {
  const { notify } = useToast();
  const [pendingList, setPendingList] = useState([]);
  const [loading, setLoading] = useState(true);

  // Review Modal State
  const [reviewApp, setReviewApp] = useState(null);
  const [comments, setComments] = useState("");
  const [actionInProgress, setActionInProgress] = useState(false);

  useEffect(() => {
    loadPending();
  }, []);

  async function loadPending() {
    setLoading(true);
    try {
      const res = await leave.pendingApprovals();
      setPendingList(res.data || []);
    } catch (err) {
      notify({ tone: "danger", message: err.message || "Failed to load approval queue" });
    } finally {
      setLoading(false);
    }
  }

  async function handleApprove() {
    if (!reviewApp) return;
    setActionInProgress(true);
    try {
      await leave.approve(reviewApp.id, { comments: comments || null });
      notify({ tone: "success", message: `Application ${reviewApp.application_number} approved.` });
      setReviewApp(null);
      setComments("");
      loadPending();
    } catch (err) {
      notify({ tone: "danger", message: err.message || "Approval action failed" });
    } finally {
      setActionInProgress(false);
    }
  }

  async function handleReject() {
    if (!reviewApp) return;
    if (!comments.trim()) {
      notify({ tone: "warning", message: "A rejection reason is required." });
      return;
    }
    setActionInProgress(true);
    try {
      await leave.reject(reviewApp.id, { comments: comments.trim() });
      notify({ tone: "success", message: `Application ${reviewApp.application_number} rejected.` });
      setReviewApp(null);
      setComments("");
      loadPending();
    } catch (err) {
      notify({ tone: "danger", message: err.message || "Rejection action failed" });
    } finally {
      setActionInProgress(false);
    }
  }

  return (
    <div className="space-y-6">
      <div className="flex items-center justify-between">
        <div>
          <h2 className="text-xl font-bold text-ink">Leave Approval Queue</h2>
          <p className="text-sm text-ink-soft">
            Review and sign-off on absence requests submitted by team members in your jurisdiction.
          </p>
        </div>
        <Button tone="neutral" variant="outline" onClick={loadPending} disabled={loading}>
          Refresh Queue
        </Button>
      </div>

      {loading ? (
        <Skeleton className="h-64 w-full" />
      ) : pendingList.length === 0 ? (
        <EmptyState
          title="All clear! No pending approvals"
          description="You currently have zero absence requests awaiting your review."
        />
      ) : (
        <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-3">
          {pendingList.map((app) => (
            <div
              key={app.id}
              className="flex flex-col justify-between rounded-card border border-line bg-surface p-5 shadow-xs"
            >
              <div className="space-y-3">
                <div className="flex items-center justify-between">
                  <span className="text-xs font-bold text-brand">{app.application_number}</span>
                  <Badge tone={app.emergency_flag ? "danger" : "warning"}>
                    {app.emergency_flag ? "EMERGENCY" : "PENDING"}
                  </Badge>
                </div>

                <div>
                  <h3 className="text-base font-semibold text-ink">{app.applicant_name}</h3>
                  <p className="text-xs text-ink-soft">{app.applicant_email}</p>
                </div>

                <div className="rounded-card bg-surface-soft p-3 text-xs space-y-1">
                  <div className="flex justify-between">
                    <span className="text-ink-soft">Leave Type:</span>
                    <span className="font-medium text-ink">{app.leave_type_name}</span>
                  </div>
                  <div className="flex justify-between">
                    <span className="text-ink-soft">Period:</span>
                    <span className="font-medium text-ink">
                      {app.start_date} to {app.end_date}
                    </span>
                  </div>
                  <div className="flex justify-between">
                    <span className="text-ink-soft">Duration:</span>
                    <span className="font-bold text-brand">
                      {app.calculated_units} {app.unit}(s)
                    </span>
                  </div>
                </div>

                <p className="line-clamp-2 text-xs text-ink-soft italic">
                  "{app.reason}"
                </p>
              </div>

              <div className="mt-4 border-t border-line pt-3">
                <Button
                  id={`review-app-${app.id}`}
                  tone="brand"
                  className="w-full"
                  onClick={() => {
                    setReviewApp(app);
                    setComments("");
                  }}
                >
                  Review & Action
                </Button>
              </div>
            </div>
          ))}
        </div>
      )}

      {/* Review & Action Modal */}
      {reviewApp && (
        <Modal
          isOpen={Boolean(reviewApp)}
          onClose={() => setReviewApp(null)}
          title={`Review Request: ${reviewApp.application_number}`}
        >
          <div className="space-y-4 text-sm text-ink">
            <div className="rounded-card bg-surface-soft p-4 text-xs space-y-2">
              <div className="flex justify-between">
                <span className="text-ink-soft">Employee:</span>
                <span className="font-semibold text-ink">
                  {reviewApp.applicant_name} ({reviewApp.applicant_email})
                </span>
              </div>
              <div className="flex justify-between">
                <span className="text-ink-soft">Category:</span>
                <span className="font-medium">{reviewApp.leave_type_name}</span>
              </div>
              <div className="flex justify-between">
                <span className="text-ink-soft">Requested Dates:</span>
                <span className="font-medium">
                  {reviewApp.start_date} to {reviewApp.end_date}
                </span>
              </div>
              <div className="flex justify-between">
                <span className="text-ink-soft">Calculated Charge:</span>
                <span className="font-bold text-brand">
                  {reviewApp.calculated_units} {reviewApp.unit}(s)
                </span>
              </div>
            </div>

            <div>
              <span className="text-xs font-semibold uppercase tracking-wider text-ink-muted">
                Stated Reason
              </span>
              <p className="mt-1 rounded-card border border-line bg-surface p-3 text-xs text-ink-soft">
                {reviewApp.reason}
              </p>
            </div>

            <FormField label="Review Remarks / Reason (Required for rejection)">
              <Textarea
                id="approval-comments"
                rows={3}
                placeholder="Enter feedback or explanation..."
                value={comments}
                onChange={(e) => setComments(e.target.value)}
              />
            </FormField>

            <div className="flex items-center justify-end gap-3 pt-3">
              <Button
                type="button"
                tone="danger"
                variant="outline"
                disabled={actionInProgress}
                onClick={handleReject}
              >
                Reject Request
              </Button>
              <Button
                type="button"
                tone="success"
                disabled={actionInProgress}
                onClick={handleApprove}
              >
                Approve Request
              </Button>
            </div>
          </div>
        </Modal>
      )}
    </div>
  );
}

export default LeaveApprovalsPage;
