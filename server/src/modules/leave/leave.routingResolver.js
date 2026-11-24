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
 * Resolves the primary approver(s) based on the matched rule action.
 */
export async function resolveApprovers(action, { applicant = {}, entities = [] }) {
  if (!action || action.requiresApproval === false) {
    return {
      requiresApproval: false,
      approverUserIds: [],
      approverLabel: "No approval required (Informational only)",
    };
  }

  const { approverType, approverTarget, inchargeField, fallbackUserId } = action;
  let approverUserIds = [];
  let approverLabel = "";

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

  // Use fallback if primary couldn't be resolved
  if (approverUserIds.length === 0 && fallbackUserId) {
    const fbId = Number(fallbackUserId);
    if (!isNaN(fbId) && fbId > 0) {
      approverUserIds = [fbId];
      approverLabel = "Fallback Approver";
    }
  }

  return {
    requiresApproval: true,
    approverUserIds,
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

