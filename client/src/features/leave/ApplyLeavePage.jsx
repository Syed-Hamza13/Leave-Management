import { useState, useEffect } from "react";
import { useNavigate } from "react-router-dom";

import Button from "../../components/ui/Button.jsx";
import FormField from "../../components/ui/FormField.jsx";
import TextInput from "../../components/ui/TextInput.jsx";
import Textarea from "../../components/ui/Textarea.jsx";
import Select from "../../components/ui/Select.jsx";
import DateInput from "../../components/ui/DateInput.jsx";
import Toggle from "../../components/ui/Toggle.jsx";
import Badge from "../../components/ui/Badge.jsx";
import { Skeleton } from "../../components/ui/LoadingState.jsx";
import { useToast } from "../../components/ui/ToastProvider.jsx";
import { leave } from "../../services/resources.js";

function ApplyLeavePage() {
  const navigate = useNavigate();
  const { notify } = useToast();

  const [types, setTypes] = useState([]);
  const [typesLoading, setTypesLoading] = useState(true);

  // Form State
  const [selectedTypeId, setSelectedTypeId] = useState("");
  const [startDate, setStartDate] = useState("");
  const [endDate, setEndDate] = useState("");
  const [reason, setReason] = useState("");
  const [emergencyFlag, setEmergencyFlag] = useState(false);
  const [isHalfDay, setIsHalfDay] = useState(false);
  const [halfDayType, setHalfDayType] = useState("FIRST_HALF");
  const [hours, setHours] = useState(2);

  // Calculation Preview State
  const [preview, setPreview] = useState(null);
  const [calculating, setCalculating] = useState(false);
  const [submitting, setSubmitting] = useState(false);
  const [submitError, setSubmitError] = useState(null);

  useEffect(() => {
    loadTypes();
  }, []);

  async function loadTypes() {
    try {
      const res = await leave.types();
      const list = res.data || [];
      setTypes(list);
      if (list.length > 0) {
        setSelectedTypeId(String(list[0].id));
      }
    } catch {
      notify({ tone: "danger", message: "Failed to load leave types" });
    } finally {
      setTypesLoading(false);
    }
  }

  const selectedType = types.find((t) => String(t.id) === String(selectedTypeId));
  const isHourly = selectedType?.unit === "hour";

  // Debounced Live Calculation Preview
  useEffect(() => {
    if (!selectedTypeId || !startDate || !endDate) {
      setPreview(null);
      return;
    }

    if (new Date(endDate) < new Date(startDate)) {
      setPreview(null);
      return;
    }

    let active = true;
    setCalculating(true);
    setSubmitError(null);

    const timer = setTimeout(async () => {
      try {
        const res = await leave.calculate({
          leaveTypeId: Number(selectedTypeId),
          startDate,
          endDate,
          emergencyFlag,
          isHalfDay: !isHourly && isHalfDay,
          halfDayType: !isHourly && isHalfDay ? halfDayType : undefined,
          hours: isHourly ? Number(hours) : undefined,
        });

        if (active) {
          setPreview(res.data);
        }
      } catch (err) {
        if (active) {
          setPreview({
            passed: false,
            violations: [err.message || "Failed to calculate leave duration"],
          });
        }
      } finally {
        if (active) setCalculating(false);
      }
    }, 300);

    return () => {
      active = false;
      clearTimeout(timer);
    };
  }, [selectedTypeId, startDate, endDate, emergencyFlag, isHalfDay, halfDayType, hours, isHourly]);

  async function handleSubmit(e) {
    e.preventDefault();
    if (!selectedTypeId || !startDate || !endDate || !reason.trim()) {
      notify({ tone: "warning", message: "Please fill in all required fields." });
      return;
    }

    setSubmitting(true);
    setSubmitError(null);

    try {
      const payload = {
        leaveTypeId: Number(selectedTypeId),
        startDate,
        endDate,
        reason: reason.trim(),
        emergencyFlag,
        isHalfDay: !isHourly && isHalfDay,
        halfDayType: !isHourly && isHalfDay ? halfDayType : undefined,
        hours: isHourly ? Number(hours) : undefined,
      };

      const res = await leave.submit(payload);
      notify({ tone: "success", message: `Leave request ${res.data.application_number} submitted!` });
      navigate("/leave/my-leaves");
    } catch (err) {
      const message = err.data?.errors?.rules?.join(" ") || err.message || "Failed to submit leave application";
      setSubmitError(message);
      notify({ tone: "danger", message });
    } finally {
      setSubmitting(false);
    }
  }

  if (typesLoading) {
    return <Skeleton className="h-64 w-full" />;
  }

  return (
    <div className="mx-auto max-w-4xl space-y-8">
      <div>
        <h2 className="text-xl font-bold text-ink">Apply for Leave</h2>
        <p className="text-sm text-ink-soft">
          Complete the guided request below. The engine calculates working days, excluded holidays, and rule compliance in real-time.
        </p>
      </div>

      <div className="grid gap-8 lg:grid-cols-5">
        {/* Form Column */}
        <form onSubmit={handleSubmit} className="space-y-6 lg:col-span-3">
          <div className="rounded-card border border-line bg-surface p-6 space-y-5">
            <h3 className="text-sm font-semibold uppercase tracking-wider text-ink-muted">
              1. Leave Category & Dates
            </h3>

            {/* Leave Type */}
            <Select
              id="leave-type-select"
              name="leave_type_id"
              label="Leave Type"
              required
              value={selectedTypeId}
              onChange={(e) => {
                setSelectedTypeId(e.target.value);
                const t = types.find((item) => String(item.id) === e.target.value);
                if (t?.unit === "hour") {
                  setIsHalfDay(false);
                }
              }}
            >
              {types.map((t) => (
                <option key={t.id} value={t.id}>
                  {t.name} ({t.unit})
                </option>
              ))}
            </Select>

            {selectedType?.description && (
              <p className="rounded-card bg-surface-soft p-3 text-xs text-ink-soft">
                {selectedType.description}
              </p>
            )}

            {/* Date Range */}
            <div className="grid gap-4 sm:grid-cols-2">
              <DateInput
                id="leave-start-date"
                name="start_date"
                label="Start Date"
                required
                value={startDate}
                onChange={(e) => {
                  setStartDate(e.target.value);
                  if (!endDate || new Date(endDate) < new Date(e.target.value)) {
                    setEndDate(e.target.value);
                  }
                }}
              />

              <DateInput
                id="leave-end-date"
                name="end_date"
                label="End Date"
                required
                value={endDate}
                min={startDate}
                onChange={(e) => setEndDate(e.target.value)}
              />
            </div>

            {/* Half Day Option */}
            {!isHourly && selectedType?.allows_half_day && startDate === endDate && (
              <div className="space-y-3 rounded-card border border-line bg-surface-soft/40 p-3.5">
                <Toggle
                  label="Half Day Leave"
                  checked={isHalfDay}
                  onChange={setIsHalfDay}
                  description="Take half a working day off"
                />

                {isHalfDay && (
                  <div className="pt-2">
                    <FormField label="Half Day Timing">
                      <Select
                        value={halfDayType}
                        onChange={(e) => setHalfDayType(e.target.value)}
                      >
                        <option value="FIRST_HALF">First Half (Morning Session)</option>
                        <option value="SECOND_HALF">Second Half (Afternoon Session)</option>
                      </Select>
                    </FormField>
                  </div>
                )}
              </div>
            )}

            {/* Hourly Units Option */}
            {isHourly && (
              <FormField label="Number of Hours" required>
                <TextInput
                  type="number"
                  min="1"
                  max="4"
                  step="1"
                  value={hours}
                  onChange={(e) => setHours(e.target.value)}
                />
              </FormField>
            )}
          </div>

          <div className="rounded-card border border-line bg-surface p-6 space-y-5">
            <h3 className="text-sm font-semibold uppercase tracking-wider text-ink-muted">
              2. Reason & Justification
            </h3>

            <Textarea
              id="leave-reason"
              name="reason"
              label="Reason for Leave"
              required
              rows={4}
              placeholder="State the purpose of your absence clearly..."
              value={reason}
              onChange={(e) => setReason(e.target.value)}
            />

            <Toggle
              label="Emergency / Unplanned Request"
              checked={emergencyFlag}
              onChange={setEmergencyFlag}
              description="Check this if applying same-day or within 24 hours due to an emergency"
            />
          </div>

          {submitError && (
            <div className="rounded-card border border-rose-200 bg-rose-50 p-4 text-xs text-rose-700">
              <span className="font-semibold">Submission Blocked: </span>
              {submitError}
            </div>
          )}

          <div className="flex items-center justify-end gap-3">
            <Button
              type="button"
              tone="neutral"
              variant="outline"
              onClick={() => navigate("/leave")}
            >
              Cancel
            </Button>
            <Button
              id="submit-leave-button"
              type="submit"
              tone="brand"
              disabled={submitting || (preview && !preview.passed)}
            >
              {submitting ? "Submitting..." : "Submit Leave Request"}
            </Button>
          </div>
        </form>

        {/* Live Preview Column */}
        <aside className="space-y-6 lg:col-span-2">
          <div className="sticky top-6 rounded-card border border-line bg-surface p-6 space-y-4 shadow-xs">
            <h3 className="text-sm font-semibold uppercase tracking-wider text-ink-muted">
              Calculation Preview
            </h3>

            {calculating ? (
              <div className="space-y-3">
                <Skeleton className="h-6 w-3/4" />
                <Skeleton className="h-16 w-full" />
                <Skeleton className="h-12 w-full" />
              </div>
            ) : !preview ? (
              <p className="text-xs text-ink-soft">
                Select your leave type and dates to preview calculated duration, working days, and rule compliance.
              </p>
            ) : (
              <div className="space-y-4 text-xs text-ink">
                {/* Metric Summary */}
                <div className="rounded-card bg-surface-soft p-3 space-y-2">
                  <div className="flex justify-between">
                    <span className="text-ink-soft">Calendar Days Span:</span>
                    <span className="font-semibold text-ink">{preview.calendarDays ?? 0}</span>
                  </div>
                  <div className="flex justify-between">
                    <span className="text-ink-soft">Working Days:</span>
                    <span className="font-semibold text-ink">{preview.workingDays ?? 0}</span>
                  </div>
                  {preview.holidaysExcluded?.length > 0 && (
                    <div className="flex justify-between text-emerald-600">
                      <span>Excluded Holidays:</span>
                      <span className="font-semibold">-{preview.holidaysExcluded.length}</span>
                    </div>
                  )}
                  {preview.sandwichDays?.length > 0 && (
                    <div className="flex justify-between text-amber-600">
                      <span>Sandwich Inclusions:</span>
                      <span className="font-semibold">+{preview.sandwichDays.length}</span>
                    </div>
                  )}
                  <div className="border-t border-line pt-2 flex justify-between font-bold text-sm text-ink">
                    <span>Counted Leave:</span>
                    <span className="text-brand">
                      {preview.calculatedUnits} {preview.unit}(s)
                    </span>
                  </div>
                </div>

                {/* Available Balance impact */}
                <div className="flex justify-between rounded-card border border-line p-3">
                  <span className="text-ink-soft">Current Balance:</span>
                  <span className="font-medium">
                    {preview.availableBalance} {preview.unit}(s)
                  </span>
                </div>

                {/* Sandwich Rule Tag */}
                {preview.isSandwichApplied && (
                  <div className="rounded-card border border-amber-200 bg-amber-50 p-2.5 text-amber-800">
                    <span className="font-semibold">Sandwich Rule Applied:</span> Span exceeds 7 days; intervening Sundays and holidays are counted towards leave.
                  </div>
                )}

                {/* Violations / Warnings */}
                {preview.violations?.length > 0 && (
                  <div className="space-y-1 rounded-card border border-rose-200 bg-rose-50 p-3 text-rose-700">
                    <span className="font-semibold">Rule Violations:</span>
                    <ul className="list-inside list-disc space-y-0.5">
                      {preview.violations.map((v, i) => (
                        <li key={i}>{v}</li>
                      ))}
                    </ul>
                  </div>
                )}

                {preview.warnings?.length > 0 && (
                  <div className="space-y-1 rounded-card border border-amber-200 bg-amber-50 p-3 text-amber-700">
                    <span className="font-semibold">Notices & Warnings:</span>
                    <ul className="list-inside list-disc space-y-0.5">
                      {preview.warnings.map((w, i) => (
                        <li key={i}>{w}</li>
                      ))}
                    </ul>
                  </div>
                )}

                {/* Approval Path Preview */}
                {preview.approvalPath?.length > 0 && (
                  <div className="space-y-2 border-t border-line pt-3">
                    <span className="text-xs font-semibold uppercase tracking-wider text-ink-muted">
                      Approval Path
                    </span>
                    <ol className="space-y-1.5 pl-2">
                      {preview.approvalPath.map((step, i) => (
                        <li key={i} className="flex items-center gap-2">
                          <span className="flex h-5 w-5 items-center justify-center rounded-full bg-brand-soft text-[10px] font-bold text-brand">
                            {step.stepOrder}
                          </span>
                          <span className="font-medium text-ink">{step.approverName}</span>
                          <span className="text-ink-soft">({step.approverType})</span>
                        </li>
                      ))}
                    </ol>
                  </div>
                )}
              </div>
            )}
          </div>
        </aside>
      </div>
    </div>
  );
}

export default ApplyLeavePage;
