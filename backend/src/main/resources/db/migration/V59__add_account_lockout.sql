-- Account Lockout: temporarily block sign-in for an account after N consecutive failed attempts.
--
-- Until now the "5 attempts / 15 minute lockout" existed only as an in-memory counter in the
-- browser, so it was global across emails, reset on refresh, and invisible to the API. These
-- columns move it server-side, per account.

-- Per-account state. failed_login_attempts resets to 0 both on a successful sign-in and at the
-- moment the lock is applied; locked_until NULL means "not locked".
ALTER TABLE app_user
    ADD COLUMN failed_login_attempts INT NOT NULL DEFAULT 0,
    ADD COLUMN locked_until          TIMESTAMPTZ;

-- Superadmin-editable policy (Business Rules -> Notifications & Escalation). Defaults preserve the
-- behaviour the lock screen has always advertised: 5 attempts, 15 minutes.
ALTER TABLE business_rule_config
    ADD COLUMN lockout_attempt_threshold INT NOT NULL DEFAULT 5,
    ADD COLUMN lockout_duration_minutes  INT NOT NULL DEFAULT 15;
