import { useState, useEffect } from "react";

import Badge from "../../../components/ui/Badge.jsx";
import Button from "../../../components/ui/Button.jsx";
import EmptyState from "../../../components/ui/EmptyState.jsx";
import Modal from "../../../components/ui/Modal.jsx";
import FormField from "../../../components/ui/FormField.jsx";
import TextInput from "../../../components/ui/TextInput.jsx";
import DateInput from "../../../components/ui/DateInput.jsx";
import Select from "../../../components/ui/Select.jsx";
import { Skeleton } from "../../../components/ui/LoadingState.jsx";
import { useToast } from "../../../components/ui/ToastProvider.jsx";
import { adminLeave } from "../../../services/resources.js";

function CalendarsPage() {
  const { notify } = useToast();
  const [calendars, setCalendars] = useState([]);
  const [selectedCalendarId, setSelectedCalendarId] = useState("");
  const [holidays, setHolidays] = useState([]);
  const [loading, setLoading] = useState(true);

  // Add Holiday Modal
  const [holidayModalOpen, setHolidayModalOpen] = useState(false);
  const [holidayName, setHolidayName] = useState("");
  const [holidayDate, setHolidayDate] = useState("");
  const [holidayType, setHolidayType] = useState("mandatory");
  const [submittingHoliday, setSubmittingHoliday] = useState(false);

  useEffect(() => {
    loadCalendars();
  }, []);

  useEffect(() => {
    if (selectedCalendarId) {
      loadHolidays(selectedCalendarId);
    }
  }, [selectedCalendarId]);

  async function loadCalendars() {
    setLoading(true);
    try {
      const res = await adminLeave.listCalendars();
      const list = res.data || [];
      setCalendars(list);
      if (list.length > 0) {
        setSelectedCalendarId(String(list[0].id));
      }
    } catch (err) {
      notify({ tone: "danger", message: err.message || "Failed to load calendars" });
    } finally {
      setLoading(false);
    }
  }

  async function loadHolidays(calId) {
    try {
      const res = await adminLeave.listHolidays(calId);
      setHolidays(res.data || []);
    } catch {
      setHolidays([]);
    }
  }

  async function handleAddHoliday(e) {
    e.preventDefault();
    if (!holidayName.trim() || !holidayDate) return;

    setSubmittingHoliday(true);
    try {
      await adminLeave.addHoliday({
        calendarId: Number(selectedCalendarId),
        name: holidayName.trim(),
        holidayDate,
        holidayType,
      });
      notify({ tone: "success", message: `Holiday '${holidayName}' added.` });
      setHolidayModalOpen(false);
      setHolidayName("");
      setHolidayDate("");
      loadHolidays(selectedCalendarId);
    } catch (err) {
      notify({ tone: "danger", message: err.message || "Failed to add holiday" });
    } finally {
      setSubmittingHoliday(false);
    }
  }

  async function handleDeleteHoliday(id) {
    try {
      await adminLeave.deleteHoliday(id);
      notify({ tone: "success", message: "Holiday removed." });
      loadHolidays(selectedCalendarId);
    } catch (err) {
      notify({ tone: "danger", message: err.message || "Failed to delete holiday" });
    }
  }

  if (loading) {
    return <Skeleton className="h-64 w-full" />;
  }

  const selectedCal = calendars.find((c) => String(c.id) === String(selectedCalendarId));
  const workingDays = selectedCal?.working_days_json || {};

  return (
    <div className="space-y-8">
      <div>
        <h2 className="text-xl font-bold text-ink">Institutional Calendars & Holidays</h2>
        <p className="text-sm text-ink-soft">
          Configure weekly working pattern and gazetted institutional holidays used by the leave calculation engine.
        </p>
      </div>

      {/* Calendar Profile Card */}
      {selectedCal && (
        <div className="rounded-card border border-line bg-surface p-6 space-y-4 shadow-xs">
          <div className="flex flex-col gap-2 sm:flex-row sm:items-center sm:justify-between">
            <div>
              <h3 className="text-base font-semibold text-ink">{selectedCal.name}</h3>
              <p className="text-xs text-ink-soft">Timezone: {selectedCal.timezone}</p>
            </div>
            <Badge tone="success">ACTIVE WORKING CALENDAR</Badge>
          </div>

          <div className="border-t border-line pt-3">
            <span className="text-xs font-semibold uppercase tracking-wider text-ink-muted">
              Weekly Working Days Configuration
            </span>
            <div className="mt-2 grid grid-cols-7 gap-2 text-center text-xs">
              {["monday", "tuesday", "wednesday", "thursday", "friday", "saturday", "sunday"].map(
                (day) => {
                  const isWorking = workingDays[day] !== false;
                  return (
                    <div
                      key={day}
                      className={`rounded-card border p-2 ${
                        isWorking
                          ? "border-emerald-200 bg-emerald-50 text-emerald-800 font-semibold"
                          : "border-line bg-surface-soft text-ink-muted"
                      }`}
                    >
                      <span className="block uppercase text-[10px] tracking-wider">{day.slice(0, 3)}</span>
                      <span className="text-xs">{isWorking ? "Working" : "Off"}</span>
                    </div>
                  );
                }
              )}
            </div>
          </div>
        </div>
      )}

      {/* Holidays Section */}
      <div className="space-y-4">
        <div className="flex items-center justify-between">
          <div>
            <h3 className="text-base font-semibold text-ink">Institutional Holidays ({holidays.length})</h3>
            <p className="text-xs text-ink-soft">
              Excluded from ordinary leave charges; factored into sandwich rule calculations.
            </p>
          </div>
          <Button tone="brand" onClick={() => setHolidayModalOpen(true)}>
            Add Holiday
          </Button>
        </div>

        {holidays.length === 0 ? (
          <EmptyState
            title="No holidays configured"
            description="Add institutional holidays for the current calendar year."
          />
        ) : (
          <div className="overflow-x-auto rounded-card border border-line bg-surface">
            <table className="w-full text-left text-sm">
              <thead className="border-b border-line bg-surface-soft text-xs font-semibold text-ink-muted">
                <tr>
                  <th className="px-4 py-3">Holiday Name</th>
                  <th className="px-4 py-3">Date</th>
                  <th className="px-4 py-3">Type</th>
                  <th className="px-4 py-3 text-right">Actions</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-line text-ink">
                {holidays.map((h) => (
                  <tr key={h.id} className="hover:bg-surface-soft/40">
                    <td className="px-4 py-3 font-semibold">{h.name}</td>
                    <td className="px-4 py-3 font-mono text-xs text-ink-soft">{h.holiday_date}</td>
                    <td className="px-4 py-3">
                      <Badge tone={h.holiday_type === "mandatory" ? "brand" : "neutral"}>
                        {h.holiday_type}
                      </Badge>
                    </td>
                    <td className="px-4 py-3 text-right">
                      <button
                        type="button"
                        onClick={() => handleDeleteHoliday(h.id)}
                        className="cursor-pointer text-xs font-medium text-rose-600 hover:underline"
                      >
                        Delete
                      </button>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </div>

      {/* Add Holiday Modal */}
      {holidayModalOpen && (
        <Modal
          isOpen={holidayModalOpen}
          onClose={() => setHolidayModalOpen(false)}
          title="Add Gazetted Holiday"
        >
          <form onSubmit={handleAddHoliday} className="space-y-4">
            <FormField label="Holiday Name" required>
              <TextInput
                placeholder="e.g. Independence Day"
                value={holidayName}
                onChange={(e) => setHolidayName(e.target.value)}
              />
            </FormField>

            <FormField label="Holiday Date" required>
              <DateInput
                value={holidayDate}
                onChange={(e) => setHolidayDate(e.target.value)}
              />
            </FormField>

            <FormField label="Type">
              <Select value={holidayType} onChange={(e) => setHolidayType(e.target.value)}>
                <option value="mandatory">Mandatory (General Closure)</option>
                <option value="optional">Optional / Restricted</option>
              </Select>
            </FormField>

            <div className="flex justify-end gap-3 pt-3">
              <Button type="button" tone="neutral" variant="outline" onClick={() => setHolidayModalOpen(false)}>
                Cancel
              </Button>
              <Button type="submit" tone="brand" disabled={submittingHoliday}>
                {submittingHoliday ? "Adding..." : "Add Holiday"}
              </Button>
            </div>
          </form>
        </Modal>
      )}
    </div>
  );
}

export default CalendarsPage;
