import { useEffect, useState } from "react";
import { Link } from "react-router-dom";

import Badge from "../../components/ui/Badge.jsx";
import Button from "../../components/ui/Button.jsx";
import EmptyState from "../../components/ui/EmptyState.jsx";
import { Skeleton } from "../../components/ui/LoadingState.jsx";
import Modal from "../../components/ui/Modal.jsx";
import DataTable from "../../components/ui/DataTable.jsx";
import { usePermissions } from "../permissions/PermissionsContext.js";
import { PERMISSIONS } from "../../lib/permissions.js";
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

function LeaveDashboardPage() {
  const { can } = usePermissions();
  const [data, setData] = useState(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState(null);

  // Ledger modal
  const [activeLedgerBalance, setActiveLedgerBalance] = useState(null);
  const [ledgerEntries, setLedgerEntries] = useState([]);
  const [ledgerLoading, setLedgerLoading] = useState(false);

  useEffect(() => {
    loadDashboard();
  }, []);

  async function loadDashboard() {
    setLoading(true);
    setError(null);
    try {
      const res = await leave.dashboard();
      setData(res.data);
    } catch (err) {
      setError(err.message || "Failed to load leave dashboard");
    } finally {
      setLoading(false);
    }
  }

  async function openLedger(balance) {
    setActiveLedgerBalance(balance);
    setLedgerLoading(true);
    try {
      const res = await leave.balanceLedger(balance.id);
      setLedgerEntries(res.data || []);
    } catch {
      setLedgerEntries([]);
    } finally {
      setLedgerLoading(false);
    }
  }

  if (loading) {
    return (
      <div className="space-y-6">
        <Skeleton className="h-32 w-full" />
        <div className="grid gap-4 sm:grid-cols-3">
          <Skeleton className="h-28" />
          <Skeleton className="h-28" />
          <Skeleton className="h-28" />
        </div>
        <Skeleton className="h-64 w-full" />
      </div>
    );
  }

  if (error) {
    return <EmptyState title="Could not load leave information" description={error} />;
  }

  const { summary, balances = [], recentApplications = [], pendingApprovals = [] } = data || {};

  return (
    <div className="space-y-8">
      {/* Top Action & Overview Card */}
      <section className="flex flex-col gap-4 rounded-card border border-line bg-surface p-6 shadow-xs sm:flex-row sm:items-center sm:justify-between">
        <div>
          <h2 className="text-lg font-semibold text-ink">Leave Overview</h2>
          <p className="text-sm text-ink-soft">
            Manage your institutional absences, check remaining quotas, and review approval queues.
          </p>
        </div>
        <div className="flex flex-wrap items-center gap-3">
          {can(PERMISSIONS.LEAVE_APPLY) && (
            <Link to="/leave/apply">
              <Button tone="brand">Apply for Leave</Button>
            </Link>
          )}
          {can(PERMISSIONS.LEAVE_CALENDAR_VIEW) && (
            <Link to="/leave/calendar">
              <Button tone="neutral" variant="outline">
                Team Calendar
              </Button>
            </Link>
          )}
        </div>
      </section>

      {/* Summary KPI Cards */}
      <section className="grid gap-4 sm:grid-cols-2 lg:grid-cols-4">
        <div className="rounded-card border border-line bg-surface p-4">
          <span className="text-xs font-semibold uppercase tracking-wider text-ink-muted">
            Available Units
          </span>
          <div className="mt-2 flex items-baseline gap-2">
            <span className="text-2xl font-bold text-ink">{summary?.availableUnits ?? 0}</span>
            <span className="text-xs text-ink-soft">days / hours</span>
          </div>
          <p className="mt-1 text-xs text-ink-soft">Total accumulated balance</p>
        </div>

        <div className="rounded-card border border-line bg-surface p-4">
          <span className="text-xs font-semibold uppercase tracking-wider text-ink-muted">
            Consumed This Year
          </span>
          <div className="mt-2 flex items-baseline gap-2">
            <span className="text-2xl font-bold text-ink">{summary?.usedUnits ?? 0}</span>
            <span className="text-xs text-ink-soft">used</span>
          </div>
          <p className="mt-1 text-xs text-ink-soft">Approved absences to date</p>
        </div>

        <div className="rounded-card border border-line bg-surface p-4">
          <span className="text-xs font-semibold uppercase tracking-wider text-ink-muted">
            Pending Requests
          </span>
          <div className="mt-2 flex items-baseline gap-2">
            <span className="text-2xl font-bold text-ink">{summary?.pendingCount ?? 0}</span>
            <span className="text-xs text-ink-soft">in review</span>
          </div>
          <p className="mt-1 text-xs text-ink-soft">Awaiting supervisory sign-off</p>
        </div>

        {can(PERMISSIONS.LEAVE_APPROVE) && (
          <div className="rounded-card border border-line bg-surface p-4">
            <span className="text-xs font-semibold uppercase tracking-wider text-ink-muted">
              Approval Queue
            </span>
            <div className="mt-2 flex items-baseline gap-2">
              <span className="text-2xl font-bold text-ink">
                {summary?.approvalQueueCount ?? 0}
              </span>
              <span className="text-xs text-ink-soft">requiring action</span>
            </div>
            <Link
              to="/leave/approvals"
              className="mt-1 inline-block text-xs font-medium text-brand hover:underline"
            >
              Go to Approvals &rarr;
            </Link>
          </div>
        )}
      </section>

      {/* Leave Quota Cards */}
      <section className="space-y-3">
        <h3 className="text-base font-semibold text-ink">My Leave Balances</h3>
        {balances.length === 0 ? (
          <p className="text-sm text-ink-soft">No leave balance accounts assigned.</p>
        ) : (
          <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-3">
            {balances.map((b) => {
              const available = Number(b.closing_balance || 0);
              const opening = Number(b.opening_balance || 0);
              const consumed = Number(b.consumed || 0);
              const max = opening > 0 ? opening : Math.max(available + consumed, 1);
              const pct = Math.min(100, Math.max(0, Math.round((available / max) * 100)));

              return (
                <div
                  key={b.id}
                  className="flex flex-col justify-between rounded-card border border-line bg-surface p-4 transition-shadow hover:shadow-xs"
                >
                  <div>
                    <div className="flex items-center justify-between">
                      <h4 className="text-sm font-semibold text-ink">{b.leave_type_name}</h4>
                      <Badge tone={b.paid_status === "paid" ? "success" : "neutral"}>
                        {b.paid_status}
                      </Badge>
                    </div>

                    <div className="mt-4 flex items-baseline gap-1.5">
                      <span className="text-3xl font-extrabold text-ink">{available}</span>
                      <span className="text-xs text-ink-soft">
                        / {opening} {b.leave_unit}(s) available
                      </span>
                    </div>

                    {/* Progress bar */}
                    <div className="mt-3 h-2 w-full overflow-hidden rounded-full bg-line">
                      <div
                        className="h-full bg-brand transition-all duration-300"
                        style={{ width: `${pct}%` }}
                      />
                    </div>
                  </div>

                  <div className="mt-4 flex items-center justify-between border-t border-line pt-3 text-xs text-ink-soft">
                    <span>Used: {consumed} {b.leave_unit}(s)</span>
                    <button
                      type="button"
                      onClick={() => openLedger(b)}
                      className="cursor-pointer font-medium text-brand hover:underline"
                    >
                      View Ledger
                    </button>
                  </div>
                </div>
              );
            })}
          </div>
        )}
      </section>

      {/* Recent Applications Table */}
      <section className="space-y-3">
        <div className="flex items-center justify-between">
          <h3 className="text-base font-semibold text-ink">Recent Leave Applications</h3>
          <Link
            to="/leave/my-leaves"
            className="text-xs font-medium text-brand hover:underline"
          >
            View all &rarr;
          </Link>
        </div>

        {recentApplications.length === 0 ? (
          <EmptyState
            title="No recent leave applications"
            description="You haven't submitted any leave requests yet. Click 'Apply for Leave' to get started."
          />
        ) : (
          <div className="overflow-x-auto rounded-card border border-line bg-surface">
            <table className="w-full text-left text-sm">
              <thead className="border-b border-line bg-surface-soft text-xs font-semibold text-ink-muted">
                <tr>
                  <th className="px-4 py-3">Application #</th>
                  <th className="px-4 py-3">Leave Type</th>
                  <th className="px-4 py-3">Dates</th>
                  <th className="px-4 py-3">Duration</th>
                  <th className="px-4 py-3">Status</th>
                  <th className="px-4 py-3">Submitted</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-line text-ink">
                {recentApplications.map((app) => (
                  <tr key={app.id} className="hover:bg-surface-soft/50">
                    <td className="px-4 py-3 font-medium text-brand">{app.application_number}</td>
                    <td className="px-4 py-3">{app.leave_type_name}</td>
                    <td className="px-4 py-3 text-ink-soft">
                      {app.start_date} to {app.end_date}
                    </td>
                    <td className="px-4 py-3 font-medium">
                      {app.calculated_units} {app.unit}(s)
                    </td>
                    <td className="px-4 py-3">
                      <Badge tone={getStatusTone(app.status)}>{app.status}</Badge>
                    </td>
                    <td className="px-4 py-3 text-ink-soft">
                      {new Date(app.submitted_at || app.created_at).toLocaleDateString()}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </section>

      {/* Balance Ledger Modal */}
      {activeLedgerBalance && (
        <Modal
          isOpen={Boolean(activeLedgerBalance)}
          onClose={() => setActiveLedgerBalance(null)}
          title={`Ledger: ${activeLedgerBalance.leave_type_name}`}
        >
          <div className="space-y-4">
            <p className="text-xs text-ink-soft">
              Immutable transaction ledger accounting for every quota grant, deduction, and reversal.
            </p>
            {ledgerLoading ? (
              <Skeleton className="h-40 w-full" />
            ) : ledgerEntries.length === 0 ? (
              <p className="text-sm text-ink-soft">No transactions recorded on this balance yet.</p>
            ) : (
              <div className="max-h-80 overflow-y-auto">
                <table className="w-full text-left text-xs">
                  <thead className="border-b border-line text-ink-muted">
                    <tr>
                      <th className="py-2">Date</th>
                      <th className="py-2">Type</th>
                      <th className="py-2">Quantity</th>
                      <th className="py-2">Reference</th>
                    </tr>
                  </thead>
                  <tbody className="divide-y divide-line text-ink">
                    {ledgerEntries.map((tx) => (
                      <tr key={tx.id}>
                        <td className="py-2 text-ink-soft">
                          {new Date(tx.created_at).toLocaleDateString()}
                        </td>
                        <td className="py-2 font-medium">{tx.transaction_type}</td>
                        <td
                          className={`py-2 font-semibold ${
                            Number(tx.quantity) >= 0 ? "text-emerald-600" : "text-rose-600"
                          }`}
                        >
                          {Number(tx.quantity) >= 0 ? `+${tx.quantity}` : tx.quantity}
                        </td>
                        <td className="py-2 text-ink-soft">{tx.reference || "—"}</td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            )}
          </div>
        </Modal>
      )}
    </div>
  );
}

export default LeaveDashboardPage;
