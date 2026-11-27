import { useState, useEffect } from "react";
import { createPortal } from "react-dom";
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

/**
 * Disabled Decision Actions rendered with a floating React Portal tooltip.
 * Using createPortal directly into document.body prevents ANY table boundary clipping or scrollbars!
 */
function DisabledApprovalActions({ waitingMessage }) {
  const [coords, setCoords] = useState(null);

  function handleMouseEnter(e) {
    const rect = e.currentTarget.getBoundingClientRect();
    setCoords({
      top: rect.top,
      bottom: rect.bottom,
      right: window.innerWidth - rect.right,
    });
  }

  function handleMouseLeave() {
    setCoords(null);
  }

  useEffect(() => {
    if (!coords) return undefined;
    const handleScroll = () => setCoords(null);
    window.addEventListener("scroll", handleScroll, true);
    return () => window.removeEventListener("scroll", handleScroll, true);
  }, [coords]);

  const showBelow = coords && coords.top < 130;

  return (
    <div
      className="inline-flex items-center gap-1.5 cursor-not-allowed select-none"
      onMouseEnter={handleMouseEnter}
      onMouseLeave={handleMouseLeave}
    >
      <Button
        size="sm"
        variant="primary"
        disabled
        className="opacity-50 cursor-not-allowed pointer-events-none"
      >
        Approve
      </Button>
      <Button
        size="sm"
        variant="danger"
        disabled
        className="opacity-50 cursor-not-allowed pointer-events-none"
      >
        Reject
      </Button>
      <span
        className="inline-flex items-center justify-center w-5 h-5 rounded-full bg-amber-100 text-amber-800 text-[11px] font-bold cursor-help border border-amber-300 shadow-2xs"
        title="Waiting for prior step approval"
      >
        ⓘ
      </span>

      {coords &&
        createPortal(
          <div
            style={{
              position: "fixed",
              top: showBelow ? coords.bottom + 10 : coords.top - 10,
              right: Math.max(16, coords.right),
              transform: showBelow ? "none" : "translateY(-100%)",
              zIndex: 99999,
            }}
            className="pointer-events-none w-80 rounded-xl bg-slate-900/95 backdrop-blur-xs p-3 text-xs text-white shadow-2xl whitespace-pre-line text-center border border-slate-700/80 animate-in fade-in duration-150"
          >
            <div className="font-semibold text-amber-300 text-[11px] mb-1 flex items-center justify-center gap-1">
              <span>⏳ Awaiting Preceding Approval</span>
            </div>
            <div className="text-slate-200 text-xs leading-relaxed font-normal">
              {waitingMessage}
            </div>

            {/* Triangle pointer arrow pointing directly to the buttons */}
            {showBelow ? (
              <div className="absolute bottom-full right-8 -mb-px border-4 border-transparent border-b-slate-900/95" />
            ) : (
              <div className="absolute top-full right-8 -mt-px border-4 border-transparent border-t-slate-900/95" />
            )}
          </div>,
          document.body
        )}
    </div>
  );
}

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
      render: (row) => {
        const val = row.values || row;
        return (
          <div>
            <span className="font-medium text-slate-900">{val.leave_type}</span>
            {val.is_emergency ? (
              <span className="ml-2 inline-flex items-center px-1.5 py-0.5 rounded text-[10px] font-medium bg-red-100 text-red-800">
                Emergency
              </span>
            ) : null}
          </div>
        );
      },
    },
    {
      key: "dates",
      header: "Dates",
      render: (row) => {
        const val = row.values || row;
        return (
          <span className="text-sm text-slate-700">
            {val.start_date}
            {val.end_date && val.end_date !== val.start_date ? ` to ${val.end_date}` : ""}
          </span>
        );
      },
    },
    {
      key: "days",
      header: "Duration",
      render: (row) => {
        const val = row.values || row;
        return (
          <div className="text-sm">
            <span className="font-semibold text-slate-800">{val.days} Days</span>
            {val.sandwiched_days > 0 ? (
              <span className="block text-[11px] text-amber-600">
                (Includes {val.sandwiched_days} sandwiched day)
              </span>
            ) : null}
          </div>
        );
      },
    },
    {
      key: "status",
      header: "Status",
      render: (row) => {
        const val = row.values || row;
        const steps = val.approval_steps || [];
        const currentStep = (val.current_step || 0) + 1;
        return (
          <div className="space-y-1">
            <Badge tone={getStatusTone(val.status)}>{val.status}</Badge>
            {val.status === "Pending Approval" && steps.length > 1 && (
              <span className="block text-[11px] font-medium text-indigo-700 bg-indigo-50 border border-indigo-200 px-1.5 py-0.5 rounded">
                Chain: Step {currentStep} of {steps.length}
              </span>
            )}
          </div>
        );
      },
    },
    {
      key: "reason",
      header: "Reason / Notes",
      render: (row) => {
        const val = row.values || row;
        return <span className="text-xs text-slate-600 line-clamp-2">{val.reason || "—"}</span>;
      },
    },
    {
      key: "actions",
      header: "",
      render: (row) => {
        const val = row.values || row;
        return val.status === "Pending Approval" ? (
          <Button
            size="sm"
            variant="ghost"
            className="text-rose-600 hover:text-rose-700 hover:bg-rose-50"
            onClick={() => setCancelTarget(row)}
          >
            Cancel
          </Button>
        ) : null;
      },
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
      render: (row) => {
        const val = row.values || row;
        return (
          <div>
            <span className="font-medium text-slate-900">{val.leave_type}</span>
            {val.is_emergency ? (
              <span className="ml-2 inline-flex items-center px-1.5 py-0.5 rounded text-[10px] font-medium bg-red-100 text-red-800">
                Emergency
              </span>
            ) : null}
          </div>
        );
      },
    },
    {
      key: "dates",
      header: "Dates & Duration",
      render: (row) => {
        const val = row.values || row;
        return (
          <div className="text-sm">
            <p className="text-slate-800 font-medium">
              {val.start_date}
              {val.end_date && val.end_date !== val.start_date ? ` to ${val.end_date}` : ""}
            </p>
            <p className="text-xs text-indigo-600 font-semibold">{val.days} Days</p>
          </div>
        );
      },
    },
    {
      key: "stage",
      header: "Chain Step",
      render: (row) => {
        const val = row.values || row;
        const steps = val.approval_steps || [];
        const currentStepIdx = val.current_step || 0;
        const currentStep = steps[currentStepIdx];
        if (steps.length > 1 && currentStep) {
          return (
            <div className="text-xs space-y-1">
              <div className="flex items-center gap-1.5 flex-wrap">
                <span className="font-bold text-indigo-700 bg-indigo-50 border border-indigo-200 px-2 py-0.5 rounded text-[11px]">
                  Active: Step {currentStepIdx + 1}/{steps.length}
                </span>
                {row.myStepOrder && row.myStepOrder > currentStepIdx + 1 && (
                  <span className="font-semibold text-amber-700 bg-amber-50 border border-amber-200 px-1.5 py-0.5 rounded text-[10px]">
                    Your Turn: Step {row.myStepOrder}
                  </span>
                )}
              </div>
              <p className="text-[11px] text-slate-500 font-medium leading-tight">
                {currentStep.approverNamesText || currentStep.label}
              </p>
            </div>
          );
        }
        return <span className="text-xs text-slate-500">Standard</span>;
      },
    },
    {
      key: "reason",
      header: "Reason",
      render: (row) => {
        const val = row.values || row;
        return <span className="text-xs text-slate-600 line-clamp-2">{val.reason || "—"}</span>;
      },
    },
    {
      key: "actions",
      header: "Decision",
      render: (row) => {
        const canAct = row.canAct !== false;
        const waitingMessage =
          row.waitingMessage ||
          "Cannot act yet. Waiting for preceding approvers in the chain to approve first.";

        if (!canAct) {
          return <DisabledApprovalActions waitingMessage={waitingMessage} />;
        }

        return (
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
        );
      },
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
            <DataTable columns={myColumns} rows={myRequests} rowKey="id" />
          </div>
        )
      ) : pendingApprovals.length === 0 ? (
        <EmptyState
          title="All Caught Up!"
          description="There are no pending leave requests awaiting your approval."
        />
      ) : (
        <div className="bg-white rounded-lg border border-slate-200 shadow-sm overflow-hidden">
          <DataTable columns={pendingColumns} rows={pendingApprovals} rowKey="id" />
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
              {reviewDialog.action === "approve" ? (
                reviewDialog.request?.values?.approval_steps?.length > 1 &&
                (reviewDialog.request?.values?.current_step || 0) + 1 <
                  reviewDialog.request?.values?.approval_steps?.length ? (
                  `Are you sure you want to approve Step ${(reviewDialog.request?.values?.current_step || 0) + 1} of ${reviewDialog.request?.values?.approval_steps?.length} for ${reviewDialog.request?.applicant?.name}? This will advance the application to the next approver in the chain.`
                ) : (
                  `Are you sure you want to grant final approval for this request of ${reviewDialog.request?.values?.days} day(s) for ${reviewDialog.request?.applicant?.name}? This will complete the approval chain and deduct the days from their leave balance ledger.`
                )
              ) : (
                `Are you sure you want to reject this request for ${reviewDialog.request?.applicant?.name}? This will reject the leave application.`
              )}
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

