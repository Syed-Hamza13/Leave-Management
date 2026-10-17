/*
 * Metadata definitions: fields, option sets, logical tables, forms and mappings.
 *
 * Administrator created "tables" are logical tables described by these
 * definitions. Row values live in table_records (migration 008) as validated
 * JSON. No browser input ever becomes a MySQL identifier.
 */

CREATE TABLE IF NOT EXISTS field_definitions (
    id BIGINT UNSIGNED NOT NULL AUTO_INCREMENT,

    field_key VARCHAR(63) NOT NULL,

    label VARCHAR(160) NOT NULL,

    description VARCHAR(500) NULL,

    data_type VARCHAR(40) NOT NULL,

    config JSON NULL,

    is_required TINYINT(1) NOT NULL DEFAULT 0,

    default_value JSON NULL,

    help_text VARCHAR(500) NULL,

    status VARCHAR(20) NOT NULL DEFAULT 'active',

    created_by BIGINT UNSIGNED NULL,

    updated_by BIGINT UNSIGNED NULL,

    created_at DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,

    updated_at DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP
        ON UPDATE CURRENT_TIMESTAMP,

    archived_at DATETIME NULL,

    PRIMARY KEY (id),

    UNIQUE KEY uq_field_definitions_key (field_key),

    KEY idx_field_definitions_status (status),

    KEY idx_field_definitions_data_type (data_type)
)
ENGINE=InnoDB
DEFAULT CHARSET=utf8mb4
COLLATE=utf8mb4_unicode_ci;


CREATE TABLE IF NOT EXISTS dropdown_definitions (
    id BIGINT UNSIGNED NOT NULL AUTO_INCREMENT,

    dropdown_key VARCHAR(63) NOT NULL,

    label VARCHAR(160) NOT NULL,

    description VARCHAR(500) NULL,

    status VARCHAR(20) NOT NULL DEFAULT 'active',

    created_by BIGINT UNSIGNED NULL,

    updated_by BIGINT UNSIGNED NULL,

    created_at DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,

    updated_at DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP
        ON UPDATE CURRENT_TIMESTAMP,

    archived_at DATETIME NULL,

    PRIMARY KEY (id),

    UNIQUE KEY uq_dropdown_definitions_key (dropdown_key),

    KEY idx_dropdown_definitions_status (status)
)
ENGINE=InnoDB
DEFAULT CHARSET=utf8mb4
COLLATE=utf8mb4_unicode_ci;


CREATE TABLE IF NOT EXISTS dropdown_options (
    id BIGINT UNSIGNED NOT NULL AUTO_INCREMENT,

    dropdown_id BIGINT UNSIGNED NOT NULL,

    option_value VARCHAR(190) NOT NULL,

    label VARCHAR(190) NOT NULL,

    sort_order INT NOT NULL DEFAULT 0,

    is_active TINYINT(1) NOT NULL DEFAULT 1,

    created_at DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,

    updated_at DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP
        ON UPDATE CURRENT_TIMESTAMP,

    PRIMARY KEY (id),

    UNIQUE KEY uq_dropdown_options_value (dropdown_id, option_value),

    KEY idx_dropdown_options_order (dropdown_id, sort_order),

    CONSTRAINT fk_dropdown_options_dropdown
        FOREIGN KEY (dropdown_id)
        REFERENCES dropdown_definitions(id)
        ON DELETE CASCADE
        ON UPDATE CASCADE
)
ENGINE=InnoDB
DEFAULT CHARSET=utf8mb4
COLLATE=utf8mb4_unicode_ci;


CREATE TABLE IF NOT EXISTS table_definitions (
    id BIGINT UNSIGNED NOT NULL AUTO_INCREMENT,

    table_key VARCHAR(63) NOT NULL,

    label VARCHAR(160) NOT NULL,

    description VARCHAR(500) NULL,

    /*
     * managed      -> rows stored in table_records
     * system_users -> rows are real users rows plus user_profile_values
     */
    storage_kind ENUM('managed', 'system_users') NOT NULL DEFAULT 'managed',

    physical_table VARCHAR(64) NULL,

    display_column_key VARCHAR(63) NULL,

    is_system TINYINT(1) NOT NULL DEFAULT 0,

    schema_version INT NOT NULL DEFAULT 1,

    status VARCHAR(20) NOT NULL DEFAULT 'active',

    created_by BIGINT UNSIGNED NULL,

    updated_by BIGINT UNSIGNED NULL,

    created_at DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,

    updated_at DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP
        ON UPDATE CURRENT_TIMESTAMP,

    archived_at DATETIME NULL,

    PRIMARY KEY (id),

    UNIQUE KEY uq_table_definitions_key (table_key),

    KEY idx_table_definitions_status (status)
)
ENGINE=InnoDB
DEFAULT CHARSET=utf8mb4
COLLATE=utf8mb4_unicode_ci;


