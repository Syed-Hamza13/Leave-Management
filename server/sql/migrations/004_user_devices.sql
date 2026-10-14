CREATE TABLE IF NOT EXISTS user_devices (
    id BIGINT UNSIGNED NOT NULL AUTO_INCREMENT,

    user_id BIGINT UNSIGNED NOT NULL,

    device_token_hash CHAR(64) NOT NULL,

    user_agent TEXT NULL,

    created_at DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3),

    last_seen_at DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3),

    revoked_at DATETIME(3) NULL,

    PRIMARY KEY (id),

    UNIQUE KEY uq_user_devices_token_hash (device_token_hash),

    KEY idx_user_devices_user_id (user_id),

    KEY idx_user_devices_active (
        user_id,
        revoked_at
    ),

    CONSTRAINT fk_user_devices_user
        FOREIGN KEY (user_id)
        REFERENCES users(id)
        ON DELETE CASCADE
        ON UPDATE CASCADE
) ENGINE=InnoDB
DEFAULT CHARSET=utf8mb4
COLLATE=utf8mb4_unicode_ci;