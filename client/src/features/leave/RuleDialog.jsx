import { useState, useEffect, useMemo } from "react";
import Button from "../../components/ui/Button.jsx";
import DateInput from "../../components/ui/DateInput.jsx";
import Modal from "../../components/ui/Modal.jsx";
import NumberInput from "../../components/ui/NumberInput.jsx";
import Select from "../../components/ui/Select.jsx";
import TextInput from "../../components/ui/TextInput.jsx";
import Toggle from "../../components/ui/Toggle.jsx";
import { useToast } from "../../components/ui/ToastContext.js";
import useAsyncData from "../../hooks/useAsyncData.js";
import { tables as tablesApi, authorization as authorizationApi } from "../../services/resources.js";
import useEntryOptions from "../records/useEntryOptions.js";

const OPERATORS = [
  { value: "eq", label: "Equals (=)" },
  { value: "neq", label: "Not Equals (!=)" },
  { value: "between", label: "Between (Range [min, max])" },
  { value: "gte", label: "Greater than or equal (>=)" },
  { value: "lte", label: "Less than or equal (<=)" },
  { value: "gt", label: "Greater than (>)" },
  { value: "lt", label: "Less than (<)" },
  { value: "in", label: "In list (comma separated)" },
  { value: "contains", label: "Contains text" },
];

const APPROVER_TYPES = [
  { value: "coordinator_or_incharge", label: "Local Coordinator OR Project In-Charge (Auto-Fallback)" },
  { value: "user_relation", label: "User Supervisor / Reference (e.g. reports_to / coordinator)" },
  { value: "entity_incharge", label: "Entity In-Charge (e.g. Project or Center In-Charge)" },
  { value: "council_or_team", label: "Council or Committee (e.g. Academic Council, Programme Committee)" },
  { value: "direct_user", label: "Specific User Account" },
];

const NOTIFY_TARGET_TYPES = [
  { value: "council", label: "Council / Committee (e.g. EC, AC, Programme Committee)" },
  { value: "entity_incharge", label: "Entity In-Charge (e.g. Center / Project / Programme Head)" },
  { value: "user_relation", label: "User Supervisor / Reference (e.g. reports_to)" },
  { value: "direct_user", label: "Specific User Account" },
];

const NOTIFY_PRESETS = [
  { type: "entity_incharge", entityTypeKey: "center", columnKey: "center_in_charge", label: "Centre In-Charge" },
  { type: "entity_incharge", entityTypeKey: "project", columnKey: "project_incharge", label: "Project In-Charge" },
  { type: "entity_incharge", entityTypeKey: "programme", columnKey: "programme_coordinator", label: "Programme Coordinator" },
  { type: "council", entityName: "Academic Council", label: "Academic Council (AC)" },
  { type: "council", entityName: "Executive Council", label: "Executive Council (EC)" },
  { type: "council", entityName: "Programme Committee", label: "Programme Committee" },
  { type: "user_relation", field: "reports_to", label: "Local Coordinator (reports_to)" },
];

const LEAVE_TYPES = [
  { value: "Privilege Leave", label: "Privilege Leave (PL)" },
  { value: "Short Leave", label: "Short Leave (2 Hours)" },
  { value: "Optional Leave", label: "Optional Leave" },
  { value: "Maternity Leave", label: "Maternity Leave" },
  { value: "Paternity Leave", label: "Paternity Leave" },
  { value: "Leave Without Pay", label: "Leave Without Pay (LWP)" },
];

const REQUEST_FIELDS = [
  {
    key: "days",
    label: "Duration in Days",
    dataType: "number",
    defaultOperator: "between",
    defaultValue: [1, 6],
    operators: [
      { value: "between", label: "Between (Range [min, max])" },
      { value: "gte", label: "Greater than or equal (>=)" },
      { value: "lte", label: "Less than or equal (<=)" },
      { value: "gt", label: "Greater than (>)" },
      { value: "lt", label: "Less than (<)" },
      { value: "eq", label: "Equals (=)" },
      { value: "neq", label: "Not Equals (!=)" },
    ],
  },
  {
    key: "leave_type",
    label: "Leave Type",
    dataType: "dropdown",
    defaultOperator: "eq",
    defaultValue: "Privilege Leave",
    options: LEAVE_TYPES,
    operators: [
      { value: "eq", label: "Equals (=)" },
      { value: "neq", label: "Not Equals (!=)" },
      { value: "in", label: "In list (multiple)" },
    ],
  },
  {
    key: "is_emergency",
    label: "Emergency / Medical Flag",
    dataType: "boolean",
    defaultOperator: "eq",
    defaultValue: "true",
    options: [
      { value: "true", label: "Yes (Emergency)" },
      { value: "false", label: "No (Normal Leave)" },
    ],
    operators: [
      { value: "eq", label: "Equals (=)" },
      { value: "neq", label: "Not Equals (!=)" },
    ],
  },
  {
    key: "start_date",
    label: "Start Date",
    dataType: "date",
    defaultOperator: "gte",
    defaultValue: "",
    operators: [
      { value: "gte", label: "On or after (>=)" },
      { value: "lte", label: "On or before (<=)" },
      { value: "eq", label: "Equals (=)" },
      { value: "between", label: "Between dates" },
    ],
  },
  {
    key: "end_date",
    label: "End Date",
    dataType: "date",
    defaultOperator: "lte",
    defaultValue: "",
    operators: [
      { value: "lte", label: "On or before (<=)" },
      { value: "gte", label: "On or after (>=)" },
      { value: "eq", label: "Equals (=)" },
      { value: "between", label: "Between dates" },
    ],
  },
];

