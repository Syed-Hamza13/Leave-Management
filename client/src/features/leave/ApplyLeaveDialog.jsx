import { useEffect, useState } from "react";
import Button from "../../components/ui/Button.jsx";
import Checkbox from "../../components/ui/Checkbox.jsx";
import DateInput from "../../components/ui/DateInput.jsx";
import Modal from "../../components/ui/Modal.jsx";
import Select from "../../components/ui/Select.jsx";
import Spinner from "../../components/ui/Spinner.jsx";
import Textarea from "../../components/ui/Textarea.jsx";
import { useToast } from "../../components/ui/ToastContext.js";
import useMutation from "../../hooks/useMutation.js";
import { errorMessage } from "../../services/errors.js";
import { leave as leaveApi } from "../../services/resources.js";

const LEAVE_TYPES = [
  { value: "Privilege Leave", label: "Privilege Leave (PL)" },
  { value: "Short Leave", label: "Short Leave (2 Hours)" },
  { value: "Optional Leave", label: "Optional Leave" },
  { value: "Maternity Leave", label: "Maternity Leave" },
  { value: "Paternity Leave", label: "Paternity Leave" },
  { value: "Leave Without Pay", label: "Leave Without Pay (LWP)" },
];

const SESSIONS = [
  { value: "full_day", label: "Full Day" },
  { value: "first_half", label: "First Half (Morning)" },
  { value: "second_half", label: "Second Half (Afternoon)" },
  { value: "short_leave", label: "2-Hour Short Leave" },
];

