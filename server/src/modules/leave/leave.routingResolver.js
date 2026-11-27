import { db } from "../../config/database.js";
import { parseJsonColumn } from "../../lib/jsonColumn.js";

/**
 * Loads all active organization entities along with their profile attributes,
 * and merges standalone table records for councils, teams, center, project, programmes.
 */
export async function loadActiveEntitiesWithProfiles() {
  const [rows] = await db.execute(`
    SELECT
      e.id,
      e.entity_type_id,
      e.name,
      e.parent_entity_id,
      e.profile_record_id,
      et.type_key,
      et.label AS type_label,
      pr.data AS profile_data
    FROM organization_entities e
    INNER JOIN organization_entity_types et ON et.id = e.entity_type_id
    LEFT JOIN table_records pr ON pr.id = e.profile_record_id
    WHERE e.status = 'active' AND et.status = 'active'
  `);

  const list = rows.map((row) => ({
    id: Number(row.id),
    entityTypeId: Number(row.entity_type_id),
    profileRecordId: row.profile_record_id ? Number(row.profile_record_id) : null,
    typeKey: row.type_key,
    typeLabel: row.type_label,
    name: row.name,
    parentEntityId: row.parent_entity_id ? Number(row.parent_entity_id) : null,
    values: parseJsonColumn(row.profile_data, {}),
  }));

  // Also include standalone table records for councils, teams, center, project, programmes
  // so any records created directly in table section are seamlessly recognized!
  try {
    const [tableRows] = await db.execute(`
      SELECT tr.id, tr.table_id, td.table_key, td.label as table_label, tr.data
      FROM table_records tr
      JOIN table_definitions td ON td.id = tr.table_id
      WHERE td.table_key IN ('councils', 'teams', 'center', 'project', 'programmes')
        AND td.status = 'active'
    `);

    for (const tr of tableRows) {
      const data = parseJsonColumn(tr.data, {});
      const recordName =
        data.council_name ||
        data.team_name ||
        data.center_name ||
        data.project_name ||
        data.programme_name ||
        data.name ||
        `Record #${tr.id}`;

      const existing = list.find(
        (e) =>
          e.profileRecordId === Number(tr.id) ||
          e.name.toLowerCase().trim() === String(recordName).toLowerCase().trim()
      );

      if (!existing) {
        list.push({
          id: Number(tr.id),
          entityTypeId: null,
          profileRecordId: Number(tr.id),
          typeKey: tr.table_key.replace(/s$/, ""),
          typeLabel: tr.table_label,
          name: recordName,
          parentEntityId: null,
          values: data,
        });
      } else {
        existing.values = { ...data, ...existing.values };
      }
    }
  } catch (err) {
    console.warn("Could not load supplementary table records for routing:", err.message);
  }

  return list;
}

/**
 * Resolves a single table + column approver reference.
 */
async function resolveSingleTableColumnApprover(tableKey, col, { applicant, entities }) {
  let userIds = [];
  let label = "";

  if (tableKey === "users") {
    const val = applicant.values?.[col] ?? applicant[col];
    if (Array.isArray(val)) {
      userIds = val.map(Number).filter((id) => !isNaN(id) && id > 0);
    } else if (val) {
      const id = Number(val);
      if (!isNaN(id) && id > 0) userIds = [id];
    }
    label = `User (${col})`;
  } else {
    // Dynamic table lookup (e.g. center, project, councils, programmes, teams)
    const refVal =
      applicant.values?.[tableKey] ??
      applicant.values?.[`${tableKey}_id`] ??
      applicant.values?.[`allocated_${tableKey}`] ??
      applicant[tableKey];

    const matchingEntity = entities.find(
      (e) =>
        (refVal && (e.id === Number(refVal) || e.profileRecordId === Number(refVal))) ||
        e.typeKey === tableKey ||
        e.typeKey === tableKey.replace(/s$/, "")
    );

    if (matchingEntity && matchingEntity.values?.[col] !== undefined) {
      const inchargeVal = matchingEntity.values[col];
      if (Array.isArray(inchargeVal)) {
        userIds = inchargeVal.map(Number).filter((id) => !isNaN(id) && id > 0);
      } else if (inchargeVal) {
        const id = Number(inchargeVal);
        if (!isNaN(id) && id > 0) userIds = [id];
      }
      label = `${matchingEntity.name || tableKey} (${col})`;
    } else {
      // Fallback: query database table records for this table
      try {
        const [tRows] = await db.execute(
          `SELECT tr.id, tr.data FROM table_records tr
           JOIN table_definitions td ON td.id = tr.table_id
           WHERE td.table_key = ? AND tr.status = 'active'`,
          [tableKey]
        );

        let matchedRow = null;
        if (refVal) {
          matchedRow = tRows.find((r) => r.id === Number(refVal));
        }
        if (!matchedRow && tRows.length === 1) {
          matchedRow = tRows[0];
        }

        if (matchedRow) {
          const data = parseJsonColumn(matchedRow.data, {});
          const targetVal = data[col];
          if (Array.isArray(targetVal)) {
            userIds = targetVal.map(Number).filter((id) => !isNaN(id) && id > 0);
          } else if (targetVal) {
            const id = Number(targetVal);
            if (!isNaN(id) && id > 0) userIds = [id];
          }
          label = `${tableKey} #${matchedRow.id} (${col})`;
        } else if (tRows.length > 0) {
          // Aggregate user ids from all active records of this table (e.g. council members)
          for (const tr of tRows) {
            const data = parseJsonColumn(tr.data, {});
            const targetVal = data[col];
            if (Array.isArray(targetVal)) {
              userIds.push(...targetVal.map(Number).filter((id) => !isNaN(id) && id > 0));
            } else if (targetVal) {
              const id = Number(targetVal);
              if (!isNaN(id) && id > 0) userIds.push(id);
            }
          }
          label = `${tableKey} (${col})`;
        }
      } catch (dbErr) {
        console.warn("Could not query dynamic table records:", dbErr.message);
      }
    }
  }

  return { userIds, label };
}

