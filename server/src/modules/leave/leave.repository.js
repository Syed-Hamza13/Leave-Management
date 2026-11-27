import { db } from "../../config/database.js";
import { parseJsonColumn, stringifyJsonColumn } from "../../lib/jsonColumn.js";
import { findSettingRow, upsertSetting } from "../settings/settings.repository.js";

export async function findLeaveRules() {
  const row = await findSettingRow("leave_rules");
  if (!row || row.setting_value === null || row.setting_value === undefined) {
    return [];
  }
  const rules = parseJsonColumn(row.setting_value, null);
  if (Array.isArray(rules)) {
    return rules;
  }
  return [];
}

export async function saveLeaveRules(executor, rules, actorUserId) {
  await upsertSetting(executor, {
    settingKey: "leave_rules",
    value: rules,
    isSecret: false,
    updatedBy: actorUserId,
  });
}

export async function findHolidays() {
  const row = await findSettingRow("leave_holidays");
  if (!row || !row.setting_value) {
    return [];
  }
  return parseJsonColumn(row.setting_value, []);
}

export async function saveHolidays(executor, holidays, actorUserId) {
  await upsertSetting(executor, {
    settingKey: "leave_holidays",
    value: holidays,
    isSecret: false,
    updatedBy: actorUserId,
  });
}

export const DEFAULT_LEAVE_SETTINGS = {
  waitingMessageTemplate:
    "Waiting for {approver} ({step}) to approve first.\nYou cannot approve or reject until previous steps are completed.",
};

export async function findLeaveSettings() {
  const row = await findSettingRow("leave_settings");
  if (!row || !row.setting_value) {
    return { ...DEFAULT_LEAVE_SETTINGS };
  }
  const parsed = parseJsonColumn(row.setting_value, {});
  return {
    ...DEFAULT_LEAVE_SETTINGS,
    ...parsed,
  };
}

export async function saveLeaveSettings(executor, settings, actorUserId) {
  await upsertSetting(executor, {
    settingKey: "leave_settings",
    value: settings,
    isSecret: false,
    updatedBy: actorUserId,
  });
}


