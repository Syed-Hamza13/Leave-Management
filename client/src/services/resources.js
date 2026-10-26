import api from "./api.js";

/*
 * Every call returns the raw response envelope, so screens read `data` and
 * `meta` themselves and the list/pagination contract stays visible at the call
 * site rather than hidden behind a helper.
 */
function toQuery(params = {}) {
  const search = new URLSearchParams();

  for (const [key, value] of Object.entries(params)) {
    if (value === undefined || value === null || value === "") continue;

    search.append(key, Array.isArray(value) ? JSON.stringify(value) : String(value));
  }

  const text = search.toString();

  return text ? `?${text}` : "";
}

/*
 * The API takes one sort term as `key:direction`; the table component holds it
 * as an object, so the translation happens once here.
 */
function listQuery({ sort, ...rest } = {}) {
  return toQuery({
    ...rest,
    sort: sort ? `${sort.key}:${sort.direction}` : undefined,
  });
}

const send = (method) => (path, payload) =>
  api(path, { method, body: payload === undefined ? undefined : JSON.stringify(payload) });

const post = send("POST");
const patch = send("PATCH");
const put = send("PUT");

export const session = {
  permissions: () => api("/authorization/permissions"),
};

export const authorization = {
  roles: () => api("/authorization/roles"),
  setRoles: (userId, roleKeys) => put(`/authorization/users/${userId}/roles`, { roleKeys }),
};

export const metadata = {
  dataTypes: () => api("/admin/metadata/data-types"),
  lookups: () => api("/admin/metadata/lookups"),
};

export const fields = {
  list: (params) => api(`/admin/fields${toQuery(params)}`),
  get: (fieldId) => api(`/admin/fields/${fieldId}`),
  usage: (fieldId) => api(`/admin/fields/${fieldId}/usage`),
  create: (payload) => post("/admin/fields", payload),
  update: (fieldId, payload) => patch(`/admin/fields/${fieldId}`, payload),
  archive: (fieldId) => api(`/admin/fields/${fieldId}`, { method: "DELETE" }),
};

export const dropdowns = {
  list: (params) => api(`/admin/dropdowns${toQuery(params)}`),
  get: (dropdownId) => api(`/admin/dropdowns/${dropdownId}`),
  create: (payload) => post("/admin/dropdowns", payload),
  update: (dropdownId, payload) => patch(`/admin/dropdowns/${dropdownId}`, payload),
  archive: (dropdownId) => api(`/admin/dropdowns/${dropdownId}`, { method: "DELETE" }),
  options: (dropdownId) => api(`/admin/dropdowns/${dropdownId}/options`),
  createOption: (dropdownId, payload) => post(`/admin/dropdowns/${dropdownId}/options`, payload),
  reorderOptions: (dropdownId, optionIds) =>
    put(`/admin/dropdowns/${dropdownId}/options/order`, { optionIds }),
  updateOption: (dropdownId, optionId, payload) =>
    patch(`/admin/dropdowns/${dropdownId}/options/${optionId}`, payload),
  deleteOption: (dropdownId, optionId) =>
    api(`/admin/dropdowns/${dropdownId}/options/${optionId}`, { method: "DELETE" }),
};

export const forms = {
  list: (params) => api(`/admin/forms${toQuery(params)}`),
  get: (formId) => api(`/admin/forms/${formId}`),
  usage: (formId) => api(`/admin/forms/${formId}/usage`),
  render: (formId) => api(`/admin/forms/${formId}/render`),
  create: (payload) => post("/admin/forms", payload),
  update: (formId, payload) => patch(`/admin/forms/${formId}`, payload),
  archive: (formId) => api(`/admin/forms/${formId}`, { method: "DELETE" }),
  reorderFields: (formId, fieldIds) => put(`/admin/forms/${formId}/fields/order`, { fieldIds }),
};

export const tables = {
  list: (params) => api(`/admin/tables${toQuery(params)}`),
  get: (tableId) => api(`/admin/tables/${tableId}`),
  usage: (tableId) => api(`/admin/tables/${tableId}/usage`),
  columns: (tableId) => api(`/admin/tables/${tableId}/columns`),
  create: (payload) => post("/admin/tables", payload),
  update: (tableId, payload) => patch(`/admin/tables/${tableId}`, payload),
  archive: (tableId) => api(`/admin/tables/${tableId}`, { method: "DELETE" }),
  createColumn: (tableId, payload) => post(`/admin/tables/${tableId}/columns`, payload),
  reorderColumns: (tableId, columnIds) =>
    put(`/admin/tables/${tableId}/columns/order`, { columnIds }),
  updateColumn: (tableId, columnId, payload) =>
    patch(`/admin/tables/${tableId}/columns/${columnId}`, payload),
  deleteColumn: (tableId, columnId, { permanent = false } = {}) =>
    api(
      `/admin/tables/${tableId}/columns/${columnId}${permanent ? "?permanent=true" : ""}`,
      { method: "DELETE" }
    ),
};

