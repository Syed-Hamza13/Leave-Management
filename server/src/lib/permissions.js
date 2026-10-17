/*
 * Permission catalogue.
 *
 * Keys are seeded into the database by the platform migration and referenced by
 * route guards. Keeping them in one module prevents typos silently widening
 * access, and lets the client mirror the same list for navigation gating.
 */
export const PERMISSIONS = {
  FIELDS_VIEW: "admin.fields.view",
  FIELDS_MANAGE: "admin.fields.manage",

  DROPDOWNS_VIEW: "admin.dropdowns.view",
  DROPDOWNS_MANAGE: "admin.dropdowns.manage",

  FORMS_VIEW: "admin.forms.view",
  FORMS_MANAGE: "admin.forms.manage",

  TABLES_VIEW: "admin.tables.view",
  TABLES_MANAGE: "admin.tables.manage",

  MAPPINGS_VIEW: "admin.mappings.view",
  MAPPINGS_MANAGE: "admin.mappings.manage",

  USERS_VIEW: "admin.users.view",
  USERS_MANAGE: "admin.users.manage",

  ORGANIZATION_VIEW: "admin.organization.view",
  ORGANIZATION_MANAGE: "admin.organization.manage",

  SETTINGS_VIEW: "admin.settings.view",
  SETTINGS_MANAGE: "admin.settings.manage",

  AUDIT_VIEW: "admin.audit.view",

  RECORDS_VIEW: "records.view",
  RECORDS_CREATE: "records.create",
  RECORDS_UPDATE: "records.update",
  RECORDS_DELETE: "records.delete",
};

export const PERMISSION_LIST = Object.entries(PERMISSIONS).map(([name, key]) => ({
  name,
  key,
}));

export const ROLES = {
  SUPER_ADMIN: "super_admin",
  ADMIN: "admin",
  MANAGER: "manager",
  EMPLOYEE: "employee",
};

/*
 * super_admin intentionally receives everything, including settings and user
 * administration. admin covers configuration but not SMTP/secret settings.
 */
export const ROLE_PERMISSIONS = {
  [ROLES.SUPER_ADMIN]: Object.values(PERMISSIONS),

  [ROLES.ADMIN]: Object.values(PERMISSIONS).filter(
    (key) => key !== PERMISSIONS.SETTINGS_MANAGE
  ),

  [ROLES.MANAGER]: [
    PERMISSIONS.FIELDS_VIEW,
    PERMISSIONS.DROPDOWNS_VIEW,
    PERMISSIONS.FORMS_VIEW,
    PERMISSIONS.TABLES_VIEW,
    PERMISSIONS.MAPPINGS_VIEW,
    PERMISSIONS.USERS_VIEW,
    PERMISSIONS.ORGANIZATION_VIEW,
    PERMISSIONS.ORGANIZATION_MANAGE,
    PERMISSIONS.RECORDS_VIEW,
    PERMISSIONS.RECORDS_CREATE,
    PERMISSIONS.RECORDS_UPDATE,
  ],

  [ROLES.EMPLOYEE]: [
    PERMISSIONS.FORMS_VIEW,
    PERMISSIONS.ORGANIZATION_VIEW,
    PERMISSIONS.RECORDS_VIEW,
    PERMISSIONS.RECORDS_CREATE,
  ],
};

export const ROLE_DESCRIPTIONS = {
  [ROLES.SUPER_ADMIN]: "Full control including settings, secrets and user administration.",
  [ROLES.ADMIN]: "Configures fields, forms, tables, mappings, organization and users.",
  [ROLES.MANAGER]: "Manages organization entities and records, reviews configuration.",
  [ROLES.EMPLOYEE]: "Submits and views records through configured forms.",
};
