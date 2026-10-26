/*
 * Migration 010: Leave Management Core Schema
 *
 * Implements the relational domain engine for Leave Management:
 * - Calendars and holidays
 * - Leave policies, types, and rules
 * - Approval workflows and workflow steps
 * - Balances and immutable ledger transactions
 * - Applications, day breakdown segments, and frozen approval snapshots
 * - Leave permission catalog and default role bindings
 */

-- 1. Calendars & Working Week
CREATE TABLE IF NOT EXISTS leave_calendars (
    id BIGINT UNSIGNED NOT NULL AUTO_INCREMENT,
    name VARCHAR(120) NOT NULL,
    timezone VARCHAR(60) NOT NULL DEFAULT 'Asia/Kolkata',
    working_days_json JSON NOT NULL,
    is_default TINYINT(1) NOT NULL DEFAULT 0,
    status VARCHAR(20) NOT NULL DEFAULT 'active',
    created_by BIGINT UNSIGNED NULL,
    updated_by BIGINT UNSIGNED NULL,
    created_at DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
    updated_at DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
    PRIMARY KEY (id),
    KEY idx_leave_cal_status (status),
    CONSTRAINT fk_leave_cal_creator FOREIGN KEY (created_by) REFERENCES users(id) ON DELETE SET NULL,
    CONSTRAINT fk_leave_cal_updater FOREIGN KEY (updated_by) REFERENCES users(id) ON DELETE SET NULL
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

-- 2. Holidays
CREATE TABLE IF NOT EXISTS leave_holidays (
    id BIGINT UNSIGNED NOT NULL AUTO_INCREMENT,
    calendar_id BIGINT UNSIGNED NOT NULL,
    holiday_date DATE NOT NULL,
    name VARCHAR(160) NOT NULL,
    holiday_type ENUM('mandatory', 'optional') NOT NULL DEFAULT 'mandatory',
    status VARCHAR(20) NOT NULL DEFAULT 'active',
    created_by BIGINT UNSIGNED NULL,
    created_at DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
    updated_at DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
    PRIMARY KEY (id),
    UNIQUE KEY uq_leave_holiday (calendar_id, holiday_date),
    KEY idx_leave_holiday_date (holiday_date),
    CONSTRAINT fk_leave_holiday_cal FOREIGN KEY (calendar_id) REFERENCES leave_calendars(id) ON DELETE CASCADE,
    CONSTRAINT fk_leave_holiday_creator FOREIGN KEY (created_by) REFERENCES users(id) ON DELETE SET NULL
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

-- 3. Leave Policies
CREATE TABLE IF NOT EXISTS leave_policies (
    id BIGINT UNSIGNED NOT NULL AUTO_INCREMENT,
    policy_key VARCHAR(64) NOT NULL,
    name VARCHAR(160) NOT NULL,
    description TEXT NULL,
    calendar_id BIGINT UNSIGNED NOT NULL,
    status VARCHAR(20) NOT NULL DEFAULT 'draft',
    version INT UNSIGNED NOT NULL DEFAULT 1,
    effective_from DATE NOT NULL,
    effective_to DATE NULL,
    is_default TINYINT(1) NOT NULL DEFAULT 0,
    created_by BIGINT UNSIGNED NULL,
    updated_by BIGINT UNSIGNED NULL,
    created_at DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
    updated_at DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
    PRIMARY KEY (id),
    UNIQUE KEY uq_leave_policies_key (policy_key),
    KEY idx_leave_policies_status (status),
    CONSTRAINT fk_leave_policies_cal FOREIGN KEY (calendar_id) REFERENCES leave_calendars(id) ON DELETE RESTRICT,
    CONSTRAINT fk_leave_policies_creator FOREIGN KEY (created_by) REFERENCES users(id) ON DELETE SET NULL,
    CONSTRAINT fk_leave_policies_updater FOREIGN KEY (updated_by) REFERENCES users(id) ON DELETE SET NULL
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

-- 4. Leave Types
CREATE TABLE IF NOT EXISTS leave_types (
    id BIGINT UNSIGNED NOT NULL AUTO_INCREMENT,
    policy_id BIGINT UNSIGNED NOT NULL,
    type_key VARCHAR(64) NOT NULL,
    name VARCHAR(160) NOT NULL,
    description TEXT NULL,
    unit ENUM('day', 'hour') NOT NULL DEFAULT 'day',
    paid_status ENUM('paid', 'unpaid', 'partial') NOT NULL DEFAULT 'paid',
    requires_balance TINYINT(1) NOT NULL DEFAULT 1,
    requires_approval TINYINT(1) NOT NULL DEFAULT 1,
    allows_half_day TINYINT(1) NOT NULL DEFAULT 1,
    allows_partial_day TINYINT(1) NOT NULL DEFAULT 0,
    carry_forward_enabled TINYINT(1) NOT NULL DEFAULT 0,
    encashment_enabled TINYINT(1) NOT NULL DEFAULT 0,
    max_balance DECIMAL(6,2) NULL,
    sort_order INT NOT NULL DEFAULT 0,
    status VARCHAR(20) NOT NULL DEFAULT 'active',
    created_at DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
    updated_at DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
    PRIMARY KEY (id),
    UNIQUE KEY uq_leave_types_key (policy_id, type_key),
    KEY idx_leave_types_status (status),
    CONSTRAINT fk_leave_types_policy FOREIGN KEY (policy_id) REFERENCES leave_policies(id) ON DELETE CASCADE
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

-- 5. Policy Rules
CREATE TABLE IF NOT EXISTS leave_policy_rules (
    id BIGINT UNSIGNED NOT NULL AUTO_INCREMENT,
    policy_id BIGINT UNSIGNED NOT NULL,
    leave_type_id BIGINT UNSIGNED NULL,
    rule_key VARCHAR(64) NOT NULL,
    rule_type VARCHAR(64) NOT NULL,
    priority INT NOT NULL DEFAULT 0,
    config_json JSON NOT NULL,
    status VARCHAR(20) NOT NULL DEFAULT 'active',
    created_at DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
    updated_at DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
    PRIMARY KEY (id),
    KEY idx_leave_rules_lookup (policy_id, leave_type_id, rule_type),
    CONSTRAINT fk_leave_rules_policy FOREIGN KEY (policy_id) REFERENCES leave_policies(id) ON DELETE CASCADE,
    CONSTRAINT fk_leave_rules_type FOREIGN KEY (leave_type_id) REFERENCES leave_types(id) ON DELETE CASCADE
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

-- 6. Policy Assignments
CREATE TABLE IF NOT EXISTS leave_policy_assignments (
    id BIGINT UNSIGNED NOT NULL AUTO_INCREMENT,
    policy_id BIGINT UNSIGNED NOT NULL,
    user_id BIGINT UNSIGNED NULL,
    organization_entity_id BIGINT UNSIGNED NULL,
    conditions_json JSON NULL,
    priority INT NOT NULL DEFAULT 0,
    status VARCHAR(20) NOT NULL DEFAULT 'active',
    created_at DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
    updated_at DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
    PRIMARY KEY (id),
    KEY idx_leave_assign_policy (policy_id),
    KEY idx_leave_assign_user (user_id),
    KEY idx_leave_assign_org (organization_entity_id),
    CONSTRAINT fk_leave_assign_policy FOREIGN KEY (policy_id) REFERENCES leave_policies(id) ON DELETE CASCADE,
    CONSTRAINT fk_leave_assign_user FOREIGN KEY (user_id) REFERENCES users(id) ON DELETE CASCADE,
    CONSTRAINT fk_leave_assign_org FOREIGN KEY (organization_entity_id) REFERENCES organization_entities(id) ON DELETE CASCADE
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

-- 7. Approval Workflows
CREATE TABLE IF NOT EXISTS leave_workflows (
    id BIGINT UNSIGNED NOT NULL AUTO_INCREMENT,
    policy_id BIGINT UNSIGNED NOT NULL,
    workflow_key VARCHAR(64) NOT NULL,
    name VARCHAR(160) NOT NULL,
    description TEXT NULL,
    conditions_json JSON NULL,
    status VARCHAR(20) NOT NULL DEFAULT 'active',
    version INT UNSIGNED NOT NULL DEFAULT 1,
    created_at DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
    updated_at DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
    PRIMARY KEY (id),
    UNIQUE KEY uq_leave_workflows_key (policy_id, workflow_key),
    CONSTRAINT fk_leave_workflows_policy FOREIGN KEY (policy_id) REFERENCES leave_policies(id) ON DELETE CASCADE
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

-- 8. Approval Workflow Steps
CREATE TABLE IF NOT EXISTS leave_workflow_steps (
    id BIGINT UNSIGNED NOT NULL AUTO_INCREMENT,
    workflow_id BIGINT UNSIGNED NOT NULL,
    step_order INT NOT NULL DEFAULT 1,
    approval_mode VARCHAR(30) NOT NULL DEFAULT 'SEQUENTIAL',
    approver_type VARCHAR(64) NOT NULL,
    approver_config_json JSON NOT NULL,
    timeout_hours INT UNSIGNED NULL,
    created_at DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
    updated_at DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
    PRIMARY KEY (id),
    KEY idx_leave_wf_steps (workflow_id, step_order),
    CONSTRAINT fk_leave_wf_steps_wf FOREIGN KEY (workflow_id) REFERENCES leave_workflows(id) ON DELETE CASCADE
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

-- 9. Leave Balances
CREATE TABLE IF NOT EXISTS leave_balances (
    id BIGINT UNSIGNED NOT NULL AUTO_INCREMENT,
    user_id BIGINT UNSIGNED NOT NULL,
    leave_type_id BIGINT UNSIGNED NOT NULL,
    policy_id BIGINT UNSIGNED NOT NULL,
    period_start DATE NOT NULL,
    period_end DATE NOT NULL,
    opening_balance DECIMAL(6,2) NOT NULL DEFAULT 0.00,
    accrued DECIMAL(6,2) NOT NULL DEFAULT 0.00,
    carried_forward DECIMAL(6,2) NOT NULL DEFAULT 0.00,
    adjusted DECIMAL(6,2) NOT NULL DEFAULT 0.00,
    consumed DECIMAL(6,2) NOT NULL DEFAULT 0.00,
    closing_balance DECIMAL(6,2) NOT NULL DEFAULT 0.00,
    unit ENUM('day', 'hour') NOT NULL DEFAULT 'day',
    created_at DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
    updated_at DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
    PRIMARY KEY (id),
    UNIQUE KEY uq_user_leave_period (user_id, leave_type_id, period_start, period_end),
    KEY idx_leave_balances_user (user_id),
    CONSTRAINT fk_leave_balances_user FOREIGN KEY (user_id) REFERENCES users(id) ON DELETE CASCADE,
    CONSTRAINT fk_leave_balances_type FOREIGN KEY (leave_type_id) REFERENCES leave_types(id) ON DELETE RESTRICT,
    CONSTRAINT fk_leave_balances_policy FOREIGN KEY (policy_id) REFERENCES leave_policies(id) ON DELETE RESTRICT
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

-- 10. Balance Transactions (Immutable Ledger)
CREATE TABLE IF NOT EXISTS leave_balance_transactions (
    id BIGINT UNSIGNED NOT NULL AUTO_INCREMENT,
    balance_id BIGINT UNSIGNED NOT NULL,
    user_id BIGINT UNSIGNED NOT NULL,
    leave_application_id BIGINT UNSIGNED NULL,
    transaction_type VARCHAR(40) NOT NULL,
    quantity DECIMAL(6,2) NOT NULL,
    reference VARCHAR(255) NULL,
    metadata_json JSON NULL,
    created_by BIGINT UNSIGNED NULL,
    created_at DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
    PRIMARY KEY (id),
    KEY idx_leave_tx_balance (balance_id, created_at),
    KEY idx_leave_tx_user (user_id),
    CONSTRAINT fk_leave_tx_balance FOREIGN KEY (balance_id) REFERENCES leave_balances(id) ON DELETE RESTRICT,
    CONSTRAINT fk_leave_tx_user FOREIGN KEY (user_id) REFERENCES users(id) ON DELETE CASCADE,
    CONSTRAINT fk_leave_tx_creator FOREIGN KEY (created_by) REFERENCES users(id) ON DELETE SET NULL
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

-- 11. Leave Applications
CREATE TABLE IF NOT EXISTS leave_applications (
    id BIGINT UNSIGNED NOT NULL AUTO_INCREMENT,
    application_number VARCHAR(64) NOT NULL,
    user_id BIGINT UNSIGNED NOT NULL,
    policy_id BIGINT UNSIGNED NOT NULL,
    policy_version INT UNSIGNED NOT NULL DEFAULT 1,
    leave_type_id BIGINT UNSIGNED NOT NULL,
    start_date DATE NOT NULL,
    end_date DATE NOT NULL,
    requested_units DECIMAL(5,2) NOT NULL,
    calculated_units DECIMAL(5,2) NOT NULL,
    unit ENUM('day', 'hour') NOT NULL DEFAULT 'day',
    reason TEXT NOT NULL,
    emergency_flag TINYINT(1) NOT NULL DEFAULT 0,
    status VARCHAR(30) NOT NULL DEFAULT 'SUBMITTED',
    custom_data_json JSON NULL,
    submitted_at DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
    approved_at DATETIME NULL,
    rejected_at DATETIME NULL,
    cancelled_at DATETIME NULL,
    created_at DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
    updated_at DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
    PRIMARY KEY (id),
    UNIQUE KEY uq_leave_app_number (application_number),
    KEY idx_leave_app_user (user_id, status),
    KEY idx_leave_app_dates (start_date, end_date),
    CONSTRAINT fk_leave_app_user FOREIGN KEY (user_id) REFERENCES users(id) ON DELETE RESTRICT,
    CONSTRAINT fk_leave_app_policy FOREIGN KEY (policy_id) REFERENCES leave_policies(id) ON DELETE RESTRICT,
    CONSTRAINT fk_leave_app_type FOREIGN KEY (leave_type_id) REFERENCES leave_types(id) ON DELETE RESTRICT
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

-- Add FK for leave_application_id in transactions
ALTER TABLE leave_balance_transactions
    ADD CONSTRAINT fk_leave_tx_app
    FOREIGN KEY (leave_application_id) REFERENCES leave_applications(id)
    ON DELETE SET NULL;

-- 12. Application Days Breakdown
CREATE TABLE IF NOT EXISTS leave_application_days (
    id BIGINT UNSIGNED NOT NULL AUTO_INCREMENT,
    application_id BIGINT UNSIGNED NOT NULL,
    date DATE NOT NULL,
    day_type VARCHAR(30) NOT NULL,
    counted TINYINT(1) NOT NULL DEFAULT 1,
    units DECIMAL(4,2) NOT NULL DEFAULT 1.00,
    calculation_metadata_json JSON NULL,
    PRIMARY KEY (id),
    KEY idx_leave_app_days (application_id, date),
    CONSTRAINT fk_leave_days_app FOREIGN KEY (application_id) REFERENCES leave_applications(id) ON DELETE CASCADE
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

-- 13. Application Approvals (Frozen Chain Snapshot)
CREATE TABLE IF NOT EXISTS leave_application_approvals (
    id BIGINT UNSIGNED NOT NULL AUTO_INCREMENT,
    application_id BIGINT UNSIGNED NOT NULL,
    step_order INT NOT NULL DEFAULT 1,
    approver_type VARCHAR(64) NOT NULL,
    approver_user_id BIGINT UNSIGNED NULL,
    approver_role_key VARCHAR(64) NULL,
    approver_entity_id BIGINT UNSIGNED NULL,
    status VARCHAR(30) NOT NULL DEFAULT 'PENDING',
    action_by_user_id BIGINT UNSIGNED NULL,
    comments TEXT NULL,
    acted_at DATETIME NULL,
    created_at DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
    PRIMARY KEY (id),
    KEY idx_leave_appr_chain (application_id, step_order),
    KEY idx_leave_appr_user (approver_user_id, status),
    CONSTRAINT fk_leave_appr_app FOREIGN KEY (application_id) REFERENCES leave_applications(id) ON DELETE CASCADE,
    CONSTRAINT fk_leave_appr_user FOREIGN KEY (approver_user_id) REFERENCES users(id) ON DELETE SET NULL,
    CONSTRAINT fk_leave_appr_entity FOREIGN KEY (approver_entity_id) REFERENCES organization_entities(id) ON DELETE SET NULL,
    CONSTRAINT fk_leave_appr_actor FOREIGN KEY (action_by_user_id) REFERENCES users(id) ON DELETE SET NULL
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

-- 14. Permissions
INSERT INTO permissions (permission_key, label) VALUES
    ('leave.view', 'View personal leave balances and history'),
    ('leave.apply', 'Submit personal leave requests'),
    ('leave.cancel', 'Cancel personal leave requests'),
    ('leave.approve', 'Review and approve assigned leave requests'),
    ('leave.reject', 'Reject assigned leave requests'),
    ('leave.calendar.view', 'View team absence calendar'),
    ('leave.policies.view', 'View leave policies and configuration'),
    ('leave.policies.manage', 'Create, edit and publish leave policies'),
    ('leave.types.view', 'View leave types'),
    ('leave.types.manage', 'Create and edit leave types'),
    ('leave.rules.view', 'View leave policy rules'),
    ('leave.rules.manage', 'Create and edit leave policy rules'),
    ('leave.workflows.view', 'View approval workflows'),
    ('leave.workflows.manage', 'Create and edit approval workflows'),
    ('leave.balances.view', 'View employee leave balances'),
    ('leave.balances.manage', 'Manually adjust employee leave balances'),
    ('leave.calendars.view', 'View working calendars and holidays'),
    ('leave.calendars.manage', 'Create and edit working calendars and holidays'),
    ('leave.reports.view', 'View and export leave summary reports')
ON DUPLICATE KEY UPDATE label = VALUES(label);

-- Bind permissions to Super Admin (all)
INSERT INTO role_permissions (role_id, permission_id)
SELECT r.id, p.id
FROM roles r
CROSS JOIN permissions p
WHERE r.role_key = 'super_admin'
  AND p.permission_key LIKE 'leave.%'
ON DUPLICATE KEY UPDATE role_id = role_id;

-- Bind permissions to Admin (all)
INSERT INTO role_permissions (role_id, permission_id)
SELECT r.id, p.id
FROM roles r
CROSS JOIN permissions p
WHERE r.role_key = 'admin'
  AND p.permission_key LIKE 'leave.%'
ON DUPLICATE KEY UPDATE role_id = role_id;

-- Bind permissions to Manager
INSERT INTO role_permissions (role_id, permission_id)
SELECT r.id, p.id
FROM roles r
CROSS JOIN permissions p
WHERE r.role_key = 'manager'
  AND p.permission_key IN (
      'leave.view',
      'leave.apply',
      'leave.cancel',
      'leave.approve',
      'leave.reject',
      'leave.calendar.view',
      'leave.balances.view',
      'leave.reports.view'
  )
ON DUPLICATE KEY UPDATE role_id = role_id;

-- Bind permissions to Employee
INSERT INTO role_permissions (role_id, permission_id)
SELECT r.id, p.id
FROM roles r
CROSS JOIN permissions p
WHERE r.role_key = 'employee'
  AND p.permission_key IN (
      'leave.view',
      'leave.apply',
      'leave.cancel',
      'leave.calendar.view'
  )
ON DUPLICATE KEY UPDATE role_id = role_id;
