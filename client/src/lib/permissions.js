/*
 * Client mirror of the server permission catalogue in
 * server/src/lib/permissions.js.
 *
 * Keys must stay identical to the server list: they gate navigation only, and
 * every request is re-checked by requirePermission on the API. Hiding a menu
 * item is not authorization.
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
