UPDATE users
SET password_changed_at = created_at
WHERE password_changed_at IS NULL;