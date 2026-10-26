import { useState, useEffect } from "react";

import Button from "../../../components/ui/Button.jsx";
import EmptyState from "../../../components/ui/EmptyState.jsx";
import Modal from "../../../components/ui/Modal.jsx";
import FormField from "../../../components/ui/FormField.jsx";
import TextInput from "../../../components/ui/TextInput.jsx";
import Select from "../../../components/ui/Select.jsx";
import { Skeleton } from "../../../components/ui/LoadingState.jsx";
import { useToast } from "../../../components/ui/ToastProvider.jsx";
import { adminLeave, leave } from "../../../services/resources.js";

function BalancesPage() {
  const { notify } = useToast();
  const [balances, setBalances] = useState([]);
  const [loading, setLoading] = useState(true);
  const [search, setSearch] = useState("");

  // Adjust Modal
  const [adjustTarget, setAdjustTarget] = useState(null);
  const [adjustQuantity, setAdjustQuantity] = useState("");
  const [adjustType, setAdjustType] = useState("ADJUSTMENT");
  const [adjustReason, setAdjustReason] = useState("");
  const [adjusting, setAdjusting] = useState(false);

  // Ledger Modal
  const [ledgerTarget, setLedgerTarget] = useState(null);
  const [ledgerEntries, setLedgerEntries] = useState([]);
  const [ledgerLoading, setLedgerLoading] = useState(false);

  useEffect(() => {
    loadBalances();
  }, []);

  async function loadBalances() {
    setLoading(true);
    try {
      const res = await adminLeave.listBalances();
      setBalances(res.data || []);
    } catch (err) {
      notify({ tone: "danger", message: err.message || "Failed to load balances" });
    } finally {
      setLoading(false);
    }
  }

  async function handleAdjustSubmit(e) {
    e.preventDefault();
    if (!adjustTarget || !adjustQuantity || !adjustReason.trim()) {
      notify({ tone: "warning", message: "Please enter quantity and a mandatory reason." });
      return;
    }

    setAdjusting(true);
    try {
      await adminLeave.adjustBalance({
        balanceId: adjustTarget.id,
        quantity: Number(adjustQuantity),
        transactionType: adjustType,
        reason: adjustReason.trim(),
      });
      notify({ tone: "success", message: `Balance updated for ${adjustTarget.user_name}.` });
      setAdjustTarget(null);
      setAdjustQuantity("");
      setAdjustReason("");
      loadBalances();
    } catch (err) {
      notify({ tone: "danger", message: err.message || "Adjustment failed" });
    } finally {
      setAdjusting(false);
    }
  }

  async function openLedger(b) {
    setLedgerTarget(b);
    setLedgerLoading(true);
    try {
      const res = await leave.balanceLedger(b.id);
      setLedgerEntries(res.data || []);
    } catch {
      setLedgerEntries([]);
    } finally {
      setLedgerLoading(false);
    }
  }

  const filtered = balances.filter(
    (b) =>
      b.user_name?.toLowerCase().includes(search.toLowerCase()) ||
      b.user_email?.toLowerCase().includes(search.toLowerCase()) ||
      b.leave_type_name?.toLowerCase().includes(search.toLowerCase())
  );

  return (
    <div className="space-y-6">
      <div className="flex flex-col gap-4 sm:flex-row sm:items-center sm:justify-between">
        <div>
          <h2 className="text-xl font-bold text-ink">Employee Leave Balances</h2>
          <p className="text-sm text-ink-soft">
            Audit and manage quota ledger accounts for staff across all departments.
          </p>
        </div>

        <div className="w-full sm:w-64">
          <TextInput
            placeholder="Search employee or type..."
            value={search}
            onChange={(e) => setSearch(e.target.value)}
          />
        </div>
      </div>

      {loading ? (
        <Skeleton className="h-64 w-full" />
      ) : filtered.length === 0 ? (
        <EmptyState
          title="No balances found"
          description={search ? "No records match your search criteria." : "No employee balances exist yet."}
        />
      ) : (
        <div className="overflow-x-auto rounded-card border border-line bg-surface">
          <table className="w-full text-left text-sm">
            <thead className="border-b border-line bg-surface-soft text-xs font-semibold text-ink-muted">
              <tr>
                <th className="px-4 py-3">Employee</th>
                <th className="px-4 py-3">Leave Type</th>
                <th className="px-4 py-3">Opening</th>
                <th className="px-4 py-3">Accrued</th>
                <th className="px-4 py-3">Adjusted</th>
                <th className="px-4 py-3">Consumed</th>
                <th className="px-4 py-3">Available Closing</th>
                <th className="px-4 py-3 text-right">Actions</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-line text-ink">
              {filtered.map((b) => (
                <tr key={b.id} className="hover:bg-surface-soft/40">
                  <td className="px-4 py-3">
                    <span className="font-semibold text-ink block">{b.user_name}</span>
                    <span className="text-xs text-ink-soft">{b.user_email}</span>
                  </td>
                  <td className="px-4 py-3">{b.leave_type_name}</td>
                  <td className="px-4 py-3 text-ink-soft">{b.opening_balance}</td>
                  <td className="px-4 py-3 text-ink-soft">{b.accrued}</td>
                  <td className="px-4 py-3 text-ink-soft">{b.adjusted}</td>
                  <td className="px-4 py-3 font-medium text-rose-600">{b.consumed}</td>
                  <td className="px-4 py-3 font-bold text-brand">
                    {b.closing_balance} {b.unit}(s)
                  </td>
                  <td className="px-4 py-3 text-right">
                    <div className="flex items-center justify-end gap-3 text-xs font-medium">
                      <button
                        type="button"
                        onClick={() => openLedger(b)}
                        className="cursor-pointer text-ink-soft hover:text-ink hover:underline"
                      >
                        Ledger
                      </button>
                      <button
                        type="button"
                        onClick={() => {
                          setAdjustTarget(b);
                          setAdjustQuantity("");
                          setAdjustReason("");
                        }}
                        className="cursor-pointer text-brand hover:underline"
                      >
                        Adjust
                      </button>
                    </div>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}

      {/* Adjust Modal */}
      {adjustTarget && (
        <Modal
          isOpen={Boolean(adjustTarget)}
          onClose={() => setAdjustTarget(null)}
          title={`Adjust Balance: ${adjustTarget.user_name} (${adjustTarget.leave_type_name})`}
        >
          <form onSubmit={handleAdjustSubmit} className="space-y-4">
            <p className="text-xs text-ink-soft">
              Current Available Balance: <span className="font-bold text-ink">{adjustTarget.closing_balance} {adjustTarget.unit}(s)</span>.
              Every manual adjustment creates an auditable transaction in the ledger.
            </p>

            <FormField label="Adjustment Type" required>
              <Select value={adjustType} onChange={(e) => setAdjustType(e.target.value)}>
                <option value="ADJUSTMENT">ADJUSTMENT (Manual Correction)</option>
                <option value="ACCRUAL">ACCRUAL (Additional Credit)</option>
                <option value="CARRY_FORWARD">CARRY_FORWARD</option>
                <option value="EXPIRY">EXPIRY (Lapse unused balance)</option>
                <option value="ENCASHMENT">ENCASHMENT</option>
              </Select>
            </FormField>

            <FormField label="Quantity (Delta: positive to add, negative to deduct)" required>
              <TextInput
                type="number"
                step="0.5"
                placeholder="e.g. 2 or -1"
                value={adjustQuantity}
                onChange={(e) => setAdjustQuantity(e.target.value)}
              />
            </FormField>

            <FormField label="Reason & Reference" required>
              <TextInput
                placeholder="e.g. Compensatory credit / Administrative correction"
                value={adjustReason}
                onChange={(e) => setAdjustReason(e.target.value)}
              />
            </FormField>

            <div className="flex justify-end gap-3 pt-3">
              <Button type="button" tone="neutral" variant="outline" onClick={() => setAdjustTarget(null)}>
                Cancel
              </Button>
              <Button type="submit" tone="brand" disabled={adjusting}>
                {adjusting ? "Applying..." : "Apply Adjustment"}
              </Button>
            </div>
          </form>
        </Modal>
      )}

      {/* Ledger Modal */}
      {ledgerTarget && (
        <Modal
          isOpen={Boolean(ledgerTarget)}
          onClose={() => setLedgerTarget(null)}
          title={`Ledger: ${ledgerTarget.user_name} (${ledgerTarget.leave_type_name})`}
        >
          <div className="space-y-4">
            {ledgerLoading ? (
              <Skeleton className="h-40 w-full" />
            ) : ledgerEntries.length === 0 ? (
              <p className="text-sm text-ink-soft">No transactions found for this account.</p>
            ) : (
              <div className="max-h-80 overflow-y-auto">
                <table className="w-full text-left text-xs">
                  <thead className="border-b border-line text-ink-muted">
                    <tr>
                      <th className="py-2">Date</th>
                      <th className="py-2">Type</th>
                      <th className="py-2">Quantity</th>
                      <th className="py-2">Reference</th>
                      <th className="py-2">Author</th>
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
                        <td className="py-2 text-ink-soft">{tx.created_by_name || "System"}</td>
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

export default BalancesPage;
