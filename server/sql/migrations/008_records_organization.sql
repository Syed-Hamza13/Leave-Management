/*
 * Organization structure, record storage, custom user attributes and settings.
 *
 * Organization entity types (Department, Council, Team, ...) are metadata. The
 * entities themselves are rows here plus an optional profile record in a
 * logical table, so creating an entity type never creates a MySQL table.
 */

CREATE TABLE IF NOT EXISTS organization_entity_types (
    id BIGINT UNSIGNED NOT NULL AUTO_INCREMENT,

    type_key VARCHAR(63) NOT NULL,

    label VARCHAR(160) NOT NULL,

    description VARCHAR(500) NULL,

    parent_type_id BIGINT UNSIGNED NULL,

    status VARCHAR(20) NOT NULL DEFAULT 'active',

    created_by BIGINT UNSIGNED NULL,

    updated_by BIGINT UNSIGNED NULL,

    created_at DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,

    updated_at DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP
        ON UPDATE CURRENT_TIMESTAMP,

    archived_at DATETIME NULL,

    PRIMARY KEY (id),

    UNIQUE KEY uq_org_entity_types_key (type_key),

    KEY idx_org_entity_types_status (status),

    KEY idx_org_entity_types_parent (parent_type_id),

    CONSTRAINT fk_org_entity_types_parent
        FOREIGN KEY (parent_type_id)
        REFERENCES organization_entity_types(id)
        ON DELETE SET NULL
        ON UPDATE CASCADE
)
ENGINE=InnoDB
DEFAULT CHARSET=utf8mb4
COLLATE=utf8mb4_unicode_ci;


CREATE TABLE IF NOT EXISTS organization_entities (
    id BIGINT UNSIGNED NOT NULL AUTO_INCREMENT,

    entity_type_id BIGINT UNSIGNED NOT NULL,

    name VARCHAR(190) NOT NULL,

    parent_entity_id BIGINT UNSIGNED NULL,

    /*
     * Points at a table_records row holding this entity's configured
     * attributes. Enforced in the application rather than by a foreign key to
     * keep organization_entities independent of record storage ordering.
     */
    profile_record_id BIGINT UNSIGNED NULL,

    sort_order INT NOT NULL DEFAULT 0,

    status VARCHAR(20) NOT NULL DEFAULT 'active',

    created_by BIGINT UNSIGNED NULL,

    updated_by BIGINT UNSIGNED NULL,

    created_at DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,

    updated_at DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP
        ON UPDATE CURRENT_TIMESTAMP,

    archived_at DATETIME NULL,

    PRIMARY KEY (id),

    KEY idx_org_entities_type (entity_type_id, status),

    KEY idx_org_entities_parent (parent_entity_id),

    KEY idx_org_entities_name (name),

    CONSTRAINT fk_org_entities_type
        FOREIGN KEY (entity_type_id)
        REFERENCES organization_entity_types(id)
        ON DELETE RESTRICT
        ON UPDATE CASCADE,

    CONSTRAINT fk_org_entities_parent
        FOREIGN KEY (parent_entity_id)
        REFERENCES organization_entities(id)
        ON DELETE SET NULL
        ON UPDATE CASCADE
)
ENGINE=InnoDB
DEFAULT CHARSET=utf8mb4
COLLATE=utf8mb4_unicode_ci;


CREATE TABLE IF NOT EXISTS entity_type_configurations (
    id BIGINT UNSIGNED NOT NULL AUTO_INCREMENT,

    entity_type_id BIGINT UNSIGNED NOT NULL,

    /*
     * profile -> the form/table used to capture this entity type's attributes
     * section -> a form/table available inside an entity's own page
     */
    scope ENUM('profile', 'section') NOT NULL DEFAULT 'section',

    label VARCHAR(160) NOT NULL,

    form_id BIGINT UNSIGNED NOT NULL,

    table_id BIGINT UNSIGNED NOT NULL,

    mapping_id BIGINT UNSIGNED NOT NULL,

    sort_order INT NOT NULL DEFAULT 0,

    is_active TINYINT(1) NOT NULL DEFAULT 1,

    created_by BIGINT UNSIGNED NULL,

    updated_by BIGINT UNSIGNED NULL,

    created_at DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,

    updated_at DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP
        ON UPDATE CURRENT_TIMESTAMP,

    PRIMARY KEY (id),

    UNIQUE KEY uq_entity_config_profile (entity_type_id, scope, label),

    KEY idx_entity_config_type (entity_type_id, scope),

    CONSTRAINT fk_entity_config_type
        FOREIGN KEY (entity_type_id)
        REFERENCES organization_entity_types(id)
        ON DELETE CASCADE
        ON UPDATE CASCADE,

    CONSTRAINT fk_entity_config_form
        FOREIGN KEY (form_id)
        REFERENCES form_definitions(id)
        ON DELETE RESTRICT
        ON UPDATE CASCADE,

    CONSTRAINT fk_entity_config_table
        FOREIGN KEY (table_id)
        REFERENCES table_definitions(id)
        ON DELETE RESTRICT
        ON UPDATE CASCADE,

    CONSTRAINT fk_entity_config_mapping
        FOREIGN KEY (mapping_id)
        REFERENCES form_table_mappings(id)
        ON DELETE RESTRICT
        ON UPDATE CASCADE
)
ENGINE=InnoDB
DEFAULT CHARSET=utf8mb4
COLLATE=utf8mb4_unicode_ci;


