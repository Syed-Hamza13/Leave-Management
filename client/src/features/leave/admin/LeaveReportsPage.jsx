import { useState, useEffect } from "react";

import Badge from "../../../components/ui/Badge.jsx";
import Button from "../../../components/ui/Button.jsx";
import EmptyState from "../../../components/ui/EmptyState.jsx";
import Select from "../../../components/ui/Select.jsx";
import { Skeleton } from "../../../components/ui/LoadingState.jsx";
import { useToast } from "../../../components/ui/ToastProvider.jsx";
import { adminLeave } from "../../../services/resources.js";

function LeaveReportsPage() {
  const { notify } = useToast();
  const [activeTab, setActiveTab] = useState("summary");
  const [summaries, setSummaries] = useState([]);
  const [register, setRegister] = useState([]);
  const [loading, setLoading] = useState(true);

  const [selectedMonth, setSelectedMonth] = useState(new Date().getMonth() + 1);
  const [selectedYear, setSelectedYear] = useState(new Date().getFullYear());

  useEffect(() => {
    if (activeTab === "summary") {
      loadSummary();
    } else {
      loadRegister();
    }
  }, [activeTab, selectedMonth, selectedYear]);

  async function loadSummary() {
    setLoading(true);
    try {
      const res = await adminLeave.summaryReport();
      setSummaries(res.data || []);
    } catch (err) {
      notify({ tone: "danger", message: err.message || "Failed to load leave summaries" });
    } finally {
      setLoading(false);
    }
  }

  async function loadRegister() {
    setLoading(true);
    try {
      const res = await adminLeave.monthlyRegister({ year: selectedYear, month: selectedMonth });
      setRegister(res.data || []);
    } catch (err) {
      notify({ tone: "danger", message: err.message || "Failed to load monthly register" });
    } finally {
      setLoading(false);
    }
  }

  return (
    <div className="space-y-6">
      <div>
        <h2 className="text-xl font-bold text-ink">Institutional Leave Reports</h2>
        <p className="text-sm text-ink-soft">
          Statutory reports and registers fulfilling monthly reporting requirements.
        </p>
      </div>

      {/* Tabs */}
      <div className="flex border-b border-line">
        <button
          type="button"
          onClick={() => setActiveTab("summary")}
          className={`cursor-pointer px-4 py-2.5 text-xs font-semibold border-b-2 transition-colors ${
            activeTab === "summary"
              ? "border-brand text-brand"
              : "border-transparent text-ink-soft hover:text-ink"
          }`}
        >
          Employee Leave Summary Quotas
        </button>
        <button
          type="button"
          onClick={() => setActiveTab("register")}
          className={`cursor-pointer px-4 py-2.5 text-xs font-semibold border-b-2 transition-colors ${
            activeTab === "register"
              ? "border-brand text-brand"
              : "border-transparent text-ink-soft hover:text-ink"
          }`}
        >
          Monthly Leave Register
        </button>
      </div>

      {/* Tab 1: Summary */}
      {activeTab === "summary" && (
        <div className="space-y-4">
          <div className="flex justify-between items-center">
            <p className="text-xs text-ink-soft">
              Consolidated employee quota balances across all active categories.
            </p>
            <Button tone="neutral" variant="outline" onClick={loadSummary}>
              Refresh
            </Button>
          </div>

          {loading ? (
            <Skeleton className="h-64 w-full" />
          ) : summaries.length === 0 ? (
            <EmptyState title="No summary records available" description="No balance records were returned." />
          ) : (
            <div className="overflow-x-auto rounded-card border border-line bg-surface">
              <table className="w-full text-left text-sm">
                <thead className="border-b border-line bg-surface-soft text-xs font-semibold text-ink-muted">
                  <tr>
                    <th className="px-4 py-3">Employee</th>
                    <th className="px-4 py-3">Category</th>
                    <th className="px-4 py-3">Opening</th>
                    <th className="px-4 py-3">Accrued</th>
                    <th className="px-4 py-3">Consumed</th>
                    <th className="px-4 py-3">Closing Balance</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-line text-ink">
                  {summaries.map((s, idx) => (
                    <tr key={idx} className="hover:bg-surface-soft/40">
                      <td className="px-4 py-3">
                        <span className="font-semibold block">{s.employee_name}</span>
                        <span className="text-xs text-ink-soft">{s.employee_email}</span>
                      </td>
                      <td className="px-4 py-3 font-medium">{s.leave_type_name}</td>
                      <td className="px-4 py-3 text-ink-soft">{s.opening_balance}</td>
                      <td className="px-4 py-3 text-ink-soft">{s.accrued}</td>
                      <td className="px-4 py-3 font-medium text-rose-600">{s.consumed}</td>
                      <td className="px-4 py-3 font-bold text-brand">
                        {s.closing_balance} {s.unit}(s)
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          )}
        </div>
      )}

      {/* Tab 2: Monthly Register */}
      {activeTab === "register" && (
        <div className="space-y-4">
          <div className="flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
            <p className="text-xs text-ink-soft">
              Detailed chronological record of all leaves taken within the selected calendar month.
            </p>

            <div className="flex items-center gap-2">
              <Select
                value={selectedMonth}
                onChange={(e) => setSelectedMonth(Number(e.target.value))}
              >
                {[
                  "January",
                  "February",
                  "March",
                  "April",
                  "May",
                  "June",
                  "July",
                  "August",
                  "September",
                  "October",
                  "November",
                  "December",
                ].map((m, idx) => (
                  <option key={idx + 1} value={idx + 1}>
                    {m}
                  </option>
                ))}
              </Select>

              <Select
                value={selectedYear}
                onChange={(e) => setSelectedYear(Number(e.target.value))}
              >
                {[2025, 2026, 2027].map((y) => (
                  <option key={y} value={y}>
                    {y}
                  </option>
                ))}
              </Select>
            </div>
          </div>

          {loading ? (
            <Skeleton className="h-64 w-full" />
          ) : register.length === 0 ? (
            <EmptyState
              title="No leaves recorded for this period"
              description="Zero employee leaves were recorded for the selected month."
            />
          ) : (
            <div className="overflow-x-auto rounded-card border border-line bg-surface">
              <table className="w-full text-left text-sm">
                <thead className="border-b border-line bg-surface-soft text-xs font-semibold text-ink-muted">
                  <tr>
                    <th className="px-4 py-3">Application #</th>
                    <th className="px-4 py-3">Employee</th>
                    <th className="px-4 py-3">Category</th>
                    <th className="px-4 py-3">Period</th>
                    <th className="px-4 py-3">Charged Units</th>
                    <th className="px-4 py-3">Status</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-line text-ink">
                  {register.map((r) => (
                    <tr key={r.id} className="hover:bg-surface-soft/40">
                      <td className="px-4 py-3 font-mono font-medium text-brand">
                        {r.application_number}
                      </td>
                      <td className="px-4 py-3">
                        <span className="font-semibold block">{r.employee_name}</span>
                        <span className="text-xs text-ink-soft">{r.employee_email}</span>
                      </td>
                      <td className="px-4 py-3">{r.leave_type_name}</td>
                      <td className="px-4 py-3 text-xs text-ink-soft">
                        {r.start_date} to {r.end_date}
                      </td>
                      <td className="px-4 py-3 font-semibold">
                        {r.calculated_units} {r.unit}(s)
                      </td>
                      <td className="px-4 py-3">
                        <Badge tone={r.status === "APPROVED" ? "success" : "neutral"}>
                          {r.status}
                        </Badge>
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          )}
        </div>
      )}
    </div>
  );
}

export default LeaveReportsPage;
