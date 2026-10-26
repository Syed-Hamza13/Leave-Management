import { notFound, badRequest } from "../../../lib/appError.js";
import { LEAVE_ERROR_CODES } from "../leave.constants.js";
import * as calendarRepo from "./calendar.repository.js";

const DAY_NAMES = ["sunday", "monday", "tuesday", "wednesday", "thursday", "friday", "saturday"];

export async function getDefaultCalendar() {
  const cal = await calendarRepo.findDefaultCalendar();
  if (!cal) {
    throw notFound("No default leave calendar configured.", {
      code: LEAVE_ERROR_CODES.LEAVE_CALENDAR_NOT_FOUND,
    });
  }
  return {
    ...cal,
    working_days_json: typeof cal.working_days_json === "string" ? JSON.parse(cal.working_days_json) : cal.working_days_json,
  };
}

export async function getCalendarById(id) {
  const cal = await calendarRepo.findCalendarById(id);
  if (!cal) {
    throw notFound("Calendar not found", { code: LEAVE_ERROR_CODES.LEAVE_CALENDAR_NOT_FOUND });
  }
  return {
    ...cal,
    working_days_json: typeof cal.working_days_json === "string" ? JSON.parse(cal.working_days_json) : cal.working_days_json,
  };
}

export async function getAllCalendars() {
  const rows = await calendarRepo.listCalendars();
  return rows.map((cal) => ({
    ...cal,
    working_days_json: typeof cal.working_days_json === "string" ? JSON.parse(cal.working_days_json) : cal.working_days_json,
  }));
}

export async function createNewCalendar(data, userId) {
  const id = await calendarRepo.createCalendar({ ...data, createdBy: userId });
  return getCalendarById(id);
}

export async function updateExistingCalendar(id, data, userId) {
  await getCalendarById(id);
  await calendarRepo.updateCalendar(id, { ...data, updatedBy: userId });
  return getCalendarById(id);
}

export async function getHolidaysBetween(calendarId, startDate, endDate) {
  return calendarRepo.findHolidaysBetween(calendarId, startDate, endDate);
}

export async function getCalendarHolidays(calendarId) {
  return calendarRepo.listHolidays(calendarId);
}

export async function addHoliday(data, userId) {
  await getCalendarById(data.calendarId);
  const id = await calendarRepo.createHoliday({ ...data, createdBy: userId });
  return { id, ...data };
}

export async function removeHoliday(holidayId) {
  await calendarRepo.deleteHoliday(holidayId);
  return { success: true };
}

export function isWorkingDay(dateStr, calendar) {
  const date = new Date(dateStr + "T00:00:00Z");
  const dayName = DAY_NAMES[date.getUTCDay()];
  const workingDays = calendar.working_days_json || {};
  return workingDays[dayName] !== false;
}
