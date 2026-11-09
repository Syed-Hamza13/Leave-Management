/**
 * Leave Duration & Sandwich Rule Calculator
 * 
 * Supports configurable working weeks (e.g. Eklavya's 6-day week),
 * public holidays, half-day sessions, short-leave slots, and sandwich rules.
 */

export const DEFAULT_WORKFLOW_CONFIG = {
  workingDaysPerWeek: 6, // 6-day working week (Monday - Saturday)
  weeklyOffDays: [0], // 0 = Sunday
  sandwichThresholdDays: 7, // If duration <= 7, sandwiched weekly off/holidays are NOT counted. If >= 8, they ARE counted.
  leastCountDays: 0.5, // Minimum unit for general leave (half day)
  shortLeaveHours: 2, // Short leave duration
  shortLeaveSlotsPerYear: 24, // 24 slots of 2 hours (= 6 days)
  maxAccumulationDays: 180, // Max carry-forward accumulation
  defaultNoticeDaysNormal: 2, // Application at least 2 days in advance
  defaultNoticeDaysLong: 7, // For leave > 6 days, at least 1 week in advance
  longLeaveThresholdDays: 6,
  approverSlaHours: 48, // Approver must act within 48 hours
};

/**
 * Formats a Date object to YYYY-MM-DD
 */
export function formatDateKey(date) {
  const d = new Date(date);
  const year = d.getFullYear();
  const month = String(d.getMonth() + 1).padStart(2, "0");
  const day = String(d.getDate()).padStart(2, "0");
  return `${year}-${month}-${day}`;
}

/**
 * Calculates days between start and end date inclusive.
 */
export function calculateLeaveDuration({
  startDate,
  endDate,
  session = "full_day",
  holidays = [],
  config = {},
}) {
  const cfg = { ...DEFAULT_WORKFLOW_CONFIG, ...config };
  const holidaySet = new Set((holidays || []).map((h) => (typeof h === "string" ? h : h.date)));
  const offDaySet = new Set(cfg.weeklyOffDays || [0]);

  const start = new Date(startDate);
  const end = new Date(endDate || startDate);

  // Normalize times to midnight UTC to prevent daylight saving / timezone drift
  start.setHours(0, 0, 0, 0);
  end.setHours(0, 0, 0, 0);

  if (isNaN(start.getTime()) || isNaN(end.getTime())) {
    throw new Error("Invalid start or end date provided.");
  }

  if (end < start) {
    throw new Error("End date cannot be earlier than start date.");
  }

  // Handle single day half-day session
  const isSameDay = formatDateKey(start) === formatDateKey(end);
  const isHalfDay = isSameDay && (session === "first_half" || session === "second_half");
  const isShortLeave = isSameDay && session === "short_leave";

  const breakdown = [];
  let current = new Date(start);

  let workingDaysCount = 0;
  let weeklyOffCount = 0;
  let holidayCount = 0;

  while (current <= end) {
    const dateKey = formatDateKey(current);
    const dayOfWeek = current.getDay();
    const isWeeklyOff = offDaySet.has(dayOfWeek);
    const isHoliday = holidaySet.has(dateKey);
    const isWorkingDay = !isWeeklyOff && !isHoliday;

    if (isWorkingDay) {
      workingDaysCount++;
    } else if (isWeeklyOff) {
      weeklyOffCount++;
    } else if (isHoliday) {
      holidayCount++;
    }

    breakdown.push({
      date: dateKey,
      dayOfWeek,
      isWorkingDay,
      isWeeklyOff,
      isHoliday,
    });

    current.setDate(current.getDate() + 1);
  }

  const totalCalendarDays = breakdown.length;

  // Sandwich rule check:
  // Policy: "Sandwiched Sundays/holidays in leave up to seven days will not to be counted.
  // (Sandwiched leave will be counted for leave for 8 days or above)."
  const threshold = cfg.sandwichThresholdDays || 7;
  const isSandwiched = totalCalendarDays > threshold;

  let calculatedDays = 0;
  let sandwichedDaysCount = 0;

  if (isShortLeave) {
    calculatedDays = 0.25; // 2 hours = 1 slot (out of 24)
  } else if (isHalfDay) {
    calculatedDays = 0.5;
  } else if (isSandwiched) {
    // If leave is 8 days or more, all calendar days (including weekly offs and holidays) are counted
    calculatedDays = totalCalendarDays;
    sandwichedDaysCount = weeklyOffCount + holidayCount;
  } else {
    // If leave is 7 days or less, only working days are counted
    calculatedDays = workingDaysCount;
    sandwichedDaysCount = 0;
  }

  // Mark in breakdown whether each day is counted
  for (const day of breakdown) {
    if (isSandwiched) {
      day.isCounted = true;
    } else {
      day.isCounted = day.isWorkingDay;
    }
  }

  return {
    startDate: formatDateKey(start),
    endDate: formatDateKey(end),
    totalCalendarDays,
    workingDaysCount,
    weeklyOffCount,
    holidayCount,
    sandwichedDaysCount,
    isSandwiched,
    calculatedDays,
    session,
    breakdown,
  };
}

/**
 * Validates notice period requirements
 */
export function checkNoticeRequirement({ startDate, calculatedDays, isEmergency, config = {} }) {
  const cfg = { ...DEFAULT_WORKFLOW_CONFIG, ...config };
  if (isEmergency) {
    return {
      isValid: true,
      requiredDays: 0,
      actualDays: 0,
      isEmergency: true,
      message: "Emergency leave - same day or 24-hour approval applicable.",
    };
  }

  const today = new Date();
  today.setHours(0, 0, 0, 0);

  const start = new Date(startDate);
  start.setHours(0, 0, 0, 0);

  const diffTime = start.getTime() - today.getTime();
  const actualDays = Math.floor(diffTime / (1000 * 60 * 60 * 24));

  const requiredDays =
    calculatedDays > (cfg.longLeaveThresholdDays || 6)
      ? cfg.defaultNoticeDaysLong || 7
      : cfg.defaultNoticeDaysNormal || 2;

  const isValid = actualDays >= requiredDays;

  return {
    isValid,
    requiredDays,
    actualDays: Math.max(0, actualDays),
    isEmergency: false,
    message: isValid
      ? `Notice requirement met (${actualDays} days in advance, required ${requiredDays} days).`
      : `Application submitted ${actualDays} day(s) in advance; policy requires at least ${requiredDays} days advance notice. Without approval, this will be treated as LWP.`,
  };
}

