import { useState, useEffect } from "react";
import Button from "../../components/ui/Button.jsx";
import DateInput from "../../components/ui/DateInput.jsx";
import { LoadingState } from "../../components/ui/LoadingState.jsx";
import NumberInput from "../../components/ui/NumberInput.jsx";
import PageHeader from "../../components/ui/PageHeader.jsx";
import Select from "../../components/ui/Select.jsx";
import TextInput from "../../components/ui/TextInput.jsx";
import { useToast } from "../../components/ui/ToastContext.js";
import useAsyncData from "../../hooks/useAsyncData.js";
import useMutation from "../../hooks/useMutation.js";
import { errorMessage } from "../../services/errors.js";
import { leave as leaveApi } from "../../services/resources.js";

export default function LeaveWorkflowPage() {
  const toast = useToast();

  const {
    data: configData,
    loading: configLoading,
    reload: reloadConfig,
  } = useAsyncData("leave-workflow-config", () => leaveApi.getConfig());

  const {
    data: holidaysData,
    loading: holidaysLoading,
    reload: reloadHolidays,
  } = useAsyncData("leave-holidays", () => leaveApi.getHolidays());

  const { run: saveMutation, pending: saving } = useMutation();

  const [formConfig, setFormConfig] = useState(null);
  const [holidays, setHolidays] = useState([]);
  const [newHolidayDate, setNewHolidayDate] = useState("");
  const [newHolidayName, setNewHolidayName] = useState("");

  useEffect(() => {
    if (configData?.data) {
      setFormConfig(configData.data);
    }
  }, [configData]);

  useEffect(() => {
    if (holidaysData?.data) {
      setHolidays(holidaysData.data);
    }
  }, [holidaysData]);

  async function handleSaveConfig(e) {
    e.preventDefault();
    if (!formConfig) return;

    const outcome = await saveMutation(() => leaveApi.saveConfig(formConfig));
    if (!outcome.ok) {
      toast.danger(errorMessage(outcome.error, "Failed to save workflow settings."));
      return;
    }

    toast.success("Leave workflow settings saved successfully.");
    reloadConfig();
  }

  async function handleAddHoliday(e) {
    e.preventDefault();
    if (!newHolidayDate || !newHolidayName) return;

    const updated = [...holidays, { date: newHolidayDate, name: newHolidayName }];
    const outcome = await saveMutation(() => leaveApi.saveHolidays(updated));

    if (!outcome.ok) {
      toast.danger(errorMessage(outcome.error, "Failed to add holiday."));
      return;
    }

    toast.success("Holiday added successfully.");
    setNewHolidayDate("");
    setNewHolidayName("");
    setHolidays(updated);
    reloadHolidays();
  }

  async function handleRemoveHoliday(index) {
    const updated = [...holidays];
    updated.splice(index, 1);
    const outcome = await saveMutation(() => leaveApi.saveHolidays(updated));

    if (!outcome.ok) {
      toast.danger(errorMessage(outcome.error, "Failed to remove holiday."));
      return;
    }

    toast.success("Holiday removed.");
    setHolidays(updated);
    reloadHolidays();
  }

  if (configLoading || holidaysLoading || !formConfig) {
    return <LoadingState label="Loading workflow configuration..." />;
  }

  return (
    <div className="p-6 max-w-4xl space-y-8">

      {/* Main Settings Form */}
      <form onSubmit={handleSaveConfig} className="bg-white rounded-lg border border-slate-200 p-6 shadow-sm space-y-6">
        <h3 className="text-base font-semibold text-slate-900 border-b border-slate-200 pb-3">
          Working Week & Calendar Parameters
        </h3>

        <div className="grid grid-cols-1 md:grid-cols-2 gap-5">
          <Select
            id="working-days"
            label="Working Days per Week"
            hint="Eklavya Foundation policy specifies a 6-day working week (Monday - Saturday)"
            value={formConfig.workingDaysPerWeek}
            options={[
              { value: 6, label: "6 Days (Mon - Sat, Sunday Off)" },
              { value: 5, label: "5 Days (Mon - Fri, Sat & Sun Off)" },
            ]}
            onChange={(e) =>
              setFormConfig({ ...formConfig, workingDaysPerWeek: Number(e.target.value) })
            }
          />

          <NumberInput
            id="sandwich-threshold"
            label="Sandwich Rule Threshold (Days)"
            hint="Leave <= threshold skips Sundays/holidays. Leave >= (threshold + 1) counts sandwiched days."
            value={formConfig.sandwichThresholdDays}
            onChange={(e) =>
              setFormConfig({ ...formConfig, sandwichThresholdDays: Number(e.target.value) })
            }
          />

          <NumberInput
            id="short-leave-slots"
            label="Annual Short Leave Slots"
            hint="Number of 2-hour slots allowed per year (e.g. 24 slots = 6 days equivalent)"
            value={formConfig.shortLeaveSlotsPerYear}
            onChange={(e) =>
              setFormConfig({ ...formConfig, shortLeaveSlotsPerYear: Number(e.target.value) })
            }
          />

          <NumberInput
            id="max-accumulation"
            label="Maximum Leave Accumulation (Days)"
            hint="Statutory maximum carry-forward accumulation cap (e.g. 180 days)"
            value={formConfig.maxAccumulationDays}
            onChange={(e) =>
              setFormConfig({ ...formConfig, maxAccumulationDays: Number(e.target.value) })
            }
          />

          <NumberInput
            id="normal-notice"
            label="Standard Notice Period (Days)"
            hint="Advance notice for leave <= 6 days (policy requires at least 2 days)"
            value={formConfig.defaultNoticeDaysNormal}
            onChange={(e) =>
              setFormConfig({ ...formConfig, defaultNoticeDaysNormal: Number(e.target.value) })
            }
          />

          <NumberInput
            id="long-notice"
            label="Long Leave Notice Period (Days)"
            hint="Advance notice for leave > 6 days (policy requires at least 1 week / 7 days)"
            value={formConfig.defaultNoticeDaysLong}
            onChange={(e) =>
              setFormConfig({ ...formConfig, defaultNoticeDaysLong: Number(e.target.value) })
            }
          />

          <NumberInput
            id="approver-sla"
            label="Approver Decision SLA (Hours)"
            hint="Time limit for supervisor to approve or reject (policy: 48 hours)"
            value={formConfig.approverSlaHours}
            onChange={(e) =>
              setFormConfig({ ...formConfig, approverSlaHours: Number(e.target.value) })
            }
          />
        </div>

        <div className="flex justify-end pt-3">
          <Button type="submit" variant="primary" loading={saving}>
            Save Workflow Settings
          </Button>
        </div>
      </form>

      {/* Holidays Management */}
      <div className="bg-white rounded-lg border border-slate-200 p-6 shadow-sm space-y-6">
        <h3 className="text-base font-semibold text-slate-900 border-b border-slate-200 pb-3">
          Public & Optional Holidays Calendar
        </h3>

        <form onSubmit={handleAddHoliday} className="flex flex-wrap items-end gap-3 bg-slate-50 p-4 rounded-lg border border-slate-200">
          <DateInput
            id="holiday-date"
            label="Holiday Date"
            required
            className="w-48"
            value={newHolidayDate}
            onChange={(e) => setNewHolidayDate(e.target.value)}
          />

          <TextInput
            id="holiday-name"
            label="Holiday Name / Occasion"
            required
            placeholder="e.g. Diwali, Independence Day"
            className="flex-1 min-w-[200px]"
            value={newHolidayName}
            onChange={(e) => setNewHolidayName(e.target.value)}
          />

          <Button type="submit" variant="primary" loading={saving}>
            + Add Holiday
          </Button>
        </form>

        <div className="space-y-2">
          {holidays.length === 0 ? (
            <p className="text-sm text-slate-500 italic py-2">No public holidays added yet.</p>
          ) : (
            <div className="divide-y divide-slate-100 border border-slate-200 rounded-md overflow-hidden">
              {holidays.map((h, idx) => (
                <div key={idx} className="flex items-center justify-between p-3 bg-white text-sm">
                  <div className="flex items-center gap-4">
                    <span className="font-mono font-medium text-indigo-700 bg-indigo-50 px-2 py-0.5 rounded">
                      {h.date}
                    </span>
                    <span className="font-medium text-slate-900">{h.name}</span>
                  </div>

                  <Button
                    size="sm"
                    variant="ghost"
                    className="text-rose-600 hover:text-rose-700"
                    onClick={() => handleRemoveHoliday(idx)}
                  >
                    Remove
                  </Button>
                </div>
              ))}
            </div>
          )}
        </div>
      </div>
    </div>
  );
}

