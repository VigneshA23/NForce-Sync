-- Reset admin password to ChangeMe123!
UPDATE app_user
SET password_hash = '$2y$10$Kl94MOMDw8fCbGWupd/3w.mTUECeJXi4qsg4qRZJhjvBWx7Gr7iBC'
WHERE email = 'admin@nforceone.com';
