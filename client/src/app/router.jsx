import { createBrowserRouter, Link, Navigate } from "react-router-dom";

import ProtectedRoute from "../components/auth/ProtectedRoute.jsx";
import RequirePermission from "../components/auth/RequirePermission.jsx";
import EmptyState from "../components/ui/EmptyState.jsx";

import AppShell from "../layouts/AppShell.jsx";

import AuthenticatedProviders from "./AuthenticatedProviders.jsx";

import LoginPage from "../features/auth/LoginPage.jsx";
import AuditPage from "../features/audit/AuditPage.jsx";
import DashboardPage from "../features/dashboard/DashboardPage.jsx";
import DropdownDetailPage from "../features/dropdowns/DropdownDetailPage.jsx";
import DropdownsPage from "../features/dropdowns/DropdownsPage.jsx";
import FieldsPage from "../features/fields/FieldsPage.jsx";
import FormDetailPage from "../features/forms/FormDetailPage.jsx";
import FormsPage from "../features/forms/FormsPage.jsx";
import MappingEditorPage from "../features/mappings/MappingEditorPage.jsx";
import MappingsPage from "../features/mappings/MappingsPage.jsx";
import EntityDetailPage from "../features/organization/EntityDetailPage.jsx";
import EntityTypeConfigPage from "../features/organization/EntityTypeConfigPage.jsx";
import EntityTypePage from "../features/organization/EntityTypePage.jsx";
import OrganizationPage from "../features/organization/OrganizationPage.jsx";
import RecordsIndexPage from "../features/records/RecordsIndexPage.jsx";
import RecordsPage from "../features/records/RecordsPage.jsx";
import SettingsPage from "../features/settings/SettingsPage.jsx";
import TableDetailPage from "../features/tables/TableDetailPage.jsx";
import TablesPage from "../features/tables/TablesPage.jsx";
import UsersPage from "../features/users/UsersPage.jsx";
import LeaveDashboardPage from "../features/leave/LeaveDashboardPage.jsx";
import MyLeavesPage from "../features/leave/MyLeavesPage.jsx";
import ApplyLeavePage from "../features/leave/ApplyLeavePage.jsx";
import LeaveApprovalsPage from "../features/leave/LeaveApprovalsPage.jsx";
import LeaveCalendarPage from "../features/leave/LeaveCalendarPage.jsx";
import PoliciesPage from "../features/leave/admin/PoliciesPage.jsx";
import PolicyEditorPage from "../features/leave/admin/PolicyEditorPage.jsx";
import BalancesPage from "../features/leave/admin/BalancesPage.jsx";
import CalendarsPage from "../features/leave/admin/CalendarsPage.jsx";
import LeaveReportsPage from "../features/leave/admin/LeaveReportsPage.jsx";

import { PERMISSIONS } from "../lib/permissions.js";

/*
 * A screen the user cannot read is never mounted: RequirePermission replaces it
 * with an explanation instead of letting it fire requests that only 403. The
 * route handle is the page's chrome — the shell renders the breadcrumb, title
 * and description, so no feature page repeats that markup.
 */
function screen({ permission, label, element, handle }) {
  return {
    element: (
      <RequirePermission permission={permission} label={label}>
        {element}
      </RequirePermission>
    ),

    handle,
  };
}