CREATE TABLE IF NOT EXISTS column_definitions (
    id BIGINT UNSIGNED NOT NULL AUTO_INCREMENT,

    table_id BIGINT UNSIGNED NOT NULL,

    column_key VARCHAR(63) NOT NULL,

    label VARCHAR(160) NOT NULL,

    description VARCHAR(500) NULL,

    data_type VARCHAR(40) NOT NULL,

    config JSON NULL,

    is_system TINYINT(1) NOT NULL DEFAULT 0,

    is_required TINYINT(1) NOT NULL DEFAULT 0,

    is_searchable TINYINT(1) NOT NULL DEFAULT 1,

    is_filterable TINYINT(1) NOT NULL DEFAULT 1,

    is_visible TINYINT(1) NOT NULL DEFAULT 1,

    sort_order INT NOT NULL DEFAULT 0,

    /*
     * Only set for system columns that mirror a real SQL column. It is written
     * by migrations and rejected by the API, never supplied by a client.
     */
    physical_column VARCHAR(64) NULL,

    relation_table_id BIGINT UNSIGNED NULL,

    relation_policy ENUM('single', 'multiple') NULL,

    status VARCHAR(20) NOT NULL DEFAULT 'active',

    created_at DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,

    updated_at DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP
        ON UPDATE CURRENT_TIMESTAMP,

    archived_at DATETIME NULL,

    PRIMARY KEY (id),

    UNIQUE KEY uq_column_definitions_table_key (table_id, column_key),

    KEY idx_column_definitions_order (table_id, sort_order),

    KEY idx_column_definitions_relation (relation_table_id),

    CONSTRAINT fk_column_definitions_table
        FOREIGN KEY (table_id)
        REFERENCES table_definitions(id)
        ON DELETE CASCADE
        ON UPDATE CASCADE,

    CONSTRAINT fk_column_definitions_relation_table
        FOREIGN KEY (relation_table_id)
        REFERENCES table_definitions(id)
        ON DELETE SET NULL
        ON UPDATE CASCADE
)
ENGINE=InnoDB
DEFAULT CHARSET=utf8mb4
COLLATE=utf8mb4_unicode_ci;


CREATE TABLE IF NOT EXISTS form_definitions (
    id BIGINT UNSIGNED NOT NULL AUTO_INCREMENT,

    form_key VARCHAR(63) NOT NULL,

    label VARCHAR(160) NOT NULL,

    description VARCHAR(500) NULL,

    submit_label VARCHAR(60) NOT NULL DEFAULT 'Submit',

    cancel_label VARCHAR(60) NOT NULL DEFAULT 'Cancel',

    status VARCHAR(20) NOT NULL DEFAULT 'active',

    created_by BIGINT UNSIGNED NULL,

    updated_by BIGINT UNSIGNED NULL,

    created_at DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,

    updated_at DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP
        ON UPDATE CURRENT_TIMESTAMP,

    archived_at DATETIME NULL,

    PRIMARY KEY (id),

    UNIQUE KEY uq_form_definitions_key (form_key),

    KEY idx_form_definitions_status (status)
)
ENGINE=InnoDB
DEFAULT CHARSET=utf8mb4
COLLATE=utf8mb4_unicode_ci;


CREATE TABLE IF NOT EXISTS form_fields (
    id BIGINT UNSIGNED NOT NULL AUTO_INCREMENT,

    form_id BIGINT UNSIGNED NOT NULL,

    field_id BIGINT UNSIGNED NOT NULL,

    sort_order INT NOT NULL DEFAULT 0,

    is_required_override TINYINT(1) NULL,

    label_override VARCHAR(160) NULL,

    help_text_override VARCHAR(500) NULL,

    config_override JSON NULL,

    created_at DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,

    updated_at DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP
        ON UPDATE CURRENT_TIMESTAMP,

    PRIMARY KEY (id),

    /*
     * A field may belong to many forms, but only once to the same form.
     */
    UNIQUE KEY uq_form_fields_form_field (form_id, field_id),

    KEY idx_form_fields_order (form_id, sort_order),

    CONSTRAINT fk_form_fields_form
        FOREIGN KEY (form_id)
        REFERENCES form_definitions(id)
        ON DELETE CASCADE
        ON UPDATE CASCADE,

    /*
     * RESTRICT: a field already placed on a form cannot be deleted outright.
     * The service archives it instead so saved forms keep rendering.
     */
    CONSTRAINT fk_form_fields_field
        FOREIGN KEY (field_id)
        REFERENCES field_definitions(id)
        ON DELETE RESTRICT
        ON UPDATE CASCADE
)
ENGINE=InnoDB
DEFAULT CHARSET=utf8mb4
COLLATE=utf8mb4_unicode_ci;


