ALTER TABLE user_sessions
ADD COLUMN user_device_id BIGINT UNSIGNED NULL AFTER user_id;

ALTER TABLE user_sessions
ADD KEY idx_user_sessions_device_id (user_device_id);

ALTER TABLE user_sessions
ADD CONSTRAINT fk_user_sessions_device
    FOREIGN KEY (user_device_id)
    REFERENCES user_devices(id)
    ON DELETE SET NULL
    ON UPDATE CASCADE;
