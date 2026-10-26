
# Leave Management Module
## Master Architecture, Database, Backend, Frontend, Security & Testing Plan

## 0. Mission

Existing Leave Management System ke andar ab **Leave Management Module** build karna hai.

Ye module:

- production-grade hona chahiye
- fully dynamic/configurable hona chahiye
- current application architecture ko follow kare
- existing Fields / Dropdowns / Forms / Logical Tables / Mappings / Records / Organization / Users / Permissions / Audit ko reuse kare
- leave policies ko hardcode na kare
- future policy changes ke liye code changes minimum/zero rakhe
- different organizations ke leave systems ko configuration ke through support kar sake
- existing modules ko break nahi kare
- backward compatibility preserve kare
- har important business rule server-side enforce kare
- UI sirf presentation layer ho; backend authoritative ho
- comprehensive automated tests ke saath aaye

Do NOT immediately start coding.

First inspect the existing repository and understand the current implementation. Then produce a short implementation-impact report before modifying anything.

---

# 1. Existing Architecture — DO NOT BREAK THIS

Current application already has:

- Express 5
- React 19 + Vite
- Tailwind CSS
- MySQL
- Redis
- session authentication
- CSRF
- RBAC/permissions
- audit logging
- dynamic Fields
- Dropdowns
- Forms
- Logical Tables
- Form-to-Table mappings
- Records
- Organization entity types/entities/memberships
- User administration
- reference fields
- dynamic schemas
- schema versioning
- automated Selenium tests

The existing platform deliberately uses metadata-defined logical tables instead of dynamically creating MySQL tables. This architectural decision is implemented and MUST NOT be reversed.

Existing logical-table architecture:

- `field_definitions`
- `dropdown_definitions`
- `dropdown_options`
- `table_definitions`
- `column_definitions`
- `form_definitions`
- `form_fields`
- `form_table_mappings`
- `field_column_mappings`
- `table_records`
- organization metadata
- audit events

This architecture must remain the foundation of Leave Management.

Do NOT create arbitrary runtime MySQL tables from the UI.

---

# 2. Critical Architectural Decision

Leave Management has TWO layers.

## Layer A — Generic configurable data layer

Reuse existing:

- Fields
- Dropdowns
- Forms
- Logical Tables
- Mappings
- Records
- `user_reference`
- `entity_reference`
- `record_reference`

These are for customizable business data.

## Layer B — Leave domain engine

Create dedicated fixed relational tables/services for things that are actually business logic:

- leave policies
- leave types
- leave policy rules
- leave entitlement/balance
- leave applications
- leave application days/segments
- approval workflows
- approval steps
- approval actions
- holiday/calendar configuration
- working calendar
- policy assignments
- balance transactions/ledger
- compensatory-off credits
- WFH requests if necessary
- policy/rule versions

Do NOT attempt to represent the entire leave engine as arbitrary JSON records.

### Rule:

**Configuration should be dynamic. Core invariants and transactional state should remain strongly typed and relational.**

---

# 3. Why This Hybrid Model Is Necessary

Leave balance is not just a normal record.

Example:

Employee has:

- 35 privilege leave
- takes 4 days
- 2 holidays are excluded
- 1 day falls under another rule
- balance becomes 32
- request is approved
- later cancelled
- balance must be restored

This requires transactional consistency.

Therefore:

```text
Policy configuration
        ↓
Rule engine
        ↓
Leave calculation
        ↓
Application
        ↓
Approval workflow
        ↓
Ledger transaction
        ↓
Balance
```

Do not directly edit `leave_balances.available_days` from multiple controllers.

---

# 4. Policy Model

Create a configurable policy system.

Suggested core entities:

## 4.1 Leave Policy

Represents a policy set.

Example:

```text
Eklavya Standard Leave Policy
```

Suggested fields:

- id
- key
- name
- description
- status
- effective_from
- effective_to
- version
- is_default
- created_by
- updated_by
- created_at
- updated_at

Policies must be versionable.

Never silently modify the historical meaning of an already-approved leave.

---

# 5. Leave Types

Create:

`leave_types`

Examples:

- Privilege Leave
- Short Leave
- Optional Leave
- Maternity Leave
- Paternity Leave
- Compensatory Off
- Long Leave
- LWP
- any organization-specific leave type

Suggested properties:

- id
- policy_id
- key
- name
- description
- unit: `day | hour`
- paid_status
- requires_balance
- requires_approval
- allows_half_day
- allows_partial_day
- carry_forward_enabled
- encashment_enabled
- max_balance
- status
- sort_order

Do NOT hardcode these types.

The current organization's policy has:

- Privilege Leave = 35 days
- Short Leave = 24 × 2-hour leaves / 6 days
- Optional Leave = 2 days
- maternity/paternity governed by separate rules.

These should be seeded as configuration, not encoded in JavaScript constants.

---

# 6. Leave Policy Rules

Create a generic rule system.

Possible rule categories:

```text
ENTITLEMENT
ELIGIBILITY
ACCRUAL
CARRY_FORWARD
MAX_BALANCE
MIN_DURATION
MAX_DURATION
NOTICE_PERIOD
APPROVAL
SANDWICH
WORKING_DAY
HOLIDAY
HALF_DAY
HOURLY_LEAVE
EMERGENCY
DOCUMENT_REQUIRED
LWP_CONVERSION
ENCASHMENT
EXPIRY
PROBATION
EMPLOYMENT_TYPE
GENDER
TENURE
LOCATION
ORGANIZATION
```

Do NOT create one table for every rule.

Use a structured rule model.

Possible shape:

```text
leave_policy_rules
------------------
id
policy_id
leave_type_id
rule_key
rule_type
priority
config_json
effective_from
effective_to
status
created_at
updated_at
```

Example:

```json
{
  "ruleType": "NOTICE_PERIOD",
  "config": {
    "minimumDays": 2,
    "unit": "calendar_day"
  }
}
```