export const mappings = {
  list: (params) => api(`/admin/mappings${toQuery(params)}`),
  compatibility: (formId, tableId) =>
    api(`/admin/mappings/compatibility${toQuery({ formId, tableId })}`),
  forFormAndTable: (formId, tableId) => api(`/admin/mappings/for/${formId}/${tableId}`),
  save: (payload) => put("/admin/mappings", payload),
  get: (mappingId) => api(`/admin/mappings/${mappingId}`),
  update: (mappingId, payload) => patch(`/admin/mappings/${mappingId}`, payload),
  // A mapping is a connector, not a row: archiving it stops the writes while
  // leaving the pair re-openable from the picker, which reactivates it.
  archive: (mappingId) => patch(`/admin/mappings/${mappingId}`, { status: "archived" }),
  remove: (mappingId) => api(`/admin/mappings/${mappingId}`, { method: "DELETE" }),
};

export const records = {
  list: (tableId, params) => api(`/tables/${tableId}/records${listQuery(params)}`),
  facets: (tableId, params) => api(`/tables/${tableId}/records/facets${toQuery(params)}`),
  get: (tableId, recordId) => api(`/tables/${tableId}/records/${recordId}`),
  create: (tableId, payload) => post(`/tables/${tableId}/records`, payload),
  update: (tableId, recordId, payload) =>
    patch(`/tables/${tableId}/records/${recordId}`, payload),
  archive: (tableId, recordId) =>
    api(`/tables/${tableId}/records/${recordId}`, { method: "DELETE" }),
};

export const organization = {
  listEntityTypes: (params) => api(`/organization/entity-types${toQuery(params)}`),
  getEntityType: (entityTypeId) => api(`/organization/entity-types/${entityTypeId}`),
  createEntityType: (payload) => post("/organization/entity-types", payload),
  updateEntityType: (entityTypeId, payload) =>
    patch(`/organization/entity-types/${entityTypeId}`, payload),
  archiveEntityType: (entityTypeId) =>
    api(`/organization/entity-types/${entityTypeId}`, { method: "DELETE" }),

  listConfigurations: (entityTypeId, params) =>
    api(`/organization/entity-types/${entityTypeId}/configurations${toQuery(params)}`),
  createConfiguration: (entityTypeId, payload) =>
    post(`/organization/entity-types/${entityTypeId}/configurations`, payload),
  updateConfiguration: (configurationId, payload) =>
    patch(`/organization/configurations/${configurationId}`, payload),
  deleteConfiguration: (configurationId) =>
    api(`/organization/configurations/${configurationId}`, { method: "DELETE" }),

  listEntities: (params) => api(`/organization/entities${listQuery(params)}`),
  getEntity: (entityId) => api(`/organization/entities/${entityId}`),
  createEntity: (payload) => post("/organization/entities", payload),
  updateEntity: (entityId, payload) => patch(`/organization/entities/${entityId}`, payload),
  archiveEntity: (entityId) => api(`/organization/entities/${entityId}`, { method: "DELETE" }),

  listMembers: (entityId) => api(`/organization/entities/${entityId}/members`),
  addMember: (entityId, payload) => post(`/organization/entities/${entityId}/members`, payload),
  updateMember: (entityId, userId, payload) =>
    patch(`/organization/entities/${entityId}/members/${userId}`, payload),
  removeMember: (entityId, userId) =>
    api(`/organization/entities/${entityId}/members/${userId}`, { method: "DELETE" }),
  userMemberships: (userId) => api(`/organization/users/${userId}/memberships`),
};

/*
 * Accounts are administered through their own endpoints, never through generic
 * record CRUD, so the authentication columns stay under server control.
 */
