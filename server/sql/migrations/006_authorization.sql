/*
 * Authorization foundation.
 *
 * Authentication (users, user_sessions, user_devices) already exists. This adds
 * role based access control so administration endpoints can be guarded on the
 * server, plus an audit trail for administrative mutations.
 */

CREATE TABLE IF NOT EXISTS roles (
    id BIGINT UNSIGNED NOT NULL AUTO_INCREMENT,

    role_key VARCHAR(64) NOT NULL,

    label VARCHAR(120) NOT NULL,

    description VARCHAR(255) NULL,

    is_system TINYINT(1) NOT NULL DEFAULT 0,

    created_at DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,

    updated_at DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP
        ON UPDATE CURRENT_TIMESTAMP,

    PRIMARY KEY (id),

    UNIQUE KEY uq_roles_role_key (role_key)
)
ENGINE=InnoDB
DEFAULT CHARSET=utf8mb4
COLLATE=utf8mb4_unicode_ci;


CREATE TABLE IF NOT EXISTS permissions (
    id BIGINT UNSIGNED NOT NULL AUTO_INCREMENT,

    permission_key VARCHAR(120) NOT NULL,

    label VARCHAR(160) NOT NULL,

    created_at DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,

    PRIMARY KEY (id),

    UNIQUE KEY uq_permissions_key (permission_key)
)
ENGINE=InnoDB
DEFAULT CHARSET=utf8mb4
COLLATE=utf8mb4_unicode_ci;


CREATE TABLE IF NOT EXISTS role_permissions (
    role_id BIGINT UNSIGNED NOT NULL,

    permission_id BIGINT UNSIGNED NOT NULL,

    PRIMARY KEY (role_id, permission_id),

    CONSTRAINT fk_role_permissions_role
        FOREIGN KEY (role_id)
        REFERENCES roles(id)
        ON DELETE CASCADE
        ON UPDATE CASCADE,

    CONSTRAINT fk_role_permissions_permission
        FOREIGN KEY (permission_id)
        REFERENCES permissions(id)
        ON DELETE CASCADE
        ON UPDATE CASCADE
)
ENGINE=InnoDB
DEFAULT CHARSET=utf8mb4
COLLATE=utf8mb4_unicode_ci;


CREATE TABLE IF NOT EXISTS user_roles (
    id BIGINT UNSIGNED NOT NULL AUTO_INCREMENT,

    user_id BIGINT UNSIGNED NOT NULL,

    role_id BIGINT UNSIGNED NOT NULL,

    assigned_by BIGINT UNSIGNED NULL,

    assigned_at DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,

    PRIMARY KEY (id),

    UNIQUE KEY uq_user_roles_user_role (user_id, role_id),

    KEY idx_user_roles_role_id (role_id),

    CONSTRAINT fk_user_roles_user
        FOREIGN KEY (user_id)
        REFERENCES users(id)
        ON DELETE CASCADE
        ON UPDATE CASCADE,

    CONSTRAINT fk_user_roles_role
        FOREIGN KEY (role_id)
        REFERENCES roles(id)
        ON DELETE CASCADE
        ON UPDATE CASCADE
)
ENGINE=InnoDB
DEFAULT CHARSET=utf8mb4
COLLATE=utf8mb4_unicode_ci;


CREATE TABLE IF NOT EXISTS audit_events (
    id BIGINT UNSIGNED NOT NULL AUTO_INCREMENT,

    actor_user_id BIGINT UNSIGNED NULL,

    action VARCHAR(80) NOT NULL,

    entity_type VARCHAR(60) NOT NULL,

    entity_id VARCHAR(64) NULL,

    summary JSON NULL,

    ip_address VARCHAR(45) NULL,

    user_agent VARCHAR(255) NULL,

    created_at DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3),

    PRIMARY KEY (id),

    KEY idx_audit_events_actor (actor_user_id),

    KEY idx_audit_events_target (entity_type, entity_id),

    KEY idx_audit_events_action (action),

    KEY idx_audit_events_created_at (created_at),

    CONSTRAINT fk_audit_events_actor
        FOREIGN KEY (actor_user_id)
        REFERENCES users(id)
        ON DELETE SET NULL
        ON UPDATE CASCADE
)
ENGINE=InnoDB
DEFAULT CHARSET=utf8mb4
COLLATE=utf8mb4_unicode_ci;


INSERT INTO roles (role_key, label, description, is_system) VALUES
    ('super_admin', 'Super Admin', 'Full control including settings, secrets and user administration.', 1),
    ('admin', 'Administrator', 'Configures fields, forms, tables, mappings, organization and users.', 1),
    ('manager', 'Manager', 'Manages organization entities and records, reviews configuration.', 1),
    ('employee', 'Employee', 'Submits and views records through configured forms.', 1)
ON DUPLICATE KEY UPDATE label = VALUES(label), description = VALUES(description);


INSERT INTO permissions (permission_key, label) VALUES
    ('admin.fields.view', 'View field definitions'),
    ('admin.fields.manage', 'Create and edit field definitions'),
    ('admin.dropdowns.view', 'View option sets'),
    ('admin.dropdowns.manage', 'Create and edit option sets'),
    ('admin.forms.view', 'View form definitions'),
    ('admin.forms.manage', 'Create and edit form definitions'),
    ('admin.tables.view', 'View table definitions'),
    ('admin.tables.manage', 'Create and edit table definitions'),
    ('admin.mappings.view', 'View form to table mappings'),
    ('admin.mappings.manage', 'Create and edit form to table mappings'),
    ('admin.users.view', 'View user accounts'),
    ('admin.users.manage', 'Create, deactivate and reset user accounts'),
    ('admin.organization.view', 'View organization structure'),
    ('admin.organization.manage', 'Create and edit organization entities'),
    ('admin.settings.view', 'View application settings'),
    ('admin.settings.manage', 'Change application settings and SMTP credentials'),
    ('admin.audit.view', 'View the administrative audit trail'),
    ('records.view', 'View records'),
    ('records.create', 'Create records'),
    ('records.update', 'Update records'),
    ('records.delete', 'Archive records')
ON DUPLICATE KEY UPDATE label = VALUES(label);


INSERT INTO role_permissions (role_id, permission_id)
SELECT r.id, p.id
FROM roles r
CROSS JOIN permissions p
WHERE r.role_key = 'super_admin'
ON DUPLICATE KEY UPDATE role_id = role_id;


INSERT INTO role_permissions (role_id, permission_id)
SELECT r.id, p.id
FROM roles r
CROSS JOIN permissions p
WHERE r.role_key = 'admin'
    AND p.permission_key <> 'admin.settings.manage'
ON DUPLICATE KEY UPDATE role_id = role_id;


INSERT INTO role_permissions (role_id, permission_id)
SELECT r.id, p.id
FROM roles r
CROSS JOIN permissions p
WHERE r.role_key = 'manager'
    AND p.permission_key IN (
        'admin.fields.view',
        'admin.dropdowns.view',
        'admin.forms.view',
        'admin.tables.view',
        'admin.mappings.view',
        'admin.users.view',
        'admin.organization.view',
        'admin.organization.manage',
        'records.view',
        'records.create',
        'records.update'
    )
ON DUPLICATE KEY UPDATE role_id = role_id;


INSERT INTO role_permissions (role_id, permission_id)
SELECT r.id, p.id
FROM roles r
CROSS JOIN permissions p
WHERE r.role_key = 'employee'
    AND p.permission_key IN (
        'admin.forms.view',
        'admin.organization.view',
        'records.view',
        'records.create'
    )
ON DUPLICATE KEY UPDATE role_id = role_id;