Another:

```json
{
  "ruleType": "SANDWICH",
  "config": {
    "enabled": true,
    "thresholdDays": 7,
    "excludeWeekdays": ["SUNDAY"],
    "includeForDurationGreaterThan": 7
  }
}
```

Another:

```json
{
  "ruleType": "MIN_DURATION",
  "config": {
    "value": 0.5,
    "unit": "day"
  }
}
```

The rule engine must validate rule configuration itself.

Invalid rule configuration must never silently become permissive behavior.

---

# 7. Employee Eligibility / Policy Assignment

A leave policy must not automatically apply to every user.

Create a policy assignment layer.

Possible table:

`leave_policy_assignments`

Fields:

- id
- policy_id
- user_id nullable
- organization_entity_id nullable
- employment category reference
- effective_from
- effective_to
- priority
- status

The exact targeting mechanism should leverage existing:

- `user_reference`
- `entity_reference`
- organization memberships
- user profile fields

where possible.

Do not duplicate organization/member information unnecessarily.

---

# 8. Important Policy Targeting

Current policy differentiates:

- Programme Staff
- Admin Staff
- full-time/fixed salary employees
- other categories
- office/field contexts

Therefore the system needs configurable eligibility criteria.

Example:

```text
Policy Assignment
    ↓
Condition Group
    ├── employment_type = programme
    ├── employment_status = full_time
    └── salary_type = fixed
```

Do not hardcode:

```js
if (user.department === "programme")
```

Instead use configurable conditions referencing approved user/profile/entity attributes.

---

# 9. Approval Workflow

This is one of the most important parts.

Current policy:

### Programme Staff

1–6 days:

```text
Local Coordinator / Project In-charge
```

7–29 days:

```text
Programme Committee
```

30+ days:

```text
Academic Council
```

### Admin Staff

1–6 days:

```text
Unit In-charge / Centre In-charge
```

7–29 days:

```text
Centre In-charge + EO/Director
```

30+ days:

```text
Executive Council
```

These are explicitly defined in the policy.

DO NOT encode these as:

```js
if (days <= 6) ...
else if (days <= 29) ...
```

inside controllers.

Instead create configurable approval workflow definitions.

---

# 10. Approval Workflow Data Model

Suggested:

### `leave_workflows`

- id
- policy_id
- name
- description
- status
- version
- effective_from
- effective_to

### `leave_workflow_steps`

- id
- workflow_id
- step_order
- approval_mode
- approver_type
- approver_config
- required
- timeout_hours
- escalation_enabled
- escalation_config

Possible approver types:

```text
USER
USER_MANAGER
ENTITY_MANAGER
ENTITY_LEAD
ENTITY_ROLE
ROLE
SPECIFIC_USER
ORGANIZATION_LEVEL
COMMITTEE
DYNAMIC_REFERENCE
```

The system must allow an organization to define its own approver model.

---

# 11. Approval Mode

Support at least:

```text
SEQUENTIAL
PARALLEL_ALL
PARALLEL_ANY
```

Example:

```text
Step 1
Local Coordinator
      ↓
Step 2
Programme Committee
      ↓
Step 3
Academic Council
```

Another organization might use:

```text
Manager
   +
HR
   +
Finance
```

with parallel approval.

Do not assume every organization has the same workflow.

---

# 12. Approval Resolution

At application time:

```text
Leave Request
    ↓
Policy resolution
    ↓
Applicable leave type
    ↓
Applicable workflow
    ↓
Resolve approvers
    ↓
Create immutable approval snapshot
```

Important:

Once an application is submitted, the actual approver snapshot should be persisted.

Do NOT resolve the approver dynamically on every screen.

Otherwise:

```text
Employee submits request
Manager changes next day
Old request suddenly points to different approver
```

That is unacceptable.

---

# 13. Leave Application

Create dedicated:

`leave_applications`

Suggested fields:

- id
- application_number
- user_id
- policy_id
- policy_version
- leave_type_id
- start_date
- end_date
- requested_units
- calculated_units
- reason
- status
- emergency_flag
- submitted_at
- approved_at
- rejected_at
- cancelled_at
- created_at
- updated_at

Statuses:

```text
DRAFT
SUBMITTED
PENDING_APPROVAL
PARTIALLY_APPROVED
APPROVED
REJECTED
CANCELLED
WITHDRAWN
LWP
COMPLETED
```

Do not allow arbitrary status changes.

Implement a state machine/service.

---

# 14. Leave Application Segments

A request can contain different day classifications.

Example:

```text
01 Jan → Leave
02 Jan → Leave
03 Jan → Sunday
04 Jan → Holiday
05 Jan → Leave
```

Therefore create:

`leave_application_days`

Possible fields:

- application_id
- date
- day_type
- counted
- unit
- reason
- calculation_metadata

This makes the calculation explainable.

---

# 15. Leave Calculation Engine

Create a dedicated service:

```text
leaveCalculation.service.js
```

It should NOT live inside controller.

Input:

```text
user
policy
leaveType
startDate
endDate
requestContext
```

Output:

```json
{
  "requestedPeriod": {},
  "calendarDays": 0,
  "workingDays": 0,
  "holidaysExcluded": [],
  "sandwichDays": [],
  "countedDays": 0,
  "countedHours": 0,
  "halfDays": [],
  "warnings": [],
  "violations": [],
  "ruleResults": []
}
```

The UI should be able to show **why** the system calculated a particular number.

---

# 16. Working Calendar

Current policy states Eklavya has a six-day working week.

Do not hardcode Sunday as universally non-working.

Create configurable:

### `leave_calendars`

- name
- timezone
- week configuration
- status

### `leave_calendar_days`

or configuration JSON for weekly working pattern.

Example:

```json
{
  "monday": true,
  "tuesday": true,
  "wednesday": true,
  "thursday": true,
  "friday": true,
  "saturday": true,
  "sunday": false
}
```