CREATE TABLE IF NOT EXISTS form_table_mappings (
    id BIGINT UNSIGNED NOT NULL AUTO_INCREMENT,

    form_id BIGINT UNSIGNED NOT NULL,

    table_id BIGINT UNSIGNED NOT NULL,

    label VARCHAR(160) NULL,

    status VARCHAR(20) NOT NULL DEFAULT 'active',

    version INT NOT NULL DEFAULT 1,

    created_by BIGINT UNSIGNED NULL,

    updated_by BIGINT UNSIGNED NULL,

    created_at DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,

    updated_at DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP
        ON UPDATE CURRENT_TIMESTAMP,

    PRIMARY KEY (id),

    UNIQUE KEY uq_form_table_mappings_pair (form_id, table_id),

    KEY idx_form_table_mappings_table (table_id),

    CONSTRAINT fk_form_table_mappings_form
        FOREIGN KEY (form_id)
        REFERENCES form_definitions(id)
        ON DELETE CASCADE
        ON UPDATE CASCADE,

    CONSTRAINT fk_form_table_mappings_table
        FOREIGN KEY (table_id)
        REFERENCES table_definitions(id)
        ON DELETE CASCADE
        ON UPDATE CASCADE
)
ENGINE=InnoDB
DEFAULT CHARSET=utf8mb4
COLLATE=utf8mb4_unicode_ci;


CREATE TABLE IF NOT EXISTS field_column_mappings (
    id BIGINT UNSIGNED NOT NULL AUTO_INCREMENT,

    mapping_id BIGINT UNSIGNED NOT NULL,

    form_field_id BIGINT UNSIGNED NOT NULL,

    column_id BIGINT UNSIGNED NOT NULL,

    created_at DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,

    PRIMARY KEY (id),

    /*
     * Within one mapping a form field targets at most one column and a column
     * receives from at most one field. Duplicate assignment is therefore a
     * database level conflict, not only a service check.
     */
    UNIQUE KEY uq_field_column_mappings_source (mapping_id, form_field_id),

    UNIQUE KEY uq_field_column_mappings_target (mapping_id, column_id),

    CONSTRAINT fk_field_column_mappings_mapping
        FOREIGN KEY (mapping_id)
        REFERENCES form_table_mappings(id)
        ON DELETE CASCADE
        ON UPDATE CASCADE,

    CONSTRAINT fk_field_column_mappings_form_field
        FOREIGN KEY (form_field_id)
        REFERENCES form_fields(id)
        ON DELETE CASCADE
        ON UPDATE CASCADE,

    CONSTRAINT fk_field_column_mappings_column
        FOREIGN KEY (column_id)
        REFERENCES column_definitions(id)
        ON DELETE CASCADE
        ON UPDATE CASCADE
)
ENGINE=InnoDB
DEFAULT CHARSET=utf8mb4
COLLATE=utf8mb4_unicode_ci;


/*
 * The authentication users table is exposed in the table builder as a system
 * table. Its columns are seeded here, flagged is_system, and rejected for
 * edit/delete by the API. password_hash and password_changed_at are
 * deliberately absent so no generic read path can reach them.
 */
INSERT INTO table_definitions
    (table_key, label, description, storage_kind, physical_table, display_column_key, is_system, schema_version, status)
VALUES
    ('users', 'Users', 'Authentication owned user accounts. Core columns are immutable.', 'system_users', 'users', 'email', 1, 1, 'active')
ON DUPLICATE KEY UPDATE label = VALUES(label), description = VALUES(description);


INSERT INTO column_definitions
    (table_id, column_key, label, data_type, config, is_system, is_required, is_searchable, is_filterable, is_visible, sort_order, physical_column, status)
SELECT t.id, c.column_key, c.label, c.data_type, c.config, 1, c.is_required, c.is_searchable, c.is_filterable, c.is_visible, c.sort_order, c.physical_column, 'active'
FROM table_definitions t
CROSS JOIN (
    SELECT 'id'            AS column_key, 'User ID'      AS label, 'number' AS data_type, CAST('{"decimalPlaces":0}' AS JSON) AS config, 0 AS is_required, 0 AS is_searchable, 1 AS is_filterable, 1 AS is_visible, 10 AS sort_order, 'id'            AS physical_column
    UNION ALL SELECT 'email',      'Email',      'email',  CAST('{"maxLength":255}' AS JSON), 1, 1, 1, 1, 20, 'email'
    UNION ALL SELECT 'first_name', 'First name', 'text',   CAST('{"maxLength":100}' AS JSON), 1, 1, 1, 1, 30, 'first_name'
    UNION ALL SELECT 'last_name',  'Last name',  'text',   CAST('{"maxLength":100}' AS JSON), 0, 1, 1, 1, 40, 'last_name'
    UNION ALL SELECT 'status',     'Status',     'text',   CAST('{"maxLength":20}' AS JSON),  1, 1, 1, 1, 50, 'status'
    UNION ALL SELECT 'last_login_at', 'Last login', 'text', CAST('{"maxLength":30}' AS JSON), 0, 0, 1, 1, 60, 'last_login_at'
    UNION ALL SELECT 'created_at', 'Created at', 'text',   CAST('{"maxLength":30}' AS JSON),  0, 0, 1, 1, 70, 'created_at'
    UNION ALL SELECT 'updated_at', 'Updated at', 'text',   CAST('{"maxLength":30}' AS JSON),  0, 0, 1, 0, 80, 'updated_at'
) AS c
WHERE t.table_key = 'users'
ON DUPLICATE KEY UPDATE label = VALUES(label);
