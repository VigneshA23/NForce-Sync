-- Replace the plain UNIQUE constraint on app_user.email with a partial
-- unique index that only covers non-deleted rows. This allows a soft-deleted
-- account's email to be reused for a new account, while still blocking two
-- active accounts from sharing an email.

-- Drop the constraint (backing index) added by V2
ALTER TABLE app_user DROP CONSTRAINT IF EXISTS app_user_email_key;

-- Partial unique index: only active (non-deleted) rows participate
CREATE UNIQUE INDEX app_user_email_unique_active
    ON app_user (email)
    WHERE deleted_at IS NULL;
