import { db } from "../../config/database.js";
import { parseJsonColumn, stringifyJsonColumn } from "../../lib/jsonColumn.js";
import { findSettingRow, upsertSetting } from "../settings/settings.repository.js";
import { DEFAULT_WORKFLOW_CONFIG } from "./leave.calculator.js";

export const DEFAULT_LEAVE_RULES = [
  {
    id: "rule_short_leave",
    name: "Short Leave (2 Hours) - Direct Informational",
    priority: 10,
    status: "active",
    conditions: [
      {
        source: "request",
        field: "session",
        operator: "eq",
        value: "short_leave",
      },
    ],
    combinator: "OR",
    actions: {
      requiresApproval: false,
      approverLabel: "No approval required (Inform only)",
      noticeDays: 0,
      slaHours: 0,
    },
  },
  {
    id: "rule_prog_1_6",
    name: "Programme Staff: 1 to 6 Days",
    priority: 20,
    status: "active",
    conditions: [
      {
        source: "user",
        field: "staff_category",
        operator: "eq",
        value: "Programme Staff",
      },
      {
        source: "request",
        field: "days",
        operator: "between",
        value: [0.5, 6],
      },
    ],
    combinator: "AND",
    actions: {
      requiresApproval: true,
      approverType: "user_relation",
      approverTarget: "reports_to",
      inchargeField: "project_incharge",
      notifyTargets: [
        { type: "entity_incharge", entityTypeKey: "center", columnKey: "center_in_charge" },
        { type: "entity_incharge", entityTypeKey: "programme", columnKey: "programme_coordinator" },
      ],
      noticeDays: 2,
      slaHours: 48,
    },
  },
  {
    id: "rule_prog_7_29",
    name: "Programme Staff: 7 to 29 Days",
    priority: 30,
    status: "active",
    conditions: [
      {
        source: "user",
        field: "staff_category",
        operator: "eq",
        value: "Programme Staff",
      },
      {
        source: "request",
        field: "days",
        operator: "between",
        value: [7, 29],
      },
    ],
    combinator: "AND",
    actions: {
      requiresApproval: true,
      approverType: "council_or_team",
      entityName: "Programme Committee",
      notifyTargets: [
        { type: "council", entityName: "Executive Council" },
        { type: "council", entityName: "Academic Council" },
      ],
      noticeDays: 7,
      slaHours: 48,
    },
  },
  {
    id: "rule_prog_30_plus",
    name: "Programme Staff: 30+ Days",
    priority: 40,
    status: "active",
    conditions: [
      {
        source: "user",
        field: "staff_category",
        operator: "eq",
        value: "Programme Staff",
      },
      {
        source: "request",
        field: "days",
        operator: "gte",
        value: 30,
      },
    ],
    combinator: "AND",
    actions: {
      requiresApproval: true,
      approverType: "council_or_team",
      entityName: "Academic Council",
      notifyTargets: [
        { type: "council", entityName: "Executive Council" },
      ],
      noticeDays: 7,
      slaHours: 48,
    },
  },
  {
    id: "rule_admin_1_6",
    name: "Admin Staff: 1 to 6 Days",
    priority: 50,
    status: "active",
    conditions: [
      {
        source: "user",
        field: "staff_category",
        operator: "eq",
        value: "Admin Staff",
      },
      {
        source: "request",
        field: "days",
        operator: "between",
        value: [0.5, 6],
      },
    ],
    combinator: "AND",
    actions: {
      requiresApproval: true,
      approverType: "entity_incharge",
      inchargeField: "center_in_charge",
      notifyTargets: [],
      noticeDays: 2,
      slaHours: 48,
    },
  },
  {
    id: "rule_admin_7_29",
    name: "Admin Staff: 7 to 29 Days",
    priority: 60,
    status: "active",
    conditions: [
      {
        source: "user",
        field: "staff_category",
        operator: "eq",
        value: "Admin Staff",
      },
      {
        source: "request",
        field: "days",
        operator: "between",
        value: [7, 29],
      },
    ],
    combinator: "AND",
    actions: {
      requiresApproval: true,
      approverType: "entity_incharge",
      inchargeField: "center_in_charge",
      notifyTargets: [],
      noticeDays: 7,
      slaHours: 48,
    },
  },
  {
    id: "rule_admin_30_plus",
    name: "Admin Staff: 30+ Days",
    priority: 70,
    status: "active",
    conditions: [
      {
        source: "user",
        field: "staff_category",
        operator: "eq",
        value: "Admin Staff",
      },
      {
        source: "request",
        field: "days",
        operator: "gte",
        value: 30,
      },
    ],
    combinator: "AND",
    actions: {
      requiresApproval: true,
      approverType: "council_or_team",
      entityName: "Executive Council",
      notifyTargets: [
        { type: "council", entityName: "Academic Council" },
      ],
      noticeDays: 7,
      slaHours: 48,
    },
  },
  {
    id: "rule_default_fallback",
    name: "Standard Default Rule",
    priority: 999,
    status: "active",
    conditions: [],
    combinator: "AND",
    actions: {
      requiresApproval: true,
      approverType: "user_relation",
      approverTarget: "reports_to",
      notifyTargets: [],
      noticeDays: 2,
      slaHours: 48,
    },
  },
];

export async function findLeaveRules() {
  const row = await findSettingRow("leave_rules");
  if (!row || !row.setting_value) {
    return DEFAULT_LEAVE_RULES;
  }
  const rules = parseJsonColumn(row.setting_value, []);
  return Array.isArray(rules) && rules.length > 0 ? rules : DEFAULT_LEAVE_RULES;
}

export async function saveLeaveRules(executor, rules, actorUserId) {
  await upsertSetting(executor, {
    settingKey: "leave_rules",
    value: rules,
    isSecret: false,
    updatedBy: actorUserId,
  });
}

export async function findWorkflowConfig() {
  const row = await findSettingRow("leave_workflow_config");
  if (!row || !row.setting_value) {
    return DEFAULT_WORKFLOW_CONFIG;
  }
  return { ...DEFAULT_WORKFLOW_CONFIG, ...parseJsonColumn(row.setting_value, {}) };
}

export async function saveWorkflowConfig(executor, config, actorUserId) {
  await upsertSetting(executor, {
    settingKey: "leave_workflow_config",
    value: config,
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

