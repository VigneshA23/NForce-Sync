-- V3: manager_id on app_user, project, allocation, task_category

-- 1. Manager self-reference on app_user
ALTER TABLE app_user
    ADD COLUMN manager_id BIGINT NULL REFERENCES app_user (id);

-- 2. Project
CREATE TABLE project (
    id            BIGSERIAL    PRIMARY KEY,
    code          VARCHAR(50)  NOT NULL UNIQUE,
    name          VARCHAR(200) NOT NULL,
    client        VARCHAR(200) NULL,
    project_type  VARCHAR(50)  NULL,
    billing_model VARCHAR(50)  NULL,
    status        VARCHAR(20)  NOT NULL DEFAULT 'ACTIVE'
                  CONSTRAINT project_status_check
                  CHECK (status IN ('ACTIVE','INACTIVE','COMPLETED','ON_HOLD')),
    pm_id         BIGINT       NULL REFERENCES app_user (id),
    start_date    DATE         NULL,
    end_date      DATE         NULL,
    created_at    TIMESTAMPTZ  NOT NULL DEFAULT NOW()
);

-- 3. Allocation
CREATE TABLE allocation (
    id             BIGSERIAL PRIMARY KEY,
    employee_id    BIGINT    NOT NULL REFERENCES app_user (id),
    project_id     BIGINT    NOT NULL REFERENCES project (id),
    allocation_pct INT       NOT NULL
                   CONSTRAINT allocation_pct_check
                   CHECK (allocation_pct >= 0 AND allocation_pct <= 100),
    effective_from DATE      NOT NULL,
    effective_to   DATE      NULL,
    created_at     TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

-- 4. Task category
CREATE TABLE task_category (
    id                  BIGSERIAL    PRIMARY KEY,
    name                VARCHAR(100) NOT NULL UNIQUE,
    is_productive       BOOLEAN      NOT NULL,
    is_billable_default BOOLEAN      NOT NULL,
    active              BOOLEAN      NOT NULL DEFAULT TRUE
);

-- Seed 19 task categories (Leave / Holiday and Bench Activity are NOT productive)
INSERT INTO task_category (name, is_productive, is_billable_default) VALUES
    ('Requirement Analysis',  TRUE,  TRUE),
    ('Test Case Preparation', TRUE,  TRUE),
    ('Test Execution',        TRUE,  TRUE),
    ('Defect Logging',        TRUE,  TRUE),
    ('Defect Retesting',      TRUE,  TRUE),
    ('Automation Scripting',  TRUE,  TRUE),
    ('Automation Execution',  TRUE,  TRUE),
    ('Development',           TRUE,  TRUE),
    ('Code Review',           TRUE,  TRUE),
    ('Production Support',    TRUE,  TRUE),
    ('Client Meeting',        TRUE,  TRUE),
    ('Internal Meeting',      TRUE,  FALSE),
    ('Documentation',         TRUE,  FALSE),
    ('KT / Training',         TRUE,  FALSE),
    ('Learning / Upskilling', TRUE,  FALSE),
    ('Bench Activity',        FALSE, FALSE),
    ('Pre-sales / Proposal',  TRUE,  TRUE),
    ('Product Development',   TRUE,  TRUE),
    ('Leave / Holiday',       FALSE, FALSE);

-- Seed: assign Priya Nair (id=2, MANAGER) as manager for active test employees
UPDATE app_user SET manager_id = 2 WHERE id IN (3, 4, 5) AND role = 'EMPLOYEE';