function parseRangeValue(val) {
  if (Array.isArray(val)) {
    return [val[0] ?? "", val[1] ?? ""];
  }
  if (typeof val === "string" && val.includes(",")) {
    const parts = val.split(",");
    return [parts[0]?.trim() ?? "", parts[1]?.trim() ?? ""];
  }
  if (val !== null && val !== undefined && val !== "") {
    return [val, ""];
  }
  return ["", ""];
}

function ConditionValueInput({ cond, idx, fieldMeta, onUpdate, optionsFor }) {
  const dataType = fieldMeta?.dataType || "text";

  const options = useMemo(() => {
    let opts = [];
    if (fieldMeta?.options) {
      opts = fieldMeta.options;
    } else if (fieldMeta?.column) {
      opts = optionsFor(fieldMeta.column) || [];
    }

    // Ensure existing cond.value is present in options so it displays cleanly
    if (cond.value !== undefined && cond.value !== null && cond.value !== "") {
      const strVal = String(cond.value).trim();
      const exists = opts.some(
        (o) => String(o.value).toLowerCase() === strVal.toLowerCase()
      );
      if (!exists) {
        const matchedLabel = opts.find(
          (o) => String(o.label).toLowerCase() === strVal.toLowerCase()
        );
        if (matchedLabel) {
          opts = [{ value: strVal, label: matchedLabel.label }, ...opts];
        } else {
          opts = [{ value: strVal, label: strVal }, ...opts];
        }
      }
    }
    return opts;
  }, [fieldMeta, optionsFor, cond.value]);

  // 1. Range / Between for Numbers
  if (cond.operator === "between" && (dataType === "number" || fieldMeta?.key === "days")) {
    const [minVal, maxVal] = parseRangeValue(cond.value);
    return (
      <div className="flex items-center gap-1.5 flex-1 min-w-[170px]">
        <input
          type="number"
          step="any"
          placeholder="Min"
          className="w-20 h-10 px-2 py-1 text-xs border border-slate-300 rounded focus:border-indigo-500 focus:outline-none bg-white"
          value={minVal}
          onChange={(e) => {
            const val = e.target.value;
            onUpdate(idx, {
              value: [val === "" ? "" : Number(val), maxVal === "" ? "" : Number(maxVal)],
            });
          }}
        />
        <span className="text-xs text-slate-400 font-semibold">to</span>
        <input
          type="number"
          step="any"
          placeholder="Max"
          className="w-20 h-10 px-2 py-1 text-xs border border-slate-300 rounded focus:border-indigo-500 focus:outline-none bg-white"
          value={maxVal}
          onChange={(e) => {
            const val = e.target.value;
            onUpdate(idx, {
              value: [minVal === "" ? "" : Number(minVal), val === "" ? "" : Number(val)],
            });
          }}
        />
      </div>
    );
  }

  // 2. Single Number
  if (dataType === "number" || fieldMeta?.key === "days") {
    const val = Array.isArray(cond.value) ? cond.value[0] ?? "" : (cond.value ?? "");
    return (
      <input
        type="number"
        step="any"
        placeholder="e.g. 7 or 30"
        className="w-full h-10 px-3 text-xs border border-slate-300 rounded focus:border-indigo-500 focus:outline-none bg-white"
        value={val}
        onChange={(e) => {
          const val = e.target.value;
          onUpdate(idx, { value: val === "" ? "" : Number(val) });
        }}
      />
    );
  }

  // 3. Dropdown / Options with Operator === "in"
  if (cond.operator === "in" && options.length > 0) {
    const currentList = (
      Array.isArray(cond.value)
        ? cond.value
        : String(cond.value || "").split(",")
    )
      .map((v) => String(v).trim())
      .filter(Boolean);

    const isSelected = (val) =>
      currentList.some((v) => v.toLowerCase() === String(val).toLowerCase());

    const toggleOption = (optVal) => {
      let next;
      if (isSelected(optVal)) {
        next = currentList.filter(
          (v) => v.toLowerCase() !== String(optVal).toLowerCase()
        );
      } else {
        next = [...currentList, optVal];
      }
      onUpdate(idx, { value: next.join(", ") });
    };

    return (
      <div className="space-y-1 flex-1 min-w-[200px]">
        <input
          type="text"
          placeholder="e.g. Admin Staff, Programme Staff"
          className="w-full h-10 px-3 text-xs border border-slate-300 rounded focus:border-indigo-500 focus:outline-none bg-white"
          value={Array.isArray(cond.value) ? cond.value.join(", ") : cond.value ?? ""}
          onChange={(e) => onUpdate(idx, { value: e.target.value })}
        />
        <div className="flex flex-wrap gap-1">
          {options.map((opt) => (
            <button
              type="button"
              key={opt.value}
              onClick={() => toggleOption(opt.value)}
              className={`text-[10px] px-1.5 py-0.5 rounded border transition-colors ${
                isSelected(opt.value)
                  ? "bg-indigo-100 border-indigo-400 text-indigo-700 font-semibold"
                  : "bg-slate-100 border-slate-200 text-slate-600 hover:bg-slate-200"
              }`}
            >
              {isSelected(opt.value) ? "✓ " : "+ "}
              {opt.label || opt.value}
            </button>
          ))}
        </div>
      </div>
    );
  }

  // 4. Dropdown / Options with Operator "eq" or "neq"
  if (options.length > 0) {
    return (
      <Select
        id={`cond-val-${idx}`}
        className="w-full text-xs"
        value={cond.value ?? ""}
        placeholder="Select value..."
        options={options}
        onChange={(e) => onUpdate(idx, { value: e.target.value })}
      />
    );
  }

  // 5. Date Field
  if (dataType === "date") {
    if (cond.operator === "between") {
      const [start, end] = parseRangeValue(cond.value);
      return (
        <div className="flex items-center gap-1.5 flex-1 min-w-[200px]">
          <DateInput
            id={`cond-date-start-${idx}`}
            className="flex-1 text-xs"
            value={start}
            onChange={(e) => onUpdate(idx, { value: [e.target.value, end] })}
          />
          <span className="text-xs text-slate-400 font-semibold">to</span>
          <DateInput
            id={`cond-date-end-${idx}`}
            className="flex-1 text-xs"
            value={end}
            onChange={(e) => onUpdate(idx, { value: [start, e.target.value] })}
          />
        </div>
      );
    }
    return (
      <DateInput
        id={`cond-date-${idx}`}
        className="w-full text-xs"
        value={Array.isArray(cond.value) ? cond.value[0] || "" : cond.value || ""}
        onChange={(e) => onUpdate(idx, { value: e.target.value })}
      />
    );
  }

  // 6. Fallback Text Input
  return (
    <input
      type="text"
      placeholder="Enter value..."
      className="w-full h-10 px-3 text-xs border border-slate-300 rounded focus:border-indigo-500 focus:outline-none bg-white"
      value={Array.isArray(cond.value) ? cond.value.join(", ") : cond.value ?? ""}
      onChange={(e) => onUpdate(idx, { value: e.target.value })}
    />
  );
}