const router = createBrowserRouter([
  {
    path: "/login",
    element: <LoginPage />,
  },

  {
    element: <ProtectedRoute />,
    children: [
      {
        element: <AuthenticatedProviders />,
        children: [
          {
            element: <AppShell />,
            children: [
              {
                index: true,
                element: <DashboardPage />,
                handle: {
                  title: "Dashboard",
                  description:
                    "The platform is configured before it is used, so start from the builder sequence below.",
                },
              },

              {
                path: "admin/fields",
                ...screen({
                  permission: PERMISSIONS.FIELDS_VIEW,
                  label: "Viewing field definitions",
                  element: <FieldsPage />,
                  handle: {
                    title: "Fields",
                    description:
                      "One reusable question definition, typed and validated once and shared by every form.",
                  },
                }),
              },

              {
                path: "admin/dropdowns",
                ...screen({
                  permission: PERMISSIONS.DROPDOWNS_VIEW,
                  label: "Viewing dropdowns",
                  element: <DropdownsPage />,
                  handle: {
                    title: "Dropdowns",
                    description:
                      "Named option sets that fields draw their choices from.",
                  },
                }),
              },

              {
                path: "admin/dropdowns/:dropdownId",
                ...screen({
                  permission: PERMISSIONS.DROPDOWNS_VIEW,
                  label: "Viewing dropdowns",
                  element: <DropdownDetailPage />,
                  handle: (match) => ({
                    breadcrumb: [
                      { label: "Dropdowns", to: "/admin/dropdowns" },
                      { label: `Dropdown #${match.params.dropdownId}` },
                    ],

                    title: "Dropdown options",
                    description:
                      "Add, reorder and archive the choices this set offers. Archived options stay on stored records.",
                  }),
                }),
              },

              {
                path: "admin/forms",
                ...screen({
                  permission: PERMISSIONS.FORMS_VIEW,
                  label: "Viewing forms",
                  element: <FormsPage />,
                  handle: {
                    title: "Forms",
                    description:
                      "The screens people submit through, composed from existing fields.",
                  },
                }),
              },

              {
                path: "admin/forms/:formId",
                ...screen({
                  permission: PERMISSIONS.FORMS_VIEW,
                  label: "Viewing forms",
                  element: <FormDetailPage />,
                  handle: (match) => ({
                    breadcrumb: [
                      { label: "Forms", to: "/admin/forms" },
                      { label: `Form #${match.params.formId}` },
                    ],

                    title: "Form builder",
                    description:
                      "Choose the fields, then set their order and how each one behaves in this form.",
                  }),
                }),
              },

              {
                path: "admin/tables",
                ...screen({
                  permission: PERMISSIONS.TABLES_VIEW,
                  label: "Viewing logical tables",
                  element: <TablesPage />,
                  handle: {
                    title: "Tables",
                    description:
                      "Logical tables hold records as metadata, never as MySQL tables created from browser input.",
                  },
                }),
              },

              {
                path: "admin/tables/:tableId",
                ...screen({
                  permission: PERMISSIONS.TABLES_VIEW,
                  label: "Viewing logical tables",
                  element: <TableDetailPage />,
                  handle: (match) => ({
                    breadcrumb: [
                      { label: "Tables", to: "/admin/tables" },
                      { label: `Table #${match.params.tableId}` },
                    ],

                    title: "Table columns",
                    description:
                      "Each column stores one typed value. Columns that already hold records stay locked.",
                  }),
                }),
              },

              {
                path: "admin/mappings",
                ...screen({
                  permission: PERMISSIONS.MAPPINGS_VIEW,
                  label: "Viewing form mappings",
                  element: <MappingsPage />,
                  handle: {
                    title: "Form mappings",
                    description:
                      "A mapping decides which column receives each field of a form, so a submission lands where it was designed to.",
                  },
                }),
              },

              {
                path: "admin/mappings/connect",
                ...screen({
                  permission: PERMISSIONS.MAPPINGS_VIEW,
                  label: "Viewing form mappings",
                  element: <MappingEditorPage />,
                  handle: {
                    title: "Connect form to table",
                    description:
                      "Pick a form and a table, then connect their compatible fields and columns. Saving creates or replaces the mapping for that pair.",
                  },
                }),
              },

              {
                path: "admin/users",
                ...screen({
                  permission: PERMISSIONS.USERS_VIEW,
                  label: "Viewing users",
                  element: <UsersPage />,
                  handle: {
                    title: "Users",
                    description:
                      "Accounts, roles and sign-in status. Setting a password ends that account's sessions immediately.",
                  },
                }),
              },

              {
                path: "records",
                ...screen({
                  permission: PERMISSIONS.RECORDS_VIEW,
                  label: "Browsing records",
                  element: <RecordsIndexPage />,
                  handle: {
                    title: "Records",
                    description:
                      "Choose a table to browse its rows or add one through a mapped form.",
                  },
                }),
              },

              {
                path: "records/:tableId",
                ...screen({
                  permission: PERMISSIONS.RECORDS_VIEW,
                  label: "Browsing records",
                  element: <RecordsPage />,
                  handle: (match) => ({
                    breadcrumb: [
                      { label: "Records", to: "/records" },
                      { label: `Table #${match.params.tableId}` },
                    ],

                    title: "Table records",
                    description:
                      "Search, sort and filter stored rows, and enter new ones through a mapped form.",
                  }),
                }),
              },

              {
                path: "organization",
                ...screen({
                  permission: PERMISSIONS.ORGANIZATION_VIEW,
                  label: "Viewing the organization",
                  element: <OrganizationPage />,
                  handle: {
                    title: "Organization structure",
                    description:
                      "Define and manage the entities your organization uses.",
                  },
                }),
              },

              {
                path: "organization/entities/:entityId",
                ...screen({
                  permission: PERMISSIONS.ORGANIZATION_VIEW,
                  label: "Viewing the organization structure",
                  element: <EntityDetailPage />,
                  handle: {
                    title: "Entity",
                    description:
                      "One entity with its profile values and the records attached to it.",
                  },
                }),
              },

              {
                path: "organization/:entityTypeId",
                ...screen({
                  permission: PERMISSIONS.ORGANIZATION_VIEW,
                  label: "Viewing the organization structure",
                  element: <EntityTypePage />,
                }),
              },

              {
                path: "organization/:entityTypeId/configure",
                ...screen({
                  permission: PERMISSIONS.ORGANIZATION_MANAGE,
                  label: "Configuring an entity",
                  element: <EntityTypeConfigPage />,
                }),
              },

              {
                path: "admin/settings",
                ...screen({
                  permission: PERMISSIONS.SETTINGS_VIEW,
                  label: "Viewing platform settings",
                  element: <SettingsPage />,
                  handle: {
                    title: "Platform settings",
                    description:
                      "Mail transport is stored encrypted and never returned by the API — only whether a credential is configured.",
                  },
                }),
              },

              {
                path: "admin/audit",
                ...screen({
                  permission: PERMISSIONS.AUDIT_VIEW,
                  label: "Viewing the audit trail",
                  element: <AuditPage />,
                  handle: {
                    title: "Audit trail",
                    description:
                      "Every administrative action is recorded with its actor, object and a summary of the change.",
                  },
                }),
              },

              {
                path: "leave",
                ...screen({
                  permission: PERMISSIONS.LEAVE_VIEW,
                  label: "Viewing leave dashboard",
                  element: <LeaveDashboardPage />,
                  handle: {
                    title: "Leave Dashboard",
                    description: "Manage your leave quota balances, track requests, and check upcoming absences.",
                  },
                }),
              },

              {
                path: "leave/my-leaves",
                ...screen({
                  permission: PERMISSIONS.LEAVE_VIEW,
                  label: "Viewing personal leave applications",
                  element: <MyLeavesPage />,
                  handle: {
                    title: "My Leave Applications",
                    description: "History of all submitted, approved, and pending leave requests.",
                  },
                }),
              },

              {
                path: "leave/apply",
                ...screen({
                  permission: PERMISSIONS.LEAVE_APPLY,
                  label: "Applying for leave",
                  element: <ApplyLeavePage />,
                  handle: {
                    title: "Apply for Leave",
                    description: "Guided application with live duration calculation and rule compliance preview.",
                  },
                }),
              },

              {
                path: "leave/approvals",
                ...screen({
                  permission: PERMISSIONS.LEAVE_APPROVE,
                  label: "Reviewing leave approvals",
                  element: <LeaveApprovalsPage />,
                  handle: {
                    title: "Approval Queue",
                    description: "Review and action pending absence requests assigned to you.",
                  },
                }),
              },

              {
                path: "leave/calendar",
                ...screen({
                  permission: PERMISSIONS.LEAVE_CALENDAR_VIEW,
                  label: "Viewing team calendar",
                  element: <LeaveCalendarPage />,
                  handle: {
                    title: "Team Absence Calendar",
                    description: "Overview of scheduled leaves and gazetted institutional holidays.",
                  },
                }),
              },

              {
                path: "admin/leave/policies",
                ...screen({
                  permission: PERMISSIONS.LEAVE_POLICIES_VIEW,
                  label: "Viewing leave policies",
                  element: <PoliciesPage />,
                  handle: {
                    title: "Leave Policies",
                    description: "Versioned leave policy sets governing institutional absence rules.",
                  },
                }),
              },

              {
                path: "admin/leave/policies/:id",
                ...screen({
                  permission: PERMISSIONS.LEAVE_POLICIES_MANAGE,
                  label: "Configuring leave policy",
                  element: <PolicyEditorPage />,
                  handle: {
                    title: "Policy Configuration",
                    description: "Configure leave types, evaluation rules, and tiered approval workflows.",
                  },
                }),
              },

              {
                path: "admin/leave/balances",
                ...screen({
                  permission: PERMISSIONS.LEAVE_BALANCES_VIEW,
                  label: "Viewing employee balances",
                  element: <BalancesPage />,
                  handle: {
                    title: "Employee Leave Balances",
                    description: "Audit quota ledgers and perform manual administrative balance adjustments.",
                  },
                }),
              },

              {
                path: "admin/leave/calendars",
                ...screen({
                  permission: PERMISSIONS.LEAVE_CALENDARS_VIEW,
                  label: "Viewing calendars and holidays",
                  element: <CalendarsPage />,
                  handle: {
                    title: "Calendars & Holidays",
                    description: "Weekly working days and institutional holiday schedules.",
                  },
                }),
              },

              {
                path: "admin/leave/reports",
                ...screen({
                  permission: PERMISSIONS.LEAVE_REPORTS_VIEW,
                  label: "Viewing leave reports",
                  element: <LeaveReportsPage />,
                  handle: {
                    title: "Leave Reports",
                    description: "Monthly leave registers and annual quota summary reports.",
                  },
                }),
              },

              {
                path: "*",
                element: (
                  <EmptyState
                    title="This page does not exist"
                    description="The address does not match any screen this account can open."
                    action={
                      <Link to="/" className="text-sm font-medium text-brand hover:underline">
                        Back to the dashboard
                      </Link>
                    }
                  />
                ),
              },
            ],
          },
        ],
      },
    ],
  },

  {
    path: "*",
    element: <Navigate to="/" replace />,
  },
]);

export default router;