/**
 * Resolves the primary approver(s) based on the matched rule action.
 */
export async function resolveApprovers(action, { applicant = {}, entities = [] }) {
  if (!action) {
    return {
      requiresApproval: true,
      approvalMode: "sequential",
      steps: [],
      approverUserIds: [],
      activeApproverUserIds: [],
      approverLabel: "Pending Approver Assignment",
    };
  }

  const {
    approverTable,
    approverColumn,
    approvers,
    approvalMode = "sequential",
    approverType,
    approverTarget,
    inchargeField,
    fallbackUserId,
  } = action;
  let approverUserIds = [];
  let activeApproverUserIds = [];
  let approverLabel = "";
  const steps = [];

  // 1. Multiple Approvers or Dynamic Table & User Reference Column Resolution
  const approverSpecs =
    Array.isArray(approvers) && approvers.length > 0
      ? approvers.filter((a) => a && a.table && a.column)
      : approverTable && approverColumn
        ? [{ table: approverTable, column: approverColumn, multiUserPolicy: "any" }]
        : [];

  if (approverSpecs.length > 0) {
    const collectedIds = [];
    const collectedLabels = [];

    for (let i = 0; i < approverSpecs.length; i++) {
      const spec = approverSpecs[i];
      const res = await resolveSingleTableColumnApprover(spec.table, spec.column, {
        applicant,
        entities,
      });

      const stepUserIds = res.userIds || [];
      const stepPolicy = spec.multiUserPolicy || "any";
      const stepLabel = res.label || `${spec.table} (${spec.column})`;

      if (stepUserIds.length > 0) {
        collectedIds.push(...stepUserIds);
      }
      if (stepLabel) {
        collectedLabels.push(stepLabel);
      }

      steps.push({
        stepOrder: i + 1,
        table: spec.table,
        column: spec.column,
        label: stepLabel,
        userIds: stepUserIds,
        multiUserPolicy: stepPolicy,
        status: i === 0 || approvalMode === "parallel" ? "pending" : "waiting",
        approvedBy: [],
      });
    }

    approverUserIds = Array.from(new Set(collectedIds));

    if (approvalMode === "parallel") {
      activeApproverUserIds = [...approverUserIds];
      approverLabel = collectedLabels.join(" + ");
    } else {
      // Sequential: active approver userIds are Step 1's userIds!
      activeApproverUserIds = steps[0]?.userIds || [];
      approverLabel = steps.map((s) => `Step ${s.stepOrder}: ${s.label}`).join(" ➔ ");
    }
  }

  // 2. Fallback to legacy approverType if approverTable wasn't matched
  if (approverUserIds.length === 0 && approverType) {
    switch (approverType) {
    case "coordinator_or_incharge": {
      // 1. Try local coordinator (reports_to)
      const coordVal = applicant.values?.reports_to || applicant.reports_to;
      if (coordVal) {
        const id = Number(coordVal);
        if (!isNaN(id) && id > 0) {
          approverUserIds = [id];
          approverLabel = "Local Coordinator";
        }
      }

      // 2. If no coordinator, fallback to Project Incharge
      if (approverUserIds.length === 0) {
        const projVal =
          applicant.values?.project || applicant.values?.allocated_project || applicant.project;
        if (projVal) {
          const projEntity = entities.find(
            (e) =>
              (e.id === Number(projVal) || e.profileRecordId === Number(projVal)) &&
              (e.typeKey === "project" || e.typeKey === "projects")
          );
          const incharge = projEntity?.values?.project_incharge || projEntity?.values?.incharge;
          if (incharge) {
            const id = Number(incharge);
            if (!isNaN(id) && id > 0) {
              approverUserIds = [id];
              approverLabel = `${projEntity.name} Project In-Charge`;
            }
          }
        }
      }

      // 3. If still not found, check Center Incharge
      if (approverUserIds.length === 0) {
        const centerVal =
          applicant.values?.center || applicant.values?.allocated_center || applicant.center;
        if (centerVal) {
          const centerEntity = entities.find(
            (e) =>
              (e.id === Number(centerVal) || e.profileRecordId === Number(centerVal)) &&
              (e.typeKey === "center" || e.typeKey === "centers")
          );
          const incharge = centerEntity?.values?.center_in_charge || centerEntity?.values?.incharge;
          if (incharge) {
            const id = Number(incharge);
            if (!isNaN(id) && id > 0) {
              approverUserIds = [id];
              approverLabel = `${centerEntity.name} Center In-Charge`;
            }
          }
        }
      }
      break;
    }

    case "user_relation": {
      const targetField = approverTarget || "reports_to";
      const val = applicant.values?.[targetField] || applicant[targetField];
      if (val) {
        const id = Number(val);
        if (!isNaN(id) && id > 0) {
          approverUserIds = [id];
          approverLabel = `Direct Supervisor / Coordinator (${targetField})`;
        }
      }
      break;
    }

    case "entity_incharge": {
      const field = action.userEntityField || (inchargeField?.includes("project") ? "project" : "center");
      const targetEntityId =
        applicant.values?.[field] ||
        applicant.values?.allocated_project ||
        applicant.values?.center ||
        applicant.values?.allocated_center ||
        action.entityId;

      const entity = entities.find(
        (e) => e.id === Number(targetEntityId) || e.profileRecordId === Number(targetEntityId)
      );

      if (entity) {
        const fieldKey = inchargeField || `${entity.typeKey}_incharge`;
        const inchargeVal =
          entity.values?.[fieldKey] ||
          entity.values?.center_in_charge ||
          entity.values?.project_incharge ||
          entity.values?.programme_coordinator;

        if (inchargeVal) {
          const id = Number(inchargeVal);
          if (!isNaN(id) && id > 0) {
            approverUserIds = [id];
            approverLabel = `${entity.name} In-Charge`;
          }
        }
      }
      break;
    }

    case "council_or_team": {
      const targetName = (action.entityName || "").toLowerCase().trim();
      const entity = entities.find(
        (e) =>
          e.name.toLowerCase().trim() === targetName ||
          e.typeKey.toLowerCase().trim() === targetName ||
          (e.values?.council_name && e.values.council_name.toLowerCase().trim() === targetName) ||
          (e.values?.team_name && e.values.team_name.toLowerCase().trim() === targetName)
      );

      if (entity) {
        const membersVal = entity.values?.members || entity.values?.users;
        if (Array.isArray(membersVal)) {
          approverUserIds = membersVal.map(Number).filter((id) => !isNaN(id) && id > 0);
        } else if (membersVal) {
          const id = Number(membersVal);
          if (!isNaN(id) && id > 0) approverUserIds = [id];
        }
        approverLabel = entity.name;
      }
      break;
    }

    case "direct_user": {
      if (action.userId) {
        const id = Number(action.userId);
        if (!isNaN(id) && id > 0) {
          approverUserIds = [id];
          approverLabel = "Assigned Approver";
        }
      }
      break;
    }

    default:
      break;
    }
  }

  // Use fallback if primary couldn't be resolved
  if (approverUserIds.length === 0 && fallbackUserId) {
    const fbId = Number(fallbackUserId);
    if (!isNaN(fbId) && fbId > 0) {
      approverUserIds = [fbId];
      approverLabel = "Fallback Approver";
    }
  }

  // If legacy approver was resolved, wrap into steps
  if (steps.length === 0 && approverUserIds.length > 0) {
    steps.push({
      stepOrder: 1,
      table: approverTable || "users",
      column: approverColumn || "reports_to",
      label: approverLabel || "Assigned Approver",
      userIds: approverUserIds,
      multiUserPolicy: "any",
      status: "pending",
      approvedBy: [],
    });
    activeApproverUserIds = [...approverUserIds];
  }

  // Enrich steps with approver user names for clearer UI display and audit
  if (approverUserIds.length > 0) {
    try {
      const [uRows] = await db.execute(
        `SELECT id, first_name, last_name, email FROM users WHERE id IN (${approverUserIds.map(() => "?").join(",")})`,
        approverUserIds
      );
      const userMap = new Map();
      for (const u of uRows) {
        const name = `${u.first_name || ""} ${u.last_name || ""}`.trim() || u.email || `User #${u.id}`;
        userMap.set(Number(u.id), name);
      }
      for (const step of steps) {
        step.approverNames = (step.userIds || []).map((id) => userMap.get(Number(id))).filter(Boolean);
        step.approverNamesText = step.approverNames.join(", ") || step.label;
      }
    } catch (err) {
      console.warn("Could not load approver user names:", err.message);
    }
  }

  return {
    requiresApproval: true,
    approvalMode,
    steps,
    approverUserIds,
    activeApproverUserIds: activeApproverUserIds.length > 0 ? activeApproverUserIds : approverUserIds,
    approverLabel: approverLabel || "Pending Approver Assignment",
  };
}