export default function RuleDialog({ open, rule, onClose, onSave, saving, onDelete }) {
  const toast = useToast();
  const [draft, setDraft] = useState(() => JSON.parse(JSON.stringify(rule)));

  useEffect(() => {
    if (rule) {
      setDraft(JSON.parse(JSON.stringify(rule)));
    }
  }, [rule]);

  // Load user table columns and roles
  const { data: userTableData } = useAsyncData("table-users-meta", () =>
    tablesApi.get("users")
  );

  const { data: rolesData } = useAsyncData("auth-roles-list", () =>
    authorizationApi.roles()
  );

  const userColumns = useMemo(
    () => (userTableData?.data?.columns ?? []).filter((c) => c.status === "active"),
    [userTableData]
  );

  const roles = useMemo(() => rolesData?.data ?? [], [rolesData]);

  const { optionsFor } = useEntryOptions(userColumns);

  // User supervisor references for Actions routing
  const userRefOptions = useMemo(() => {
    return userColumns
      .filter((c) => c.dataType === "user_reference")
      .map((c) => ({
        value: c.key,
        label: `${c.label || c.key} (${c.key})`,
      }));
  }, [userColumns]);

  // Build clean list of User Attributes
  const userAttributes = useMemo(() => {
    const list = [];

    // 1. Staff Type / Staff Category
    const staffCol = userColumns.find(
      (c) => c.key === "staff_type" || c.key === "staff_category"
    );
    if (staffCol) {
      list.push({
        key: staffCol.key,
        label: `${staffCol.label || "Staff Type"} (${staffCol.key})`,
        dataType: "dropdown",
        column: staffCol,
        defaultOperator: "eq",
        operators: [
          { value: "eq", label: "Equals (=)" },
          { value: "neq", label: "Not Equals (!=)" },
          { value: "in", label: "In list (multiple)" },
        ],
      });
      // Also provide staff_category alias so existing rules match seamlessly
      if (staffCol.key === "staff_type") {
        list.push({
          key: "staff_category",
          label: "Staff Category (staff_category)",
          dataType: "dropdown",
          column: staffCol,
          defaultOperator: "eq",
          operators: [
            { value: "eq", label: "Equals (=)" },
            { value: "neq", label: "Not Equals (!=)" },
            { value: "in", label: "In list (multiple)" },
          ],
        });
      }
    }

    // 2. Role
    list.push({
      key: "role",
      label: "User Role (role)",
      dataType: "role",
      defaultOperator: "eq",
      options: roles.map((r) => ({ value: r.role_key, label: r.label })),
      operators: [
        { value: "eq", label: "Equals (=)" },
        { value: "neq", label: "Not Equals (!=)" },
        { value: "in", label: "In list (multiple)" },
      ],
    });

    // 3. Status
    list.push({
      key: "status",
      label: "Account Status (status)",
      dataType: "dropdown",
      defaultOperator: "eq",
      options: [
        { value: "active", label: "Active" },
        { value: "disabled", label: "Disabled" },
        { value: "inactive", label: "Inactive" },
      ],
      operators: [
        { value: "eq", label: "Equals (=)" },
        { value: "neq", label: "Not Equals (!=)" },
      ],
    });

    // 4. Other user columns (reports_to, first_name, last_name, email, custom fields)
    for (const col of userColumns) {
      if (
        col.key === "staff_type" ||
        col.key === "staff_category" ||
        col.key === "status" ||
        col.key === "id" ||
        col.key === "last_login_at" ||
        col.key === "created_at" ||
        col.key === "updated_at"
      ) {
        continue;
      }

      let operators = [
        { value: "eq", label: "Equals (=)" },
        { value: "neq", label: "Not Equals (!=)" },
      ];

      if (col.dataType === "number") {
        operators = [
          { value: "between", label: "Between (Range [min, max])" },
          { value: "gte", label: "Greater than or equal (>=)" },
          { value: "lte", label: "Less than or equal (<=)" },
          { value: "gt", label: "Greater than (>)" },
          { value: "lt", label: "Less than (<)" },
          { value: "eq", label: "Equals (=)" },
          { value: "neq", label: "Not Equals (!=)" },
        ];
      } else if (col.dataType === "date") {
        operators = [
          { value: "gte", label: "On or after (>=)" },
          { value: "lte", label: "On or before (<=)" },
          { value: "eq", label: "Equals (=)" },
          { value: "between", label: "Between dates" },
        ];
      } else if (
        col.dataType === "dropdown" ||
        col.dataType === "user_reference" ||
        col.dataType === "entity_reference"
      ) {
        operators = [
          { value: "eq", label: "Equals (=)" },
          { value: "neq", label: "Not Equals (!=)" },
          { value: "in", label: "In list (multiple)" },
        ];
      } else {
        operators = [
          { value: "eq", label: "Equals (=)" },
          { value: "neq", label: "Not Equals (!=)" },
          { value: "contains", label: "Contains text" },
          { value: "in", label: "In list (multiple)" },
        ];
      }

      list.push({
        key: col.key,
        label: `${col.label || col.key} (${col.key})`,
        dataType: col.dataType || "text",
        column: col,
        defaultOperator: col.dataType === "number" ? "gte" : "eq",
        operators,
      });
    }

    return list;
  }, [userColumns, roles]);

  function getFieldMeta(cond) {
    if (cond.source === "user") {
      const found = userAttributes.find((a) => a.key === cond.field);
      if (found) return found;
      if (cond.field) {
        return {
          key: cond.field,
          label: `${cond.field} (Custom)`,
          dataType: "text",
          defaultOperator: "eq",
          operators: [
            { value: "eq", label: "Equals (=)" },
            { value: "neq", label: "Not Equals (!=)" },
            { value: "contains", label: "Contains text" },
          ],
        };
      }
      return userAttributes[0] || null;
    } else {
      const found = REQUEST_FIELDS.find((f) => f.key === cond.field);
      if (found) return found;
      if (cond.field) {
        return {
          key: cond.field,
          label: `${cond.field} (Custom)`,
          dataType: "text",
          defaultOperator: "eq",
          operators: [
            { value: "eq", label: "Equals (=)" },
            { value: "neq", label: "Not Equals (!=)" },
            { value: "contains", label: "Contains text" },
          ],
        };
      }
      return REQUEST_FIELDS[0] || null;
    }
  }

  function handleAddCondition() {
    setDraft((prev) => ({
      ...prev,
      conditions: [
        ...(prev.conditions || []),
        {
          source: "request",
          field: "days",
          operator: "between",
          value: [1, 6],
        },
      ],
    }));
  }

  function handleRemoveCondition(index) {
    setDraft((prev) => {
      const updated = [...(prev.conditions || [])];
      updated.splice(index, 1);
      return { ...prev, conditions: updated };
    });
  }

  function updateCondition(index, patch) {
    setDraft((prev) => {
      const updated = [...(prev.conditions || [])];
      updated[index] = { ...updated[index], ...patch };
      return { ...prev, conditions: updated };
    });
  }

  function handleSourceChange(idx, newSource) {
    if (newSource === "user") {
      const firstAttr = userAttributes[0] || { key: "staff_type", defaultOperator: "eq" };
      let defaultVal = "";
      if (firstAttr.options && firstAttr.options.length > 0) {
        defaultVal = firstAttr.options[0].value;
      } else if (firstAttr.column) {
        const resolved = optionsFor(firstAttr.column);
        defaultVal = resolved?.[0]?.value || "";
      }
      updateCondition(idx, {
        source: "user",
        field: firstAttr.key,
        operator: firstAttr.defaultOperator || "eq",
        value: defaultVal,
        customKey: undefined,
      });
    } else {
      const firstReq = REQUEST_FIELDS[0];
      updateCondition(idx, {
        source: "request",
        field: firstReq.key,
        operator: firstReq.defaultOperator,
        value: firstReq.defaultValue,
        customKey: undefined,
      });
    }
  }

  function handleFieldChange(idx, selectedValue) {
    if (selectedValue === "__custom__") {
      updateCondition(idx, {
        field: "",
        customKey: true,
        operator: "eq",
        value: "",
      });
      return;
    }

    const cond = draft.conditions[idx];
    const isUser = cond.source === "user";
    const meta = isUser
      ? userAttributes.find((a) => a.key === selectedValue)
      : REQUEST_FIELDS.find((f) => f.key === selectedValue);

    const newOp = meta?.defaultOperator || "eq";
    let newVal = "";
    if (meta?.defaultValue !== undefined) {
      newVal = meta.defaultValue;
    } else if (meta?.options && meta.options.length > 0) {
      newVal = meta.options[0].value;
    } else if (meta?.column) {
      const resolved = optionsFor(meta.column);
      newVal = resolved?.[0]?.value || "";
    } else if (meta?.dataType === "number") {
      newVal = 0;
    }

    updateCondition(idx, {
      field: selectedValue,
      customKey: false,
      operator: newOp,
      value: newVal,
    });
  }

  function handleOperatorChange(idx, newOperator) {
    const cond = draft.conditions[idx];
    let newVal = cond.value;

    if (newOperator === "between") {
      const [min, max] = parseRangeValue(newVal);
      newVal = [Number(min) || 1, Number(max) || 6];
    } else if (cond.operator === "between" && newOperator !== "between") {
      const [min] = parseRangeValue(newVal);
      newVal = Number(min) || 1;
    }

    updateCondition(idx, { operator: newOperator, value: newVal });
  }

  function handleAddNotifyTarget() {
    setDraft((prev) => ({
      ...prev,
      actions: {
        ...prev.actions,
        notifyTargets: [
          ...(prev.actions?.notifyTargets || []),
          {
            type: "council",
            entityName: "Academic Council",
            label: "Academic Council",
          },
        ],
      },
    }));
  }

  function handleRemoveNotifyTarget(index) {
    setDraft((prev) => {
      const updated = [...(prev.actions?.notifyTargets || [])];
      updated.splice(index, 1);
      return {
        ...prev,
        actions: {
          ...prev.actions,
          notifyTargets: updated,
        },
      };
    });
  }

  function handleUpdateNotifyTarget(index, patch) {
    setDraft((prev) => {
      const updated = [...(prev.actions?.notifyTargets || [])];
      updated[index] = { ...updated[index], ...patch };
      return {
        ...prev,
        actions: {
          ...prev.actions,
          notifyTargets: updated,
        },
      };
    });
  }

  function handleTogglePreset(preset) {
    const list = draft.actions?.notifyTargets || [];
    const exists = list.some(
      (t) =>
        (preset.entityName && t.entityName === preset.entityName) ||
        (preset.columnKey && t.columnKey === preset.columnKey) ||
        (preset.field && t.field === preset.field)
    );
    if (exists) {
      const filtered = list.filter(
        (t) =>
          !(
            (preset.entityName && t.entityName === preset.entityName) ||
            (preset.columnKey && t.columnKey === preset.columnKey) ||
            (preset.field && t.field === preset.field)
          )
      );
      setDraft((prev) => ({
        ...prev,
        actions: { ...prev.actions, notifyTargets: filtered },
      }));
    } else {
      setDraft((prev) => ({
        ...prev,
        actions: { ...prev.actions, notifyTargets: [...list, { ...preset }] },
      }));
    }
  }

  function handleSubmit(e) {
    e.preventDefault();

    if (!draft.name?.trim()) {
      toast.danger("Please enter a valid rule name.");
      return;
    }

    // Process conditions value format (e.g. range string to array if between)
    const processedConditions = (draft.conditions || []).map((cond) => {
      let val = cond.value;
      if (cond.operator === "between") {
        const [min, max] = parseRangeValue(val);
        val = [Number(min) || 0, Number(max) || 0];
      } else if (cond.operator === "in") {
        if (typeof val === "string") {
          val = val.split(",").map((v) => v.trim()).filter(Boolean);
        }
      }
      return {
        source: cond.source || "request",
        field: cond.field?.trim(),
        operator: cond.operator || "eq",
        value: val,
      };
    });

    const ruleToSave = {
      ...draft,
      priority: Number(draft.priority) || 100,
      conditions: processedConditions,
    };

    onSave(ruleToSave);
  }

  if (!open || !draft) return null;

  const isEdit = Boolean(rule?.id && !rule.id.startsWith("rule_temp_"));

  return (
    <Modal
      open={open}
      onClose={saving ? () => {} : onClose}
      title={isEdit ? `Edit Leave Rule: ${draft.name}` : "Create New Leave Rule"}
      size="lg"
    >
      <form onSubmit={handleSubmit} className="space-y-6">
        <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
          <div className="md:col-span-2">
            <TextInput
              id="rule-name"
              label="Rule Name"
              required
              data-autofocus
              placeholder="e.g. Programme Staff: 1 to 6 Days"
              value={draft.name}
              onChange={(e) => setDraft({ ...draft, name: e.target.value })}
            />
          </div>

          <div>
            <NumberInput
              id="rule-priority"
              label="Priority Order"
              required
              hint="Lower number = evaluated first"
              value={draft.priority}
              onChange={(e) => setDraft({ ...draft, priority: Number(e.target.value) })}
            />
          </div>
        </div>

        {/* Conditions Section */}
        <div className="border border-slate-200 rounded-lg p-4 bg-slate-50 space-y-3">
          <div className="flex items-center justify-between border-b border-slate-200 pb-2">
            <div>
              <h4 className="text-sm font-semibold text-slate-800">Matching Criteria (IF)</h4>
              <p className="text-xs text-slate-500">Define which leave requests match this rule</p>
            </div>
            <div className="flex items-center gap-2">
              <Select
                id="rule-combinator"
                className="w-32 text-xs"
                value={draft.combinator || "AND"}
                options={[
                  { value: "AND", label: "Match ALL (AND)" },
                  { value: "OR", label: "Match ANY (OR)" },
                ]}
                onChange={(e) => setDraft({ ...draft, combinator: e.target.value })}
              />
              <Button size="sm" variant="outline" type="button" onClick={handleAddCondition}>
                + Add Condition
              </Button>
            </div>
          </div>

          {draft.conditions?.length === 0 ? (
            <p className="text-xs text-slate-500 italic py-2">
              No conditions set. This rule will act as a standard fallback for all requests.
            </p>
          ) : (
            draft.conditions?.map((cond, idx) => {
              const isUser = cond.source === "user";
              const fieldMeta = getFieldMeta(cond);
              const isCustom = cond.customKey || (!fieldMeta && cond.field);

              // Field options for dropdown
              const fieldSelectOptions = isUser
                ? [
                    ...userAttributes.map((a) => ({ value: a.key, label: a.label })),
                    { value: "__custom__", label: "Custom Attribute..." },
                  ]
                : REQUEST_FIELDS.map((f) => ({ value: f.key, label: f.label }));

              // Operators supported for this field
              const opOptions = fieldMeta?.operators || OPERATORS;

              return (
                <div
                  key={idx}
                  className="flex flex-wrap items-center gap-2 bg-white p-3 rounded-lg border border-slate-200 shadow-2xs"
                >
                  {/* 1. Source */}
                  <div className="w-32">
                    <Select
                      id={`cond-source-${idx}`}
                      className="text-xs"
                      value={cond.source || "request"}
                      options={[
                        { value: "request", label: "Request Field" },
                        { value: "user", label: "User Attribute" },
                      ]}
                      onChange={(e) => handleSourceChange(idx, e.target.value)}
                    />
                  </div>

                  {/* 2. Field Dropdown */}
                  <div className={isCustom ? "w-36" : "w-48"}>
                    <Select
                      id={`cond-field-${idx}`}
                      className="text-xs"
                      value={isCustom ? "__custom__" : (cond.field || "")}
                      options={fieldSelectOptions}
                      onChange={(e) => handleFieldChange(idx, e.target.value)}
                    />
                  </div>

                  {/* Custom attribute key text input */}
                  {isCustom && (
                    <div className="w-32">
                      <input
                        type="text"
                        placeholder="attribute_key"
                        className="w-full h-10 px-2 text-xs border border-slate-300 rounded focus:border-indigo-500 focus:outline-none bg-white font-mono"
                        value={cond.field || ""}
                        onChange={(e) => updateCondition(idx, { field: e.target.value })}
                      />
                    </div>
                  )}

                  {/* 3. Operator Dropdown */}
                  <div className="w-40">
                    <Select
                      id={`cond-op-${idx}`}
                      className="text-xs"
                      value={cond.operator || (fieldMeta?.defaultOperator || "eq")}
                      options={opOptions}
                      onChange={(e) => handleOperatorChange(idx, e.target.value)}
                    />
                  </div>

                  {/* 4. Adaptive Condition Value Input */}
                  <div className="flex-1 min-w-[160px]">
                    <ConditionValueInput
                      cond={cond}
                      idx={idx}
                      fieldMeta={fieldMeta}
                      onUpdate={updateCondition}
                      optionsFor={optionsFor}
                    />
                  </div>

                  {/* 5. Delete Button */}
                  <Button
                    size="sm"
                    variant="ghost"
                    type="button"
                    className="text-rose-500 hover:text-rose-700 hover:bg-rose-50 px-2 py-1"
                    onClick={() => handleRemoveCondition(idx)}
                    title="Remove Condition"
                  >
                    ✕
                  </Button>
                </div>
              );
            })
          )}
        </div>

        {/* Actions Section */}
        <div className="border border-slate-200 rounded-lg p-4 bg-slate-50 space-y-4">
          <div>
            <h4 className="text-sm font-semibold text-slate-800">Approval Routing & Actions (THEN)</h4>
            <p className="text-xs text-slate-500">Configure where the application routes when matched</p>
          </div>

          <div className="space-y-4 pt-1">
            <Toggle
              label="Requires Manager / Council Approval"
              hint="Disable for leaves that do not require prior approval (e.g. 2-Hour Short Leave)"
              checked={draft.actions?.requiresApproval ?? true}
              onChange={(val) =>
                setDraft({
                  ...draft,
                  actions: { ...draft.actions, requiresApproval: val },
                })
              }
            />

            {draft.actions?.requiresApproval && (
              <div className="grid grid-cols-1 md:grid-cols-2 gap-4 pt-2 border-t border-slate-200">
                <Select
                  id="approver-type"
                  label="Approver Hierarchy Type"
                  value={draft.actions?.approverType || "user_relation"}
                  options={APPROVER_TYPES}
                  onChange={(e) =>
                    setDraft({
                      ...draft,
                      actions: { ...draft.actions, approverType: e.target.value },
                    })
                  }
                />

                {draft.actions?.approverType === "user_relation" && (
                  <Select
                    id="approver-target"
                    label="User Supervisor Column"
                    hint="Reference column on Users table (e.g. reports_to or coordinator)"
                    value={draft.actions?.approverTarget || "reports_to"}
                    options={
                      userRefOptions.length > 0
                        ? userRefOptions
                        : [{ value: "reports_to", label: "Co-Ordinator / Supervisor (reports_to)" }]
                    }
                    onChange={(e) =>
                      setDraft({
                        ...draft,
                        actions: { ...draft.actions, approverTarget: e.target.value },
                      })
                    }
                  />
                )}

                {draft.actions?.approverType === "entity_incharge" && (
                  <TextInput
                    id="incharge-field"
                    label="In-Charge Column Key"
                    hint="Profile column on Center/Project (e.g. center_in_charge, project_incharge)"
                    value={draft.actions?.inchargeField || "center_in_charge"}
                    onChange={(e) =>
                      setDraft({
                        ...draft,
                        actions: { ...draft.actions, inchargeField: e.target.value },
                      })
                    }
                  />
                )}

                {draft.actions?.approverType === "council_or_team" && (
                  <TextInput
                    id="council-name"
                    label="Council or Committee Entity Name"
                    hint="e.g. Academic Council, Programme Committee, Executive Council"
                    value={draft.actions?.entityName || ""}
                    placeholder="Academic Council"
                    onChange={(e) =>
                      setDraft({
                        ...draft,
                        actions: { ...draft.actions, entityName: e.target.value },
                      })
                    }
                  />
                )}

                <NumberInput
                  id="notice-days"
                  label="Required Advance Notice (Days)"
                  hint="e.g. 2 days for normal leave, 7 days for long leave"
                  value={draft.actions?.noticeDays ?? 2}
                  onChange={(e) =>
                    setDraft({
                      ...draft,
                      actions: { ...draft.actions, noticeDays: Number(e.target.value) },
                    })
                  }
                />

                <NumberInput
                  id="sla-hours"
                  label="Approver Decision SLA (Hours)"
                  hint="e.g. 48 hours turnaround"
                  value={draft.actions?.slaHours ?? 48}
                  onChange={(e) =>
                    setDraft({
                      ...draft,
                      actions: { ...draft.actions, slaHours: Number(e.target.value) },
                    })
                  }
                />
              </div>
            )}
          </div>
        </div>

        {/* Informed / CC List (Notification Targets) Section */}
        <div className="border border-slate-200 rounded-lg p-4 bg-slate-50 space-y-3">
          <div className="flex items-center justify-between border-b border-slate-200 pb-2">
            <div>
              <h4 className="text-sm font-semibold text-slate-800">Informed / CC List (Notification Targets)</h4>
              <p className="text-xs text-slate-500">Who receives informational notification when this leave is applied or approved</p>
            </div>
            <Button
              size="sm"
              variant="outline"
              type="button"
              onClick={handleAddNotifyTarget}
            >
              + Add CC Target
            </Button>
          </div>

          {/* Quick Presets */}
          <div className="flex flex-wrap items-center gap-1.5 py-1">
            <span className="text-[11px] font-semibold text-slate-500 uppercase tracking-wide mr-1">Quick Add:</span>
            {NOTIFY_PRESETS.map((preset) => {
              const exists = (draft.actions?.notifyTargets || []).some(
                (t) =>
                  (preset.entityName && t.entityName === preset.entityName) ||
                  (preset.columnKey && t.columnKey === preset.columnKey) ||
                  (preset.field && t.field === preset.field)
              );
              return (
                <button
                  type="button"
                  key={preset.label}
                  onClick={() => handleTogglePreset(preset)}
                  className={`text-xs px-2 py-0.5 rounded-full border transition-colors ${
                    exists
                      ? "bg-indigo-100 border-indigo-400 text-indigo-700 font-semibold"
                      : "bg-white border-slate-300 text-slate-600 hover:bg-slate-100"
                  }`}
                >
                  {exists ? "✓ " : "+ "}
                  {preset.label}
                </button>
              );
            })}
          </div>

          {/* List of configured notify targets */}
          {(draft.actions?.notifyTargets || []).length === 0 ? (
            <p className="text-xs text-slate-400 italic py-1">No additional users/councils to inform for this rule.</p>
          ) : (
            <div className="space-y-2 pt-1">
              {(draft.actions?.notifyTargets || []).map((target, tIdx) => (
                <div
                  key={tIdx}
                  className="flex flex-wrap items-center gap-2 bg-white p-2.5 rounded-lg border border-slate-200 shadow-2xs"
                >
                  <div className="w-48">
                    <Select
                      id={`notify-type-${tIdx}`}
                      className="text-xs"
                      value={target.type || "council"}
                      options={NOTIFY_TARGET_TYPES}
                      onChange={(e) => handleUpdateNotifyTarget(tIdx, { type: e.target.value })}
                    />
                  </div>

                  {target.type === "council" && (
                    <div className="flex-1 min-w-[180px]">
                      <TextInput
                        id={`notify-council-${tIdx}`}
                        placeholder="e.g. Academic Council, Executive Council"
                        value={target.entityName || ""}
                        onChange={(e) =>
                          handleUpdateNotifyTarget(tIdx, {
                            entityName: e.target.value,
                            label: e.target.value,
                          })
                        }
                      />
                    </div>
                  )}

                  {target.type === "entity_incharge" && (
                    <div className="flex flex-1 items-center gap-2 min-w-[200px]">
                      <div className="w-36">
                        <Select
                          id={`notify-entity-type-${tIdx}`}
                          className="text-xs"
                          value={target.entityTypeKey || "center"}
                          options={[
                            { value: "center", label: "Center" },
                            { value: "project", label: "Project" },
                            { value: "programme", label: "Programme" },
                          ]}
                          onChange={(e) =>
                            handleUpdateNotifyTarget(tIdx, {
                              entityTypeKey: e.target.value,
                              columnKey: `${e.target.value}_incharge`,
                            })
                          }
                        />
                      </div>
                      <div className="flex-1">
                        <TextInput
                          id={`notify-incharge-${tIdx}`}
                          placeholder="incharge column key (e.g. center_in_charge)"
                          value={target.columnKey || ""}
                          onChange={(e) =>
                            handleUpdateNotifyTarget(tIdx, {
                              columnKey: e.target.value,
                              label: `${target.entityTypeKey} Incharge`,
                            })
                          }
                        />
                      </div>
                    </div>
                  )}

                  {target.type === "user_relation" && (
                    <div className="flex-1 min-w-[180px]">
                      <Select
                        id={`notify-user-rel-${tIdx}`}
                        className="text-xs"
                        value={target.field || "reports_to"}
                        options={
                          userRefOptions.length > 0
                            ? userRefOptions
                            : [{ value: "reports_to", label: "Co-Ordinator / Supervisor (reports_to)" }]
                        }
                        onChange={(e) =>
                          handleUpdateNotifyTarget(tIdx, {
                            field: e.target.value,
                            label: "Supervisor",
                          })
                        }
                      />
                    </div>
                  )}

                  {target.type === "direct_user" && (
                    <div className="flex-1 min-w-[180px]">
                      <TextInput
                        id={`notify-user-id-${tIdx}`}
                        placeholder="User ID (e.g. 1)"
                        value={target.userId || ""}
                        onChange={(e) =>
                          handleUpdateNotifyTarget(tIdx, {
                            userId: e.target.value,
                            label: `User #${e.target.value}`,
                          })
                        }
                      />
                    </div>
                  )}

                  <Button
                    size="sm"
                    variant="ghost"
                    type="button"
                    className="text-rose-500 hover:text-rose-700 hover:bg-rose-50 px-2 py-1"
                    onClick={() => handleRemoveNotifyTarget(tIdx)}
                    title="Remove CC Target"
                  >
                    ✕
                  </Button>
                </div>
              ))}
            </div>
          )}
        </div>

        <div className="flex w-full items-center justify-between pt-2">
          {onDelete && rule?.id ? (
            <Button
              type="button"
              variant="danger"
              size="sm"
              onClick={() => onDelete(rule)}
              disabled={saving}
            >
              Delete Rule
            </Button>
          ) : (
            <span />
          )}

          <div className="flex items-center gap-3">
            <Button type="button" variant="outline" onClick={onClose} disabled={saving}>
              Cancel
            </Button>
            <Button type="submit" variant="primary" loading={saving}>
              Save Leave Rule
            </Button>
          </div>
        </div>
      </form>
    </Modal>
  );
}
