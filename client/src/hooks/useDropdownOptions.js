import useAsyncData from "./useAsyncData.js";
import { dropdowns } from "../services/resources.js";

/*
 * Dropdown-type fields and columns reference an option set by id, so the
 * renderer needs the options separately. Loading them here keeps every screen
 * that shows a dropdown from repeating the request shape.
 */
export default function useDropdownOptions(dropdownId) {
  return useAsyncData(`dropdown-options:${dropdownId ?? "none"}`, () => {
    if (!dropdownId) return Promise.resolve([]);

    return dropdowns.options(dropdownId).then((response) =>
      (response?.data ?? []).map((option) => ({
        value: option.value,
        label: option.label,
      }))
    );
  });
}
