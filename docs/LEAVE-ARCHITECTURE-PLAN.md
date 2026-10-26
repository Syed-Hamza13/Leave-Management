# Leave Management Module — Master Architecture & Implementation Plan

**Specification Document Reference:** [`docs/LEAVES-MODULES-PLAN.md`](file:///c:/Users/pc/Desktop/Software%20Projects/Leave-Management/docs/LEAVES-MODULES-PLAN.md)  
**Creation Date:** 2026-10-26  
**Status:** Approved for Implementation

---

## 1. Current Architecture Understanding

The Leave Management System is a production-grade multi-layer web application built on the following stack:

- **Backend Runtime:** Node.js (ES Modules `"type": "module"`), Express 5 (`server/src/app.js`).
- **Database:** MySQL 8 with connection pooling (`server/src/config/database.js`), strict transactional execution (`withTransaction` in `server/src/lib/transactions.js`), and append-only, checksum-verified migrations (`server/scripts/migrate.js`).
- **Session & Caching:** Redis 6+ backing `express-session` (`leave.sid`) and `rate-limit-redis`.
- **Security & Cryptography:** Argon2id password hashing, CSRF double-submit cookies (`csrf-csrf`), Helmet HTTP headers, CORS whitelisting, and strict per-request authorization checks (`requireAuth`, `requirePermission`, `requireAllPermissions`).
- **API Convention:** Versioned REST endpoints mounted under `/api/v1/` returning standardized envelopes:
  - Single entity: `{ success: true, data }`
  - Collections: `{ success: true, data, meta: { page, pageSize, total, totalPages, hasNext, hasPrev } }`
  - Operations: `{ success: true, message, data }`
  - Errors: `{ success: false, code: STABLE_MACHINE_CODE, message, errors: { field: [msg] }, details }`
- **Dynamic Metadata Layer:** Logical tables and field definitions (`field_definitions`, `dropdown_definitions`, `form_definitions`, `table_definitions`, `table_records`) that capture customizable user attributes and form submissions without altering MySQL DDL at runtime.
- **Organization Hierarchy:** `organization_entity_types`, `organization_entities`, and `organization_entity_members` (linking users with explicit roles: `member`, `lead`, `manager`).
- **Frontend:** React 19, Vite, Tailwind CSS 4, React Router 7. Shell navigation dynamically filtered by user permissions (`client/src/layouts/navigation.js`). Standardized UI component primitives in `client/src/components/ui/` (`Button`, `DataTable`, `Modal`, `FormField`, `DateInput`, `TextInput`, `Select`, `Toggle`, `Badge`, `PageHeader`, `Pagination`, `ReferencePicker`, `ConfirmDialog`, `Toast`).
- **Automated Testing:** Selenium WebDriver test runner in `testing/run.js` executing 17 existing suites (00 to 16, 151 tests) in isolated execution environments with tagged test accounts.

---

## 2. Existing Modules Reused

The Leave Management Module natively integrates with and reuses:

| Existing Module | Path / Table | Integration Purpose in Leave Management |
| :--- | :--- | :--- |
| **Authentication & Users** | `server/src/modules/users/`, `users` | Applicant identity (`user_id`), approver assignments, and session context (`req.session.user.id`). Never trusts client-supplied user IDs. |
| **Organization Structure** | `server/src/modules/organization/`, `organization_entities`, `organization_entity_members` | Approver hierarchy resolution: maps employees to teams, centres, and committees (e.g. `lead`, `manager`, `committee` roles). |
| **RBAC Authorization** | `server/src/modules/authorization/`, `roles`, `permissions`, `role_permissions` | Gates all Leave endpoints with granular permissions (`leave.apply`, `leave.approve`, `leave.policies.manage`, etc.). |
| **Audit Trail** | `server/src/modules/audit/`, `audit_events` | Logs all leave mutations (submissions, approvals, cancellations, manual ledger adjustments) with recursive secret redaction. |
| **Transactions Utility** | `server/src/lib/transactions.js` (`withTransaction`) | Enforces ACID transactions across ledger debits/credits and application status transitions. |
| **Standard Envelopes** | `server/src/lib/responses.js`, `server/src/lib/appError.js` | Enforces uniform API JSON format and domain-specific stable error codes. |
| **Validation Engine** | `server/src/middleware/validate.js` | Request body, query, and parameter validation using Zod schemas. |
| **Dynamic Fields & Forms** | `server/src/modules/fields/`, `forms/`, `records/` | Captures organization-custom leave attributes (handover plans, project codes, substitute personnel) without schema pollution. |
| **UI Primitives** | `client/src/components/ui/` | Direct reuse of `DataTable`, `Modal`, `Button`, `FormField`, `DateInput`, `Select`, `Badge`, `ReferencePicker`, and `Toast`. |
| **Navigation Shell** | `client/src/layouts/AppShell.jsx`, `navigation.js` | Integrates `Leave` and `Administration → Leave` groups gated by user permissions. |

---

## 3. New Modules Architecture

To prevent a monolithic `leave.js` and maintain strict **Controller → Service → Repository** separation, the backend will be structured under `server/src/modules/leave/`:

```
server/src/modules/leave/
├── policy/
│   ├── policy.repository.js       # SQL queries for leave_policies and policy versions
│   ├── policy.service.js          # Draft, publish, archive, validation, versioning logic
│   └── policy.validation.js       # Zod schemas for policy payload
├── types/
│   ├── leaveType.repository.js    # SQL queries for leave_types
│   ├── leaveType.service.js       # CRUD and validation for leave types under policies
│   └── leaveType.validation.js    # Zod schemas for leave types
├── rules/
│   ├── rule.repository.js         # SQL queries for leave_policy_rules
│   ├── rule.validator.js          # Validates rule config JSON schemas per rule_type
│   ├── rule.engine.js             # Orchestrates rule evaluation pipeline
│   └── evaluators/                # Pluggable rule evaluator implementations:
│       ├── entitlement.evaluator.js
│       ├── eligibility.evaluator.js
│       ├── notice.evaluator.js
│       ├── duration.evaluator.js
│       ├── sandwich.evaluator.js
│       ├── document.evaluator.js
│       └── balance.evaluator.js
├── calendars/
│   ├── calendar.repository.js     # SQL queries for leave_calendars & leave_holidays
│   ├── calendar.service.js        # Working-day detection, holiday resolution
│   └── calendar.validation.js     # Zod schemas for calendars and holidays
├── calculation/
│   └── leaveCalculation.service.js# Pure calculation engine: date breakdown, working days,
│                                  # sandwich day evaluation, counted units, rule explanation
├── balance/
│   ├── balance.repository.js      # SQL queries for leave_balances & leave_balance_transactions
│   ├── balance.service.js         # Ledger adjustments, accruals, carry-forward, consumption,
│   │                              # row-locking concurrency guard (SELECT ... FOR UPDATE)
│   └── balance.validation.js      # Zod schemas for manual balance adjustments
├── workflow/
│   ├── workflow.repository.js     # SQL queries for leave_workflows & workflow_steps
│   ├── workflow.service.js        # Approver resolution (USER, MANAGER, ENTITY_LEAD, ROLE, COMMITTEE)
│   └── workflow.validation.js     # Zod schemas for workflows and approval steps
├── applications/
│   ├── application.repository.js  # SQL queries for applications, days, and approval snapshots
│   ├── application.service.js     # Application state machine (DRAFT, PENDING, APPROVED, etc.),
│   │                              # approval routing, cancellation, transaction coordination
│   └── application.validation.js  # Zod schemas for submit, approve, reject, cancel
├── reports/
│   ├── report.repository.js       # SQL aggregation queries for summaries, registers, SLA
│   └── report.service.js          # Data formatting for HR summary, monthly register, LWP report
├── leave.controller.js            # Express controller delegating to respective services
├── leave.routes.js                # Route definitions and middleware binding
└── leave.constants.js             # Enums, statuses, transaction types, error codes
```

---

## 4. Database Tables Specification

A new migration `010_leave_management.sql` will be added to `server/sql/migrations/`.

### 4.1 Working Calendars & Holidays
- **`leave_calendars`**:
  - `id` BIGINT UNSIGNED AUTO_INCREMENT PRIMARY KEY
  - `name` VARCHAR(120) NOT NULL
  - `timezone` VARCHAR(60) NOT NULL DEFAULT 'Asia/Kolkata'
  - `working_days_json` JSON NOT NULL comment 'e.g. {"monday":true,"tuesday":true,"wednesday":true,"thursday":true,"friday":true,"saturday":true,"sunday":false}'
  - `is_default` TINYINT(1) NOT NULL DEFAULT 0
  - `status` VARCHAR(20) NOT NULL DEFAULT 'active'
  - Timestamps & Audit FKs (`created_by`, `updated_by`, `created_at`, `updated_at`)
- **`leave_holidays`**:
  - `id` BIGINT UNSIGNED AUTO_INCREMENT PRIMARY KEY
  - `calendar_id` BIGINT UNSIGNED NOT NULL (FK -> `leave_calendars.id` ON DELETE CASCADE)
  - `holiday_date` DATE NOT NULL
  - `name` VARCHAR(160) NOT NULL
  - `holiday_type` ENUM('mandatory', 'optional') NOT NULL DEFAULT 'mandatory'
  - `status` VARCHAR(20) NOT NULL DEFAULT 'active'
  - Timestamps & Audit FKs (`created_by`, `created_at`, `updated_at`)
  - UNIQUE (`calendar_id`, `holiday_date`)

### 4.2 Leave Policies & Types
- **`leave_policies`**:
  - `id` BIGINT UNSIGNED AUTO_INCREMENT PRIMARY KEY
  - `policy_key` VARCHAR(64) NOT NULL UNIQUE
  - `name` VARCHAR(160) NOT NULL
  - `description` TEXT NULL
  - `calendar_id` BIGINT UNSIGNED NOT NULL (FK -> `leave_calendars.id`)
  - `status` ENUM('draft', 'published', 'archived') NOT NULL DEFAULT 'draft'
  - `version` INT UNSIGNED NOT NULL DEFAULT 1
  - `effective_from` DATE NOT NULL
  - `effective_to` DATE NULL
  - `is_default` TINYINT(1) NOT NULL DEFAULT 0
  - Timestamps & Audit FKs (`created_by`, `updated_by`, `created_at`, `updated_at`)
- **`leave_types`**:
  - `id` BIGINT UNSIGNED AUTO_INCREMENT PRIMARY KEY
  - `policy_id` BIGINT UNSIGNED NOT NULL (FK -> `leave_policies.id` ON DELETE CASCADE)
  - `type_key` VARCHAR(64) NOT NULL
  - `name` VARCHAR(160) NOT NULL
  - `description` TEXT NULL
  - `unit` ENUM('day', 'hour') NOT NULL DEFAULT 'day'
  - `paid_status` ENUM('paid', 'unpaid', 'partial') NOT NULL DEFAULT 'paid'
  - `requires_balance` TINYINT(1) NOT NULL DEFAULT 1
  - `requires_approval` TINYINT(1) NOT NULL DEFAULT 1
  - `allows_half_day` TINYINT(1) NOT NULL DEFAULT 1
  - `allows_partial_day` TINYINT(1) NOT NULL DEFAULT 0
  - `carry_forward_enabled` TINYINT(1) NOT NULL DEFAULT 0
  - `encashment_enabled` TINYINT(1) NOT NULL DEFAULT 0
  - `max_balance` DECIMAL(6,2) NULL
  - `sort_order` INT NOT NULL DEFAULT 0
  - `status` VARCHAR(20) NOT NULL DEFAULT 'active'
  - Timestamps (`created_at`, `updated_at`)
  - UNIQUE (`policy_id`, `type_key`)

### 4.3 Rules & Targeting
- **`leave_policy_rules`**:
  - `id` BIGINT UNSIGNED AUTO_INCREMENT PRIMARY KEY
  - `policy_id` BIGINT UNSIGNED NOT NULL (FK -> `leave_policies.id` ON DELETE CASCADE)
  - `leave_type_id` BIGINT UNSIGNED NULL (FK -> `leave_types.id` ON DELETE CASCADE)
  - `rule_key` VARCHAR(64) NOT NULL
  - `rule_type` VARCHAR(64) NOT NULL (e.g. `ENTITLEMENT`, `NOTICE_PERIOD`, `SANDWICH`, `DURATION`, `DOCUMENT_REQUIRED`, `CARRY_FORWARD`, `ACCUMULATION_CAP`)
  - `priority` INT NOT NULL DEFAULT 0
  - `config_json` JSON NOT NULL
  - `status` VARCHAR(20) NOT NULL DEFAULT 'active'
  - Timestamps (`created_at`, `updated_at`)
  - KEY (`policy_id`, `leave_type_id`, `rule_type`)
- **`leave_policy_assignments`**:
  - `id` BIGINT UNSIGNED AUTO_INCREMENT PRIMARY KEY
  - `policy_id` BIGINT UNSIGNED NOT NULL (FK -> `leave_policies.id` ON DELETE CASCADE)
  - `user_id` BIGINT UNSIGNED NULL (FK -> `users.id` ON DELETE CASCADE)
  - `organization_entity_id` BIGINT UNSIGNED NULL (FK -> `organization_entities.id` ON DELETE CASCADE)
  - `conditions_json` JSON NULL comment 'Attribute matching, e.g. {"employment_type":"programme"}'
  - `priority` INT NOT NULL DEFAULT 0
  - `status` VARCHAR(20) NOT NULL DEFAULT 'active'
  - Timestamps (`created_at`, `updated_at`)

### 4.4 Approval Workflows
- **`leave_workflows`**:
  - `id` BIGINT UNSIGNED AUTO_INCREMENT PRIMARY KEY
  - `policy_id` BIGINT UNSIGNED NOT NULL (FK -> `leave_policies.id` ON DELETE CASCADE)
  - `workflow_key` VARCHAR(64) NOT NULL
  - `name` VARCHAR(160) NOT NULL
  - `description` TEXT NULL
  - `conditions_json` JSON NULL comment 'Criteria when this workflow applies, e.g. min_days, max_days, entity_type'
  - `status` VARCHAR(20) NOT NULL DEFAULT 'active'
  - `version` INT UNSIGNED NOT NULL DEFAULT 1
  - Timestamps (`created_at`, `updated_at`)
- **`leave_workflow_steps`**:
  - `id` BIGINT UNSIGNED AUTO_INCREMENT PRIMARY KEY
  - `workflow_id` BIGINT UNSIGNED NOT NULL (FK -> `leave_workflows.id` ON DELETE CASCADE)
  - `step_order` INT NOT NULL DEFAULT 1
  - `approval_mode` ENUM('SEQUENTIAL', 'PARALLEL_ALL', 'PARALLEL_ANY') NOT NULL DEFAULT 'SEQUENTIAL'
  - `approver_type` ENUM('SPECIFIC_USER', 'USER_MANAGER', 'ENTITY_LEAD', 'ENTITY_ROLE', 'ROLE', 'COMMITTEE') NOT NULL
  - `approver_config_json` JSON NOT NULL comment 'e.g. {"role_key":"manager"} or {"entity_id":4,"role":"lead"}'
  - `timeout_hours` INT UNSIGNED NULL
  - Timestamps (`created_at`, `updated_at`)
  - KEY (`workflow_id`, `step_order`)

### 4.5 Balance & Transaction Ledger
- **`leave_balances`**:
  - `id` BIGINT UNSIGNED AUTO_INCREMENT PRIMARY KEY
  - `user_id` BIGINT UNSIGNED NOT NULL (FK -> `users.id` ON DELETE CASCADE)
  - `leave_type_id` BIGINT UNSIGNED NOT NULL (FK -> `leave_types.id` ON DELETE RESTRICT)
  - `policy_id` BIGINT UNSIGNED NOT NULL (FK -> `leave_policies.id` ON DELETE RESTRICT)
  - `period_start` DATE NOT NULL
  - `period_end` DATE NOT NULL
  - `opening_balance` DECIMAL(6,2) NOT NULL DEFAULT 0.00
  - `accrued` DECIMAL(6,2) NOT NULL DEFAULT 0.00
  - `carried_forward` DECIMAL(6,2) NOT NULL DEFAULT 0.00
  - `adjusted` DECIMAL(6,2) NOT NULL DEFAULT 0.00
  - `consumed` DECIMAL(6,2) NOT NULL DEFAULT 0.00
  - `closing_balance` DECIMAL(6,2) GENERATED ALWAYS AS (opening_balance + accrued + carried_forward + adjusted - consumed) STORED
  - `unit` ENUM('day', 'hour') NOT NULL DEFAULT 'day'
  - `updated_at` DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP
  - UNIQUE KEY `uq_user_leave_period` (`user_id`, `leave_type_id`, `period_start`, `period_end`)
- **`leave_balance_transactions`**:
  - `id` BIGINT UNSIGNED AUTO_INCREMENT PRIMARY KEY
  - `balance_id` BIGINT UNSIGNED NOT NULL (FK -> `leave_balances.id` ON DELETE RESTRICT)
  - `user_id` BIGINT UNSIGNED NOT NULL (FK -> `users.id` ON DELETE CASCADE)
  - `leave_application_id` BIGINT UNSIGNED NULL comment 'Associated application for CONSUMPTION/REVERSAL'
  - `transaction_type` ENUM('OPENING', 'ACCRUAL', 'CARRY_FORWARD', 'CONSUMPTION', 'REVERSAL', 'ADJUSTMENT', 'EXPIRY', 'ENCASHMENT') NOT NULL
  - `quantity` DECIMAL(6,2) NOT NULL comment 'Positive for credits, negative for debits'
  - `reference` VARCHAR(255) NULL
  - `metadata_json` JSON NULL
  - `created_by` BIGINT UNSIGNED NULL (FK -> `users.id` ON DELETE SET NULL)
  - `created_at` DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP
  - KEY `idx_balance_tx` (`balance_id`, `created_at`)

### 4.6 Applications, Day Breakdown & Approval Snapshots
- **`leave_applications`**:
  - `id` BIGINT UNSIGNED AUTO_INCREMENT PRIMARY KEY
  - `application_number` VARCHAR(64) NOT NULL UNIQUE
  - `user_id` BIGINT UNSIGNED NOT NULL (FK -> `users.id` ON DELETE RESTRICT)
  - `policy_id` BIGINT UNSIGNED NOT NULL (FK -> `leave_policies.id` ON DELETE RESTRICT)
  - `policy_version` INT UNSIGNED NOT NULL DEFAULT 1
  - `leave_type_id` BIGINT UNSIGNED NOT NULL (FK -> `leave_types.id` ON DELETE RESTRICT)
  - `start_date` DATE NOT NULL
  - `end_date` DATE NOT NULL
  - `requested_units` DECIMAL(5,2) NOT NULL
  - `calculated_units` DECIMAL(5,2) NOT NULL
  - `unit` ENUM('day', 'hour') NOT NULL DEFAULT 'day'
  - `reason` TEXT NOT NULL
  - `emergency_flag` TINYINT(1) NOT NULL DEFAULT 0
  - `status` ENUM('DRAFT', 'SUBMITTED', 'PENDING_APPROVAL', 'PARTIALLY_APPROVED', 'APPROVED', 'REJECTED', 'CANCELLED', 'WITHDRAWN', 'LWP') NOT NULL DEFAULT 'SUBMITTED'
  - `custom_data_json` JSON NULL comment 'Dynamic custom fields defined by admin forms'
  - `submitted_at` DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP
  - `approved_at` DATETIME NULL
  - `rejected_at` DATETIME NULL
  - `cancelled_at` DATETIME NULL
  - `created_at` DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP
  - `updated_at` DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP
  - KEY `idx_leave_app_user` (`user_id`, `status`)
  - KEY `idx_leave_app_dates` (`start_date`, `end_date`)
- **`leave_application_days`**:
  - `id` BIGINT UNSIGNED AUTO_INCREMENT PRIMARY KEY
  - `application_id` BIGINT UNSIGNED NOT NULL (FK -> `leave_applications.id` ON DELETE CASCADE)
  - `date` DATE NOT NULL
  - `day_type` ENUM('FULL_DAY', 'FIRST_HALF', 'SECOND_HALF', 'SHORT_LEAVE', 'HOLIDAY', 'WEEKEND', 'SANDWICH') NOT NULL
  - `counted` TINYINT(1) NOT NULL DEFAULT 1
  - `units` DECIMAL(4,2) NOT NULL DEFAULT 1.00
  - `calculation_metadata_json` JSON NULL
  - KEY `idx_leave_days_app` (`application_id`, `date`)
- **`leave_application_approvals`**:
  - `id` BIGINT UNSIGNED AUTO_INCREMENT PRIMARY KEY
  - `application_id` BIGINT UNSIGNED NOT NULL (FK -> `leave_applications.id` ON DELETE CASCADE)
  - `step_order` INT NOT NULL DEFAULT 1
  - `approver_type` VARCHAR(64) NOT NULL
  - `approver_user_id` BIGINT UNSIGNED NULL (FK -> `users.id` ON DELETE SET NULL)
  - `approver_role_key` VARCHAR(64) NULL
  - `approver_entity_id` BIGINT UNSIGNED NULL (FK -> `organization_entities.id` ON DELETE SET NULL)
  - `status` ENUM('PENDING', 'APPROVED', 'REJECTED', 'SKIPPED') NOT NULL DEFAULT 'PENDING'
  - `action_by_user_id` BIGINT UNSIGNED NULL (FK -> `users.id` ON DELETE SET NULL)
  - `comments` TEXT NULL
  - `acted_at` DATETIME NULL
  - `created_at` DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP
  - KEY `idx_leave_appr_app` (`application_id`, `step_order`)
  - KEY `idx_leave_appr_user` (`approver_user_id`, `status`)

---

## 5. Relationships & Integrity

```
[leave_calendars] ◄─── (1:N) ─── [leave_holidays]
        ▲
        │ (calendar_id)
[leave_policies] ◄─── (1:N) ─── [leave_types]
        │                             ▲
        ├─── (1:N) ─── [leave_policy_rules] (optional FK to leave_types)
        ├─── (1:N) ─── [leave_policy_assignments] ──► [users] / [organization_entities]
        └─── (1:N) ─── [leave_workflows] ◄─── (1:N) ─── [leave_workflow_steps]
                                                                │
[users] ◄──────────────────────────────────────────────┐        │
   │                                                   │        │
   ├── (1:N) ──► [leave_balances]                      │        │
   │                    │                              │        │
   │                    └── (1:N) ──► [leave_balance_transactions]
   │                                                   │
   └── (1:N) ──► [leave_applications] ─────────────────┘
                        │
                        ├── (1:N) ──► [leave_application_days]
                        └── (1:N) ──► [leave_application_approvals] (persistent snapshot)
```

- **Referential Protection:** Core entities (`leave_policies`, `leave_types`, `leave_applications`, `leave_balances`) use real foreign keys. Deletion of types with existing balances or applications is blocked via `ON DELETE RESTRICT`.
- **Soft Deletion & Versioning:** Historical policies and workflows are archived (`status = 'archived'`), never hard deleted. Every application records `policy_version`.

---

## 6. Rule Engine Design

The rule engine is decoupled into structured rule evaluation components:

1. **Rule Registry (`rules/rule.registry.js`):** Maps `rule_type` strings to evaluator implementations.
2. **Rule Evaluator Interface:**
   ```js
   export async function evaluateRule({ applicationContext, ruleConfig, calendar, balance }) {
     // Returns: { passed: boolean, violations: string[], warnings: string[], effects: object }
   }
   ```
3. **Core Evaluators:**
   - **`ENTITLEMENT`**: Validates annual/periodic allocation and pro-rata rules.
   - **`ELIGIBILITY`**: Checks user attributes (e.g. probation status, tenure, employment category) against rule requirements.
   - **`NOTICE_PERIOD`**: Validates `submission_date` vs `start_date` based on requested duration (e.g., 2 days for ordinary leave, 7 days for >6 days, 30 days for long leave). Respects `emergency_flag` overrides with audit trail.
   - **`DURATION`**: Validates minimum duration (e.g. 0.5 day for PL, 2 hours for short leave) and maximum duration limits.
   - **`SANDWICH`**: Evaluates Sundays and holidays within leave periods. In Eklavya policy: for leaves $\le 7$ days, sandwiched Sundays/holidays are excluded; for leaves $\ge 8$ days, sandwiched non-working days are counted.
   - **`DOCUMENT_REQUIRED`**: Enforces supporting documentation upload when duration exceeds configured threshold or for medical/maternity leave.
   - **`BALANCE`**: Verifies available balance $>=$ calculated units before allowing submission or final approval.
   - **`ACCUMULATION_CAP`**: Caps carry-forward accumulation to policy ceiling (e.g., 180 days).

---

## 7. Approval Workflow Design

1. **Rule-Driven Workflow Resolution:**
   When an application is submitted, the workflow engine matches applicable workflows by evaluating conditions:
   - Employment category (`Programme` vs `Admin`)
   - Duration tier (1–6 days, 7–29 days, 30+ days)
2. **Approver Types Supported:**
   - `SPECIFIC_USER`: Explicit user ID.
   - `USER_MANAGER`: Direct manager designated in user profile or team.
   - `ENTITY_LEAD`: Team / Project Lead from `organization_entity_members` where `role = 'lead'`.
   - `ENTITY_ROLE`: Specific role within entity (e.g. `coordinator`, `in_charge`).
   - `ROLE`: System role (e.g., `admin`, `director`).
   - `COMMITTEE`: All members of a designated organization entity (e.g. `Programme Committee`, `Academic Council`).
3. **Approval Modes:**
   - `SEQUENTIAL`: Step 1 must complete before Step 2 activates.
   - `PARALLEL_ALL`: All approvers in the step must approve.
   - `PARALLEL_ANY`: Any single approver in the step can approve.
4. **Immutable Snapshot Guarantee:**
   Upon submission, the resolved approvers are frozen into `leave_application_approvals`. Subsequent organizational changes do NOT rewrite historical approval chains.

---

## 8. Balance & Ledger Architecture

1. **Ledger-Based Invariant:**
   `leave_balances.closing_balance` is computed strictly from the sum of transactions:
   $$\text{Closing Balance} = \text{Opening} + \text{Accrued} + \text{Carried Forward} + \text{Adjusted} - \text{Consumed}$$
2. **Transaction Safety & Concurrency:**
   All balance updates execute inside `withTransaction(async (connection) => { ... })`:
   - Acquire row-level lock:
     ```sql
     SELECT * FROM leave_balances WHERE id = ? FOR UPDATE;
     ```
   - Verify sufficient remaining balance: `closing_balance >= requested_units`.
   - Insert transaction row in `leave_balance_transactions`.
   - Update summary counters on `leave_balances`.
   - Update `leave_applications` status and log `recordAudit`.
   - Commit transaction.
3. **Reversals on Cancellation:**
   If an approved leave is cancelled, a corresponding `REVERSAL` transaction is appended to the ledger, cleanly restoring the balance.

---

## 9. API Design

All endpoints require authentication (`requireAuth`) and are mounted under `/api/v1/`:

### 9.1 Employee Endpoints (`/api/v1/leave/`)
| Method | Route | Permission | Description |
| :--- | :--- | :--- | :--- |
| `GET` | `/api/v1/leave/dashboard` | `leave.view` | Aggregated user summary: balances, active requests, upcoming leaves |
| `GET` | `/api/v1/leave/balances` | `leave.view` | User's leave balances with opening/consumed/available figures |
| `GET` | `/api/v1/leave/balances/:id/ledger` | `leave.view` | Detailed audit ledger for a specific balance account |
| `POST` | `/api/v1/leave/calculate` | `leave.apply` | Dry-run preview calculation (working days, sandwich days, rule checks) |
| `POST` | `/api/v1/leave/applications` | `leave.apply` | Submit a new leave application |
| `GET` | `/api/v1/leave/applications` | `leave.view` | List user's leave applications (paginated, filterable) |
| `GET` | `/api/v1/leave/applications/:id` | `leave.view` | Retrieve application details, day breakdown, and approval status |
| `POST` | `/api/v1/leave/applications/:id/cancel` | `leave.cancel` | Cancel a pending or approved future leave request |
| `GET` | `/api/v1/leave/calendar` | `leave.calendar.view` | Team absence calendar (anonymized/privacy-aware) |

### 9.2 Manager & Approver Endpoints (`/api/v1/leave/approvals/`)
| Method | Route | Permission | Description |
| :--- | :--- | :--- | :--- |
| `GET` | `/api/v1/leave/approvals/pending` | `leave.approve` | Applications waiting for current authenticated user's review |
| `GET` | `/api/v1/leave/approvals/history` | `leave.approve` | History of applications reviewed by user |
| `POST` | `/api/v1/leave/approvals/:id/approve` | `leave.approve` | Approve application step (with balance deduction if final step) |
| `POST` | `/api/v1/leave/approvals/:id/reject` | `leave.reject` | Reject application with mandatory reason |

### 9.3 Admin Endpoints (`/api/v1/admin/leave/`)
| Method | Route | Permission | Description |
| :--- | :--- | :--- | :--- |
| `GET, POST` | `/api/v1/admin/leave/policies` | `leave.policies.view`, `.manage` | List / create leave policies |
| `GET, PATCH` | `/api/v1/admin/leave/policies/:id` | `leave.policies.view`, `.manage` | View / update policy header |
| `POST` | `/api/v1/admin/leave/policies/:id/publish` | `leave.policies.manage` | Validate and publish policy version |
| `GET, POST, PATCH`| `/api/v1/admin/leave/types` | `leave.types.view`, `.manage` | CRUD leave types under policies |
| `GET, POST, PATCH`| `/api/v1/admin/leave/rules` | `leave.rules.view`, `.manage` | CRUD policy rules |
| `GET, POST, PATCH`| `/api/v1/admin/leave/workflows` | `leave.workflows.view`, `.manage` | CRUD approval workflows and steps |
| `GET, POST, PATCH`| `/api/v1/admin/leave/calendars` | `leave.calendars.view`, `.manage` | Working week & holiday configuration |
| `GET, POST` | `/api/v1/admin/leave/balances/adjust`| `leave.balances.manage` | Manual ledger adjustment with mandatory reason |
| `GET` | `/api/v1/admin/leave/reports/summary` | `leave.reports.view` | HR monthly leave summary report |

---

## 10. Permission Design

New granular permissions to be added to `permissions` table:

```
leave.view                 - View personal leave balances and history
leave.apply                - Submit personal leave requests
leave.cancel               - Cancel personal leave requests
leave.approve              - Review and approve assigned leave requests
leave.reject               - Reject assigned leave requests
leave.calendar.view        - View team absence calendar
leave.policies.view        - View leave policies and configuration
leave.policies.manage      - Create, edit, publish leave policies
leave.types.view           - View leave types
leave.types.manage         - Create and edit leave types
leave.rules.view           - View leave rules
leave.rules.manage         - Create and edit leave rules
leave.workflows.view       - View approval workflows
leave.workflows.manage     - Create and edit approval workflows
leave.balances.view        - View employee balances across the organization
leave.balances.manage      - Manually adjust employee balances via ledger
leave.calendars.view       - View working calendars and holidays
leave.calendars.manage     - Edit working calendars and holidays
leave.reports.view         - View and export leave summary and register reports
```

### Role Mapping:
- `super_admin`: All permissions.
- `admin`: All permissions except direct security overrides.
- `manager`: `leave.view`, `leave.apply`, `leave.cancel`, `leave.approve`, `leave.reject`, `leave.calendar.view`, `leave.balances.view`, `leave.reports.view`.
- `employee`: `leave.view`, `leave.apply`, `leave.cancel`, `leave.calendar.view`.

---

## 11. Frontend Route & UI Plan

### 11.1 Routes (`client/src/app/router.jsx`)
- `/leave`: Employee Dashboard (`LeaveDashboardPage.jsx`)
- `/leave/my-leaves`: My Applications list (`MyLeavesPage.jsx`)
- `/leave/apply`: Apply Leave guided wizard (`ApplyLeavePage.jsx`)
- `/leave/approvals`: Manager Approval Queue (`LeaveApprovalsPage.jsx`)
- `/leave/calendar`: Team Absence Calendar (`LeaveCalendarPage.jsx`)
- `/admin/leave/policies`: Policies Management (`PoliciesPage.jsx`)
- `/admin/leave/policies/:id`: Policy Editor (`PolicyEditorPage.jsx`)
- `/admin/leave/balances`: Admin Balances & Ledger drill-down (`BalancesPage.jsx`)
- `/admin/leave/calendars`: Working week & Holiday management (`CalendarsPage.jsx`)
- `/admin/leave/reports`: HR Reports & Register (`LeaveReportsPage.jsx`)

### 11.2 UI Aesthetics & Component Reuse
- **Dashboard:** Rich summary cards (Available Balance progress bars, Pending Approvals count, Used Days), upcoming absence banner, and rapid-action "Apply Leave" button.
- **Guided Application Form:**
  - Step 1: Select Leave Type (displays available quota, notice period rules, unit).
  - Step 2: Date Picker with instant preview (working days, sandwich days, excluded holidays, total counted days).
  - Step 3: Dynamic attributes (emergency toggle, reason, handover plan, file reference).
  - Step 4: Transparent Rule Check breakdown and visual Approval Path preview before submit.
- **Approvals Screen:** Clean tabular overview with quick status badges and review modal showing employee quota impact and one-click Approve / Reject with remarks.
- **Navigation:** Grouped seamlessly in `client/src/layouts/navigation.js` under `Leave` and `Administration → Leave Management`.

---

## 12. Migration Plan

- **File:** `server/sql/migrations/010_leave_management.sql`
- **Execution:** Runs via `npm run migrate` in `server/`.
- **Integrity Guarantee:** Never modifies migrations `001` through `009`. Creates all 12 relational domain tables, seeds new permissions, assigns permissions to default roles, and inserts default working calendar and policy structure.

---

## 13. Seed Strategy (Eklavya Standard Policy)

A dedicated script `server/scripts/seed-leave-policy.js` will seed the standard policy configuration:
1. **Calendar:** 6-day working week (Monday–Saturday active, Sunday off).
2. **Leave Types:**
   - **Privilege Leave (PL):** 35 days entitlement, carry-forward enabled, accumulation ceiling 180 days, minimum duration 0.5 day.
   - **Short Leave:** 24 instances of 2 hours (unit: hour, quantum: 2, total 6 days), carry-forward disabled, no prior approval required.
   - **Optional Leave:** 2 days entitlement.
   - **Maternity Leave:** 26 weeks, medical certificate required.
   - **Paternity Leave:** 2 weeks.
3. **Rules:**
   - Sandwich rule: Leaves $\le 7$ days exclude Sundays/holidays; leaves $\ge 8$ days count sandwiched Sundays/holidays.
   - Notice period: 2 days advance notice for ordinary leave; 7 days advance notice for $>6$ days; 30 days for long leave. Same-day emergency exception supported.
4. **Workflows:**
   - Programme Staff: 1–6 days $\rightarrow$ Local Coordinator / Project In-charge; 7–29 days $\rightarrow$ Programme Committee; 30+ days $\rightarrow$ Academic Council.
   - Admin Staff: 1–6 days $\rightarrow$ Unit/Centre In-charge; 7–29 days $\rightarrow$ Centre In-charge + EO/Director; 30+ days $\rightarrow$ Executive Council.
5. **Initial Balances:** Seed test accounts (`e2e.admin@leave.test`, `e2e.employee@leave.test`) with opening balances.

---

## 14. Test Plan

1. **Unit & API Tests:**
   - Calculation engine unit tests: single day, multi-day, holiday exclusion, sandwich rule boundary (7 vs 8 days), half-day, short leave 2-hour quanta.
   - Ledger & balance concurrency tests: transaction rollbacks, race conditions on balance depletion (`SELECT ... FOR UPDATE`).
   - Workflow & authorization tests: forbidden unauthorized approval attempts, immutable approver snapshot verification, emergency notice override.
2. **Selenium E2E Test Suites (`testing/suites/`):**
   - `17-leave-navigation.js`: Sidebar navigation, role-based menu gating.
   - `18-leave-policy-config.js`: Admin policy creation, rule builder, workflow setup.
   - `19-leave-application.js`: Employee apply leave flow, live preview, submission.
   - `20-leave-approval.js`: Manager approval queue, approval actions, ledger deduction.
   - `21-leave-balance-ledger.js`: Balance display, transaction history inspection, cancellation reversal.
3. **Regression Suite:**
   - Run complete suite `00` through `16` to guarantee all 151 existing E2E tests remain 100% green.

---

## 15. Security & Risk Analysis

| Risk | Mitigation |
| :--- | :--- |
| **Client-side tampering of calculated duration or balance** | Backend recalculates duration and validates balance within database transaction. Client calculations are strictly advisory. |
| **Unauthorized approval or approver ID spoofing** | Approver resolution is derived server-side from session user ID and frozen approval snapshot. Direct status mutations are blocked. |
| **Race condition / double-spending balance** | Pessimistic row-locking (`FOR UPDATE`) on `leave_balances` inside ACID transaction prevents overdrawing. |
| **Policy tampering affecting past leaves** | Application records `policy_version` and approval snapshot at submission time. Historical records are immutable. |
| **Sensitive data leakage (medical/emergency reasons)** | Field-level display gating: peers see absence only on calendar; medical certificates and sensitive notes are restricted to applicant and approvers/HR. |

---

## 16. Backward Compatibility Plan

- Existing tables (`users`, `organization_entities`, `organization_entity_members`, `permissions`, `audit_events`, `table_records`) remain untouched.
- Existing routes (`/api/v1/auth/`, `/api/v1/admin/`, `/api/v1/organization/`, `/api/v1/tables/`) retain their exact contracts.
- Frontend layout seamlessly nests the new `Leave` navigation group without disturbing existing groups (`Records`, `Organization`, `Administration`, `Settings`).
- No breaking changes introduced to existing Selenium suites.

---

## 17. Files to Add & Modify

### Database
- `server/sql/migrations/010_leave_management.sql` (NEW)

### Backend
- `server/src/lib/permissions.js` (MODIFY: add leave permission keys & role mappings)
- `server/src/modules/leave/leave.constants.js` (NEW)
- `server/src/modules/leave/policy/` (NEW: repo, service, validation)
- `server/src/modules/leave/types/` (NEW: repo, service, validation)
- `server/src/modules/leave/rules/` (NEW: repo, engine, validator, evaluators)
- `server/src/modules/leave/calendars/` (NEW: repo, service, validation)
- `server/src/modules/leave/calculation/leaveCalculation.service.js` (NEW)
- `server/src/modules/leave/balance/` (NEW: repo, service, validation)
- `server/src/modules/leave/workflow/` (NEW: repo, service, validation)
- `server/src/modules/leave/applications/` (NEW: repo, service, validation)
- `server/src/modules/leave/reports/` (NEW: repo, service)
- `server/src/modules/leave/leave.controller.js` (NEW)
- `server/src/modules/leave/leave.routes.js` (NEW)
- `server/src/app.js` (MODIFY: mount leave routes)
- `server/scripts/seed-leave-policy.js` (NEW)

### Frontend
- `client/src/lib/permissions.js` (MODIFY: add leave permissions mirror)
- `client/src/layouts/navigation.js` (MODIFY: register Leave navigation group)
- `client/src/app/router.jsx` (MODIFY: register leave routes)
- `client/src/features/leave/LeaveDashboardPage.jsx` (NEW)
- `client/src/features/leave/MyLeavesPage.jsx` (NEW)
- `client/src/features/leave/ApplyLeavePage.jsx` (NEW)
- `client/src/features/leave/LeaveApprovalsPage.jsx` (NEW)
- `client/src/features/leave/LeaveCalendarPage.jsx` (NEW)
- `client/src/features/leave/admin/PoliciesPage.jsx` (NEW)
- `client/src/features/leave/admin/PolicyEditorPage.jsx` (NEW)
- `client/src/features/leave/admin/BalancesPage.jsx` (NEW)
- `client/src/features/leave/admin/CalendarsPage.jsx` (NEW)
- `client/src/features/leave/admin/LeaveReportsPage.jsx` (NEW)
- `client/src/features/leave/components/` (NEW: calculation preview, balance cards, approval timeline)

### Testing
- `testing/suites/17-leave-navigation.js` (NEW)
- `testing/suites/18-leave-workflow.js` (NEW)
- `testing/suites/index.js` (MODIFY: register leave test suites)

---

## 18. Questions / Ambiguities Resolved

1. **Migration Sequence:** Next migration number is verified to be `010_leave_management.sql` (after `009_organization_members.sql`).
2. **Tenant Scoping:** In accordance with existing deployment architecture, leave policies belong to the platform instance with configurable assignment to organization entities, avoiding premature fake `organization_id` column proliferation.
3. **Short Leave Quanta:** Short leave operates in 2-hour increments (unit = `'hour'`), tracked and displayed in native hours rather than converted lossily to decimal days.
4. **Sandwich Rule Threshold:** Configured as a dynamic rule with threshold of 7 days (exclusive $\le 7$, inclusive $\ge 8$), perfectly fulfilling the Eklavya policy specification.
