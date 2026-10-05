-- Migration: Aggiungi supporto per sospensione soci e foto profilo
-- Data: 2025-01-08

-- Aggiungi campo sospeso
ALTER TABLE users
ADD COLUMN IF NOT EXISTS sospeso BOOLEAN DEFAULT false;

-- Aggiungi campo foto_profilo
ALTER TABLE users
ADD COLUMN IF NOT EXISTS foto_profilo VARCHAR(500);

-- Indice per migliorare le performance
CREATE INDEX IF NOT EXISTS idx_users_sospeso ON users(sospeso) WHERE sospeso = true;

-- Commenti per documentazione
COMMENT ON COLUMN users.sospeso IS 'Indica se il socio è stato sospeso o revocato';
COMMENT ON COLUMN users.foto_profilo IS 'Percorso relativo alla foto profilo del socio';