Different organizations can use:

```text
Mon-Fri
Mon-Sat
Sun-Thu
custom
```

---

# 17. Holiday Calendar

Create:

`leave_holidays`

Fields:

- id
- calendar_id
- date
- name
- holiday_type
- optional/mandatory
- status

Holiday handling must be configurable.

---

# 18. Sandwich Rule

Current policy:

- Sundays/holidays sandwiched inside leave up to 7 days are not counted.
- For leave of 8 days or more, sandwiched Sundays/holidays are counted.

This must be implemented by the rule engine.

Not:

```js
if (duration <= 7) ...
```

in random application code.

Instead:

```text
SANDWICH rule
threshold = 7
excludedDays = Sunday + holidays
includeWhenDuration > 7
```

The calculation result should explain which dates were excluded/included.

---

# 19. Short Leave

Short leave is fundamentally different from ordinary day leave.

Current policy:

- 24 short leaves
- each is 2 hours
- total 6 days
- no carry forward
- approval not required
- information can be given one day before or same day.

Therefore leave type must support:

```text
unit = hour
quantum = 2
daily_max = configurable
approval_required = false
```

Do not convert every leave into a decimal day and lose the original unit semantics.

---

# 20. Minimum Leave Duration

Current policy says:

- except short leave, minimum leave is half a day.

Represent this as rule configuration:

```json
{
  "minimum": 0.5,
  "unit": "day"
}
```

---

# 21. Carry Forward

Privilege leave:

```text
35 days
carry forward = yes
```

Short leave:

```text
24 × 2 hours
carry forward = no
```

Current accumulation ceiling:

```text
180 days
```

For fixed salary:

```text
quarterly prorata
```

These are policy rules, not application constants.

---

# 22. Leave Balance Architecture

Do NOT rely only on:

```text
leave_balances.available
```

Create a ledger.

Suggested:

### `leave_balances`

- id
- user_id
- leave_type_id
- policy_id
- period_start
- period_end
- opening_balance
- accrued
- carried_forward
- adjusted
- consumed
- expired
- closing_balance
- unit
- version/timestamps

And:

### `leave_balance_transactions`

- id
- balance_id
- user_id
- leave_application_id nullable
- transaction_type
- quantity
- reference
- metadata
- created_at
- created_by

Transaction types:

```text
OPENING
ACCRUAL
CARRY_FORWARD
CONSUMPTION
REVERSAL
ADJUSTMENT
EXPIRY
ENCASHMENT
MANUAL_CORRECTION
```

Balance should be reconstructable from ledger.

---

# 23. Transaction Safety

Approval/consumption/reversal must use DB transactions.

Example:

```text
Approve leave
    ↓
BEGIN
    ↓
lock applicable balance
    ↓
recalculate request
    ↓
verify available balance
    ↓
create balance transaction
    ↓
update application state
    ↓
audit event
    ↓
COMMIT
```

If anything fails:

```text
ROLLBACK
```

Never allow:

```text
leave approved
balance not deducted
```

or:

```text
balance deducted
leave rejected
```

---

# 24. LWP

Current policy says if leave has no prior approval, it is treated as LWP.

Do NOT silently convert records without an auditable rule result.

Model:

```text
requested leave
      ↓
policy violation / no approval
      ↓
rule evaluation
      ↓
LWP classification
```

Persist:

- original request
- violated rule
- resulting classification
- actor/system
- timestamp

---

# 25. Notice Period Rules

Current policy:

- ordinary leave: at least 2 days before
- >6 days: one week advance
- long leave 1 month+: one month advance
- emergencies are exceptions. 

Represent these as configurable rule definitions.

Support exception conditions:

```text
EMERGENCY
MEDICAL
SYSTEM_EXCEPTION
AUTHORIZED_OVERRIDE
```

---

# 26. Emergency Requests

Emergency requests may be submitted same day / within 24 hours under the policy.

UI should support:

```text
Emergency request
Reason
Supporting document if required
```

Backend must still validate eligibility.

Do not let frontend bypass notice rules.

---

# 27. Medical Documents

Long medical leave requires medical certificate.

Do not immediately hardcode:

```text
if leaveType === medical
```

Instead rule:

```text
DOCUMENT_REQUIRED
```

with:

```json
{
  "documentType": "medical_certificate",
  "requiredAfter": {
    "value": 0,
    "unit": "day"
  }
}
```

If the existing application has no secure file-storage abstraction, DO NOT invent insecure local file upload.

First design document storage abstraction.

---

# 28. Long Leave

Current policy:

- 1 month or more requires advance application
- emergency submission within one week
- maximum long leave normally 6 months
- paid leave normally max 90 days
- beyond that LWP
- special cases beyond six months require higher approval.

These must be policy rules.

Do not hardcode these values into controllers.

---

# 29. Maternity / Paternity

Current policy specifies:

- maternity = 26 weeks
- eligibility based on employment duration
- miscarriage leave
- tubectomy leave
- adoption/commissioning mother rules
- paternity = 2 weeks.

These should be modeled as leave-type configurations + eligibility/rule sets.

Example:

```text
Maternity
  ├── eligibility rule
  ├── duration rule
  ├── document rule
  ├── approval rule
  └── special-case rules
```

Do not build a giant `maternityService.js` with hardcoded policy values.

---

# 30. Compensatory Off

Current policy says:

- work 6–8 hours on Sunday/holiday
- must be approved
- normally use within one month
- maximum two months
- special extension possible
- capacity-building workshops can generate compensatory leave.

This should have a separate credit concept:

```text
Comp-off credit
      ↓
earned_from_event
      ↓
approved
      ↓
expires_at
      ↓
consumed by leave request
```

Do not fake comp-off as normal annual leave balance.

---

# 31. WFH

WFH is not exactly leave.

Current policy has:

- normally one day/week
- advance application/sanction
- hierarchy-based approval
- >7 days requires committee
- special hierarchy for PI, Programme Coordinator, EO, Director.

