/*
 * Organization Entity Membership table.
 *
 * Connects users to organization entities (teams, departments, councils, etc.)
 * with explicit roles (member, lead, manager). Enables role-based membership,
 * approval hierarchies for leave management, and entity-specific scoping.
 */

CREATE TABLE IF NOT EXISTS organization_entity_members (
    id BIGINT UNSIGNED NOT NULL AUTO_INCREMENT,

    organization_entity_id BIGINT UNSIGNED NOT NULL,

    user_id BIGINT UNSIGNED NOT NULL,

    role VARCHAR(60) NOT NULL DEFAULT 'member',

    status VARCHAR(20) NOT NULL DEFAULT 'active',

    created_by BIGINT UNSIGNED NULL,

    updated_by BIGINT UNSIGNED NULL,

    created_at DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,

    updated_at DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP
        ON UPDATE CURRENT_TIMESTAMP,

    PRIMARY KEY (id),

    UNIQUE KEY uq_org_entity_member (organization_entity_id, user_id),

    KEY idx_org_members_user (user_id, status),

    KEY idx_org_members_role (organization_entity_id, role),

    CONSTRAINT fk_org_entity_members_entity
        FOREIGN KEY (organization_entity_id)
        REFERENCES organization_entities(id)
        ON DELETE CASCADE
        ON UPDATE CASCADE,

    CONSTRAINT fk_org_entity_members_user
        FOREIGN KEY (user_id)
        REFERENCES users(id)
        ON DELETE CASCADE
        ON UPDATE CASCADE,

    CONSTRAINT fk_org_entity_members_creator
        FOREIGN KEY (created_by)
        REFERENCES users(id)
        ON DELETE SET NULL
        ON UPDATE CASCADE,

    CONSTRAINT fk_org_entity_members_updater
        FOREIGN KEY (updated_by)
        REFERENCES users(id)
        ON DELETE SET NULL
        ON UPDATE CASCADE
)
ENGINE=InnoDB
DEFAULT CHARSET=utf8mb4
COLLATE=utf8mb4_unicode_ci;
