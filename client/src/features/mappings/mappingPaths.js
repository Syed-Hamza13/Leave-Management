/*
 * The editor is keyed by the form/table pair rather than by mapping id, because
 * `PUT /admin/mappings` upserts: the same screen creates the mapping the first
 * time and edits it afterwards.
 */
export function mappingEditorPath(formId, tableId) {
  return `/admin/mappings/connect?formId=${formId}&tableId=${tableId}`;
}
