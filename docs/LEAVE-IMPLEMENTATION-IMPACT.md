# Leave Management Module — Implementation Impact Report

**Reference:** [`docs/LEAVES-MODULES-PLAN.md`](file:///c:/Users/pc/Desktop/Software%20Projects/Leave-Management/docs/LEAVES-MODULES-PLAN.md)  
**Architecture Document:** [`docs/LEAVE-ARCHITECTURE-PLAN.md`](file:///c:/Users/pc/Desktop/Software%20Projects/Leave-Management/docs/LEAVE-ARCHITECTURE-PLAN.md)  
**Date:** 2026-10-26  

---

## 1. Summary of Architectural Impact

The Leave Management Module introduces a dedicated, strongly-typed relational Leave Domain Engine (`leave_*` tables, services, and repositories) while preserving the platform's existing dynamic metadata layer (`fields`, `forms`, `tables`, `records`) and organization structures (`organization_entities`, `organization_entity_members`).

This implementation impact is clean, additive, and non-breaking:
- **Zero Schema Breaking Changes:** Existing tables (`001_auth.sql` through `009_organization_members.sql`) remain unmodified.
- **Append-Only Database Migration:** All new tables and initial schema records are encapsulated in `010_leave_management.sql`.
- **Existing API Contracts Intact:** No existing routes in `/api/v1/auth/`, `/api/v1/admin/`, `/api/v1/tables/`, or `/api/v1/organization/` are modified or deprecated.
- **Dynamic Policy Configuration:** No leave policies, limits, approval chains, or rules are hardcoded in application logic.
- **Ledger-Based Transaction Safety:** Balance updates are strictly driven by immutable ledger transactions wrapped in MySQL ACID transactions with row-level locks.

---

## 2. Inventory of File Changes

### 2.1 Files to Add (New Files)

#### Database Migration
- `server/sql/migrations/010_leave_management.sql`: Adds core relational tables (`leave_calendars`, `leave_holidays`, `leave_policies`, `leave_types`, `leave_policy_rules`, `leave_policy_assignments`, `leave_workflows`, `leave_workflow_steps`, `leave_balances`, `leave_balance_transactions`, `leave_applications`, `leave_application_days`, `leave_application_approvals`), seeds permissions, and assigns default permissions to roles.

#### Backend (`server/src/modules/leave/`)
- `leave.constants.js`: Enums for statuses, unit types, approver types, transaction types, error codes.
- `calendars/calendar.repository.js`, `calendar.service.js`, `calendar.validation.js`: Calendar and holiday domain logic.
- `policy/policy.repository.js`, `policy.service.js`, `policy.validation.js`: Policy header CRUD, status transitions, versioning.
- `types/leaveType.repository.js`, `leaveType.service.js`, `leaveType.validation.js`: Leave types CRUD and configuration under policies.
- `rules/rule.repository.js`, `rule.validator.js`, `rule.engine.js`: Rule configuration storage, JSON schema validation, and evaluation pipeline.
- `rules/evaluators/`:
  - `entitlement.evaluator.js`
  - `eligibility.evaluator.js`
  - `notice.evaluator.js`
  - `duration.evaluator.js`
  - `sandwich.evaluator.js`
  - `document.evaluator.js`
  - `balance.evaluator.js`
- `calculation/leaveCalculation.service.js`: Deterministic, explainable calculation of working days, excluded holidays, sandwich days, and counted units.
- `balance/balance.repository.js`, `balance.service.js`, `balance.validation.js`: Ledger management, atomic row-locked transactions (`FOR UPDATE`), balance reconciliation.
- `workflow/workflow.repository.js`, `workflow.service.js`, `workflow.validation.js`: Workflow steps, approver resolution across users, entity roles, and committees.
- `applications/application.repository.js`, `application.service.js`, `application.validation.js`: Application lifecycle, segment generation, immutable approval freeze, cancellation reversal.
- `reports/report.repository.js`, `report.service.js`: Monthly leave register and summary aggregations.
- `leave.controller.js`: Express controller handling all leave API actions.
- `leave.routes.js`: Express routes with CSRF, authentication, and permission gates.
- `server/scripts/seed-leave-policy.js`: Seeds the Eklavya standard policy configuration and test balances.

#### Frontend (`client/src/features/leave/`)
- `LeaveDashboardPage.jsx`: Employee balance metrics, recent leaves, quick-apply trigger.
- `MyLeavesPage.jsx`: Tabular view of submitted leaves with status badges and cancellation dialog.
- `ApplyLeavePage.jsx`: 4-step guided leave application wizard with live calculation preview and approver chain preview.
- `LeaveApprovalsPage.jsx`: Approver inbox with applicant balance context and review actions (Approve / Reject).
- `LeaveCalendarPage.jsx`: Organization absence calendar respecting privacy rules.
- `admin/PoliciesPage.jsx` & `PolicyEditorPage.jsx`: Visual policy editor (Leave Types, Rules, Workflows, Assignments).
- `admin/BalancesPage.jsx`: Employee balance overview with ledger drill-down and manual adjustment modal.
- `admin/CalendarsPage.jsx`: Holiday and working days configuration.
- `admin/LeaveReportsPage.jsx`: Monthly HR report and exportable leave register.
- `components/LeaveCalculationCard.jsx`: Detailed breakdown card showing working days, sandwich days, and notice status.
- `components/ApprovalTimeline.jsx`: Visual progression tracker for multi-step approval workflows.

#### Testing (`testing/suites/`)
- `testing/suites/17-leave-navigation.js`: Verifies navigation links and permission gating for Leave modules.
- `testing/suites/18-leave-workflow.js`: Verifies calculation preview, application submission, balance debit, and approval actions.

---

### 2.2 Files to Modify (Existing Files)

| File | Changes Made | Risk Level |
| :--- | :--- | :--- |
| `server/src/lib/permissions.js` | Add `leave.*` permission constants and update default role assignment mappings. | Low (Purely additive) |
| `server/src/app.js` | Mount `/api/v1/leave` and `/api/v1/admin/leave` routes behind CSRF and session middleware. | Low (Standard route registration) |
| `client/src/lib/permissions.js` | Mirror `leave.*` permissions on client. | Low (Purely additive) |
| `client/src/layouts/navigation.js` | Register `Leave` and `Administration → Leave Management` navigation groups. | Low (Standard data-driven navigation) |
| `client/src/app/router.jsx` | Register new leave routes with `RequirePermission` guards and breadcrumbs. | Low (Standard route registration) |
| `testing/suites/index.js` | Include new test suites `17-leave-navigation` and `18-leave-workflow`. | Low (Additive to test runner) |

---

### 2.3 Files that MUST NOT Change

- Migrations `001_auth.sql` through `009_organization_members.sql` (checksum integrity).
- Existing auth, session, and CSRF token generation mechanisms.
- Existing metadata logical table structures (`field_definitions`, `table_definitions`, `table_records`).
- Existing Selenium test suites `00-smoke.js` through `16-security.js`.

---

## 3. Migration and Rollback Safety

- The migration is forward-only and executed via the built-in migration tool (`server/scripts/migrate.js`).
- If any statement fails, the runner aborts cleanly without corrupting the `schema_migrations` record.
- Tables are defined with `IF NOT EXISTS` and foreign keys are safely bound to existing parent tables with appropriate `ON DELETE` policies (`CASCADE` for child steps/days, `RESTRICT` for critical master definitions with active balances/applications).

---

## 4. Security Verification Checklist

- [x] All mutation endpoints enforce CSRF double-submit validation.
- [x] All leave routes require authenticated session (`requireAuth`).
- [x] Application submission rejects client-supplied `userId`; applicant is locked to `req.session.user.id`.
- [x] Approver validation ensures caller is the authorized actor for the active approval step.
- [x] Balances are checked and debited within `FOR UPDATE` transaction locks to prevent concurrency overdraws.
- [x] Sensitive medical documents and leave reasons are hidden on public team calendars.
- [x] Audit logs record all mutations with automated credential and secret redaction.