Architecturally:

Do NOT force WFH into `leave_types` just because it uses an approval workflow.

Create a generic future `attendance/work-arrangement` domain boundary.

For the first release, if WFH is inside Leave UI, keep the domain type explicit:

```text
REQUEST_TYPE = WFH
```

but do not deduct leave balance.

Design the workflow engine so WFH can reuse it later.

---

# 32. Travel / Compensatory Rules

Current policy includes:

- overnight travel → half-day entitlement
- Sunday/holiday 6–8 hour travel → one compensatory off.

Do not implement these as random special cases inside leave application controller.

Prepare a reusable **entitlement source / credit engine**:

```text
source
    ↓
approved attendance/travel/work event
    ↓
entitlement credit
    ↓
leave balance / comp-off balance
```

The actual attendance/travel module can be added later.

---

# 33. Monthly HR Reporting

Current policy requires:

- by 25th: monthly leave information to HR
- by 5th: verified attendance register copy to HR.

Do not build this as a one-off hardcoded email function.

Create future-ready reporting concepts:

```text
report definition
report period
report recipients
report schedule
report data source
```

For first leave release, implement the underlying leave summary query/report endpoint.

Scheduled email can be a later layer.

---

# 34. Relationship With Existing Users

Leave module must use existing `users`.

Never create a duplicate employee table unless there is a demonstrated need.

Use:

```text
leave_applications.user_id
```

as a stable relational FK to `users.id`.

Custom user attributes should remain in the existing dynamic profile system.

The existing system explicitly protects authentication columns and uses custom profile values separately.

---

# 35. Relationship With Organization

Leave module should use:

- organization entity
- organization memberships
- membership roles
- entity references

Example:

```text
Employee
   ↓
Team
   ↓
Department
   ↓
Centre
```

But do not assume this hierarchy exists in every organization.

Approver resolution must use configurable organization relationships.

---

# 36. New Field Types — Do We Need More?

Current system already supports:

- text
- textarea
- number
- date
- email
- phone
- dropdown
- checkbox
- toggle
- record_reference
- entity_reference
- user_reference

These are already implemented with relation policies and searchable pickers.

For Leave module, first reuse them.

Potential future type worth adding:

### `date_range`

But DO NOT add it merely because leave uses start/end date.

Leave application can use:

```text
start_date
end_date
```

as domain fields.

Only add a new generic field type if another independent feature genuinely needs it.

---

# 37. Dynamic Forms

Leave request form should be configurable.

Example default form:

```text
Leave Type
Start Date
End Date
Start Time
End Time
Reason
Emergency?
Supporting Document
Handover / Work Plan
```

But the form should be built from existing Fields + Forms.

The Leave engine still owns required domain fields.

Therefore distinguish:

### Domain-required fields

Server controlled:

- leave type
- user
- period
- request status
- calculated units

### Organization-custom fields

Dynamic:

- reason category
- substitute person
- work handover
- travel details
- additional explanation
- manager notes

This prevents administrators from accidentally deleting a field that the leave engine requires.

---

# 38. Leave Request UI

Design should NOT look like the generic CRUD pages.

Main Leave dashboard:

```text
┌───────────────────────────────────────────────┐
│ My Leave                                      │
│                                               │
│ Available       Pending        Used           │
│ 32 PL           1 Request      8 Days         │
│                                               │
│ [Apply Leave]                                 │
└───────────────────────────────────────────────┘

My Leave Balance
───────────────────────────────────────────────
Privilege Leave     32 / 35
Optional Leave       2 / 2
Short Leave         18 / 24 hours

Upcoming Leave
───────────────────────────────────────────────
12 Nov – 15 Nov     Privilege Leave   Approved

Recent Requests
───────────────────────────────────────────────
...
```

---

# 39. Leave Application Screen

Use a guided form:

### Step 1 — Leave Type

Show:

- available balance
- unit
- eligibility
- relevant rules

### Step 2 — Dates

Show:

```text
Requested period
Working days
Excluded holidays
Sandwich days
Counted leave
```

### Step 3 — Details

Dynamic configured fields.

### Step 4 — Rule Preview

Very important:

```text
Leave calculation

Requested: 7 calendar days
Working days: 6
Holiday excluded: 1
Leave charged: 6 days

Notice period: ✓
Balance: ✓
Approval required: ✓
```

### Step 5 — Submit

Show approval path:

```text
You request will go to:

1. Project In-charge
2. Programme Committee
```

This makes the system understandable.

---

# 40. Admin Leave UI

Navigation should be something like:

```text
Leave
├── Dashboard
├── My Leaves
├── Apply Leave
├── Approvals
└── Team Calendar

Administration
└── Leave Management
    ├── Policies
    ├── Leave Types
    ├── Rules
    ├── Workflows
    ├── Calendars
    ├── Holidays
    ├── Policy Assignments
    ├── Balances
    └── Reports
```

Do not expose every technical table directly to users.

---

# 41. Policy Builder UI

Policy editor should have tabs:

```text
General
Leave Types
Rules
Approval Workflow
Calendar
Assignments
Preview
Version History
```

Example:

```text
Privilege Leave

Entitlement
35 days

Carry Forward
✓

Maximum Balance
180 days

Minimum Duration
0.5 day

Notice Period
2 days

Approval
Dynamic workflow

Encashment
Disabled
```

Every setting should be configuration data.

---

# 42. Rule Builder UI

Do not expose raw JSON to normal administrators.

Build a rule builder:

```text
WHEN
Leave duration

IS
greater than

VALUE
6 days

THEN
Require notice

VALUE
7 days
```

Advanced administrators may get JSON/config inspection later.

---

# 43. Approval Workflow UI

Visual flow:

```text
Leave submitted
       ↓
[Local Coordinator]
       ↓
[Programme Committee]
       ↓
[Academic Council]
       ↓
Approved
```

