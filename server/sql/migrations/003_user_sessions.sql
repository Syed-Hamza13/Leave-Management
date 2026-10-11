CREATE TABLE IF NOT EXISTS user_sessions (
    id BIGINT UNSIGNED NOT NULL AUTO_INCREMENT,

    user_id BIGINT UNSIGNED NOT NULL,

    session_id VARCHAR(255) NOT NULL,

    device_id VARCHAR(255) NULL,

    user_agent TEXT NULL,

    ip_address VARCHAR(45) NULL,

    created_at DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3),

    last_seen_at DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3),

    expires_at DATETIME(3) NULL,

    revoked_at DATETIME(3) NULL,

    PRIMARY KEY (id),

    UNIQUE KEY uq_user_sessions_session_id (session_id),

    KEY idx_user_sessions_user_id (user_id),

    KEY idx_user_sessions_active (
        user_id,
        revoked_at
    ),

    CONSTRAINT fk_user_sessions_user
        FOREIGN KEY (user_id)
        REFERENCES users(id)
        ON DELETE CASCADE
        ON UPDATE CASCADE

) ENGINE=InnoDB
DEFAULT CHARSET=utf8mb4
COLLATE=utf8mb4_unicode_ci;