/**
 * Resolves notification / CC list from action.notifyTargets
 */
export function resolveNotifyTargets(notifyTargets = [], { applicant = {}, entities = [] }) {
  const userIds = new Set();

  for (const target of notifyTargets) {
    if (!target) continue;

    if (target.type === "user_relation" && target.field) {
      const val = applicant.values?.[target.field] || applicant[target.field];
      if (val) {
        const id = Number(val);
        if (!isNaN(id) && id > 0) userIds.add(id);
      }
    } else if (target.type === "entity_incharge") {
      const typeKey = (target.entityTypeKey || "").toLowerCase().trim();
      let entityId = null;
      if (typeKey === "center") {
        entityId = applicant.values?.center || applicant.values?.allocated_center;
      } else if (typeKey === "project") {
        entityId = applicant.values?.project || applicant.values?.allocated_project;
      } else if (typeKey === "programme") {
        entityId = applicant.values?.programme || applicant.values?.allocated_programme;
      }

      let entity = null;
      if (entityId) {
        entity = entities.find(
          (e) => e.id === Number(entityId) || e.profileRecordId === Number(entityId)
        );
      }

      // If not assigned or not found by ID, match by target.entityName or typeKey
      if (!entity) {
        entity = entities.find(
          (e) =>
            (target.entityName && e.name.toLowerCase().trim() === target.entityName.toLowerCase().trim()) ||
            e.typeKey === typeKey
        );
      }

      if (entity) {
        const val =
          (target.columnKey && entity.values?.[target.columnKey]) ||
          entity.values?.center_in_charge ||
          entity.values?.project_incharge ||
          entity.values?.programme_coordinator;
        if (val) {
          const id = Number(val);
          if (!isNaN(id) && id > 0) userIds.add(id);
        }
      }
    } else if (target.type === "council" || target.type === "team") {
      const targetName = (target.entityName || target.name || "").toLowerCase().trim();
      const entity = entities.find(
        (e) =>
          e.name.toLowerCase().trim() === targetName ||
          e.typeKey.toLowerCase().trim() === targetName ||
          (e.values?.council_name && e.values.council_name.toLowerCase().trim() === targetName) ||
          (e.values?.team_name && e.values.team_name.toLowerCase().trim() === targetName)
      );

      if (entity) {
        const membersVal = entity.values?.members || entity.values?.users;
        if (Array.isArray(membersVal)) {
          for (const m of membersVal) {
            const id = Number(m);
            if (!isNaN(id) && id > 0) userIds.add(id);
          }
        } else if (membersVal) {
          const id = Number(membersVal);
          if (!isNaN(id) && id > 0) userIds.add(id);
        }
      }
    } else if (target.type === "direct_user" && target.userId) {
      const id = Number(target.userId);
      if (!isNaN(id) && id > 0) userIds.add(id);
    }
  }

  // Exclude applicant's own ID from notifications
  if (applicant.id) {
    userIds.delete(Number(applicant.id));
  }

  return Array.from(userIds);
}