Allow:

- add step
- remove step
- reorder
- choose approver type
- choose approval mode
- timeout
- escalation
- notification recipients

Persist IDs/configuration, never canvas coordinates.

This follows the same principle already used by the mapping editor: visual UI is only an editor; persisted state is structured data.

---

# 44. Balance UI

Admin should see:

```text
Employee
Leave Type
Opening
Accrued
Carry Forward
Consumed
Adjusted
Available
```

Clicking balance should open:

```text
Balance Ledger

01 Apr   Opening       +35
10 Apr   Leave         -3
20 Apr   Adjustment    +1
...
```

This is much safer than exposing a mutable number.

---

# 45. Approval UI

Approver dashboard:

```text
Pending approvals: 7

Employee     Type        Period        Days    Action
------------------------------------------------------
Rahul        PL          12-15 Nov     4       Review
Seema        Optional    20 Nov        1       Review
...
```

Request detail:

```text
Employee
Department
Leave type
Dates
Calculated leave
Balance before
Balance after
Reason
Documents
Handover
Approval history
Rule evaluation
```

Approver can:

```text
Approve
Reject
Request clarification
```

Do not allow arbitrary status editing.

---

# 46. Permissions

Add separate permission catalogue.

Suggested:

```text
leave.view
leave.apply
leave.cancel
leave.approve
leave.reject
leave.manage
leave.policies.view
leave.policies.manage
leave.rules.view
leave.rules.manage
leave.workflows.view
leave.workflows.manage
leave.balances.view
leave.balances.manage
leave.calendars.view
leave.calendars.manage
leave.reports.view
```

Potentially:

```text
leave.team.view
leave.team.manage
```

Keep permission semantics separate from role names.

Existing authorization already resolves permissions from DB per request. Preserve this model.

---

# 47. Authorization Must Be Context-Aware

Do NOT rely only on:

```text
leave.approve
```

Example:

Employee A should not automatically approve every employee's leave.

Server must verify:

```text
Does this approval step belong to this approver?
Is this request assigned to this approver?
Does the approver still have required organization membership?
Is the request still pending?
```

Every approval action must revalidate authorization.

---

# 48. Audit

Every important action should produce audit event.

Examples:

```text
LEAVE_POLICY_CREATED
LEAVE_POLICY_UPDATED
LEAVE_POLICY_PUBLISHED
LEAVE_TYPE_CREATED
LEAVE_RULE_UPDATED
LEAVE_WORKFLOW_UPDATED
LEAVE_REQUEST_SUBMITTED
LEAVE_REQUEST_APPROVED
LEAVE_REQUEST_REJECTED
LEAVE_REQUEST_CANCELLED
LEAVE_BALANCE_ADJUSTED
LEAVE_BALANCE_ACCRUED
LEAVE_COMP_OFF_GRANTED
LEAVE_COMP_OFF_CONSUMED
LEAVE_LWP_CLASSIFIED
```

Do not log:

- passwords
- tokens
- secrets
- sensitive authentication values

Use existing redacted audit infrastructure.

---

# 49. API Design

Follow existing API contract.

Base:

```text
/api/v1
```

Use standard response envelopes and stable machine codes.

Existing API explicitly requires stable codes and says clients must branch on `code`, not human messages.

Suggested:

```text
/api/v1/leave
/api/v1/leave/types
/api/v1/leave/policies
/api/v1/leave/rules
/api/v1/leave/workflows
/api/v1/leave/calendars
/api/v1/leave/holidays
/api/v1/leave/balances
/api/v1/leave/applications
/api/v1/leave/approvals
/api/v1/leave/reports
```

Admin definitions can use:

```text
/api/v1/admin/leave/...
```

if consistent with existing route conventions.

Decide one convention before implementation and document it.

---

# 50. Suggested API Operations

### Policies

```text
GET
POST
GET /:id
PATCH /:id
POST /:id/publish
POST /:id/archive
GET /:id/versions
```

### Leave Types

```text
GET
POST
PATCH
archive
```

### Rules

```text
GET
POST
PATCH
DELETE/archive
validate
```

### Workflows

```text
GET
POST
PATCH
publish
preview
```

### Applications

```text
GET
POST
GET /:id
POST /:id/submit
POST /:id/cancel
POST /:id/withdraw
```

### Approvals

```text
GET /pending
GET /:applicationId
POST /:applicationId/approve
POST /:applicationId/reject
POST /:applicationId/request-changes
```

### Calculation

```text
POST /calculate
```

Calculation endpoint should be preview-only and must NOT mutate balance.

---

# 51. Stable Error Codes

Create domain-specific codes.

Examples:

```text
LEAVE_POLICY_NOT_FOUND
LEAVE_TYPE_NOT_FOUND
LEAVE_RULE_NOT_FOUND
LEAVE_WORKFLOW_NOT_FOUND
LEAVE_APPLICATION_NOT_FOUND
LEAVE_BALANCE_NOT_FOUND

LEAVE_TYPE_IN_USE
LEAVE_POLICY_IN_USE
LEAVE_WORKFLOW_IN_USE

LEAVE_NOT_ELIGIBLE
LEAVE_INSUFFICIENT_BALANCE
LEAVE_NOTICE_PERIOD_VIOLATION
LEAVE_MIN_DURATION_VIOLATION
LEAVE_MAX_DURATION_VIOLATION
LEAVE_DOCUMENT_REQUIRED
LEAVE_HOLIDAY_RULE_VIOLATION
LEAVE_WORKFLOW_NOT_RESOLVED
LEAVE_APPROVAL_NOT_ASSIGNED
LEAVE_ALREADY_APPROVED
LEAVE_ALREADY_REJECTED
LEAVE_ALREADY_CANCELLED
LEAVE_INVALID_STATE
LEAVE_OVERLAPPING_REQUEST
LEAVE_BALANCE_CONFLICT
LEAVE_RULE_CONFIGURATION_INVALID
LEAVE_POLICY_VERSION_CONFLICT
```

