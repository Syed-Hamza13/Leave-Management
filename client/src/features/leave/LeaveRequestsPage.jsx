import { useState } from "react";
import Badge from "../../components/ui/Badge.jsx";
import Button from "../../components/ui/Button.jsx";
import ConfirmDialog from "../../components/ui/ConfirmDialog.jsx";
import DataTable from "../../components/ui/DataTable.jsx";
import EmptyState from "../../components/ui/EmptyState.jsx";
import { LoadingState } from "../../components/ui/LoadingState.jsx";
import Modal from "../../components/ui/Modal.jsx";
import PageHeader from "../../components/ui/PageHeader.jsx";
import Textarea from "../../components/ui/Textarea.jsx";
import { useToast } from "../../components/ui/ToastContext.js";
import useAsyncData from "../../hooks/useAsyncData.js";
import useMutation from "../../hooks/useMutation.js";
import { errorMessage } from "../../services/errors.js";
import { leave as leaveApi } from "../../services/resources.js";
import ApplyLeaveDialog from "./ApplyLeaveDialog.jsx";

export default function LeaveRequestsPage() {
  const toast = useToast();
  const [activeTab, setActiveTab] = useState("my"); // "my" | "pending"
  const [applyDialogOpen, setApplyDialogOpen] = useState(false);

  // Approval / Rejection Action State
  const [reviewDialog, setReviewDialog] = useState(null); // { request, action: 'approve' | 'reject' }
  const [remarks, setRemarks] = useState("");
  const [cancelTarget, setCancelTarget] = useState(null);

  const { run: runAction, pending: actionPending } = useMutation();

  // Load My Requests
  const {
    data: myData,
    loading: myLoading,
    reload: reloadMy,
  } = useAsyncData("leave-my-requests", () => leaveApi.myRequests());

  // Load Pending Approvals
  const {
    data: pendingData,
    loading: pendingLoading,
    reload: reloadPending,
  } = useAsyncData("leave-pending-approvals", () => leaveApi.pendingApprovals());

  const myRequests = myData?.data?.items ?? [];
  const pendingApprovals = pendingData?.data?.items ?? [];

  async function handleReviewSubmit(e) {
    e.preventDefault();
    if (!reviewDialog) return;

    const { request, action } = reviewDialog;
    const outcome = await runAction(() =>
      action === "approve"
        ? leaveApi.approve(request.id, { remarks })
        : leaveApi.reject(request.id, { remarks })
    );

    if (!outcome.ok) {
      toast.danger(errorMessage(outcome.error, `Failed to ${action} leave request.`));
      return;
    }

    toast.success(
      action === "approve"
        ? "Leave request approved and balance ledger deducted."
        : "Leave request has been rejected."
    );
    setReviewDialog(null);
    setRemarks("");
    reloadPending();
    reloadMy();
  }

  async function handleCancelRequest() {
    if (!cancelTarget) return;

    const outcome = await runAction(() => leaveApi.cancel(cancelTarget.id));
    if (!outcome.ok) {
      toast.danger(errorMessage(outcome.error, "Failed to cancel leave request."));
      return;
    }

    toast.success("Leave request cancelled successfully.");
    setCancelTarget(null);
    reloadMy();
  }

  function getStatusTone(status) {
    switch (status) {
      case "Approved":
        return "success";
      case "Pending Approval":
        return "warning";
      case "Rejected":
        return "danger";
      case "Cancelled":
        return "neutral";
      default:
        return "info";
    }
  }

  const myColumns = [
    {
      key: "leave_type",
      header: "Leave Type",
      render: (row) => (
        <div>
          <span className="font-medium text-slate-900">{row.values.leave_type}</span>
          {row.values.is_emergency ? (
            <span className="ml-2 inline-flex items-center px-1.5 py-0.5 rounded text-[10px] font-medium bg-red-100 text-red-800">
              Emergency
            </span>
          ) : null}
        </div>
      ),
    },
    {
      key: "dates",
      header: "Dates",
      render: (row) => (
        <span className="text-sm text-slate-700">
          {row.values.start_date}
          {row.values.end_date && row.values.end_date !== row.values.start_date
            ? ` to ${row.values.end_date}`
            : ""}
        </span>
      ),
    },
    {
      key: "days",
      header: "Duration",
      render: (row) => (
        <div className="text-sm">
          <span className="font-semibold text-slate-800">{row.values.days} Days</span>
          {row.values.sandwiched_days > 0 ? (
            <span className="block text-[11px] text-amber-600">
              (Includes {row.values.sandwiched_days} sandwiched day)
            </span>
          ) : null}
        </div>
      ),
    },
    {
      key: "status",
      header: "Status",
      render: (row) => <Badge tone={getStatusTone(row.values.status)}>{row.values.status}</Badge>,
    },
    {
      key: "reason",
      header: "Reason / Notes",
      render: (row) => (
        <span className="text-xs text-slate-600 line-clamp-2">{row.values.reason || "—"}</span>
      ),
    },
    {
      key: "actions",
      header: "",
      render: (row) =>
        row.values.status === "Pending Approval" ? (
          <Button
            size="sm"
            variant="ghost"
            className="text-rose-600 hover:text-rose-700 hover:bg-rose-50"
            onClick={() => setCancelTarget(row)}
          >
            Cancel
          </Button>
        ) : null,
    },
  ];

  const pendingColumns = [
    {
      key: "applicant",
      header: "Applicant",
      render: (row) => (
        <div>
          <p className="font-semibold text-slate-900">{row.applicant?.name || "Employee"}</p>
          <p className="text-xs text-slate-500">{row.applicant?.email}</p>
        </div>
      ),
    },
    {
      key: "leave_type",
      header: "Leave Type",
      render: (row) => (
        <div>
          <span className="font-medium text-slate-900">{row.values.leave_type}</span>
          {row.values.is_emergency ? (
            <span className="ml-2 inline-flex items-center px-1.5 py-0.5 rounded text-[10px] font-medium bg-red-100 text-red-800">
              Emergency
            </span>
          ) : null}
        </div>
      ),
    },
    {
      key: "dates",
      header: "Dates & Duration",
      render: (row) => (
        <div className="text-sm">
          <p className="text-slate-800 font-medium">
            {row.values.start_date}
            {row.values.end_date && row.values.end_date !== row.values.start_date
              ? ` to ${row.values.end_date}`
              : ""}
          </p>
          <p className="text-xs text-indigo-600 font-semibold">{row.values.days} Days</p>
        </div>
      ),
    },
    {
      key: "reason",
      header: "Reason",
      render: (row) => (
        <span className="text-xs text-slate-600 line-clamp-2">{row.values.reason || "—"}</span>
      ),
    },
    {
      key: "actions",
      header: "Decision",
      render: (row) => (
        <div className="flex items-center gap-2">
          <Button
            size="sm"
            variant="primary"
            onClick={() => setReviewDialog({ request: row, action: "approve" })}
          >
            Approve
          </Button>
          <Button
            size="sm"
            variant="danger"
            onClick={() => setReviewDialog({ request: row, action: "reject" })}
          >
            Reject
          </Button>
        </div>
      ),
    },
  ];

  const busy = myLoading || pendingLoading;

  return (
    <div className="p-6 space-y-6">
      {/* Header Action Bar with Tabs and Apply Button */}
      <div className="flex flex-wrap items-center justify-between gap-4 border-b border-slate-200 pb-2">
        <nav className="flex space-x-6">
          <button
            type="button"
            className={`pb-3 text-sm font-semibold transition-colors border-b-2 ${
              activeTab === "my"
                ? "border-indigo-600 text-indigo-600"
                : "border-transparent text-slate-500 hover:text-slate-700"
            }`}
            onClick={() => setActiveTab("my")}
          >
            My Applications ({myRequests.length})
          </button>

          <button
            type="button"
            className={`pb-3 text-sm font-semibold transition-colors border-b-2 flex items-center gap-2 ${
              activeTab === "pending"
                ? "border-indigo-600 text-indigo-600"
                : "border-transparent text-slate-500 hover:text-slate-700"
            }`}
            onClick={() => setActiveTab("pending")}
          >
            <span>Pending My Approval</span>
            {pendingApprovals.length > 0 && (
              <span className="px-2 py-0.5 rounded-full text-xs font-bold bg-amber-500 text-white">
                {pendingApprovals.length}
              </span>
            )}
          </button>
        </nav>

        <Button variant="primary" onClick={() => setApplyDialogOpen(true)}>
          + Apply for Leave
        </Button>
      </div>

      {busy ? (
        <LoadingState label="Loading leave requests..." />
      ) : activeTab === "my" ? (
        myRequests.length === 0 ? (
          <EmptyState
            title="No Leave Applications"
            description="You haven't submitted any leave applications yet."
            action={
              <Button variant="primary" onClick={() => setApplyDialogOpen(true)}>
                Apply for Leave
              </Button>
            }
          />
        ) : (
          <div className="bg-white rounded-lg border border-slate-200 shadow-sm overflow-hidden">
            <DataTable columns={myColumns} data={myRequests} keyField="id" />
          </div>
        )
      ) : pendingApprovals.length === 0 ? (
        <EmptyState
          title="All Caught Up!"
          description="There are no pending leave requests awaiting your approval."
        />
      ) : (
        <div className="bg-white rounded-lg border border-slate-200 shadow-sm overflow-hidden">
          <DataTable columns={pendingColumns} data={pendingApprovals} keyField="id" />
        </div>
      )}

      {/* Apply Leave Modal */}
      {applyDialogOpen && (
        <ApplyLeaveDialog
          open={applyDialogOpen}
          onClose={() => setApplyDialogOpen(false)}
          onSaved={() => {
            reloadMy();
            reloadPending();
          }}
        />
      )}

      {/* Approval / Rejection Remarks Modal */}
      {reviewDialog && (
        <Modal
          open={Boolean(reviewDialog)}
          onClose={() => setReviewDialog(null)}
          title={reviewDialog.action === "approve" ? "Approve Leave Request" : "Reject Leave Request"}
          size="md"
        >
          <form onSubmit={handleReviewSubmit} className="space-y-4">
            <p className="text-sm text-slate-600">
              {reviewDialog.action === "approve"
                ? `Are you sure you want to approve this request of ${reviewDialog.request?.values?.days} day(s) for ${reviewDialog.request?.applicant?.name}? This will deduct the days from their leave balance ledger.`
                : `Are you sure you want to reject this request for ${reviewDialog.request?.applicant?.name}?`}
            </p>

            <Textarea
              id="approver-remarks"
              label="Remarks / Comments"
              rows={3}
              placeholder="Enter remarks or handover guidance..."
              value={remarks}
              onChange={(e) => setRemarks(e.target.value)}
            />

            <div className="flex justify-end gap-3 pt-2">
              <Button
                type="button"
                variant="outline"
                onClick={() => setReviewDialog(null)}
                disabled={actionPending}
              >
                Cancel
              </Button>
              <Button
                type="submit"
                variant={reviewDialog.action === "approve" ? "primary" : "danger"}
                loading={actionPending}
              >
                Confirm {reviewDialog.action === "approve" ? "Approval" : "Rejection"}
              </Button>
            </div>
          </form>
        </Modal>
      )}

      {/* Cancel Request Confirmation */}
      {cancelTarget && (
        <ConfirmDialog
          open={Boolean(cancelTarget)}
          title="Cancel Leave Request"
          message={`Are you sure you want to cancel your leave request for ${cancelTarget.values?.start_date}?`}
          confirmLabel="Cancel Request"
          tone="danger"
          loading={actionPending}
          onConfirm={handleCancelRequest}
          onCancel={() => setCancelTarget(null)}
        />
      )}
    </div>
  );
}

