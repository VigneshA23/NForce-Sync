CREATE TABLE department (
    id         BIGSERIAL PRIMARY KEY,
    name       VARCHAR(200) NOT NULL UNIQUE,
    is_active  BOOLEAN      NOT NULL DEFAULT TRUE,
    created_at TIMESTAMP    NOT NULL DEFAULT now(),
    updated_at TIMESTAMP    NOT NULL DEFAULT now()
);

CREATE TABLE designation (
    id         BIGSERIAL PRIMARY KEY,
    title      VARCHAR(200) NOT NULL UNIQUE,
    is_active  BOOLEAN      NOT NULL DEFAULT TRUE,
    created_at TIMESTAMP    NOT NULL DEFAULT now(),
    updated_at TIMESTAMP    NOT NULL DEFAULT now()
);

CREATE TABLE location (
    id         BIGSERIAL PRIMARY KEY,
    name       VARCHAR(200) NOT NULL UNIQUE,
    is_active  BOOLEAN      NOT NULL DEFAULT TRUE,
    created_at TIMESTAMP    NOT NULL DEFAULT now(),
    updated_at TIMESTAMP    NOT NULL DEFAULT now()
);

INSERT INTO department (name) VALUES
    ('Engineering'),
    ('Human Resources'),
    ('Finance'),
    ('Operations'),
    ('Sales & Marketing');

INSERT INTO designation (title) VALUES
    ('Software Engineer'),
    ('Senior Software Engineer'),
    ('Team Lead'),
    ('Project Manager'),
    ('HR Manager'),
    ('Finance Analyst'),
    ('Delivery Manager');

INSERT INTO location (name) VALUES
    ('Chennai'),
    ('Bangalore'),
    ('Mumbai'),
    ('Hyderabad'),
    ('Remote');

ALTER TABLE app_user ADD COLUMN department_id  BIGINT REFERENCES department(id);
ALTER TABLE app_user ADD COLUMN designation_id BIGINT REFERENCES designation(id);
ALTER TABLE app_user ADD COLUMN location_id    BIGINT REFERENCES location(id);