export default function ApplyLeaveDialog({ open, onClose, onSaved }) {
  const toast = useToast();

  const todayStr = new Date().toISOString().split("T")[0];
  const [startDate, setStartDate] = useState(todayStr);
  const [endDate, setEndDate] = useState(todayStr);
  const [session, setSession] = useState("full_day");
  const [leaveType, setLeaveType] = useState("Privilege Leave");
  const [isEmergency, setIsEmergency] = useState(false);
  const [reason, setReason] = useState("");

  const [preview, setPreview] = useState(null);
  const [previewLoading, setPreviewLoading] = useState(false);
  const [previewError, setPreviewError] = useState(null);

  const { run: submitLeave, pending: submitting } = useMutation();

  // If short leave selected, lock session to short_leave and endDate to startDate
  useEffect(() => {
    if (leaveType === "Short Leave") {
      setSession("short_leave");
      setEndDate(startDate);
    }
  }, [leaveType, startDate]);

  // Recalculate live preview
  useEffect(() => {
    if (!startDate) return;

    let active = true;
    setPreviewLoading(true);
    setPreviewError(null);

    const actualEnd = session === "short_leave" || session.includes("half") ? startDate : (endDate || startDate);

    leaveApi
      .preview({
        startDate,
        endDate: actualEnd,
        session,
        leaveType,
        isEmergency,
      })
      .then((res) => {
        if (active) {
          setPreview(res.data);
          setPreviewLoading(false);
        }
      })
      .catch((err) => {
        if (active) {
          setPreviewError(err);
          setPreviewLoading(false);
        }
      });

    return () => {
      active = false;
    };
  }, [startDate, endDate, session, leaveType, isEmergency]);

  async function handleSubmit(e) {
    e.preventDefault();

    const actualEnd = session === "short_leave" || session.includes("half") ? startDate : (endDate || startDate);

    const outcome = await submitLeave(() =>
      leaveApi.submit({
        startDate,
        endDate: actualEnd,
        session,
        leaveType,
        isEmergency,
        reason,
      })
    );

    if (!outcome.ok) {
      toast.danger(errorMessage(outcome.error, "Failed to submit leave application."));
      return;
    }

    toast.success(
      outcome.result?.data?.status === "Approved"
        ? "Leave recorded and auto-approved!"
        : "Leave application submitted for approval."
    );
    onSaved?.(outcome.result?.data);
    onClose();
  }

  const isSingleDaySession = session === "short_leave" || session.includes("half");

  return (
    <Modal open={open} onClose={onClose} title="Apply for Leave" size="lg">
      <form onSubmit={handleSubmit} className="space-y-5">
        <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
          <Select
            id="leave-type"
            label="Leave Type"
            required
            value={leaveType}
            options={LEAVE_TYPES}
            onChange={(e) => setLeaveType(e.target.value)}
          />

          <Select
            id="leave-session"
            label="Session / Duration"
            required
            value={session}
            options={SESSIONS}
            onChange={(e) => setSession(e.target.value)}
          />
        </div>

        <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
          <DateInput
            id="start-date"
            label={isSingleDaySession ? "Date" : "Start Date"}
            required
            value={startDate}
            onChange={(e) => setStartDate(e.target.value)}
          />

          {!isSingleDaySession && (
            <DateInput
              id="end-date"
              label="End Date"
              required
              min={startDate}
              value={endDate}
              onChange={(e) => setEndDate(e.target.value)}
            />
          )}
        </div>

        <div>
          <Checkbox
            id="is-emergency"
            label="Medical or Emergency situation (Applies same-day approval exception)"
            checked={isEmergency}
            onChange={(e) => setIsEmergency(e.target.checked)}
          />
        </div>

        <Textarea
          id="leave-reason"
          label="Reason for Leave"
          rows={3}
          placeholder="Enter reason or handover details..."
          value={reason}
          onChange={(e) => setReason(e.target.value)}
        />

        {/* Dynamic Calculation & Rule Routing Preview Card */}
        <div className="rounded-lg border border-slate-200 bg-slate-50 p-4 space-y-3">
          <div className="flex items-center justify-between border-b border-slate-200 pb-2">
            <h4 className="text-xs font-semibold uppercase tracking-wider text-slate-700">
              Live Policy & Routing Evaluation
            </h4>
            {previewLoading && <Spinner size="sm" />}
          </div>

          {previewError ? (
            <p className="text-xs text-rose-600 font-medium">
              {errorMessage(previewError, "Could not evaluate leave calculation.")}
            </p>
          ) : preview ? (
            <div className="space-y-2 text-xs">
              {/* Duration and Sandwich Details */}
              <div className="flex flex-wrap items-center justify-between gap-2">
                <div>
                  <span className="font-semibold text-slate-800">Calculated Leave Duration: </span>
                  <span className="font-bold text-indigo-700 text-sm">
                    {preview.duration.calculatedDays} {preview.duration.calculatedDays === 1 ? "Day" : "Days"}
                  </span>
                  <span className="text-slate-500 ml-1">
                    ({preview.duration.totalCalendarDays} calendar days, {preview.duration.workingDaysCount} working days)
                  </span>
                </div>

                {preview.duration.isSandwiched ? (
                  <span className="inline-flex items-center px-2 py-0.5 rounded text-xs font-medium bg-amber-100 text-amber-800">
                    Sandwich Rule Applied (Intervening weekly off counted)
                  </span>
                ) : (
                  preview.duration.weeklyOffCount > 0 && (
                    <span className="inline-flex items-center px-2 py-0.5 rounded text-xs font-medium bg-emerald-100 text-emerald-800">
                      Weekly Off Excluded ({preview.duration.weeklyOffCount} day exempt)
                    </span>
                  )
                )}
              </div>

              {/* Notice Period Check */}
              <div
                className={`p-2 rounded text-xs font-medium ${
                  preview.notice.isValid
                    ? "bg-emerald-50 text-emerald-800 border border-emerald-200"
                    : "bg-amber-50 text-amber-800 border border-amber-200"
                }`}
              >
                {preview.notice.message}
              </div>

              {/* Dynamic Approval Routing */}
              <div className="grid grid-cols-1 md:grid-cols-2 gap-2 pt-1 border-t border-slate-200">
                <div>
                  <span className="text-slate-500">Routing Policy: </span>
                  <span className="font-medium text-slate-800">
                    {preview.matchedRule?.name || "Standard Workflow"}
                  </span>
                </div>

                <div>
                  <span className="text-slate-500">Approver: </span>
                  <span className="font-semibold text-slate-900">
                    {preview.approval?.approverLabel || "Pending Assignment"}
                  </span>
                </div>
              </div>

              {preview.balance?.message && (
                <div className="text-slate-600 pt-1">
                  <span className="font-medium">Balance Status: </span>
                  {preview.balance.message}
                </div>
              )}
            </div>
          ) : null}
        </div>

        <div className="flex justify-end gap-3 pt-2">
          <Button type="button" variant="outline" onClick={onClose} disabled={submitting}>
            Cancel
          </Button>
          <Button type="submit" variant="primary" loading={submitting}>
            Submit Leave Application
          </Button>
        </div>
      </form>
    </Modal>
  );
}

