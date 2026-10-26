import "dotenv/config";
import mysql from "mysql2/promise";
import { env } from "../src/config/env.js";

async function seed() {
  const connection = await mysql.createConnection({
    host: env.DB_HOST,
    port: env.DB_PORT,
    user: env.DB_USER,
    password: env.DB_PASSWORD,
    database: env.DB_NAME,
    multipleStatements: true,
    charset: "utf8mb4",
  });

  try {
    console.log("🌱 Seeding Eklavya Standard Leave Policy...");

    // 1. Calendar: 6-day working week (Monday - Saturday, Sunday off)
    const workingDays = {
      monday: true,
      tuesday: true,
      wednesday: true,
      thursday: true,
      friday: true,
      saturday: true,
      sunday: false,
    };

    let [calRows] = await connection.execute(
      `SELECT id FROM leave_calendars WHERE name = 'Eklavya 6-Day Working Calendar' LIMIT 1`
    );
    let calendarId;
    if (calRows.length > 0) {
      calendarId = calRows[0].id;
    } else {
      const [res] = await connection.execute(
        `INSERT INTO leave_calendars (name, timezone, working_days_json, is_default, status)
         VALUES (?, ?, ?, 1, 'active')`,
        ["Eklavya 6-Day Working Calendar", "Asia/Kolkata", JSON.stringify(workingDays)]
      );
      calendarId = res.insertId;
      console.log(`✓ Calendar created (id: ${calendarId})`);
    }

    // 2. Standard Holidays for current year
    const year = new Date().getFullYear();
    const holidays = [
      { date: `${year}-01-26`, name: "Republic Day", type: "mandatory" },
      { date: `${year}-08-15`, name: "Independence Day", type: "mandatory" },
      { date: `${year}-10-02`, name: "Gandhi Jayanti", type: "mandatory" },
      { date: `${year}-11-01`, name: "Diwali", type: "mandatory" },
      { date: `${year}-12-25`, name: "Christmas", type: "mandatory" },
    ];

    for (const h of holidays) {
      await connection.execute(
        `INSERT INTO leave_holidays (calendar_id, holiday_date, name, holiday_type, status)
         VALUES (?, ?, ?, ?, 'active')
         ON DUPLICATE KEY UPDATE name = VALUES(name)`,
        [calendarId, h.date, h.name, h.type]
      );
    }
    console.log(`✓ Seeded ${holidays.length} standard holidays.`);

    // 3. Master Policy
    let [polRows] = await connection.execute(
      `SELECT id FROM leave_policies WHERE policy_key = 'eklavya_standard_policy' LIMIT 1`
    );
    let policyId;
    if (polRows.length > 0) {
      policyId = polRows[0].id;
    } else {
      const [res] = await connection.execute(
        `INSERT INTO leave_policies
           (policy_key, name, description, calendar_id, status, version, effective_from, is_default)
         VALUES (?, ?, ?, ?, 'published', 1, '2026-01-01', 1)`,
        [
          "eklavya_standard_policy",
          "Eklavya Standard Leave Policy",
          "Standard institutional leave policy with 35 PL, 24 Short Leaves, 2 Optional Leaves, and tiered approval workflow.",
          calendarId,
        ]
      );
      policyId = res.insertId;
      console.log(`✓ Policy created (id: ${policyId})`);
    }

    // 4. Leave Types
    const leaveTypesToSeed = [
      {
        key: "privilege_leave",
        name: "Privilege Leave",
        description: "Annual privilege leave (35 days/year, carry-forward enabled up to 180 days).",
        unit: "day",
        paid: "paid",
        reqBal: 1,
        reqAppr: 1,
        halfDay: 1,
        cf: 1,
        maxBal: 180,
        sort: 1,
      },
      {
        key: "short_leave",
        name: "Short Leave",
        description: "Up to 24 instances of 2-hour short leave per year. No prior approval required.",
        unit: "hour",
        paid: "paid",
        reqBal: 1,
        reqAppr: 0,
        halfDay: 0,
        partialDay: 1,
        cf: 0,
        maxBal: 48,
        sort: 2,
      },
      {
        key: "optional_leave",
        name: "Optional Leave",
        description: "2 days of optional festival / cultural leaves per year.",
        unit: "day",
        paid: "paid",
        reqBal: 1,
        reqAppr: 1,
        halfDay: 0,
        cf: 0,
        maxBal: 2,
        sort: 3,
      },
      {
        key: "maternity_leave",
        name: "Maternity Leave",
        description: "26 weeks of paid maternity leave for eligible staff.",
        unit: "day",
        paid: "paid",
        reqBal: 0,
        reqAppr: 1,
        halfDay: 0,
        cf: 0,
        maxBal: null,
        sort: 4,
      },
      {
        key: "paternity_leave",
        name: "Paternity Leave",
        description: "2 weeks of paternity leave.",
        unit: "day",
        paid: "paid",
        reqBal: 0,
        reqAppr: 1,
        halfDay: 0,
        cf: 0,
        maxBal: null,
        sort: 5,
      },
      {
        key: "comp_off",
        name: "Compensatory Off",
        description: "Compensatory leave credited for approved Sunday/holiday work.",
        unit: "day",
        paid: "paid",
        reqBal: 1,
        reqAppr: 1,
        halfDay: 1,
        cf: 0,
        maxBal: null,
        sort: 6,
      },
      {
        key: "lwp",
        name: "Leave Without Pay",
        description: "Unpaid leave for unauthorized absences or when balance is exhausted.",
        unit: "day",
        paid: "unpaid",
        reqBal: 0,
        reqAppr: 1,
        halfDay: 1,
        cf: 0,
        maxBal: null,
        sort: 7,
      },
    ];

    const typeIdMap = {};
    for (const lt of leaveTypesToSeed) {
      let [existing] = await connection.execute(
        `SELECT id FROM leave_types WHERE policy_id = ? AND type_key = ?`,
        [policyId, lt.key]
      );
      if (existing.length > 0) {
        typeIdMap[lt.key] = existing[0].id;
      } else {
        const [res] = await connection.execute(
          `INSERT INTO leave_types
             (policy_id, type_key, name, description, unit, paid_status, requires_balance, requires_approval,
              allows_half_day, allows_partial_day, carry_forward_enabled, max_balance, sort_order, status)
           VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, 'active')`,
          [
            policyId,
            lt.key,
            lt.name,
            lt.description,
            lt.unit,
            lt.paid,
            lt.reqBal,
            lt.reqAppr,
            lt.halfDay,
            lt.partialDay || 0,
            lt.cf,
            lt.maxBal,
            lt.sort,
          ]
        );
        typeIdMap[lt.key] = res.insertId;
      }
    }
    console.log(`✓ Seeded ${Object.keys(typeIdMap).length} leave types.`);

    // 5. Policy Rules
    const plId = typeIdMap["privilege_leave"];
    const slId = typeIdMap["short_leave"];
    const optId = typeIdMap["optional_leave"];

    const rulesToSeed = [
      // Entitlements
      {
        leaveTypeId: plId,
        key: "pl_entitlement",
        type: "ENTITLEMENT",
        priority: 10,
        config: { annualQuota: 35, accrual: "annual", unit: "day" },
      },
      {
        leaveTypeId: slId,
        key: "sl_entitlement",
        type: "ENTITLEMENT",
        priority: 10,
        config: { annualQuota: 48, accrual: "annual", unit: "hour", maxQuanta: 24, quantumHours: 2 },
      },
      {
        leaveTypeId: optId,
        key: "opt_entitlement",
        type: "ENTITLEMENT",
        priority: 10,
        config: { annualQuota: 2, accrual: "annual", unit: "day" },
      },
      // Minimum duration
      {
        leaveTypeId: plId,
        key: "pl_min_duration",
        type: "MIN_DURATION",
        priority: 8,
        config: { minDuration: 0.5, unit: "day" },
      },
      {
        leaveTypeId: slId,
        key: "sl_min_duration",
        type: "MIN_DURATION",
        priority: 8,
        config: { minDuration: 2, unit: "hour" },
      },
      {
        leaveTypeId: optId,
        key: "opt_min_duration",
        type: "MIN_DURATION",
        priority: 8,
        config: { minDuration: 1, unit: "day" },
      },
      // Sandwich rule for PL
      {
        leaveTypeId: plId,
        key: "pl_sandwich_rule",
        type: "SANDWICH",
        priority: 9,
        config: { enabled: true, thresholdDays: 7, includeWhenDurationGreaterThan: 7 },
      },
      // Notice periods for PL (2 days for 1-6; 7 days for 7-29; 30 days for 30+)
      {
        leaveTypeId: plId,
        key: "pl_notice_period",
        type: "NOTICE_PERIOD",
        priority: 7,
        config: {
          tiers: [
            { minDuration: 0.5, maxDuration: 6, noticeDays: 2 },
            { minDuration: 7, maxDuration: 29, noticeDays: 7 },
            { minDuration: 30, maxDuration: 365, noticeDays: 30 },
          ],
        },
      },
      // Document requirement for leave >= 3 days
      {
        leaveTypeId: plId,
        key: "pl_document_required",
        type: "DOCUMENT_REQUIRED",
        priority: 5,
        config: { requiredAfterDays: 3, documentType: "medical_certificate" },
      },
    ];

    for (const r of rulesToSeed) {
      const [existing] = await connection.execute(
        `SELECT id FROM leave_policy_rules WHERE policy_id = ? AND rule_key = ?`,
        [policyId, r.key]
      );
      if (existing.length === 0) {
        await connection.execute(
          `INSERT INTO leave_policy_rules (policy_id, leave_type_id, rule_key, rule_type, priority, config_json, status)
           VALUES (?, ?, ?, ?, ?, ?, 'active')`,
          [policyId, r.leaveTypeId, r.key, r.type, r.priority, JSON.stringify(r.config)]
        );
      }
    }
    console.log(`✓ Seeded ${rulesToSeed.length} policy rules.`);

    // 6. Approval Workflows
    // Workflow 1: Standard tier 1-6 days
    let [wf1] = await connection.execute(
      `SELECT id FROM leave_workflows WHERE policy_id = ? AND workflow_key = 'wf_standard_tier1'`,
      [policyId]
    );
    let wf1Id;
    if (wf1.length > 0) {
      wf1Id = wf1[0].id;
    } else {
      const [res] = await connection.execute(
        `INSERT INTO leave_workflows (policy_id, workflow_key, name, description, conditions_json, status, version)
         VALUES (?, 'wf_standard_tier1', 'Standard 1-6 Days Approval', 'Single-step manager/coordinator approval', ?, 'active', 1)`,
        [policyId, JSON.stringify({ minDays: 0, maxDays: 6 })]
      );
      wf1Id = res.insertId;
      await connection.execute(
        `INSERT INTO leave_workflow_steps (workflow_id, step_order, approval_mode, approver_type, approver_config_json)
         VALUES (?, 1, 'SEQUENTIAL', 'USER_MANAGER', '{}')`,
        [wf1Id]
      );
    }

    // Workflow 2: Tier 7-29 days
    let [wf2] = await connection.execute(
      `SELECT id FROM leave_workflows WHERE policy_id = ? AND workflow_key = 'wf_standard_tier2'`,
      [policyId]
    );
    let wf2Id;
    if (wf2.length > 0) {
      wf2Id = wf2[0].id;
    } else {
      const [res] = await connection.execute(
        `INSERT INTO leave_workflows (policy_id, workflow_key, name, description, conditions_json, status, version)
         VALUES (?, 'wf_standard_tier2', 'Committee Approval (7-29 Days)', 'Manager and committee dual-step approval', ?, 'active', 1)`,
        [policyId, JSON.stringify({ minDays: 7, maxDays: 29 })]
      );
      wf2Id = res.insertId;
      await connection.execute(
        `INSERT INTO leave_workflow_steps (workflow_id, step_order, approval_mode, approver_type, approver_config_json)
         VALUES
           (?, 1, 'SEQUENTIAL', 'USER_MANAGER', '{}'),
           (?, 2, 'SEQUENTIAL', 'ROLE', '{"roleKey":"manager"}')`,
        [wf2Id, wf2Id]
      );
    }

    // Workflow 3: Tier 30+ days
    let [wf3] = await connection.execute(
      `SELECT id FROM leave_workflows WHERE policy_id = ? AND workflow_key = 'wf_standard_tier3'`,
      [policyId]
    );
    let wf3Id;
    if (wf3.length > 0) {
      wf3Id = wf3[0].id;
    } else {
      const [res] = await connection.execute(
        `INSERT INTO leave_workflows (policy_id, workflow_key, name, description, conditions_json, status, version)
         VALUES (?, 'wf_standard_tier3', 'Council Approval (30+ Days)', 'Comprehensive three-step approval up to Executive Council', ?, 'active', 1)`,
        [policyId, JSON.stringify({ minDays: 30, maxDays: 365 })]
      );
      wf3Id = res.insertId;
      await connection.execute(
        `INSERT INTO leave_workflow_steps (workflow_id, step_order, approval_mode, approver_type, approver_config_json)
         VALUES
           (?, 1, 'SEQUENTIAL', 'USER_MANAGER', '{}'),
           (?, 2, 'SEQUENTIAL', 'ROLE', '{"roleKey":"manager"}'),
           (?, 3, 'SEQUENTIAL', 'ROLE', '{"roleKey":"admin"}')`,
        [wf3Id, wf3Id, wf3Id]
      );
    }
    console.log(`✓ Seeded tiered approval workflows.`);

    // 7. Initialize Opening Balances for Active Users
    const [users] = await connection.execute(`SELECT id, email, first_name, last_name FROM users WHERE status = 'active'`);
    const periodStart = `${year}-01-01`;
    const periodEnd = `${year}-12-31`;

    let balancesCreated = 0;
    for (const u of users) {
      // PL: 35 days
      const [plBal] = await connection.execute(
        `SELECT id FROM leave_balances WHERE user_id = ? AND leave_type_id = ? AND period_start = ?`,
        [u.id, plId, periodStart]
      );
      if (plBal.length === 0) {
        const [res] = await connection.execute(
          `INSERT INTO leave_balances
             (user_id, leave_type_id, policy_id, period_start, period_end, opening_balance, closing_balance, unit)
           VALUES (?, ?, ?, ?, ?, 35.00, 35.00, 'day')`,
          [u.id, plId, policyId, periodStart, periodEnd]
        );
        await connection.execute(
          `INSERT INTO leave_balance_transactions
             (balance_id, user_id, transaction_type, quantity, reference)
           VALUES (?, ?, 'OPENING', 35.00, 'Annual Quota Allocation')`,
          [res.insertId, u.id]
        );
        balancesCreated++;
      }

      // Short Leave: 48 hours (24 leaves)
      const [slBal] = await connection.execute(
        `SELECT id FROM leave_balances WHERE user_id = ? AND leave_type_id = ? AND period_start = ?`,
        [u.id, slId, periodStart]
      );
      if (slBal.length === 0) {
        const [res] = await connection.execute(
          `INSERT INTO leave_balances
             (user_id, leave_type_id, policy_id, period_start, period_end, opening_balance, closing_balance, unit)
           VALUES (?, ?, ?, ?, ?, 48.00, 48.00, 'hour')`,
          [u.id, slId, policyId, periodStart, periodEnd]
        );
        await connection.execute(
          `INSERT INTO leave_balance_transactions
             (balance_id, user_id, transaction_type, quantity, reference)
           VALUES (?, ?, 'OPENING', 48.00, 'Annual Short Leave Quota (24 x 2h)')`,
          [res.insertId, u.id]
        );
        balancesCreated++;
      }

      // Optional Leave: 2 days
      const [optBal] = await connection.execute(
        `SELECT id FROM leave_balances WHERE user_id = ? AND leave_type_id = ? AND period_start = ?`,
        [u.id, optId, periodStart]
      );
      if (optBal.length === 0) {
        const [res] = await connection.execute(
          `INSERT INTO leave_balances
             (user_id, leave_type_id, policy_id, period_start, period_end, opening_balance, closing_balance, unit)
           VALUES (?, ?, ?, ?, ?, 2.00, 2.00, 'day')`,
          [u.id, optId, policyId, periodStart, periodEnd]
        );
        await connection.execute(
          `INSERT INTO leave_balance_transactions
             (balance_id, user_id, transaction_type, quantity, reference)
           VALUES (?, ?, 'OPENING', 2.00, 'Annual Optional Leave Quota')`,
          [res.insertId, u.id]
        );
        balancesCreated++;
      }
    }

    console.log(`✓ Seeded initial leave balances (${balancesCreated} accounts credited).`);
    console.log("✅ Leave Management seed completed successfully.");
  } finally {
    await connection.end();
  }
}

seed()
  .then(() => process.exit(0))
  .catch((err) => {
    console.error("❌ Seeding failed:", err);
    process.exit(1);
  });
