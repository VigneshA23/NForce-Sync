-- Ensure admin is ACTIVE and has a known password (ChangeMe123! — Spring BCrypt verified)
UPDATE app_user
SET password_hash = '$2a$10$eLFmSIWqtvZ05vyxM5UZauimr5UdTqFevbYIgH.KKyjNrRAlIeRp6',
    status        = 'ACTIVE'
WHERE email = 'admin@nforceone.com';
