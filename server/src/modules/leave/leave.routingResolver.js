import { db } from "../../config/database.js";
import { parseJsonColumn } from "../../lib/jsonColumn.js";

/**
 * Loads all active organization entities along with their profile attributes.
 */
export async function loadActiveEntitiesWithProfiles() {
  const [rows] = await db.execute(`
    SELECT
      e.id,
      e.entity_type_id,
      e.name,
      e.parent_entity_id,
      et.type_key,
      et.label AS type_label,
      pr.data AS profile_data
    FROM organization_entities e
    INNER JOIN organization_entity_types et ON et.id = e.entity_type_id
    LEFT JOIN table_records pr ON pr.id = e.profile_record_id
    WHERE e.status = 'active' AND et.status = 'active'
  `);

  return rows.map((row) => ({
    id: Number(row.id),
    entityTypeId: Number(row.entity_type_id),
    typeKey: row.type_key,
    typeLabel: row.type_label,
    name: row.name,
    parentEntityId: row.parent_entity_id ? Number(row.parent_entity_id) : null,
    values: parseJsonColumn(row.profile_data, {}),
  }));
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
    case "user_relation": {
      // e.g. applicant.values.reports_to
      const targetField = approverTarget || "reports_to";
      const val = applicant.values?.[targetField];
      if (val) {
        const id = Number(val);
        if (!isNaN(id) && id > 0) {
          approverUserIds = [id];
          approverLabel = `Direct Supervisor (${targetField})`;
        }
      }
      break;
    }

    case "entity_incharge": {
      // Find the entity the user belongs to (e.g. project, center)
      // and read the in-charge column (e.g. project_incharge, center_in_charge)
      const targetEntityId =
        applicant.values?.[action.userEntityField || "allocated_project"] ||
        applicant.values?.allocated_center ||
        action.entityId;

      const entity = entities.find((e) => e.id === Number(targetEntityId));
      if (entity) {
        const fieldKey = inchargeField || `${entity.typeKey}_incharge`;
        // Check profile values for this in-charge field or common variations
        const inchargeVal =
          entity.values?.[fieldKey] ||
          entity.values?.project_incharge ||
          entity.values?.center_in_charge ||
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
      // Find council or committee by name or type
      const targetName = (action.entityName || "").toLowerCase().trim();
      const entity = entities.find(
        (e) =>
          e.name.toLowerCase().trim() === targetName ||
          e.typeKey.toLowerCase().trim() === targetName
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
      const val = applicant.values?.[target.field];
      if (val) {
        const id = Number(val);
        if (!isNaN(id) && id > 0) userIds.add(id);
      }
    } else if (target.type === "entity_incharge") {
      const entity = entities.find(
        (e) =>
          e.typeKey === target.entityTypeKey ||
          e.name.toLowerCase().trim() === (target.entityName || "").toLowerCase().trim()
      );
      if (entity) {
        const val =
          entity.values?.[target.columnKey] ||
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
          e.typeKey.toLowerCase().trim() === targetName
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

