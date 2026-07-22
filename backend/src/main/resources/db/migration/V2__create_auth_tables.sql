-- Auth tables: app_user, password_reset_token, audit_log
-- Seed super admin: email=admin@nforceone.com plaintext=ChangeMe123!

CREATE TABLE app_user (
    id            BIGSERIAL    PRIMARY KEY,
    full_name     VARCHAR(200) NOT NULL,
    email         VARCHAR(200) NOT NULL UNIQUE,
    password_hash VARCHAR(255) NOT NULL,
    role          VARCHAR(20)  NOT NULL
                  CONSTRAINT app_user_role_check
                  CHECK (role IN ('EMPLOYEE','MANAGER','HR','SUPERADMIN','PM','DM','FINANCE','LEADERSHIP')),
    employee_code BIGINT       NOT NULL UNIQUE
                  GENERATED ALWAYS AS IDENTITY (START WITH 1001 INCREMENT BY 1),
    status        VARCHAR(20)  NOT NULL DEFAULT 'ACTIVE'
                  CONSTRAINT app_user_status_check
                  CHECK (status IN ('ACTIVE','INACTIVE')),
    created_at    TIMESTAMPTZ  NOT NULL DEFAULT NOW(),
    created_by    BIGINT       NULL REFERENCES app_user (id)
);

CREATE TABLE password_reset_token (
    id         BIGSERIAL    PRIMARY KEY,
    user_id    BIGINT       NOT NULL REFERENCES app_user (id),
    token      VARCHAR(255) NOT NULL UNIQUE,
    expires_at TIMESTAMPTZ  NOT NULL,
    used       BOOLEAN      NOT NULL DEFAULT FALSE
);

CREATE TABLE audit_log (
    id           BIGSERIAL    PRIMARY KEY,
    entity_type  VARCHAR(100) NOT NULL,
    entity_id    BIGINT       NOT NULL,
    action       VARCHAR(100) NOT NULL,
    actor_id     BIGINT       NULL REFERENCES app_user (id),
    before_value JSONB        NULL,
    after_value  JSONB        NULL,
    occurred_at  TIMESTAMPTZ  NOT NULL DEFAULT NOW()
);

-- Seed super admin (plaintext: ChangeMe123! — change on first login)
INSERT INTO app_user (full_name, email, password_hash, role, status, created_at, created_by)
VALUES (
    'System Admin',
    'admin@nforceone.com',
    '$2a$10$7c1lFL6CXCE6y6KvjL1t6uIZ7UUlULJ5wP8MUDY87mFfYHvLO4y3m',
    'SUPERADMIN',
    'ACTIVE',
    NOW(),
    NULL
);
