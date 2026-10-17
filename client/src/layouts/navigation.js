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
    label: "Organization",
    items: [
      { to: "/organization", label: "Structure", permission: PERMISSIONS.ORGANIZATION_VIEW },
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
