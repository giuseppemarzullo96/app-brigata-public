ALTER TABLE users ADD COLUMN IF NOT EXISTS fittizio BOOLEAN DEFAULT false;
CREATE INDEX IF NOT EXISTS idx_users_fittizio ON users (fittizio) WHERE fittizio = true;
COMMENT ON COLUMN users.fittizio IS 'Account non reale (ente esterno come parrocchia/associazione), usato per assegnare slot senza registrare una persona fisica';
