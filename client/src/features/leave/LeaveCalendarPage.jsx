import { useState, useEffect } from "react";

import Badge from "../../components/ui/Badge.jsx";
import Button from "../../components/ui/Button.jsx";
import EmptyState from "../../components/ui/EmptyState.jsx";
import { Skeleton } from "../../components/ui/LoadingState.jsx";
import { useToast } from "../../components/ui/ToastProvider.jsx";
import { leave } from "../../services/resources.js";

function LeaveCalendarPage() {
  const { notify } = useToast();
  const [events, setEvents] = useState([]);
  const [loading, setLoading] = useState(true);

  const [currentMonth, setCurrentMonth] = useState(new Date().getMonth());
  const [currentYear, setCurrentYear] = useState(new Date().getFullYear());

  useEffect(() => {
    loadEvents();
  }, [currentMonth, currentYear]);

  async function loadEvents() {
    setLoading(true);
    try {
      const start = new Date(currentYear, currentMonth, 1).toISOString().slice(0, 10);
      const end = new Date(currentYear, currentMonth + 1, 0).toISOString().slice(0, 10);

      const res = await leave.calendar({ startDate: start, endDate: end });
      setEvents(res.data || []);
    } catch (err) {
      notify({ tone: "danger", message: err.message || "Failed to load calendar events" });
    } finally {
      setLoading(false);
    }
  }

  function handlePrev() {
    if (currentMonth === 0) {
      setCurrentMonth(11);
      setCurrentYear((y) => y - 1);
    } else {
      setCurrentMonth((m) => m - 1);
    }
  }

  function handleNext() {
    if (currentMonth === 11) {
      setCurrentMonth(0);
      setCurrentYear((y) => y + 1);
    } else {
      setCurrentMonth((m) => m + 1);
    }
  }

  const monthName = new Date(currentYear, currentMonth).toLocaleString("default", { month: "long" });

  return (
    <div className="space-y-6">
      <div className="flex flex-col gap-4 sm:flex-row sm:items-center sm:justify-between">
        <div>
          <h2 className="text-xl font-bold text-ink">Team Absence Calendar</h2>
          <p className="text-sm text-ink-soft">
            View scheduled institutional absences and gazetted holidays.
          </p>
        </div>

        <div className="flex items-center gap-3">
          <Button tone="neutral" variant="outline" onClick={handlePrev}>
            &larr; Prev
          </Button>
          <span className="min-w-36 text-center font-semibold text-ink">
            {monthName} {currentYear}
          </span>
          <Button tone="neutral" variant="outline" onClick={handleNext}>
            Next &rarr;
          </Button>
        </div>
      </div>

      {loading ? (
        <Skeleton className="h-64 w-full" />
      ) : events.length === 0 ? (
        <EmptyState
          title={`No absences or holidays in ${monthName} ${currentYear}`}
          description="Enjoy the uninterrupted working period!"
        />
      ) : (
        <div className="space-y-4">
          <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-3">
            {events.map((ev) => (
              <div
                key={ev.id}
                className={`rounded-card border p-4 shadow-xs ${
                  ev.type === "holiday"
                    ? "border-amber-200 bg-amber-50/50"
                    : "border-line bg-surface"
                }`}
              >
                <div className="flex items-center justify-between">
                  <Badge tone={ev.type === "holiday" ? "warning" : "brand"}>
                    {ev.type === "holiday" ? "INSTITUTIONAL HOLIDAY" : "PLANNED LEAVE"}
                  </Badge>
                  <span className="text-xs font-semibold text-ink-soft">
                    {ev.startDate === ev.endDate ? ev.startDate : `${ev.startDate} to ${ev.endDate}`}
                  </span>
                </div>

                <h3 className="mt-2 text-sm font-semibold text-ink">{ev.title}</h3>

                {ev.units && (
                  <p className="mt-1 text-xs text-ink-soft">Duration: {ev.units} day(s)</p>
                )}
              </div>
            ))}
          </div>
        </div>
      )}
    </div>
  );
}

export default LeaveCalendarPage;
