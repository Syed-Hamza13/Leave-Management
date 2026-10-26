import * as calendarService from "../calendars/calendar.service.js";
import * as ruleService from "../rules/rule.service.js";
import * as ruleEngine from "../rules/rule.engine.js";
import { DAY_TYPE, LEAVE_UNIT, RULE_TYPE } from "../leave.constants.js";

function formatDateString(d) {
  const year = d.getFullYear();
  const month = String(d.getMonth() + 1).padStart(2, "0");
  const day = String(d.getDate()).padStart(2, "0");
  return `${year}-${month}-${day}`;
}

export async function calculateLeaveDays({
  user,
  policy,
  leaveType,
  startDate,
  endDate,
  calendar,
  balance,
  requestContext = {},
}) {
  const start = new Date(startDate + "T00:00:00Z");
  const end = new Date(endDate + "T00:00:00Z");

  const diffMs = end.getTime() - start.getTime();
  const calendarDays = Math.floor(diffMs / (1000 * 60 * 60 * 24)) + 1;

  if (calendarDays < 1) {
    throw new Error("End date must be on or after start date.");
  }

  // Fetch holidays within range
  const holidays = await calendarService.getHolidaysBetween(calendar.id, startDate, endDate);
  const holidayMap = new Map();
  for (const h of holidays) {
    const dStr = formatDateString(new Date(h.holiday_date));
    holidayMap.set(dStr, h);
  }

  // Fetch rules for policy & leave type
  const rules = await ruleService.getRulesForPolicy(policy.id, leaveType.id);
  const sandwichRule = rules.find((r) => r.rule_type === RULE_TYPE.SANDWICH);
  const sandwichThreshold = sandwichRule?.config_json?.thresholdDays ?? 7;

  // Evaluate if sandwich applies: when span exceeds threshold
  const isSandwichApplied = calendarDays > sandwichThreshold && (sandwichRule ? sandwichRule.config_json?.enabled !== false : true);

  const dayBreakdown = [];
  let workingDaysCount = 0;
  const holidaysExcluded = [];
  const sandwichDays = [];
  let totalCountedUnits = 0;

  const isHourly = leaveType.unit === LEAVE_UNIT.HOUR;
  const isHalfDay = Boolean(requestContext.isHalfDay && calendarDays === 1 && leaveType.allows_half_day);

  const cur = new Date(start);
  while (cur <= end) {
    const curStr = formatDateString(cur);
    const isHoliday = holidayMap.has(curStr);
    const isWorkDay = calendarService.isWorkingDay(curStr, calendar);

    if (isHourly) {
      const hours = Number(requestContext.hours || 2);
      dayBreakdown.push({
        date: curStr,
        dayType: DAY_TYPE.SHORT_LEAVE,
        counted: true,
        units: hours,
        reason: "Short leave",
      });
      totalCountedUnits += hours;
      workingDaysCount += 1;
    } else if (isHoliday) {
      const holidayInfo = holidayMap.get(curStr);
      if (isSandwichApplied) {
        dayBreakdown.push({
          date: curStr,
          dayType: DAY_TYPE.SANDWICH,
          counted: true,
          units: 1.0,
          reason: `Holiday (${holidayInfo.name}) included under sandwich rule (> ${sandwichThreshold} days)`,
        });
        sandwichDays.push({ date: curStr, name: holidayInfo.name, type: "holiday" });
        totalCountedUnits += 1.0;
      } else {
        dayBreakdown.push({
          date: curStr,
          dayType: DAY_TYPE.HOLIDAY,
          counted: false,
          units: 0,
          reason: `Holiday: ${holidayInfo.name}`,
        });
        holidaysExcluded.push({ date: curStr, name: holidayInfo.name });
      }
    } else if (!isWorkDay) {
      if (isSandwichApplied) {
        dayBreakdown.push({
          date: curStr,
          dayType: DAY_TYPE.SANDWICH,
          counted: true,
          units: 1.0,
          reason: `Weekend included under sandwich rule (> ${sandwichThreshold} days)`,
        });
        sandwichDays.push({ date: curStr, type: "weekend" });
        totalCountedUnits += 1.0;
      } else {
        dayBreakdown.push({
          date: curStr,
          dayType: DAY_TYPE.WEEKEND,
          counted: false,
          units: 0,
          reason: "Weekly non-working day",
        });
      }
    } else {
      // Normal working day
      const units = isHalfDay ? 0.5 : 1.0;
      const dayType = isHalfDay
        ? requestContext.halfDayType === "SECOND_HALF"
          ? DAY_TYPE.SECOND_HALF
          : DAY_TYPE.FIRST_HALF
        : DAY_TYPE.FULL_DAY;

      dayBreakdown.push({
        date: curStr,
        dayType,
        counted: true,
        units,
        reason: isHalfDay ? "Half-day working leave" : "Full-day leave",
      });
      totalCountedUnits += units;
      workingDaysCount += 1;
    }

    cur.setDate(cur.getDate() + 1);
  }

  // Prepare evaluation context
  const evaluationContext = {
    user,
    policy,
    leaveType,
    submissionDate: requestContext.submissionDate || formatDateString(new Date()),
    startDate,
    endDate,
    requestedUnits: totalCountedUnits,
    calculatedUnits: totalCountedUnits,
    spanCalendarDays: calendarDays,
    workingDaysCount,
    emergencyFlag: Boolean(requestContext.emergencyFlag),
    customData: requestContext.customData || {},
    balance,
  };

  // Evaluate rules
  const ruleEvaluation = await ruleEngine.evaluatePolicyRules(rules, evaluationContext);

  return {
    requestedPeriod: { startDate, endDate },
    calendarDays,
    workingDays: workingDaysCount,
    holidaysExcluded,
    sandwichDays,
    calculatedUnits: totalCountedUnits,
    unit: leaveType.unit,
    isSandwichApplied,
    dayBreakdown,
    passed: ruleEvaluation.passed,
    violations: ruleEvaluation.violations,
    warnings: ruleEvaluation.warnings,
    ruleResults: ruleEvaluation.ruleResults,
    // snake_case aliases
    requested_days: calendarDays,
    working_days: workingDaysCount,
    total_deducted_days: totalCountedUnits,
    breakdown: dayBreakdown,
  };
}