---

# 52. Concurrency

This is critical.

Two requests must not consume the same balance simultaneously.

Example:

```text
Balance = 5

Request A = 4 days
Request B = 4 days
```

Both cannot be approved.

Use DB transaction + appropriate row locking.

Never trust:

```text
frontend showed balance = 5
```

Backend must recalculate and lock.

---

# 53. Overlapping Leave

The engine must detect:

```text
Existing approved leave
       +
new request
       ↓
overlap
```

But overlap rules must be configurable where appropriate.

Possible policies:

```text
BLOCK
ALLOW
WARN
```

For example, short leave may coexist differently from full-day leave.

---

# 54. Policy Versioning

Critical.

Suppose:

```text
Policy v1:
PL = 35
```

Later:

```text
Policy v2:
PL = 30
```

Old approved applications must still be interpretable under v1.

Therefore:

```text
leave_application.policy_version
```

and rule evaluation snapshot.

Never recalculate historical approved applications using current policy.

Existing platform already preserves old record schema versions rather than silently reinterpreting old records. Follow the same philosophy.

---

# 55. Draft vs Published Configuration

Administrators should be able to edit draft policy.

Only published policy can be used for new leave applications.

States:

```text
DRAFT
PUBLISHED
ARCHIVED
```

Publishing should validate:

- all leave types valid
- rules valid
- workflows valid
- approvers resolvable
- calendars valid
- no contradictory rules
- required configuration present

---

# 56. Rule Engine Architecture

Create something similar to:

```text
server/src/modules/leave/
├── policy/
├── types/
├── rules/
├── calculation/
├── balance/
├── applications/
├── workflow/
├── calendars/
├── approvals/
├── reports/
├── leave.routes.js
├── leave.controller.js
└── ...
```

But maintain the existing:

```text
controller
    ↓
service
    ↓
repository
```

architecture.

SQL belongs in repositories.

Business rules belong in services.

HTTP concerns belong in controllers.

This is explicitly the existing architecture direction.

---

# 57. Rule Engine Internal Structure

Suggested:

```text
rules/
├── rule.registry.js
├── rule.validator.js
├── rule.engine.js
├── evaluators/
│   ├── entitlement.rule.js
│   ├── notice.rule.js
│   ├── duration.rule.js
│   ├── sandwich.rule.js
│   ├── eligibility.rule.js
│   ├── balance.rule.js
│   └── document.rule.js
```

Each evaluator should receive:

```text
context
config
```

and return:

```json
{
  "passed": true,
  "violations": [],
  "warnings": [],
  "effects": []
}
```

Avoid a giant 2000-line conditional function.

---

# 58. No Hardcoded Policy Values

Forbidden:

```js
const PRIVILEGE_LEAVE = 35;
const MAX_ACCUMULATION = 180;
const NOTICE_DAYS = 2;
const SHORT_LEAVE_HOURS = 2;
```

Allowed:

```js
const rule = policyRuleRepository.get(...)
```

Policy data belongs in DB.

Code only knows rule semantics.

---

# 59. Seed Current Eklavya Policy

After architecture is complete, create seed/configuration for the supplied policy.

Do NOT bake it into migrations as application logic.

Create a seed or bootstrap script that creates:

- default policy
- leave types
- rules
- workflow definitions
- calendar
- holidays if supplied separately
- policy assignments

The seeded configuration should reproduce the supplied policy.

---

# 60. Policy Items That Must Be Represented

The initial seed must account for:

### Entitlements

- PL = 35 days
- Short leave = 24 × 2 hours
- Optional = 2 days
- maternity
- paternity

### Carry-forward

- PL yes
- short leave no
- accumulation max 180

### Duration

- minimum 0.5 day except short leave

### Calendar

- six-day working week

### Sandwich

- ≤7 days: Sunday/holiday excluded
- ≥8 days: sandwich days counted

### Notice

- ordinary: 2 days
- >6 days: 7 days
- long leave: 1 month

### Emergency

- same-day/24-hour exception

### Approval

Programme:

```text
1–6 → Local Coordinator / PI
7–29 → Programme Committee
30+ → Academic Council
```

Admin:

```text
1–6 → Unit/Centre In-charge
7–29 → Centre In-charge + EO/Director
30+ → Executive Council
```

### LWP

Unauthorized/no-prior-approval leave → LWP

### Comp-off

6–8 hour approved Sunday/holiday work → comp-off

### WFH

Separate non-balance workflow

### Long leave

- max 6 months normally
- paid normally max 90 days
- beyond that LWP
- special cases higher approval

### Medical

medical certificate requirements

### Maternity/paternity

all supplied special rules.

---

# 61. UI Principle

Do not build a second design system.

Reuse:

- Button
- Modal
- Drawer
- FormField
- FieldRenderer
- ReferencePicker
- DataTable
- Pagination
- ColumnFilter
- Toast
- ConfirmDialog
- Loading/Skeleton
- PageHeader

These are already established shared primitives.

---

# 62. Navigation

Do not hardcode navigation for users who lack permissions.

Use existing permission-filtered navigation.

Potential navigation:

```text
Leave
  Dashboard
  My Leave
  Apply Leave
  Approvals
  Team Calendar

Administration
  Leave Policies
  Leave Types
  Leave Rules
  Approval Workflows
  Calendars
  Holidays
  Balances
  Reports
```

Each item requires permission.

---

# 63. Responsive UI

The Leave module should work on:

- desktop
- laptop
- tablet
- mobile browser

Approval actions should be usable on mobile.

Do not make huge desktop-only tables for critical approval workflows.

---

# 64. Accessibility

Use:

- keyboard navigation
- semantic buttons
- proper labels
- focus management
- accessible modal/drawer
- keyboard alternative to drag/drop
- visible validation
- screen-reader friendly status

Follow existing UI component accessibility conventions.

