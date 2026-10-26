import { db } from "../../../config/database.js";

export async function findDefaultCalendar(connection = db) {
  const [rows] = await connection.execute(
    `SELECT * FROM leave_calendars WHERE is_default = 1 AND status = 'active' LIMIT 1`
  );
  if (rows.length > 0) return rows[0];

  const [fallback] = await connection.execute(
    `SELECT * FROM leave_calendars WHERE status = 'active' ORDER BY id ASC LIMIT 1`
  );
  return fallback[0] || null;
}

export async function findCalendarById(calendarId, connection = db) {
  const [rows] = await connection.execute(
    `SELECT * FROM leave_calendars WHERE id = ?`,
    [calendarId]
  );
  return rows[0] || null;
}

export async function listCalendars(connection = db) {
  const [rows] = await connection.execute(
    `SELECT * FROM leave_calendars ORDER BY is_default DESC, id ASC`
  );
  return rows;
}

export async function createCalendar(data, connection = db) {
  const [result] = await connection.execute(
    `INSERT INTO leave_calendars (name, timezone, working_days_json, is_default, status, created_by)
     VALUES (?, ?, ?, ?, ?, ?)`,
    [
      data.name,
      data.timezone || "Asia/Kolkata",
      JSON.stringify(data.workingDaysJson),
      data.isDefault ? 1 : 0,
      data.status || "active",
      data.createdBy || null,
    ]
  );
  return result.insertId;
}

export async function updateCalendar(calendarId, data, connection = db) {
  const fields = [];
  const values = [];

  if (data.name !== undefined) {
    fields.push("name = ?");
    values.push(data.name);
  }
  if (data.timezone !== undefined) {
    fields.push("timezone = ?");
    values.push(data.timezone);
  }
  if (data.workingDaysJson !== undefined) {
    fields.push("working_days_json = ?");
    values.push(JSON.stringify(data.workingDaysJson));
  }
  if (data.isDefault !== undefined) {
    fields.push("is_default = ?");
    values.push(data.isDefault ? 1 : 0);
  }
  if (data.status !== undefined) {
    fields.push("status = ?");
    values.push(data.status);
  }
  if (data.updatedBy !== undefined) {
    fields.push("updated_by = ?");
    values.push(data.updatedBy);
  }

  if (fields.length === 0) return;

  values.push(calendarId);
  await connection.execute(
    `UPDATE leave_calendars SET ${fields.join(", ")} WHERE id = ?`,
    values
  );
}

export async function findHolidaysBetween(calendarId, startDate, endDate, connection = db) {
  const [rows] = await connection.execute(
    `SELECT * FROM leave_holidays
     WHERE calendar_id = ? AND holiday_date BETWEEN ? AND ? AND status = 'active'
     ORDER BY holiday_date ASC`,
    [calendarId, startDate, endDate]
  );
  return rows;
}

export async function listHolidays(calendarId, connection = db) {
  const [rows] = await connection.execute(
    `SELECT * FROM leave_holidays
     WHERE calendar_id = ?
     ORDER BY holiday_date ASC`,
    [calendarId]
  );
  return rows;
}

export async function createHoliday(data, connection = db) {
  const [result] = await connection.execute(
    `INSERT INTO leave_holidays (calendar_id, holiday_date, name, holiday_type, status, created_by)
     VALUES (?, ?, ?, ?, ?, ?)`,
    [
      data.calendarId,
      data.holidayDate,
      data.name,
      data.holidayType || "mandatory",
      data.status || "active",
      data.createdBy || null,
    ]
  );
  return result.insertId;
}

export async function deleteHoliday(holidayId, connection = db) {
  await connection.execute(
    `DELETE FROM leave_holidays WHERE id = ?`,
    [holidayId]
  );
}
