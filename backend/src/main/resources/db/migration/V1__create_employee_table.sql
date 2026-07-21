CREATE TABLE employee (
    id              BIGSERIAL PRIMARY KEY,
    name            VARCHAR(150) NOT NULL,
    email           VARCHAR(150) NOT NULL UNIQUE,
    department      VARCHAR(100),
    employment_type VARCHAR(30)  NOT NULL DEFAULT 'FULL_TIME',
    status          VARCHAR(20)  NOT NULL DEFAULT 'ACTIVE',
    created_at      TIMESTAMP    NOT NULL DEFAULT CURRENT_TIMESTAMP
);

INSERT INTO employee (name, email, department) VALUES
    ('Priya Sharma', 'priya@nforceone.com', 'Engineering'),
    ('Ravi Kumar',   'ravi@nforceone.com',  'Engineering'),
    ('Anita Desai',  'anita@nforceone.com', 'QA');