---

# 65. Notifications

Design notification events but don't tightly couple leave logic to email.

Events:

```text
LEAVE_SUBMITTED
LEAVE_APPROVAL_REQUIRED
LEAVE_APPROVED
LEAVE_REJECTED
LEAVE_CANCELLED
LEAVE_BALANCE_LOW
LEAVE_REQUEST_CLARIFICATION
```

Create notification service abstraction.

Email can use existing SMTP settings.

Do not send email directly from controllers.

---

# 66. Security Requirements

Every endpoint:

```text
requireAuth
+
requirePermission
+
resource/context authorization
+
Zod validation
```

Mutations remain behind CSRF.

Do not trust:

- user_id from client
- balance from client
- approver from client
- policy_id without checking applicability
- organization entity id without access validation
- leave calculation from client
- status from client

---

# 67. Server-Side Identity

For:

```text
POST /leave/applications
```

Never accept:

```json
{
  "userId": 123
}
```

as authoritative.

Use:

```js
req.session.user.id
```

for "apply for myself".

Admin/on-behalf-of flows must be separately permissioned.

---

# 68. Approval Security

Approver ID must never be trusted from browser.

Browser sends:

```text
approve
```

Backend resolves:

```text
current authenticated user
+
application
+
current approval step
```

and verifies that the current user is authorized.

---

# 69. Audit Security

Audit every mutation.

Audit should include:

- actor
- target
- action
- timestamp
- safe summary
- old/new relevant values where appropriate

Never include secrets.

---

# 70. Database Migration Strategy

Current migration system is append-only and checksum protected.

Never edit an applied migration.

Create:

```text
009_leave_core.sql
010_leave_rules.sql
011_leave_workflows.sql
...
```

or whatever sequence is actually free in the repository.

First inspect the real current migration list.

Never assume migration number.

Existing migration system explicitly requires append-only migrations and forward fixes.

---

# 71. Foreign Keys

Use real FKs for stable domain relationships:

```text
leave_applications.user_id → users.id
leave_applications.leave_type_id → leave_types.id
leave_balances.user_id → users.id
leave_balances.leave_type_id → leave_types.id
```

For dynamic references, use the existing application-level reference mechanism.

Do not create arbitrary FK structures to dynamic tables.

---

# 72. Soft Delete / Archive

Do not hard delete:

- policies used by historical requests
- leave types used by applications
- workflow definitions used by applications
- rules used by published policies
- calendars used historically

Use:

```text
status = archived
```

or equivalent.

Existing system already blocks destructive deletion of referenced definitions. Preserve this principle.

---

# 73. Reporting

Minimum reports:

### Employee Leave Summary

```text
Employee
Leave type
Opening
Accrued
Consumed
Balance
```

### Monthly Leave Report

```text
Employee
Department/entity
Leave type
From
To
Days
Status
```

### Pending Approval Report

```text
Approver
Employee
Request
Age
SLA
```

### LWP Report

```text
Employee
Period
Days
Reason/rule
```

### Comp-off Report

```text
Employee
Earned
Used
Expired
Available
```

---

# 74. Calendar UI

Team calendar should show:

```text
Employee
Leave
WFH
Comp-off
Holiday
```

but respect permissions.

An employee should not automatically see sensitive leave reasons/documents of other employees.

Separate:

```text
calendar visibility
```

from:

```text
leave record detail access
```

---

# 75. Data Privacy

Leave information may contain sensitive employee information.

Implement field-level display policy where necessary.

For example:

```text
Employee:
sees own reason/document

Manager:
sees required business information

HR:
sees full record

Peer:
may see only "on leave"
```

Do not expose medical details to ordinary users.

---

# 76. Multi-Organization Future

Current platform assumes one organization per deployment and the tenant boundary is still an open architecture decision.

Do not introduce a fake `organization_id` everywhere without understanding current deployment model.

BUT:

Design leave entities so organization scoping can be introduced later without rewriting the engine.

Where organization context is already available, use existing `organization_entity_id`.

---

# 77. Testing Strategy

Do not consider Leave complete without tests.

Existing test suite is already broad and uses Selenium; documentation currently records a 151/151 green state.

Add leave suites rather than modifying existing tests destructively.

Suggested:

```text
17-leave-navigation
18-leave-types
19-leave-policies
20-leave-rules
21-leave-calculation
22-leave-balance
23-leave-application
24-leave-approval
25-leave-calendar
26-leave-comp-off
27-leave-workflow-security
28-leave-permissions
29-leave-concurrency
30-leave-policy-versioning
31-leave-regression
```

Use actual next suite numbers after inspecting repository.

---

# 78. Rule Engine Unit Tests

Must test:

### Entitlement

```text
35 PL
```

### Carry forward

```text
35 + previous balance
```

### Maximum accumulation

```text
>180 rejected/capped according to configured rule
```

### Short leave

```text
2 hour quantum
24 instances
```

### Minimum duration

```text
0.5 day accepted
0.25 day rejected
```

### Sandwich

```text
7-day leave
8-day leave
holiday between leave
Sunday between leave
```

### Notice

```text
2-day notice
1-day notice
7-day requirement
emergency exception
```

### LWP

No prior approval.

### Balance

Insufficient balance.

### Overlap

Existing leave.

---

# 79. Workflow Tests

Test:

```text
1–6 days → correct programme approver
7–29 → programme committee
30+ → academic council

1–6 admin → unit/centre
7–29 admin → centre + EO/director
30+ admin → EC
```

Also test:

- approver unavailable
- approver removed
- user changed organization
- workflow changed after request submission
- old request retains approval snapshot

---

# 80. Security Tests

Attempt:

```text
Employee approving someone else's request
Employee changing leave_type_id
Employee changing user_id
Employee changing calculated_days
Employee changing balance
Employee bypassing notice rule
Employee directly setting status = APPROVED
Employee accessing another organization's/entity data
Employee accessing another user's private leave details
Employee modifying policy without permission
Employee modifying published historical policy
CSRF mutation
SQL injection through search/filter
invalid reference IDs
archived leave type
archived workflow
```

