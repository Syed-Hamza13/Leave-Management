import { PERMISSIONS } from "../lib/permissions.js";

/*
 * The shell renders this list, so navigation is data rather than JSX: adding a
 * builder screen is one entry here plus one route.
 *
 * A group disappears entirely when the signed-in user holds none of its
 * permissions.
 */
export const NAV_GROUPS = [
  {
    label: "Leave",
    items: [
      { to: "/leave", label: "Leave Overview", permission: PERMISSIONS.LEAVE_VIEW, end: true },
      { to: "/leave/my-leaves", label: "My Leaves", permission: PERMISSIONS.LEAVE_VIEW },
      { to: "/leave/apply", label: "Apply Leave", permission: PERMISSIONS.LEAVE_APPLY },
      { to: "/leave/approvals", label: "Approvals", permission: PERMISSIONS.LEAVE_APPROVE },
      { to: "/leave/calendar", label: "Team Calendar", permission: PERMISSIONS.LEAVE_CALENDAR_VIEW },
    ],
  },
  {
    label: "Records",
    items: [
      { to: "/records", label: "Browse records", permission: PERMISSIONS.RECORDS_VIEW },
    ],
  },
  {
    label: "Administration",
    items: [
      { to: "/admin/fields", label: "Fields", permission: PERMISSIONS.FIELDS_VIEW },
      { to: "/admin/dropdowns", label: "Dropdowns", permission: PERMISSIONS.DROPDOWNS_VIEW },
      { to: "/admin/forms", label: "Forms", permission: PERMISSIONS.FORMS_VIEW },
      { to: "/admin/tables", label: "Tables", permission: PERMISSIONS.TABLES_VIEW },
      { to: "/admin/mappings", label: "Form mappings", permission: PERMISSIONS.MAPPINGS_VIEW },
      { to: "/admin/users", label: "Users", permission: PERMISSIONS.USERS_VIEW },
    ],
  },
  {
    label: "Leave Management",
    items: [
      { to: "/admin/leave/policies", label: "Policies & Rules", permission: PERMISSIONS.LEAVE_POLICIES_VIEW },
      { to: "/admin/leave/balances", label: "Employee Balances", permission: PERMISSIONS.LEAVE_BALANCES_VIEW },
      { to: "/admin/leave/calendars", label: "Calendars & Holidays", permission: PERMISSIONS.LEAVE_CALENDARS_VIEW },
      { to: "/admin/leave/reports", label: "Reports & Register", permission: PERMISSIONS.LEAVE_REPORTS_VIEW },
    ],
  },
  {
    label: "Organization",
    /*
     * Entity types are administrator-defined, so the shell nests one entry per
     * active type under this group: reaching a department or a branch should not
     * cost two clicks on every visit.
     */
    nest: "entityTypes",
    items: [
      /*
       * `end` keeps this entry lit only on the list itself: the type screens
       * branch off it and each has its own entry.
       */
      {
        to: "/organization",
        label: "Structure",
        permission: PERMISSIONS.ORGANIZATION_VIEW,
        end: true,
      },
    ],
  },
  {
    label: "Settings",
    items: [
      { to: "/admin/settings", label: "Platform settings", permission: PERMISSIONS.SETTINGS_VIEW },
      { to: "/admin/audit", label: "Audit trail", permission: PERMISSIONS.AUDIT_VIEW },
    ],
  },
];
