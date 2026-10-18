import smoke from "./00-smoke.js";
import auth from "./01-auth.js";
import navigation from "./02-navigation.js";
import fields from "./03-fields.js";
import dropdowns from "./04-dropdowns.js";
import forms from "./05-forms.js";
import tables from "./06-tables.js";
import mappings from "./07-mappings.js";
import records from "./08-records.js";
import organization from "./09-organization.js";
import users from "./10-users.js";
import settings from "./11-settings.js";
import audit from "./12-audit.js";
import slice from "./13-vertical-slice.js";
import dataTypes from "./14-data-types.js";
import resilience from "./15-resilience.js";
import security from "./16-security.js";

export const suites = [
  smoke,
  auth,
  navigation,
  fields,
  dropdowns,
  forms,
  tables,
  mappings,
  records,
  organization,
  users,
  settings,
  audit,
  slice,
  dataTypes,
  resilience,
  // Runs last: it sends hostile payloads, so it stays away from the suites that
  // still need a clean budget and untouched definitions.
  security,
];
