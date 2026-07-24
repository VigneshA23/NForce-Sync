UPDATE app_user
SET password_hash = '$2a$10$eLFmSIWqtvZ05vyxM5UZauimr5UdTqFevbYIgH.KKyjNrRAlIeRp6',
    status        = 'ACTIVE'
WHERE email = 'admin@nforceone.com';