export const users = {
  list: (params) => api(`/admin/users${listQuery(params)}`),
  get: (userId) => api(`/admin/users/${userId}`),
  create: (payload) => post("/admin/users", payload),
  update: (userId, payload) => patch(`/admin/users/${userId}`, payload),
  setPassword: (userId, password) => put(`/admin/users/${userId}/password`, { password }),
};

export const settings = {
  list: () => api("/admin/settings"),
  smtp: () => api("/admin/settings/smtp"),
  updateSmtp: (payload) => patch("/admin/settings/smtp", payload),
  testSmtp: () => post("/admin/settings/smtp/test", {}),
  turnstile: () => api("/admin/settings/turnstile"),
  updateTurnstile: (payload) => patch("/admin/settings/turnstile", payload),
};

export const auth = {
  turnstile: () => api("/auth/turnstile"),
};

export const audit = {
  events: (params) => api(`/admin/audit/events${toQuery(params)}`),
};

export const leave = {
  dashboard: () => api("/leave/dashboard"),
  balances: () => api("/leave/balances"),
  balanceLedger: (balanceId) => api(`/leave/balances/${balanceId}/ledger`),
  calculate: (payload) => post("/leave/calculate", payload),
  submit: (payload) => post("/leave/applications", payload),
  myApplications: (params) => api(`/leave/applications${toQuery(params)}`),
  getApplication: (id) => api(`/leave/applications/${id}`),
  cancel: (id, payload) => post(`/leave/applications/${id}/cancel`, payload),
  calendar: (params) => api(`/leave/calendar${toQuery(params)}`),
  types: () => api("/leave/types"),

  pendingApprovals: () => api("/leave/approvals/pending"),
  approve: (id, payload) => post(`/leave/approvals/${id}/approve`, payload),
  reject: (id, payload) => post(`/leave/approvals/${id}/reject`, payload),
};

export const adminLeave = {
  listPolicies: () => api("/admin/leave/policies"),
  getPolicy: (id) => api(`/admin/leave/policies/${id}`),
  createPolicy: (payload) => post("/admin/leave/policies", payload),
  updatePolicy: (id, payload) => patch(`/admin/leave/policies/${id}`, payload),
  publishPolicy: (id) => post(`/admin/leave/policies/${id}/publish`, {}),
  archivePolicy: (id) => post(`/admin/leave/policies/${id}/archive`, {}),

  listTypes: (policyId) => api(`/admin/leave/types${toQuery({ policyId })}`),
  createType: (payload) => post("/admin/leave/types", payload),
  updateType: (id, payload) => patch(`/admin/leave/types/${id}`, payload),
  archiveType: (id) => api(`/admin/leave/types/${id}`, { method: "DELETE" }),

  listRules: (params) => api(`/admin/leave/rules${toQuery(params)}`),
  createRule: (payload) => post("/admin/leave/rules", payload),
  updateRule: (id, payload) => patch(`/admin/leave/rules/${id}`, payload),
  deleteRule: (id) => api(`/admin/leave/rules/${id}`, { method: "DELETE" }),

  listWorkflows: (policyId) => api(`/admin/leave/workflows${toQuery({ policyId })}`),
  createWorkflow: (payload) => post("/admin/leave/workflows", payload),
  updateWorkflow: (id, payload) => patch(`/admin/leave/workflows/${id}`, payload),
  deleteWorkflow: (id) => api(`/admin/leave/workflows/${id}`, { method: "DELETE" }),
  addWorkflowStep: (workflowId, payload) => post(`/admin/leave/workflows/${workflowId}/steps`, payload),
  deleteWorkflowStep: (stepId) => api(`/admin/leave/workflows/steps/${stepId}`, { method: "DELETE" }),

  listCalendars: () => api("/admin/leave/calendars"),
  createCalendar: (payload) => post("/admin/leave/calendars", payload),
  updateCalendar: (id, payload) => patch(`/admin/leave/calendars/${id}`, payload),
  listHolidays: (calendarId) => api(`/admin/leave/holidays${toQuery({ calendarId })}`),
  addHoliday: (payload) => post("/admin/leave/holidays", payload),
  deleteHoliday: (id) => api(`/admin/leave/holidays/${id}`, { method: "DELETE" }),

  listBalances: (params) => api(`/admin/leave/balances${toQuery(params)}`),
  adjustBalance: (payload) => post("/admin/leave/balances/adjust", payload),

  summaryReport: () => api("/admin/leave/reports/summary"),
  monthlyRegister: (params) => api(`/admin/leave/reports/register${toQuery(params)}`),
};