CREATE TABLE IF NOT EXISTS table_records (
    id BIGINT UNSIGNED NOT NULL AUTO_INCREMENT,

    table_id BIGINT UNSIGNED NOT NULL,

    /*
     * The definition version the values were validated against. Older records
     * keep their version so a definition change cannot silently reinterpret
     * stored values.
     */
    schema_version INT NOT NULL DEFAULT 1,

    data JSON NOT NULL,

    organization_entity_id BIGINT UNSIGNED NULL,

    status VARCHAR(20) NOT NULL DEFAULT 'active',

    created_by BIGINT UNSIGNED NULL,

    updated_by BIGINT UNSIGNED NULL,

    created_at DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3),

    updated_at DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3)
        ON UPDATE CURRENT_TIMESTAMP(3),

    archived_at DATETIME NULL,

    PRIMARY KEY (id),

    KEY idx_table_records_table (table_id, status),

    KEY idx_table_records_created (table_id, created_at),

    KEY idx_table_records_entity (organization_entity_id),

    KEY idx_table_records_creator (created_by),

    CONSTRAINT fk_table_records_table
        FOREIGN KEY (table_id)
        REFERENCES table_definitions(id)
        ON DELETE CASCADE
        ON UPDATE CASCADE,

    CONSTRAINT fk_table_records_entity
        FOREIGN KEY (organization_entity_id)
        REFERENCES organization_entities(id)
        ON DELETE SET NULL
        ON UPDATE CASCADE,

    CONSTRAINT fk_table_records_creator
        FOREIGN KEY (created_by)
        REFERENCES users(id)
        ON DELETE SET NULL
        ON UPDATE CASCADE
)
ENGINE=InnoDB
DEFAULT CHARSET=utf8mb4
COLLATE=utf8mb4_unicode_ci;


CREATE TABLE IF NOT EXISTS user_profile_values (
    id BIGINT UNSIGNED NOT NULL AUTO_INCREMENT,

    user_id BIGINT UNSIGNED NOT NULL,

    column_definition_id BIGINT UNSIGNED NOT NULL,

    value JSON NULL,

    created_at DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,

    updated_at DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP
        ON UPDATE CURRENT_TIMESTAMP,

    PRIMARY KEY (id),

    UNIQUE KEY uq_user_profile_values_pair (user_id, column_definition_id),

    KEY idx_user_profile_values_column (column_definition_id),

    CONSTRAINT fk_user_profile_values_user
        FOREIGN KEY (user_id)
        REFERENCES users(id)
        ON DELETE CASCADE
        ON UPDATE CASCADE,

    CONSTRAINT fk_user_profile_values_column
        FOREIGN KEY (column_definition_id)
        REFERENCES column_definitions(id)
        ON DELETE CASCADE
        ON UPDATE CASCADE
)
ENGINE=InnoDB
DEFAULT CHARSET=utf8mb4
COLLATE=utf8mb4_unicode_ci;


CREATE TABLE IF NOT EXISTS app_settings (
    id BIGINT UNSIGNED NOT NULL AUTO_INCREMENT,

    setting_key VARCHAR(120) NOT NULL,

    setting_value JSON NULL,

    /*
     * Secret values are stored encrypted and are never returned by read
     * endpoints, only reported as "configured".
     */
    is_secret TINYINT(1) NOT NULL DEFAULT 0,

    updated_by BIGINT UNSIGNED NULL,

    created_at DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,

    updated_at DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP
        ON UPDATE CURRENT_TIMESTAMP,

    PRIMARY KEY (id),

    UNIQUE KEY uq_app_settings_key (setting_key)
)
ENGINE=InnoDB
DEFAULT CHARSET=utf8mb4
COLLATE=utf8mb4_unicode_ci;


INSERT INTO app_settings (setting_key, setting_value, is_secret) VALUES
    ('smtp', CAST('{"host":"","port":587,"secure":false,"fromAddress":"","username":"","authMode":"password","encryption":"tls"}' AS JSON), 1)
ON DUPLICATE KEY UPDATE setting_key = setting_key;