Every attack must fail safely.

---

# 81. Regression Testing

Before touching leave module:

```text
npm run test-api
```

and existing Selenium suite.

After every major phase:

```text
existing suite
+
new leave suite
```

No existing failure is acceptable unless explicitly understood and unrelated.

---

# 82. Implementation Order

Do NOT build everything at once.

Follow this exact sequence.

## Phase 0 — Repository reconnaissance

Inspect:

- migrations
- permissions
- metadata
- record services
- organization services
- API routing
- frontend routing
- navigation
- testing framework

Output:

```text
LEAVE-IMPLEMENTATION-IMPACT.md
```

containing:

- files to add
- files to modify
- files that must not change
- migration numbers
- permission additions
- route additions
- test additions
- risks

Do not modify existing business logic yet.

---

## Phase 1 — Domain model

Implement:

- policies
- leave types
- rules
- calendars
- holidays
- policy assignments

No UI initially beyond basic admin CRUD if needed.

---

## Phase 2 — Calculation engine

Implement:

- working day calculation
- holiday calculation
- sandwich
- minimum duration
- notice
- eligibility
- entitlement
- balance validation

Write unit tests before integrating with application workflow.

---

## Phase 3 — Balance/ledger

Implement:

- balances
- ledger
- accrual
- carry-forward
- consumption
- reversal
- adjustment
- locking/concurrency

Test heavily.

---

## Phase 4 — Workflow engine

Implement:

- workflow definitions
- workflow steps
- approver resolution
- approval snapshots
- SLA/timeout structure
- escalation structure

---

## Phase 5 — Leave applications

Implement:

- draft
- submit
- calculation preview
- validation
- overlap detection
- approval assignment
- cancellation/withdrawal

---

## Phase 6 — Approval UI

Implement:

- pending approvals
- request detail
- approve/reject/request changes
- approval history

---

## Phase 7 — Employee UI

Implement:

- leave dashboard
- balances
- apply leave
- my applications
- calendar

---

## Phase 8 — Admin UI

Implement:

- policies
- types
- rules
- workflows
- calendars
- holidays
- assignments
- balances
- reports

---

## Phase 9 — Eklavya policy seed

Only after the engine works generically.

Create current policy configuration.

Verify that the configuration reproduces the supplied policy.

---

## Phase 10 — Testing + hardening

Run:

- unit tests
- API tests
- Selenium
- security tests
- concurrency tests
- migration rehearsal
- build/lint
- full regression

---

# 83. What NOT to Do

Absolutely do NOT:

### ❌ Create a giant `leave.js`

### ❌ Hardcode policy values

### ❌ Create a `leave_requests` table with everything as JSON

### ❌ Make leave balance a manually editable number

### ❌ Trust frontend calculated days

### ❌ Trust frontend approver IDs

### ❌ Trust frontend user IDs

### ❌ Put business rules in React

### ❌ Put business rules in controllers

### ❌ Create runtime MySQL tables

### ❌ Duplicate employee/organization data

### ❌ Break existing metadata infrastructure

### ❌ Edit old migrations

### ❌ Remove existing tests

### ❌ Change existing API contracts without documenting them

### ❌ Add a new field type without a reusable generic need

### ❌ Treat WFH as ordinary leave balance

### ❌ Treat comp-off as ordinary annual leave

---

# 84. Definition of Done

Leave module is NOT complete merely because:

```text
employee can submit leave
```

It is complete only when:

```text
Policy
 ↓
Eligibility
 ↓
Leave Type
 ↓
Rule Evaluation
 ↓
Calendar
 ↓
Calculation
 ↓
Balance
 ↓
Application
 ↓
Approval Workflow
 ↓
Approval
 ↓
Ledger
 ↓
Audit
```

all work together.

And:

```text
same engine
+
different configuration
=
different organization's leave policy
```

without changing business code.

---

# 85. First Deliverable From Agent

Before writing code, provide:

## `LEAVE-ARCHITECTURE-PLAN.md`

containing:

1. Current architecture understanding
2. Existing modules reused
3. New modules
4. Database tables
5. Relationships
6. Rule engine design
7. Workflow design
8. Balance/ledger design
9. API design
10. Permission design
11. Frontend route/UI plan
12. Migration plan
13. Seed strategy
14. Test plan
15. Security risks
16. Backward compatibility plan
17. Exact files to add/change
18. Questions/ambiguities that cannot safely be inferred

Do NOT code until this plan is internally consistent.

---

# 86. Final Architectural Principle

The Leave module should ultimately behave like this:

```text
                 ┌─────────────────────┐
                 │ Organization Config │
                 └──────────┬──────────┘
                            │
                     Policy Assignment
                            │
                            ▼
                 ┌─────────────────────┐
                 │    Leave Policy     │
                 └──────────┬──────────┘
                            │
             ┌──────────────┼──────────────┐
             ▼              ▼              ▼
        Leave Types       Rules        Calendar
             │              │              │
             └──────────────┼──────────────┘
                            ▼
                    Calculation Engine
                            │
                            ▼
                     Leave Application
                            │
                            ▼
                    Workflow Resolution
                            │
                            ▼
                    Approval Snapshot
                            │
                            ▼
                    Approval / Rejection
                            │
                            ▼
                      Balance Ledger
                            │
                            ▼
                         Balance
                            │
                            ▼
                          Audit
```

And the existing dynamic platform sits around it:

```text
Fields
  ↓
Forms
  ↓
Mappings
  ↓
Logical Tables
  ↓
Dynamic Custom Data

          +
          
Leave Domain Engine
```

The two systems should integrate, but **one must not swallow the other**.

That is the architecture that gives us a genuinely customizable Leave Management System instead of a hardcoded Eklavya-specific leave application.